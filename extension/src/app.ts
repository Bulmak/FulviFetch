// SPDX-License-Identifier: MPL-2.0
import './style.css';
import {videoIdFromUrl} from './core';
import type {TaskState} from './task';
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = element<HTMLFormElement>('download-form');
const input = element<HTMLInputElement>('url');
const start = element<HTMLButtonElement>('download');
const cancel = element<HTMLButtonElement>('cancel');
const current = element<HTMLButtonElement>('current-video');
const showLink = element<HTMLButtonElement>('show-link');
const status = element<HTMLHeadingElement>('status');
const detail = element<HTMLParagraphElement>('detail');
const progress = element<HTMLProgressElement>('progress');
const track = element<HTMLParagraphElement>('track-title');
let revision = -1;
let lastState: TaskState | undefined;
let starting = false;
element('build-version').textContent = __APP_VERSION__;

function updateControls() {
  const active = lastState?.active ?? false;
  const busy = active || starting;
  start.disabled = busy; input.disabled = busy;
  current.disabled = busy; showLink.disabled = busy;
  cancel.disabled = !active; cancel.hidden = !active;
}

function render(state: TaskState) {
  if (state.version !== __APP_VERSION__ || state.revision < revision) return;
  revision = state.revision; lastState = state;
  updateControls();
  status.textContent = state.status; detail.textContent = state.detail;
  progress.hidden = !state.active;
  if (state.total > 0 && state.status === 'Descargando el audio') { progress.max = state.total; progress.value = state.received; }
  else progress.removeAttribute('value');
  element('result').dataset.result = state.diagnostic.result;
  // Only an ongoing download restores its URL. Finished tasks must not refill
  // a new popup with a previous video's link or overwrite a manual selection.
  if (state.active) {
    input.value = state.url;
    track.textContent = state.title; track.hidden = !state.title;
  }
}
function showError(error: unknown) {
  status.textContent = 'Revisa el enlace';
  detail.textContent = error instanceof Error ? error.message : 'No se pudo comunicar con la extensión.';
}
async function download(getUrl: () => Promise<string>) {
  if (lastState?.active || starting) return;
  starting = true; updateControls();
  status.textContent = 'Preparando la descarga';
  let failed = false;
  try {
    const url = await getUrl();
    videoIdFromUrl(url);
    // Capture and pasted links share the same task; only the background downloads.
    const state: TaskState = await browser.runtime.sendMessage({type: 'START_TASK', url});
    render(state);
  } catch (error) {
    failed = true;
    showError(error);
  } finally {
    starting = false; updateControls();
    if (failed && !form.hidden) input.focus();
  }
}
input.addEventListener('input', () => { track.hidden = true; });
current.addEventListener('click', () => {
  void download(async () => {
    const [tab] = await browser.tabs.query({active: true, currentWindow: true});
    let id: string;
    try { id = videoIdFromUrl(tab?.url ?? ''); }
    catch { throw new Error('Abre un video de YouTube o usa «O pega el link aquí».'); }
    input.value = 'https://www.youtube.com/watch?v=' + id;
    return input.value;
  });
});
showLink.addEventListener('click', () => {
  form.hidden = !form.hidden;
  showLink.setAttribute('aria-expanded', String(!form.hidden));
  if (!form.hidden) input.focus();
});
form.addEventListener('submit', event => {
  event.preventDefault();
  void download(async () => input.value);
});
cancel.addEventListener('click', () => {
  cancel.disabled = true;
  void browser.runtime.sendMessage({type: 'CANCEL_TASK'}).then((state: TaskState) => render(state)).catch(showError);
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.task?.newValue) render(changes.task.newValue as TaskState);
});
void browser.runtime.sendMessage({type: 'GET_TASK'}).then((state: TaskState) => render(state)).catch(showError);
