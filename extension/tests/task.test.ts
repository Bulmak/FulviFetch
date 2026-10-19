import test from 'node:test';
import assert from 'node:assert/strict';
import {DownloadTask, type TaskUpdates} from '../src/task.ts';
const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}
test('Cerrar la interfaz no cancela el trabajo ni pierde su progreso', async () => {
  const gate = deferred<Record<string, string>>(); let updates!: TaskUpdates;
  const task = new DownloadTask('test', async (_id, _signal, current) => { updates = current; return gate.promise; });
  const completion = task.start(url);
  updates.progress(25, 100);
  const reopened = task.snapshot();
  assert.equal(reopened.active, true); assert.equal(reopened.received, 25);
  reopened.diagnostic.events.push({message: 'Cambio de la interfaz'});
  assert.equal(task.snapshot().diagnostic.events.length, 0);
  gate.resolve({title: 'Audio'});
  const finished = await completion;
  assert.equal(finished.active, false); assert.equal(finished.diagnostic.result, 'complete');
});
test('Dos paneles no pueden iniciar descargas simultáneas', async () => {
  const gate = deferred<Record<string, string>>();
  const task = new DownloadTask('test', () => gate.promise);
  const completion = task.start(url);
  assert.throws(() => task.start(url), {code: 'BUSY'});
  gate.resolve({}); await completion;
});
test('Cancelar desde otra apertura del panel llega al trabajo original', async () => {
  const task = new DownloadTask('test', (_id, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  }));
  const completion = task.start(url);
  assert.equal(task.snapshot().active, true);
  task.cancel();
  assert.equal((await completion).diagnostic.result, 'cancelled');
  assert.equal(task.snapshot().active, false);
});
test('Al despertar tras una interrupción no muestra un progreso activo inexistente', async () => {
  const gate = deferred<Record<string, string>>();
  const original = new DownloadTask('test', () => gate.promise);
  const completion = original.start(url);
  const recovered = new DownloadTask('test', async () => ({}));
  recovered.restore(original.snapshot());
  assert.equal(recovered.snapshot().active, false);
  assert.equal(recovered.snapshot().diagnostic.code, 'BACKGROUND_INTERRUPTED');
  gate.resolve({}); await completion;
});
test('Una descarga terminada se recupera al despertar el proceso de fondo', async () => {
  const task = new DownloadTask('test', async () => ({title: 'Canción', bytes: 123}));
  await task.start(url);
  const recovered = new DownloadTask('test', async () => ({}));
  recovered.restore(task.snapshot());
  assert.equal(recovered.snapshot().diagnostic.result, 'complete');
  assert.equal(recovered.snapshot().diagnostic.bytes, 123);
});
test('Un enlace inválido no inicia ni modifica la tarea', () => {
  let calls = 0;
  const task = new DownloadTask('test', async () => { calls++; return {}; });
  assert.throws(() => task.start('https://example.com/video'), {code: 'INVALID_URL'});
  assert.equal(calls, 0); assert.equal(task.snapshot().diagnostic.result, 'idle');
});
