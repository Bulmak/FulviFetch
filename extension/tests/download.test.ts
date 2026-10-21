import test from 'node:test';
import assert from 'node:assert/strict';
import {videoIdFromUrl, filenameFor, validateMediaUrl, checkSize, DownloadFailure, MAX_BYTES} from '../src/core.ts';
import {downloadAudio, fetchImage} from '../src/media.ts';
const id = 'jNQXAC9IVRw';
for (const url of [`https://www.youtube.com/watch?v=${id}&list=example`, `https://youtu.be/${id}?t=3`, `https://m.youtube.com/watch?v=${id}`, `https://www.youtube.com/shorts/${id}`]) {
  test(`Extrae un solo video: ${url}`, () => assert.equal(videoIdFromUrl(url), id));
}
for (const url of [`https://youtube.com.attacker.test/watch?v=${id}`, `https://user:password@youtube.com/watch?v=${id}`, 'file:///video', 'https://youtube.com/playlist?list=example', `https://youtu.be/${id}/extra`]) {
  test(`Rechaza enlace fuera de alcance: ${url}`, () => assert.throws(() => videoIdFromUrl(url)));
}
test('El nombre no permite escapar de la carpeta de descargas', () => {
  const name = filenameFor('../tema\\con:cortes?\u0000', id, 'm4a');
  assert.equal(name.split('/').length, 2); assert.ok(!name.includes('..')); assert.ok(name.endsWith('.m4a'));
});
test('Los servidores de audio deben pertenecer a googlevideo por HTTPS', () => {
  assert.equal(validateMediaUrl('https://r1.googlevideo.com/videoplayback').hostname, 'r1.googlevideo.com');
  for (const url of ['https://googlevideo.com.attacker.test/file', 'http://r1.googlevideo.com/file', 'https://localhost/file']) assert.throws(() => validateMediaUrl(url));
});
test('El tamaño debe ser conocido y estar dentro del límite', () => {
  assert.equal(checkSize(MAX_BYTES), MAX_BYTES);
  for (const size of [0, -1, NaN, Infinity, MAX_BYTES + 1]) assert.throws(() => checkSize(size));
});
const candidate = {url: 'https://r1.googlevideo.com/videoplayback', mime: 'audio/mp4', title: 'Prueba', videoId: id, itag: 140, size: 1024 * 1024 + 24, client: 'TEST'};
function audioBytes(size = candidate.size) { const data = new Uint8Array(size); data.set([0, 0, 0, 24, 102, 116, 121, 112, 77, 52, 65, 32]); return data; }
test('Descarga varios fragmentos íntegros sin enviar credenciales', async t => {
  const original = audioBytes(); const ranges: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.credentials, 'omit');
    const range = new Headers(init?.headers).get('Range')!; ranges.push(range);
    const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(range)!;
    const start = Number(first), end = Number(last);
    return new Response(original.slice(start, end + 1), {status: 206, headers: {'Content-Type': 'audio/mp4', 'Content-Range': `bytes ${start}-${end}/${original.length}`}});
  });
  let received = 0;
  const blob = await downloadAudio(candidate, new AbortController().signal, count => { received = count; });
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), original);
  assert.equal(ranges.length, 2); assert.equal(received, original.length);
});
test('Rechaza rangos incorrectos en lugar de guardar un archivo corrupto', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(audioBytes(24), {status: 206, headers: {'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 1-24/24'}}));
  await assert.rejects(downloadAudio({...candidate, size: 24}, new AbortController().signal, () => {}), {code: 'INVALID_RANGE'});
});
test('Rechaza una página HTML devuelta como si fuera audio', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(24), {status: 206, headers: {'Content-Type': 'text/html', 'Content-Range': 'bytes 0-23/24'}}));
  await assert.rejects(downloadAudio({...candidate, size: 24}, new AbortController().signal, () => {}), {code: 'INVALID_MEDIA'});
});
test('No acepta una transferencia truncada', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(audioBytes(12), {status: 206, headers: {'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 0-23/24'}}));
  await assert.rejects(downloadAudio({...candidate, size: 24}, new AbortController().signal, () => {}), {code: 'TRUNCATED_MEDIA'});
});
test('Cancelar antes de descargar evita peticiones de audio', async t => {
  const controller = new AbortController(); controller.abort(new DOMException('Cancelado', 'AbortError'));
  const request = t.mock.method(globalThis, 'fetch', () => { throw new Error('No debe llamarse'); });
  await assert.rejects(downloadAudio(candidate, controller.signal, () => {}), {name: 'AbortError'});
  assert.equal(request.mock.callCount(), 0);
});
test('Un 403 renueva la URL y reanuda el mismo fragmento sin duplicar bytes', async t => {
  const original = audioBytes(); let denied = false; let refreshes = 0; const requests: number[] = [];
  const refreshed = {...candidate, url: candidate.url + '?renewed=1'};
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!;
    const start = Number(first), end = Number(last); requests.push(start);
    if (start > 0 && !denied) { denied = true; return new Response(null, {status: 403}); }
    if (denied) assert.equal(String(url), refreshed.url);
    return new Response(original.slice(start, end + 1), {status: 206, headers: {'Content-Type': 'audio/mp4', 'Content-Range': `bytes ${start}-${end}/${original.length}`}});
  });
  const blob = await downloadAudio({...candidate, refresh: async () => { refreshes++; return refreshed; }}, new AbortController().signal, () => {});
  assert.equal(refreshes, 1); assert.deepEqual(requests, [0, 1048576, 1048576]);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), original);
});

