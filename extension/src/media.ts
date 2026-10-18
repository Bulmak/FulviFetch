import {checkSize, DownloadFailure, extensionForMime, validateMagic, validateMediaUrl, validateRange} from './core.ts';
export interface Candidate {
  url: string; mime: string; title: string; videoId: string; itag: number; size?: number; client: string;
  audioTrack?: string;
  refresh?: (signal: AbortSignal) => Promise<Candidate>;
}
type Report = (message: string, data?: Record<string, string | number | boolean>) => void;

export function validateRefreshedMedia(original: Candidate, fresh: Candidate, size: number): URL {
  const url = validateMediaUrl(fresh.url);
  const freshSize = Number(fresh.size || url.searchParams.get('clen'));
  if (fresh.videoId !== original.videoId || fresh.client !== original.client || fresh.itag !== original.itag
      || fresh.mime !== original.mime || fresh.audioTrack !== original.audioTrack || freshSize !== size) {
    throw new DownloadFailure('MEDIA_CHANGED', 'YouTube cambió el formato o la pista durante la descarga. Vuelve a iniciar la tarea para evitar mezclar archivos.');
  }
  return url;
}

export async function downloadAudio(candidate: Candidate, signal: AbortSignal, progress: (received: number, total: number) => void, report: Report = () => {}): Promise<Blob> {
  let url = validateMediaUrl(candidate.url);
  const extension = extensionForMime(candidate.mime);
  let refreshes = 0;
  const maxRefreshes = 2;
  async function renew(status: number, offset: number, size?: number): Promise<boolean> {
    if (!candidate.refresh || refreshes >= maxRefreshes || ![403, 410].includes(status)) return false;
    signal.throwIfAborted(); refreshes++;
    report('Actualizando el acceso al audio para continuar.', {status, offset, refresh: refreshes});
    const fresh = await candidate.refresh(signal);
    signal.throwIfAborted();
    const expectedSize = size ?? checkSize(Number(candidate.size || url.searchParams.get('clen') || fresh.size));
    url = validateRefreshedMedia(candidate, fresh, expectedSize);
    return true;
  }
  let size = Number(candidate.size || url.searchParams.get('clen'));
  while (!Number.isSafeInteger(size) || size <= 0) {
    signal.throwIfAborted();
    const probe = await fetch(url, {headers: {Range: 'bytes=0-0'}, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])});
    if (probe.status !== 206) {
      await probe.body?.cancel();
      if (await renew(probe.status, 0)) { size = Number(candidate.size || url.searchParams.get('clen')); continue; }
      throw new DownloadFailure('MEDIA_HTTP', `YouTube no permitió comprobar el audio (HTTP ${probe.status}).`, {status: probe.status, offset: 0, refreshes});
    }
    size = Number(/\/(\d+)$/.exec(probe.headers.get('Content-Range') ?? '')?.[1]);
    await probe.body?.cancel(); break;
  }
  checkSize(size);
  const parts: ArrayBuffer[] = [];
  const chunkSize = 1024 * 1024;
  progress(0, size);
  for (let start = 0; start < size; start += chunkSize) {
    signal.throwIfAborted();
    const end = Math.min(start + chunkSize - 1, size - 1);
    let part: ArrayBuffer | undefined;
    let transientRetries = 0;
    while (part === undefined) {
      signal.throwIfAborted();
      try {
        const response = await fetch(url, {headers: {Range: `bytes=${start}-${end}`}, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)])});
        if (response.url) validateMediaUrl(response.url);
        if (response.status !== 206) {
          await response.body?.cancel();
          if (await renew(response.status, start, size)) continue;
          throw new DownloadFailure('MEDIA_HTTP', `YouTube rechazó un fragmento de audio (HTTP ${response.status}).`, {status: response.status, offset: start, refreshes});
        }
        try { validateRange(response.headers.get('Content-Range'), start, end, size); }
        catch (error) { await response.body?.cancel(); throw error; }
        const mime = response.headers.get('Content-Type') ?? '';
        if (mime && !/^(audio\/|application\/octet-stream)/i.test(mime)) {
          await response.body?.cancel(); throw new DownloadFailure('INVALID_MEDIA', 'YouTube devolvió una respuesta que no es audio.');
        }
        const reader = response.body?.getReader();
        if (!reader) throw new DownloadFailure('EMPTY_MEDIA', 'El servidor no devolvió audio.');
        const expected = end - start + 1;
        const data = new Uint8Array(expected);
        let offset = 0;
        try {
          while (true) {
            const item = await reader.read(); if (item.done) break;
            if (offset + item.value.length > expected) { await reader.cancel(); throw new DownloadFailure('INVALID_RANGE', 'El fragmento recibido excede el tamaño solicitado.'); }
            data.set(item.value, offset); offset += item.value.length;
          }
        } finally { reader.releaseLock(); }
        if (offset !== expected) throw new DownloadFailure('TRUNCATED_MEDIA', 'La conexión terminó antes de completar un fragmento.');
        if (start === 0) validateMagic(data, extension);
        part = data.buffer;
      } catch (error) {
        signal.throwIfAborted();
        // An access denial needs a new URL, not repeated requests to the old one.
        if (error instanceof DownloadFailure) {
          const status = Number(error.details.status);
          if (['INVALID_RANGE', 'INVALID_MEDIA', 'MEDIA_CHANGED'].includes(error.code)
              || (error.code === 'MEDIA_HTTP' && status < 500 && status !== 408)) throw error;
        }
        if (transientRetries++ >= 2) throw error;
      }
    }
    parts.push(part); progress(end + 1, size);
  }
  return new Blob(parts, {type: candidate.mime.split(';')[0]});
}
