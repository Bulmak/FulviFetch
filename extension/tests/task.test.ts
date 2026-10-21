import test from 'node:test';
import assert from 'node:assert/strict';
import {DownloadFailure} from '../src/core.ts';
import {DownloadTask, MAX_QUEUE, type TaskUpdates} from '../src/task.ts';
const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const otherUrl = 'https://www.youtube.com/watch?v=llmbcMmZuQ4';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}
const settle = () => new Promise<void>(done => setImmediate(done));

test('Cerrar la interfaz no cancela el trabajo ni pierde su progreso', async () => {
  const gate = deferred<Record<string, string>>(); let updates!: TaskUpdates;
  const task = new DownloadTask('test', async (_id, _signal, current) => { updates = current; return gate.promise; });
  task.submit(url);
  updates.progress(25, 100);
  const reopened = task.snapshot();
  assert.equal(reopened.active, true); assert.equal(reopened.received, 25);
  reopened.diagnostic.events.push({message: 'Cambio de la interfaz'});
  assert.equal(task.snapshot().diagnostic.events.length, 0);
  gate.resolve({title: 'Audio'});
  const finished = await task.whenIdle();
  assert.equal(finished.active, false); assert.equal(finished.diagnostic.result, 'complete');
});

test('Un segundo enlace espera a que termine el primero', async () => {
  const gates = [deferred<Record<string, string>>(), deferred<Record<string, string>>()];
  let call = 0;
  const task = new DownloadTask('test', () => gates[call++]!.promise);
  task.submit(url);
  task.submit(otherUrl);
  const queued = task.snapshot();
  assert.equal(queued.queue.length, 1);
  assert.equal(queued.queue[0]!.videoId, 'llmbcMmZuQ4');
  assert.equal(queued.active, true);
  gates[0]!.resolve({title: 'Primero'});
  await settle();
  const second = task.snapshot();
  assert.equal(second.active, true);
  assert.equal(second.queue.length, 0);
  assert.equal(second.diagnostic.videoId, 'llmbcMmZuQ4');
  gates[1]!.resolve({title: 'Segundo'});
  await task.whenIdle();
  assert.equal(task.snapshot().diagnostic.result, 'complete');
});

test('Dos paneles encolan en vez de rechazarse', async () => {
  const gate = deferred<Record<string, string>>();
  const task = new DownloadTask('test', () => gate.promise);
  task.submit(url);
  assert.doesNotThrow(() => task.submit(otherUrl));
  assert.equal(task.snapshot().queue.length, 1);
  gate.resolve({});
  await task.whenIdle();
});

test('La cola no crece sin límite', async () => {
  const gate = deferred<Record<string, string>>();
  const task = new DownloadTask('test', () => gate.promise);
  task.submit(url);
  for (let index = 0; index < MAX_QUEUE; index++) task.submit(otherUrl);
  assert.throws(() => task.submit(otherUrl), {code: 'BUSY'});
  gate.resolve({});
  await task.whenIdle();
});

test('Quitar un elemento pendiente no lo descarga', async () => {
  const gates = [deferred<Record<string, string>>(), deferred<Record<string, string>>()];
  let call = 0;
  const task = new DownloadTask('test', () => gates[call++]!.promise);
  task.submit(url);
  task.submit(otherUrl);
  const queued = task.snapshot().queue[0]!;
  task.remove(queued.id);
  assert.equal(task.snapshot().queue.length, 0);
  gates[0]!.resolve({});
  await task.whenIdle();
  assert.equal(call, 1);
});

test('Vaciar la cola deja intacta la descarga en curso', async () => {
  const gate = deferred<Record<string, string>>();
  const task = new DownloadTask('test', () => gate.promise);
  task.submit(url);
  task.submit(otherUrl);
  task.submit(otherUrl);
  task.clear();
  assert.equal(task.snapshot().queue.length, 0);
  assert.equal(task.snapshot().active, true);
  gate.resolve({});
  await task.whenIdle();
});

test('Cancelar la descarga activa hace continuar con el siguiente', async () => {
  const task = new DownloadTask('test', (_id, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  }));
  task.submit(url);
  task.submit(otherUrl);
  task.cancel();
  await settle();
  const next = task.snapshot();
  assert.equal(next.active, true);
  assert.equal(next.diagnostic.videoId, 'llmbcMmZuQ4');
  task.cancel();
  await task.whenIdle();
  assert.equal(task.snapshot().diagnostic.result, 'cancelled');
});

