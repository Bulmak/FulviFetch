import './style.css';
import {videoIdFromUrl} from './core';
import type {TaskState} from './task';
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
element('build-version').textContent = __APP_VERSION__;

function render(state: TaskState) {
  if (state.version !== __APP_VERSION__ || state.revision < revision) return;
  revision = state.revision; lastState = state;
  starting = false;
  start.disabled = state.active; cancel.disabled = !state.active;
  input.disabled = state.active; current.disabled = state.active;
  status.textContent = state.status; detail.textContent = state.detail;
  track.textContent = state.title; track.hidden = !state.title;
  progress.hidden = !state.active;
  if (state.total > 0 && state.status === 'Descargando el audio') { progress.max = state.total; progress.value = state.received; }
  else progress.removeAttribute('value');
  diagnostic.textContent = JSON.stringify(state.diagnostic, null, 2);
  element('result').dataset.result = state.diagnostic.result;
  if (state.url && (!userEdited || state.active)) input.value = state.url;
}
function showError(error: unknown) {
  status.textContent = 'Revisa el enlace';
  detail.textContent = error instanceof Error ? error.message : 'No se pudo comunicar con la extensión.';
}
async function useCurrentVideo(automatic = false) {
  if (lastState?.active || starting) return;
  const [tab] = await browser.tabs.query({active: true, currentWindow: true});
  try {
    const id = videoIdFromUrl(tab?.url ?? '');
    if (automatic && (userEdited || input.value)) return;
    input.value = 'https://www.youtube.com/watch?v=' + id;
    if (!automatic) userEdited = true;
    track.textContent = tab.title?.replace(/ - YouTube$/, '') || 'Video de la pestaña actual';
    track.hidden = false;
  } catch {
    if (!automatic) {
      status.textContent = 'Abre un video de YouTube';
      detail.textContent = 'También puedes pegar un enlace en el campo de arriba.';
    }
  }
}
input.addEventListener('input', () => { userEdited = true; track.hidden = true; });
current.addEventListener('click', () => { void useCurrentVideo().catch(showError); });
form.addEventListener('submit', event => {
  event.preventDefault();
  if (lastState?.active || starting) return;
  try { videoIdFromUrl(input.value); } catch (error) { showError(error); input.focus(); return; }
  starting = true; start.disabled = true; input.disabled = true; current.disabled = true;
  status.textContent = 'Preparando la descarga';
  // The background accepts the job; progress arrives through session storage.
  void browser.runtime.sendMessage({type: 'START_TASK', url: input.value}).then((state: TaskState) => render(state)).catch(error => {
    starting = false;
    start.disabled = false; input.disabled = false; current.disabled = false;
    showError(error);
  });
});
cancel.addEventListener('click', () => {
  cancel.disabled = true;
  void browser.runtime.sendMessage({type: 'CANCEL_TASK'}).then((state: TaskState) => render(state)).catch(showError);
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
}).catch(showError);
