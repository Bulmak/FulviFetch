export const MAX_BYTES = 64 * 1024 * 1024;
export class DownloadFailure extends Error {
  code: string;
  details: Record<string, string | number | boolean>;
  constructor(code: string, message: string, details: Record<string, string | number | boolean> = {}) { super(message); this.name = 'DownloadFailure'; this.code = code; this.details = details; }
}
export function videoIdFromUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new DownloadFailure('INVALID_URL', 'Pega un enlace completo de YouTube.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new DownloadFailure('INVALID_URL', 'El enlace no tiene un formato admitido.');
  }
  let id: string | null = null;
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 1) id = parts[0] ?? null;
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new DownloadFailure('INVALID_URL', 'Usa el enlace de un solo video de YouTube.');
  return id;
}
export function validateMediaUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.googlevideo.com') || url.port || url.username || url.password) {
    throw new DownloadFailure('INVALID_MEDIA_URL', 'La dirección de audio no pertenece a los servidores admitidos.');
  }
  return url;
}
export function validateImageUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'i.ytimg.com' || url.port || url.username || url.password) {
    throw new DownloadFailure('INVALID_IMAGE_URL', 'La dirección de la carátula no pertenece a los servidores admitidos.');
  }
  return url;
}
export function extensionForMime(mime: string): 'm4a' | 'webm' {
  const base = (mime.split(';')[0] ?? '').trim().toLowerCase();
  if (base === 'audio/mp4') return 'm4a';
  if (base === 'audio/webm') return 'webm';
  throw new DownloadFailure('UNSUPPORTED_FORMAT', 'El formato de audio no está admitido en esta prueba.');
}
export function filenameFor(title: string, id: string, extension: string, includeId = true): string {
  const clean = title.normalize('NFC').replace(/\s/gu, ' ').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/^[. ]+|[. ]+$/g, '').slice(0, 120).replace(/[. ]+$/g, '');
  return `FulviFetch/${clean || 'Audio'}${includeId ? ` [${id}]` : ''}.${extension}`;
}
export function checkSize(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new DownloadFailure('UNKNOWN_SIZE', 'No se pudo determinar el tamaño completo del audio.');
  if (value > MAX_BYTES) throw new DownloadFailure('TOO_LARGE', 'Este prototipo admite archivos de hasta 64 MiB.');
  return value;
}
export function validateRange(header: string | null, start: number, end: number, total: number): void {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header ?? '');
  if (!match || Number(match[1]) !== start || Number(match[2]) !== end || Number(match[3]) !== total) {
    throw new DownloadFailure('INVALID_RANGE', 'El servidor devolvió un fragmento distinto del solicitado.');
  }
}
export function validateMagic(bytes: Uint8Array, extension: string): void {
  const valid = extension === 'm4a'
    ? bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp'
    : bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (!valid) throw new DownloadFailure('INVALID_MEDIA', 'La respuesta no contiene un archivo de audio válido.');
}