test('Cancelar desde otra apertura del panel llega al trabajo original', async () => {
  const task = new DownloadTask('test', (_id, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  }));
  task.submit(url);
  assert.equal(task.snapshot().active, true);
  task.cancel();
  const finished = await task.whenIdle();
  assert.equal(finished.diagnostic.result, 'cancelled');
  assert.equal(task.snapshot().active, false);
});

test('Al despertar tras una interrupción la tarea vuelve a encolarse y continúa', async () => {
  const gate = deferred<Record<string, string>>();
  const original = new DownloadTask('test', async () => gate.promise);
  original.submit(url);
  const recoveredGate = deferred<Record<string, string>>();
  const recovered = new DownloadTask('test', async () => recoveredGate.promise);
  recovered.restore(original.snapshot());
  const state = recovered.snapshot();
  // La cola continúa sola: el elemento interrumpido arranca de nuevo.
  assert.equal(state.active, true);
  assert.equal(state.diagnostic.videoId, 'jNQXAC9IVRw');
  assert.equal(state.diagnostic.events.some(event => typeof event.message === 'string' && event.message.includes('interrumpió')), true);
  recoveredGate.resolve({});
  await recovered.whenIdle();
  gate.resolve({}); await original.whenIdle();
});

test('La cola se conserva al despertar el proceso de fondo', async () => {
  const gate = deferred<Record<string, string>>();
  const original = new DownloadTask('test', async () => gate.promise);
  original.submit(url);
  original.submit(otherUrl);
  const saved = original.snapshot();
  const recoveredGate = deferred<Record<string, string>>();
  const recovered = new DownloadTask('test', async () => recoveredGate.promise);
  recovered.restore(saved);
  const state = recovered.snapshot();
  // La tarea interrumpida vuelve a la cola y arranca; la pendiente se conserva.
  assert.equal(state.active, true);
  assert.equal(state.diagnostic.videoId, 'jNQXAC9IVRw');
  assert.equal(state.queue.length, 1);
  assert.equal(state.queue[0]!.videoId, 'llmbcMmZuQ4');
  recoveredGate.resolve({});
  await recovered.whenIdle();
  gate.resolve({}); await original.whenIdle();
});

test('Una descarga terminada se recupera al despertar el proceso de fondo', async () => {
  const task = new DownloadTask('test', async () => ({title: 'Canción', bytes: 123}));
  await task.whenIdle();
  task.submit(url);
  await task.whenIdle();
  const recovered = new DownloadTask('test', async () => ({}));
  recovered.restore(task.snapshot());
  assert.equal(recovered.snapshot().diagnostic.result, 'complete');
  assert.equal(recovered.snapshot().diagnostic.bytes, 123);
});

test('Un enlace inválido no inicia ni modifica la tarea', () => {
  let calls = 0;
  const task = new DownloadTask('test', async () => { calls++; return {}; });
  assert.throws(() => task.submit('https://example.com/video'), {code: 'INVALID_URL'});
  assert.equal(calls, 0);
  assert.equal(task.snapshot().diagnostic.result, 'idle');
  assert.equal(task.snapshot().queue.length, 0);
});

test('Un error al guardar conserva su fase y no se presenta como un fallo de red', async () => {
  const task = new DownloadTask('test', async (_id, _signal, updates) => {
    updates.progress(100, 100);
    updates.phase('Guardando el archivo');
    throw new DownloadFailure('SAVE_FAILED', 'Firefox no pudo guardar el audio.');
  });
  task.submit(url);
  const state = await task.whenIdle();
  assert.equal(state.active, false);
  assert.equal(state.diagnostic.result, 'failed');
  assert.equal(state.diagnostic.code, 'SAVE_FAILED');
  assert.equal(state.diagnostic.phase, 'Guardando el archivo');
  assert.equal(state.diagnostic.received, 100);
  assert.equal(state.diagnostic.total, 100);
  assert.equal(state.detail, 'Firefox no pudo guardar el audio.');
});
