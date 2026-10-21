import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DownloadTask, MAX_QUEUE} from '../src/task.ts';
const A = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const B = 'https://www.youtube.com/watch?v=llmbcMmZuQ4';
const C = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}
const settle = () => new Promise<void>(done => setImmediate(done));
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

test('S1: tres enlaces se descargan en orden FIFO y el segundo aparece en cola', async () => {
  const gates = [deferred<Record<string, string>>(), deferred<Record<string, string>>(), deferred<Record<string, string>>()];
  let call = 0;
  const task = new DownloadTask('test', async () => gates[call++]!.promise);
  task.submit(A); task.submit(B); task.submit(C);
  let state = task.snapshot();
  assert.equal(state.diagnostic.videoId, 'jNQXAC9IVRw');
  assert.deepEqual(state.queue.map(item => item.videoId), ['llmbcMmZuQ4', 'aqz-KE-bpKQ']);
  gates[0]!.resolve({}); await settle();
  state = task.snapshot();
  assert.equal(state.diagnostic.videoId, 'llmbcMmZuQ4');
  assert.deepEqual(state.queue.map(item => item.videoId), ['aqz-KE-bpKQ']);
  gates[1]!.resolve({}); await settle();
  assert.equal(task.snapshot().diagnostic.videoId, 'aqz-KE-bpKQ');
  gates[2]!.resolve({}); await task.whenIdle();
});

test('S1: la cola y la tarea interrumpida sobreviven a restore', async () => {
  const gate = deferred<Record<string, string>>();
  const original = new DownloadTask('test', async () => gate.promise);
  original.submit(A); original.submit(B); original.submit(C);
  const gates = [deferred<Record<string, string>>(), deferred<Record<string, string>>()];
  let call = 0;
  const recovered = new DownloadTask('test', async () => gates[call++]!.promise);
  recovered.restore(original.snapshot());
  const state = recovered.snapshot();
  assert.equal(state.diagnostic.videoId, 'jNQXAC9IVRw');
  assert.deepEqual(state.queue.map(item => item.videoId), ['llmbcMmZuQ4', 'aqz-KE-bpKQ']);
  gates[0]!.resolve({}); await settle();
  assert.equal(recovered.snapshot().diagnostic.videoId, 'llmbcMmZuQ4');
  gates[1]!.resolve({}); await recovered.whenIdle();
  gate.resolve({}); await original.whenIdle();
});

test('S2: quitar el elemento intermedio no afecta a la activa ni al resto', async () => {
  const gate = deferred<Record<string, string>>();
  let aborted = false;
  const task = new DownloadTask('test', (_id, signal) => {
    signal.addEventListener('abort', () => { aborted = true; }, {once: true});
    return gate.promise;
  });
  task.submit(A); task.submit(B); task.submit(C);
  task.remove(task.snapshot().queue[0]!.id);
  const state = task.snapshot();
  assert.equal(state.active, true);
  assert.equal(aborted, false);
  assert.deepEqual(state.queue.map(item => item.videoId), ['aqz-KE-bpKQ']);
  gate.resolve({}); await task.whenIdle();
  assert.equal(task.snapshot().diagnostic.result, 'complete');
});

test('S2: vaciar la cola deja solo la activa y no arranca nada tras terminar', async () => {
  const gate = deferred<Record<string, string>>();
  let calls = 0;
  const task = new DownloadTask('test', async () => { calls++; return gate.promise; });
  task.submit(A); task.submit(B); task.submit(C);
  task.clear();
  assert.equal(task.snapshot().queue.length, 0);
  assert.equal(task.snapshot().active, true);
  gate.resolve({}); await task.whenIdle();
  assert.equal(calls, 1);
});

test('S3: cancelar con tres enlaces arranca el siguiente y no borra el resto', async () => {
  const task = new DownloadTask('test', (_id, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  }));
  task.submit(A); task.submit(B); task.submit(C);
  task.cancel(); await settle();
  let state = task.snapshot();
  assert.equal(state.diagnostic.videoId, 'llmbcMmZuQ4');
  assert.deepEqual(state.queue.map(item => item.videoId), ['aqz-KE-bpKQ']);
  task.cancel(); await settle();
  assert.equal(task.snapshot().diagnostic.videoId, 'aqz-KE-bpKQ');
  task.cancel(); await task.whenIdle();
  assert.equal(task.snapshot().active, false);
});

test('Invariante: un comando rechazado deja el estado publicado sin cambios', async () => {
  const published: string[] = [];
  const gate = deferred<Record<string, string>>();
  const task = new DownloadTask('test', async () => gate.promise, state => { published.push(JSON.stringify(state)); });
  task.clear();
  const pristine = hash(JSON.stringify(task.snapshot()));
  task.clear();
  assert.equal(hash(JSON.stringify(task.snapshot())), pristine);
  assert.equal(published.length, 0);
  task.submit(A);
  for (let index = 0; index < MAX_QUEUE; index++) task.submit(B);
  const before = hash(JSON.stringify(task.snapshot()));
  const beforePublishes = published.length;
  assert.throws(() => task.submit('https://example.com/video'), {code: 'INVALID_URL'});
  assert.throws(() => task.submit(C), {code: 'BUSY'});
  task.remove('no-existe');
  assert.equal(hash(JSON.stringify(task.snapshot())), before);
  assert.equal(published.length, beforePublishes);
  gate.resolve({}); await task.whenIdle();
});

test('S1: la cola llena admite exactamente MAX_QUEUE pendientes y menciona el límite', async () => {
  const gate = deferred<Record<string, string>>();
  const task = new DownloadTask('test', async () => gate.promise);
  task.submit(A);
  for (let index = 0; index < MAX_QUEUE; index++) task.submit(B);
  assert.equal(task.snapshot().queue.length, MAX_QUEUE);
  assert.throws(() => task.submit(C), (error: unknown) => /hasta 20/.test((error as Error).message));
  gate.resolve({}); await task.whenIdle();
});

test('Los identificadores de la cola no se repiten tras restaurar', async () => {
  const gate = deferred<Record<string, string>>();
  const original = new DownloadTask('test', async () => gate.promise);
  original.submit(A); original.submit(B);
  const saved = original.snapshot();
  const recovered = new DownloadTask('test', async () => gate.promise);
  recovered.restore(saved);
  recovered.submit(C);
  const ids = recovered.snapshot().queue.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, 'Hay identificadores repetidos en la cola: ' + ids.join(', '));
  gate.resolve({}); await original.whenIdle();
  await recovered.whenIdle();
});
