import './style.css';
import {audioCandidates, installRequestHeaders} from './extractor';
import {downloadAudio} from './media';
import {DownloadFailure, extensionForMime, filenameFor, videoIdFromUrl} from './core';
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = element<HTMLFormElement>('download-form');
const input = element<HTMLInputElement>('url');
const start = element<HTMLButtonElement>('download');
const cancel = element<HTMLButtonElement>('cancel');
const status = element<HTMLHeadingElement>('status');
const detail = element<HTMLParagraphElement>('detail');
const progress = element<HTMLProgressElement>('progress');
const events = element<HTMLOListElement>('events');
const diagnostic = element<HTMLPreElement>('diagnostic');
let controller: AbortController | undefined;
let downloadId: number | undefined;
let objectUrl: string | undefined;
let reportData: Record<string, unknown> = {};
const entries: Array<Record<string, unknown>> = [];
element('build-version').textContent = __APP_VERSION__;
function updateDiagnostic() { diagnostic.textContent = JSON.stringify({...reportData, events: entries}, null, 2); }
function report(message: string, data: Record<string, string | number | boolean> = {}) {
  const li = document.createElement('li'); li.textContent = message; events.append(li);
  if (events.children.length > 30) events.firstChild?.remove();
  entries.push({message, ...data}); if (entries.length > 60) entries.shift();
  detail.textContent = message; updateDiagnostic();
}
function clearBlob() { if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = undefined; }
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
form.addEventListener('submit', event => {
  event.preventDefault(); if (!controller) void runDownload();
});
async function runDownload() {
  let videoId: string;
  try { videoId = videoIdFromUrl(input.value); }
  catch (error) { status.textContent = 'Revisa el enlace'; detail.textContent = (error as Error).message; input.focus(); return; }
  controller = new AbortController(); const signal = controller.signal;
  events.replaceChildren(); entries.length = 0; clearBlob();
  reportData = {version: __APP_VERSION__, extractor: 'youtubei.js 18.2.0', videoId, result: 'running'};
  start.disabled = true; input.disabled = true; cancel.disabled = false;
  progress.hidden = false; progress.removeAttribute('value');
  status.textContent = 'Obteniendo el audio';
  let removeHeaders: (() => void) | undefined;
  try {
    removeHeaders = await installRequestHeaders(report);
    const browserInfo = await browser.runtime.getBrowserInfo(); reportData.browserVersion = browserInfo.version;
    const permissions = await browser.permissions.getAll();
    if (!permissions.origins?.some(origin => origin.includes('youtube.com'))) throw new DownloadFailure('HOST_PERMISSION', 'Concede a la extensión acceso a YouTube en sus permisos de Firefox.');
    let result: Blob | undefined;
    let selected: {title: string; mime: string; itag: number; client: string} | undefined;
    for await (const candidate of audioCandidates(videoId, signal, report)) {
      status.textContent = 'Descargando el audio';
      try {
        result = await downloadAudio(candidate, signal, (received, total) => {
          progress.max = total; progress.value = received;
          detail.textContent = `${(received / 1048576).toFixed(1)} de ${(total / 1048576).toFixed(1)} MiB`;
        }, report);
        selected = candidate; break;
      } catch (error) {
        signal.throwIfAborted();
        report('Ese formato no se pudo descargar; probando otra opción.', {client: candidate.client, itag: candidate.itag, code: error instanceof DownloadFailure ? error.code : 'NETWORK_ERROR', reason: error instanceof DownloadFailure ? error.message : 'Network error', ...(error instanceof DownloadFailure ? error.details : {})});
        result = undefined;
        if (error instanceof DownloadFailure && error.code === 'TOO_LARGE') throw error;
      }
    }
    signal.throwIfAborted();
    if (!result || !selected) throw new DownloadFailure('EMPTY_MEDIA', 'No se obtuvo audio.');
    reportData = {...reportData, title: selected.title, mime: selected.mime, itag: selected.itag, client: selected.client, bytes: result.size};
    status.textContent = 'Guardando el archivo';
    objectUrl = URL.createObjectURL(result);
    downloadId = await browser.downloads.download({url: objectUrl, filename: filenameFor(selected.title, videoId, extensionForMime(selected.mime)), saveAs: false, conflictAction: 'uniquify'});
    await waitForSave(downloadId, signal);
    status.textContent = 'Audio guardado'; reportData.result = 'complete';
    report('Encontrarás el archivo en Audio local, dentro de las descargas de Firefox.');
  } catch (error) {
    const aborted = signal.aborted;
    status.textContent = aborted ? 'Descarga cancelada' : 'No se pudo completar la descarga';
    reportData.result = aborted ? 'cancelled' : 'failed';
    reportData.code = aborted ? 'CANCELLED' : error instanceof DownloadFailure ? error.code : 'NETWORK_OR_EXTRACTOR_ERROR';
    report(aborted ? 'Puedes volver a intentarlo con el mismo enlace.' : error instanceof DownloadFailure ? error.message : 'No se pudo comunicar con YouTube o interpretar su respuesta. Copia el diagnóstico para revisar el fallo.');
  } finally {
    removeHeaders?.(); clearBlob(); downloadId = undefined;
    controller = undefined; start.disabled = false; input.disabled = false; cancel.disabled = true;
    progress.hidden = true; updateDiagnostic();
  }
}
cancel.addEventListener('click', () => controller?.abort(new DOMException('Cancelado', 'AbortError')));
element('copy-diagnostic').addEventListener('click', () => {
  const text = diagnostic.textContent ?? '';
  void navigator.clipboard.writeText(text).catch(() => {
    const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(diagnostic); selection?.removeAllRanges(); selection?.addRange(range);
  });
});
window.addEventListener('beforeunload', event => {
  if (controller) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => {
  controller?.abort(); if (downloadId !== undefined) void browser.downloads.cancel(downloadId).catch(() => undefined); clearBlob();
});
