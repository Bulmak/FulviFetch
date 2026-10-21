import {audioCandidates, installRequestHeaders} from './extractor.ts';
import {downloadAudio} from './media.ts';
import {remuxM4a} from './remux.ts';
import {DownloadFailure, extensionForMime, filenameFor} from './core.ts';
import {DownloadTask, type TaskState, type TaskUpdates} from './task.ts';
import {createThrottledWriter} from './writer.ts';
import {requestFromUrl, type VideoRequest} from './requests.ts';

// Los estados intermedios se agrupan: escribir en cada fragmento saturaba el
// almacenamiento y el distintivo del icono. El último estado siempre se guarda.
const writer = createThrottledWriter<TaskState>(async state => {
  await browser.storage.session.set({task: state});
  const result = state.diagnostic.result;
  const text = state.active ? state.total ? Math.floor(state.received * 100 / state.total) + '%' : '…'
    : result === 'complete' ? '✓' : result === 'failed' ? '!' : '';
  await Promise.all([
    browser.action.setBadgeText({text}),
    browser.action.setBadgeBackgroundColor({color: result === 'failed' ? '#b43b54' : '#245ea8'}),
    browser.action.setTitle({title: state.active ? 'FulviFetch · ' + state.status : 'FulviFetch'})
  ]);
}, 200);

function publish(state: TaskState) {
  writer.push(state);
  // El estado final no puede esperar al intervalo.
  if (!state.active) void writer.flush();
}

function waitForSave(id: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return; settled = true;
      browser.downloads.onChanged.removeListener(changed); signal.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve();
    };
    const changed = (delta: browser.downloads._OnChangedDownloadDelta) => {
      if (delta.id !== id) return;
      if (delta.state?.current === 'complete') finish();
      if (delta.state?.current === 'interrupted') finish(new DownloadFailure('SAVE_INTERRUPTED', 'El navegador no completó el guardado del archivo.'));
    };
    const aborted = () => { void browser.downloads.cancel(id).catch(() => undefined); finish(new DOMException('Cancelado', 'AbortError')); };
    browser.downloads.onChanged.addListener(changed); signal.addEventListener('abort', aborted, {once: true});
    if (signal.aborted) { aborted(); return; }
    void browser.downloads.search({id}).then(items => {
      if (items[0]?.state === 'complete') finish();
      else if (!items[0] || items[0].state === 'interrupted') finish(new DownloadFailure('SAVE_INTERRUPTED', 'El archivo no se pudo guardar.'));
    }).catch(() => finish(new DownloadFailure('SAVE_FAILED', 'No se pudo comprobar el guardado.')));
  });
}

