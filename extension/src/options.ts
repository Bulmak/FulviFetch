import './options.css';
import {normalizePreferences, type Preferences} from './preferences.ts';

const form = document.getElementById('preferences') as HTMLFormElement;
const saved = document.getElementById('saved') as HTMLParagraphElement;
const cover = document.getElementById('cover') as HTMLInputElement;
const includeId = document.getElementById('include-id') as HTMLInputElement;

function show(preferences: Preferences) {
  const chosen = form.querySelector<HTMLInputElement>(`input[name="format"][value="${preferences.format}"]`);
  if (chosen) chosen.checked = true;
  cover.checked = preferences.cover;
  includeId.checked = preferences.includeId;
}

function read(): Preferences {
  const format = form.querySelector<HTMLInputElement>('input[name="format"]:checked')?.value;
  return normalizePreferences({format, cover: cover.checked, includeId: includeId.checked});
}

form.addEventListener('change', () => {
  void browser.storage.local.set({preferences: read()}).then(() => {
    saved.hidden = false;
  });
});

void browser.storage.local.get('preferences').then(stored => show(normalizePreferences(stored.preferences))).catch(() => undefined);
