import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackFor} from '../src/feedback.ts';
import {DownloadFailure} from '../src/core.ts';

test('Un enlace inválido pide revisar el enlace', () => {
  const feedback = feedbackFor(new DownloadFailure('INVALID_URL', 'Pega un enlace completo de YouTube.'));
  assert.equal(feedback.status, 'Revisa el enlace');
  assert.equal(feedback.detail, 'Pega un enlace completo de YouTube.');
  assert.equal(feedback.keepRunning, false);
});

test('Una descarga en curso no se presenta como un error del enlace', () => {
  const feedback = feedbackFor(new DownloadFailure('BUSY', 'Ya hay una descarga en curso.'));
  assert.equal(feedback.status, 'Ya hay una descarga en curso');
  assert.notEqual(feedback.status, 'Revisa el enlace');
  assert.equal(feedback.keepRunning, true);
});

test('Un fallo desconocido se explica sin inventar la causa', () => {
  const feedback = feedbackFor(new Error('boom'));
  assert.equal(feedback.status, 'No se pudo iniciar la descarga');
  assert.equal(feedback.detail, 'boom');
  assert.equal(feedback.keepRunning, false);
});

test('Un valor que no es un error también produce un mensaje utilizable', () => {
  const feedback = feedbackFor(undefined);
  assert.equal(feedback.status, 'No se pudo iniciar la descarga');
  assert.equal(feedback.detail, 'No se pudo comunicar con la extensión.');
  assert.equal(feedback.keepRunning, false);
});