test('El rechazo persistente tiene un límite de dos renovaciones', async t => {
  let renewals = 0;
  const request = t.mock.method(globalThis, 'fetch', async () => new Response(null, {status: 403}));
  await assert.rejects(downloadAudio({...candidate, refresh: async () => { renewals++; return candidate; }}, new AbortController().signal, () => {}), (error: unknown) => {
    assert.ok(error instanceof DownloadFailure);
    assert.equal(error.code, 'MEDIA_HTTP'); assert.equal(error.details.status, 403); assert.equal(error.details.offset, 0); assert.equal(error.details.refreshes, 2); return true;
  });
  assert.equal(renewals, 2); assert.equal(request.mock.callCount(), 3);
});

test('Un 403 sin renovación no repite peticiones inútiles', async t => {
  const request = t.mock.method(globalThis, 'fetch', async () => new Response(null, {status: 403}));
  await assert.rejects(downloadAudio(candidate, new AbortController().signal, () => {}), {code: 'MEDIA_HTTP'});
  assert.equal(request.mock.callCount(), 1);
});

for (const change of [{size: candidate.size + 1}, {itag: 139}, {mime: 'audio/webm'}, {videoId: 'aqz-KE-bpKQ'}, {audioTrack: 'different'}, {client: 'OTHER'}]) {
  test(`No mezcla un audio renovado incompatible: ${Object.keys(change)[0]}`, async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response(null, {status: 403}));
    await assert.rejects(downloadAudio({...candidate, refresh: async () => ({...candidate, ...change})}, new AbortController().signal, () => {}), {code: 'MEDIA_CHANGED'});
  });
}

test('Cancelar durante la renovación evita reanudar la transferencia', async t => {
  const controller = new AbortController();
  const request = t.mock.method(globalThis, 'fetch', async () => new Response(null, {status: 403}));
  await assert.rejects(downloadAudio({...candidate, refresh: async () => { controller.abort(new DOMException('Cancelado', 'AbortError')); return candidate; }}, controller.signal, () => {}), {name: 'AbortError'});
  assert.equal(request.mock.callCount(), 1);
});
test('Normaliza espacios Unicode del título que Firefox rechaza al guardar', () => {
  const title = 'Modern Talking - Brother Louie (Official\u00a0Video)';
  assert.equal(filenameFor(title, 'Lp2qcCrdBLA', 'm4a'),
    'FulviFetch/Modern Talking - Brother Louie (Official Video) [Lp2qcCrdBLA].m4a');
  for (const whitespace of ['\u00a0', '\u202f', '\u2007', '\u3000']) {
    assert.equal(filenameFor('Tema' + whitespace + 'musical', id, 'm4a'),
      'FulviFetch/Tema musical [' + id + '].m4a');
  }
});

test('Normalizar espacios conserva acentos y títulos en otros idiomas', () => {
  assert.equal(filenameFor('Canción\u00a0日本語', id, 'm4a'),
    'FulviFetch/Canción 日本語 [' + id + '].m4a');
});

test('La carátula solo se descarga de los servidores admitidos', async t => {
  const image = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const requested: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    requested.push(url.hostname);
    return new Response(image, {headers: {'Content-Type': 'image/jpeg'}});
  });
  const data = await fetchImage('https://i.ytimg.com/vi/abc/hqdefault.jpg', new AbortController().signal);
  assert.deepEqual(Array.from(data ?? []), Array.from(image));
  assert.deepEqual(requested, ['i.ytimg.com']);
});

test('Una carátula con una dirección no admitida no puede fallar la descarga', async t => {
  const requested: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    requested.push(url.hostname);
    return new Response(new Uint8Array(8));
  });
  // La carátula es un extra: una dirección no admitida no se descarga y no
  // tumba la descarga, que ya está terminada cuando se pide.
  assert.equal(await fetchImage('https://otro-servidor.test/c.jpg', new AbortController().signal), undefined);
  assert.equal(await fetchImage('http://i.ytimg.com/vi/abc/hqdefault.jpg', new AbortController().signal), undefined);
  assert.equal(await fetchImage('https://i.ytimg.com.otro.test/c.jpg', new AbortController().signal), undefined);
  assert.deepEqual(requested, []);
});

test('Una carátula ausente no impide descargar el audio', async () => {
  assert.equal(await fetchImage(undefined, new AbortController().signal), undefined);
});

test('Una carátula demasiado grande se descarta', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(3 * 1024 * 1024), {headers: {'Content-Type': 'image/jpeg'}}));
  assert.equal(await fetchImage('https://i.ytimg.com/vi/abc/hqdefault.jpg', new AbortController().signal), undefined);
});

test('El identificador del video se puede quitar del nombre del archivo', () => {
  assert.equal(filenameFor('Canción', id, 'm4a', false), 'FulviFetch/Canción.m4a');
  assert.equal(filenameFor('Canción', id, 'm4a'), 'FulviFetch/Canción [' + id + '].m4a');
  assert.equal(filenameFor('', id, 'webm', false), 'FulviFetch/Audio.webm');
});