async function transfer(videoId: string, signal: AbortSignal, updates: TaskUpdates) {
  const {report} = updates;
  let removeHeaders: (() => void) | undefined;
  let objectUrl: string | undefined;
  try {
    removeHeaders = await installRequestHeaders(report);
    const browserInfo = await browser.runtime.getBrowserInfo();
    updates.metadata({browserVersion: browserInfo.version});
    const permissions = await browser.permissions.getAll();
    if (!permissions.origins?.some(origin => origin.includes('youtube.com'))) throw new DownloadFailure('HOST_PERMISSION', 'Concede a la extensión acceso a YouTube en sus permisos de Firefox.');
    for await (const candidate of audioCandidates(videoId, signal, report)) {
      let result: Blob;
      updates.metadata({title: candidate.title});
      updates.phase('Descargando el audio');
      try {
        result = await downloadAudio(candidate, signal, updates.progress, report);
      } catch (error) {
        signal.throwIfAborted();
        report('Ese formato no se pudo descargar; probando otra opción.', {
          client: candidate.client, itag: candidate.itag,
          code: error instanceof DownloadFailure ? error.code : 'NETWORK_ERROR',
          reason: error instanceof DownloadFailure ? error.message : 'Network error',
          ...(error instanceof DownloadFailure ? error.details : {})
        });
        if (error instanceof DownloadFailure && error.code === 'TOO_LARGE') throw error;
        continue;
      }
      signal.throwIfAborted();
      if (extensionForMime(candidate.mime) === 'm4a') {
        updates.phase('Preparando el archivo');
        report('Preparando el audio para guardarlo.');
        let lastProgress = performance.now();
        const prepared = await remuxM4a(result, signal, (copied, total) => {
          if (performance.now() - lastProgress >= 500) {
            lastProgress = performance.now();
            report('Preparando el audio para guardarlo.', {packets: copied, totalPackets: total});
          }
        });
        result = prepared.blob;
        updates.metadata({remuxer: 'mediabunny 1.61.6', remuxPackets: prepared.packets,
          originalBytes: prepared.inputBytes, preparedBytes: prepared.outputBytes, remuxMs: prepared.milliseconds});
      }
      updates.metadata({mime: candidate.mime, itag: candidate.itag, client: candidate.client, bytes: result.size});
      updates.phase('Guardando el archivo');
      let downloadId: number;
      try {
        objectUrl = URL.createObjectURL(result);
        downloadId = await browser.downloads.download({
          url: objectUrl, filename: filenameFor(candidate.title, videoId, extensionForMime(candidate.mime)),
          saveAs: false, conflictAction: 'uniquify'
        });
      } catch {
        signal.throwIfAborted();
        throw new DownloadFailure('SAVE_FAILED', 'Firefox no pudo guardar el audio. Revisa la carpeta de descargas y sus permisos.');
      }
      await waitForSave(downloadId, signal);
      return {title: candidate.title, mime: candidate.mime, itag: candidate.itag, client: candidate.client, bytes: result.size};
    }
    throw new DownloadFailure('EMPTY_MEDIA', 'No se obtuvo audio.');
  } finally {
    removeHeaders?.(); if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

const task = new DownloadTask(__APP_VERSION__, transfer, publish);
const ready = browser.storage.session.get('task').then(saved => task.restore(saved.task as TaskState | undefined));

// Encola un video desde el menú contextual o el atajo de teclado.
function enqueue(request?: VideoRequest) {
  if (!request) return;
  try {
    task.submit(request.url, request.label);
  } catch (error) {
    // La cola está llena: se avisa en el icono y en el panel.
    void browser.action.setBadgeText({text: '!'});
    void browser.action.setBadgeBackgroundColor({color: '#b43b54'});
    console.warn('FulviFetch:', error instanceof Error ? error.message : error);
  }
}
browser.menus.onClicked.addListener((info, tab) => {
  // Sobre un enlace se encola el enlace; sobre la página, la página. El
  // título de la pestaña solo describe al video cuando es la propia página.
  const fromLink = Boolean(info.linkUrl);
  const request = requestFromUrl(fromLink ? info.linkUrl : info.pageUrl, fromLink ? undefined : tab?.title);
  void ready.then(() => enqueue(request));
});
browser.commands.onCommand.addListener(command => {
  if (command !== 'download-active-tab') return;
  void browser.tabs.query({active: true, currentWindow: true}).then(([tab]) => {
    const request = requestFromUrl(tab?.url, tab?.title);
    void ready.then(() => enqueue(request));
  });
});

// Register at module load so Firefox can wake this event page for popup messages.
browser.runtime.onMessage.addListener((message: unknown, sender) => {
  if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('index.html'))) return false;
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  if (message.type === 'GET_TASK') return ready.then(() => task.snapshot());
  if (message.type === 'CANCEL_TASK') return ready.then(() => { task.cancel(); return task.snapshot(); });
  if (message.type === 'CLEAR_QUEUE') return ready.then(() => { task.clear(); return task.snapshot(); });
  if (message.type === 'REMOVE_QUEUED' && 'id' in message && typeof message.id === 'string') {
    const id = message.id;
    return ready.then(() => { task.remove(id); return task.snapshot(); });
  }
  if (message.type === 'START_TASK' && 'url' in message && typeof message.url === 'string' && message.url.length <= 4096) {
    const input = message.url;
    const label = 'label' in message && typeof message.label === 'string' ? message.label.slice(0, 200) : undefined;
    return ready.then(() => {
      // Accept promptly; the task is owned by this background context, not the sender.
      // Our own request events and progress storage writes provide activity. Network
      // waits are bounded to 15/20 s, below Firefox's normal 30 s idle timeout.
      // An invalid link or a full queue throws here and reaches the panel.
      task.submit(input, label);
      return task.snapshot();
    });
  }
  return false;
});
