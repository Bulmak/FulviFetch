import './style.css';
import {videoIdFromUrl} from './core.ts';
import {feedbackFor, type Feedback} from './feedback.ts';
import type {TaskState} from './task.ts';
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = element<HTMLFormElement>('download-form');
const input = element<HTMLInputElement>('url');
const start = element<HTMLButtonElement>('download');
const cancel = element<HTMLButtonElement>('cancel');
const current = element<HTMLButtonElement>('current-video');
const status = element<HTMLHeadingElement>('status');
const detail = element<HTMLParagraphElement>('detail');
const progress = element<HTMLProgressElement>('progress');
const diagnostic = element<HTMLPreElement>('diagnostic');
const track = element<HTMLParagraphElement>('track-title');
let revision = -1;
let lastState: TaskState | undefined;
let userEdited = false;
let starting = false;
let currentLabel = '';
element('build-version').textContent = __APP_VERSION__;

function render(state: TaskState) {
  if (state.version !== __APP_VERSION__ || state.revision < revision) return;
  revision = state.revision; lastState = state;
  starting = false;
  // La cola admite varios enlaces: el campo y el botón siguen disponibles.
  start.disabled = false; cancel.disabled = !state.active;
  input.disabled = false; current.disabled = false;
  element('download-label').textContent = state.active ? 'Añadir a la cola' : 'Descargar audio';
  status.textContent = state.status; detail.textContent = state.detail;
  track.textContent = state.title; track.hidden = !state.title;
  progress.hidden = !state.active;
  if (state.total > 0 && state.status === 'Descargando el audio') { progress.max = state.total; progress.value = state.received; }
  else progress.removeAttribute('value');
  diagnostic.textContent = JSON.stringify(state.diagnostic, null, 2);
  element('result').dataset.result = state.diagnostic.result;
  if (state.url && !userEdited) input.value = state.url;
  renderQueue(state);
}
function renderQueue(state: TaskState) {
  const section = element<HTMLElement>('queue-section');
  const list = element<HTMLUListElement>('queue-list');
  section.hidden = state.queue.length === 0;
  element('queue-count').textContent = String(state.queue.length);
  list.replaceChildren(...state.queue.map(item => {
    const row = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = item.label || item.videoId;
    name.title = item.url;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Quitar';
    remove.setAttribute('aria-label', 'Quitar de la cola: ' + (item.label || item.videoId));
    remove.addEventListener('click', () => {
      void browser.runtime.sendMessage({type: 'REMOVE_QUEUED', id: item.id}).catch(() => undefined);
    });
    row.append(name, remove);
    return row;
  }));
}
function showError(error: unknown): Feedback {
  const feedback = feedbackFor(error);
  status.textContent = feedback.status;
  detail.textContent = feedback.detail;
  return feedback;
}
async function readTask(): Promise<TaskState | undefined> {
  return browser.runtime.sendMessage({type: 'GET_TASK'}).catch(() => undefined);
}
async function useCurrentVideo(automatic = false) {
  if (lastState?.active || starting) return;
  const [tab] = await browser.tabs.query({active: true, currentWindow: true});
  try {
    const id = videoIdFromUrl(tab?.url ?? '');
    if (automatic && (userEdited || input.value)) return;
    input.value = 'https://www.youtube.com/watch?v=' + id;
    if (!automatic) userEdited = true;
    currentLabel = tab?.title?.replace(/ - YouTube$/, '') || '';
    track.textContent = currentLabel || 'Video de la pestaña actual';
    track.hidden = false;
  } catch {
    if (!automatic) {
      status.textContent = 'Abre un video de YouTube';
      detail.textContent = 'También puedes pegar un enlace en el campo de arriba.';
    }
  }
}
input.addEventListener('input', () => { userEdited = true; currentLabel = ''; track.hidden = true; });
current.addEventListener('click', () => {
  void useCurrentVideo().catch(() => {
    status.textContent = 'No se pudo leer la pestaña';
    detail.textContent = 'Abre un video de YouTube o pega el enlace en el campo de arriba.';
  });
});
form.addEventListener('submit', event => {
  event.preventDefault();
  if (starting) return;
  try { videoIdFromUrl(input.value); } catch (error) { showError(error); input.focus(); return; }
  starting = true; start.disabled = true; input.disabled = true; current.disabled = true;
  status.textContent = 'Preparando la descarga';
  const message: {type: string; url: string; label?: string} = {type: 'START_TASK', url: input.value};
  if (currentLabel) message.label = currentLabel;
  // The background accepts the job; progress arrives through session storage.
  void browser.runtime.sendMessage(message).then((state: TaskState) => render(state)).catch(async error => {
    starting = false;
    const feedback = showError(error);
    if (feedback.keepRunning) {
      // Otra descarga sigue en curso: el estado real manda y los controles
      // deben seguir deshabilitados.
      const state = await readTask();
      if (state) { render(state); return; }
    }
    start.disabled = false; input.disabled = false; current.disabled = false;
  });
});
element('clear-queue').addEventListener('click', () => {
  void browser.runtime.sendMessage({type: 'CLEAR_QUEUE'}).catch(() => undefined);
});
cancel.addEventListener('click', () => {
  cancel.disabled = true;
  void browser.runtime.sendMessage({type: 'CANCEL_TASK'}).then((state: TaskState) => render(state)).catch(async () => {
    // La cancelación no llegó: la descarga puede seguir en curso.
    const state = await readTask();
    if (state) render(state);
    else { status.textContent = 'No se pudo cancelar'; detail.textContent = 'Vuelve a intentarlo en unos segundos.'; }
  });
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.task?.newValue) render(changes.task.newValue as TaskState);
});
element('copy-diagnostic').addEventListener('click', () => {
  void navigator.clipboard.writeText(diagnostic.textContent ?? '').then(() => {
    element('copy-diagnostic').textContent = 'Copiado';
  }).catch(() => {
    const range = document.createRange(); range.selectNodeContents(diagnostic);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
  });
});
void browser.runtime.sendMessage({type: 'GET_TASK'}).then(async (state: TaskState) => {
  render(state);
  if (!state.active) await useCurrentVideo(true);
}).catch(() => {
  status.textContent = 'No se pudo comunicar con la extensión';
  detail.textContent = 'Vuelve a abrir el panel para reintentar.';
});
