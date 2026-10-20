import test from 'node:test';
import assert from 'node:assert/strict';
import {Constants} from 'youtubei.js/cf-worker';
import {audioCandidates, installRequestHeaders} from '../src/extractor.ts';

const id = 'mXY6yjM2m84';

test('Usa iOS cuando VISIONOS no permite reproducir y conserva el ajuste al renovar', async t => {
  const clients: string[] = [];
  let generation = 0;
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(init?.credentials, 'omit');
    assert.equal(new Headers(init?.headers).has('Cookie'), false);
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    if (url.pathname.startsWith('/embed/')) return new Response('"VISITOR_DATA":"guest","INNERTUBE_CLIENT_VERSION":"2.20261019.00.00"');
    assert.equal(url.pathname, '/youtubei/v1/player');
    const body = JSON.parse(init!.body as string);
    const client = body.context.client.clientName;
    clients.push(client);
    assert.equal(body.videoId, id);
    if (client === 'VISIONOS') {
      assert.equal(body.params, undefined);
      return Response.json({playabilityStatus: {status: 'UNPLAYABLE', reason: 'This video is not available'}, videoDetails: {videoId: id}});
    }
    assert.equal(client, Constants.CLIENTS.IOS.NAME);
    assert.equal(body.params, '2AMB');
    generation++;
    return Response.json({
      playabilityStatus: {status: 'OK'}, videoDetails: {videoId: id, title: 'Prueba para niños', lengthSeconds: '2'},
      streamingData: {expiresInSeconds: '3600', formats: [], adaptiveFormats: [{
        itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000,
        contentLength: '24', audioQuality: 'AUDIO_QUALITY_MEDIUM', audioSampleRate: '44100', audioChannels: 2,
        url: `https://r1.googlevideo.com/videoplayback?c=IOS&clen=24&test=${generation}`
      }]}
    });
  });
  const candidates = audioCandidates(id, new AbortController().signal, () => {});
  try {
    const {value: candidate, done} = await candidates.next();
    assert.equal(done, false);
    assert.equal(candidate!.client, 'IOS');
    assert.equal(candidate!.itag, 140);
    assert.equal(candidate!.videoId, id);
    const fresh = await candidate!.refresh!(new AbortController().signal);
    assert.equal(fresh.client, 'IOS');
    assert.equal(fresh.itag, candidate!.itag);
    assert.notEqual(fresh.url, candidate!.url);
    assert.deepEqual(clients, ['VISIONOS', 'iOS', 'iOS']);
  } finally { await candidates.return(undefined); }
});

test('Clasifica un video no disponible después de agotar los cinco clientes', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.startsWith('/embed/')) return new Response('', {status: 404});
    calls++;
    return Response.json({playabilityStatus: {status: 'ERROR', reason: 'This video is unavailable'}});
  });
  await assert.rejects(audioCandidates(id, new AbortController().signal, () => {}).next(), {code: 'VIDEO_UNAVAILABLE'});
  assert.equal(calls, 5);
});

test('Ajusta cabeceras iOS solo en peticiones propias y retira los manejadores al finalizar', async t => {
  const before = new Set<Function>(), sent = new Set<Function>();
  const event = (listeners: Set<Function>) => ({addListener: (fn: Function) => listeners.add(fn), removeListener: (fn: Function) => listeners.delete(fn)});
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'browser');
  Object.defineProperty(globalThis, 'browser', {configurable: true, value: {
    runtime: {getURL: () => 'moz-extension://test/'},
    webRequest: {onBeforeSendHeaders: event(before), onSendHeaders: event(sent)}
  }});
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'browser', previous); else Reflect.deleteProperty(globalThis, 'browser'); });
  const reports: unknown[] = [];
  const remove = await installRequestHeaders((message, data) => reports.push({message, ...data}));
  const [listener] = before, [finalHeaders] = sent;
  const details = {
    requestId: 'test', originUrl: 'moz-extension://test/background.js',
    url: 'https://r1.googlevideo.com/videoplayback?c=IOS',
    requestHeaders: [{name: 'User-Agent', value: 'Firefox'}, {name: 'Cookie', value: 'private'}, {name: 'Authorization', value: 'private'}]
  };
  try {
    assert.equal(listener({...details, originUrl: 'https://www.youtube.com/watch?v=' + id}), undefined);
    const result = listener(details);
    const headers = new Headers(result.requestHeaders.map((header: {name: string; value: string}) => [header.name, header.value]));
    assert.equal(headers.get('User-Agent'), Constants.CLIENTS.IOS.USER_AGENT);
    assert.equal(headers.has('Cookie'), false);
    assert.equal(headers.has('Authorization'), false);
    finalHeaders({...details, requestHeaders: result.requestHeaders});
    assert.ok(reports.some((report: any) => report.mediaClient === 'IOS' && report.headersMatch === true));
  } finally { remove(); }
  assert.equal(before.size, 0);
  assert.equal(sent.size, 0);
});
