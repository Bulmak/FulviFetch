import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Input, MP4, BlobSource, Output, Mp4OutputFormat, BufferTarget,
  EncodedAudioPacketSource, EncodedPacket, EncodedPacketSink
} from 'mediabunny';
import {remuxM4a} from '../src/remux.ts';

async function fixture(packets = 4) {
  const output = new Output({target: new BufferTarget(), format: new Mp4OutputFormat({fastStart: 'fragmented'})});
  const source = new EncodedAudioPacketSource('aac');
  output.addAudioTrack(source); await output.start();
  // Synthetic payloads test packet copying, not AAC decoding. Real AAC is checked in Firefox.
  for (let index = 0; index < packets; index++) {
    await source.add(new EncodedPacket(new Uint8Array([0x21, 0x10, index % 256, 0x60]), 'key',
      index * 1024 / 44100, 1024 / 44100), index === 0 ? {
        decoderConfig: {codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, description: new Uint8Array([0x12, 0x10])}
      } : undefined);
  }
  source.close(); await output.finalize();
  return new Blob([output.target.buffer!], {type: 'audio/mp4'});
}
async function packets(blob: Blob) {
  const input = new Input({formats: [MP4], source: new BlobSource(blob)});
  try {
    const track = (await input.getAudioTracks())[0];
    const payloads = [];
    for await (const packet of new EncodedPacketSink(track).packets()) {
      payloads.push({data: Array.from(packet.data), timestamp: packet.timestamp, duration: packet.duration});
    }
    return {payloads, config: await track.getDecoderConfig(), duration: await track.computeDuration()};
  } finally { input.dispose(); }
}
test('Reempaqueta un MP4 fragmentado sin cambiar paquetes, configuración ni duración', async () => {
  const original = await fixture();
  const prepared = await remuxM4a(original, new AbortController().signal);
  const before = await packets(original), after = await packets(prepared.blob);
  assert.equal(prepared.packets, before.payloads.length);
  assert.deepEqual(after.payloads.map(packet => packet.data), before.payloads.map(packet => packet.data));
  assert.deepEqual(after.config, before.config);
  assert.ok(Math.abs(after.duration - before.duration) < 1 / 44100);
  assert.notDeepEqual(new Uint8Array(await original.arrayBuffer()), new Uint8Array(await prepared.blob.arrayBuffer()));
  assert.equal(prepared.blob.type, 'audio/mp4');
  const bytes = new Uint8Array(await prepared.blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes).includes('moof'), false);
});
test('El reempaquetado funciona sin decodificadores ni codificadores de audio', async () => {
  const original = await fixture();
  assert.equal(typeof globalThis.AudioDecoder, 'undefined');
  assert.equal(typeof globalThis.AudioEncoder, 'undefined');
  assert.ok((await remuxM4a(original, new AbortController().signal)).blob.size > 0);
});
test('Cancelar antes de preparar el archivo no inicia trabajo', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(remuxM4a(new Blob(['invalid']), controller.signal), {name: 'AbortError'});
});
test('Cancelar durante la copia de paquetes detiene la preparación', async () => {
  const controller = new AbortController();
  const original = await fixture(600);
  await assert.rejects(remuxM4a(original, controller.signal, copied => { if (copied >= 256) controller.abort(); }), {name: 'AbortError'});
});
test('Rechaza datos dañados en lugar de guardarlos como audio preparado', async () => {
  await assert.rejects(remuxM4a(new Blob(['not an mp4']), new AbortController().signal), {code: 'REMUX_FAILED'});
});
test('Aplica el límite de tamaño antes de leer el archivo', async () => {
  const oversized = new Blob([new Uint8Array(64 * 1024 * 1024 + 1)]);
  await assert.rejects(remuxM4a(oversized, new AbortController().signal), {code: 'TOO_LARGE'});
});
