import {
  Input, MP4, BlobSource, EncodedPacketSink,
  Output, Mp4OutputFormat, BufferTarget, EncodedAudioPacketSource
} from 'mediabunny';
import {DownloadFailure, checkSize} from './core.ts';

export interface RemuxResult {
  blob: Blob; packets: number; inputBytes: number; outputBytes: number; milliseconds: number;
}

// Copy compressed AAC packets, without AudioDecoder, AudioEncoder, WASM or network access.
export async function remuxM4a(
  blob: Blob, signal: AbortSignal, progress: (packets: number, total: number) => void = () => {}
): Promise<RemuxResult> {
  signal.throwIfAborted(); checkSize(blob.size);
  const started = performance.now();
  const input = new Input({formats: [MP4], source: new BlobSource(blob)});
  let output: Output<Mp4OutputFormat, BufferTarget> | undefined;
  const abort = () => {
    input.dispose();
    if (output) void output.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', abort, {once: true});
  try {
    const tracks = await input.getAudioTracks();
    if (tracks.length !== 1 || (await input.getVideoTracks()).length) {
      throw new DownloadFailure('REMUX_UNSUPPORTED', 'El archivo no contiene una única pista de audio admitida.');
    }
    const track = tracks[0];
    if (await track.getCodec() !== 'aac') {
      throw new DownloadFailure('REMUX_UNSUPPORTED', 'Esta versión prepara M4A con audio AAC.');
    }
    const config = await track.getDecoderConfig();
    if (!config?.description) throw new DownloadFailure('REMUX_INVALID', 'No se pudo leer la configuración del audio.');
    const stats = await track.computePacketStats();
    if (!Number.isSafeInteger(stats.packetCount) || stats.packetCount <= 0) {
      throw new DownloadFailure('REMUX_INVALID', 'La pista de audio está vacía.');
    }
    signal.throwIfAborted();
    const target = new BufferTarget();
    output = new Output({target, format: new Mp4OutputFormat({fastStart: 'reserve'})});
    const source = new EncodedAudioPacketSource('aac');
    output.addAudioTrack(source, {maximumPacketCount: stats.packetCount});
    await output.start();
    const sink = new EncodedPacketSink(track);
    let packets = 0;
    progress(0, stats.packetCount);
    for await (const packet of sink.packets()) {
      signal.throwIfAborted();
      await source.add(packet, packets === 0 ? {decoderConfig: config} : undefined);
      packets++;
      if (packets % 256 === 0) {
        progress(packets, stats.packetCount);
        // Let Firefox deliver cancellation messages while preparing larger files.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    signal.throwIfAborted();
    if (packets !== stats.packetCount) throw new DownloadFailure('REMUX_INVALID', 'El audio terminó antes de completar la pista.');
    source.close();
    await output.finalize();
    signal.throwIfAborted();
    if (!target.buffer) throw new DownloadFailure('REMUX_INVALID', 'No se generó el archivo de audio.');
    checkSize(target.buffer.byteLength);
    const result = new Blob([target.buffer], {type: 'audio/mp4'});
    progress(packets, stats.packetCount);
    signal.throwIfAborted();
    return {blob: result, packets, inputBytes: blob.size, outputBytes: result.size,
      milliseconds: Math.round(performance.now() - started)};
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof DownloadFailure) throw error;
    throw new DownloadFailure('REMUX_FAILED', 'No se pudo preparar un M4A compatible. Copia el diagnóstico para revisar el archivo.');
  } finally {
    signal.removeEventListener('abort', abort);
    input.dispose();
    if (output && output.state !== 'finalized') await output.cancel().catch(() => undefined);
  }
}
