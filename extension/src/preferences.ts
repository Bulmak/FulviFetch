// Preferencias del usuario. Se guardan en `storage.local`, así que no se
// pierden al reiniciar Firefox.
export type AudioFormat = 'auto' | 'm4a' | 'webm';

export interface Preferences {
  format: AudioFormat;
  includeId: boolean;
  cover: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {format: 'auto', includeId: true, cover: true};

export function normalizePreferences(value: unknown): Preferences {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof Preferences, unknown>>;
  return {
    format: raw.format === 'm4a' || raw.format === 'webm' ? raw.format : 'auto',
    includeId: typeof raw.includeId === 'boolean' ? raw.includeId : DEFAULT_PREFERENCES.includeId,
    cover: typeof raw.cover === 'boolean' ? raw.cover : DEFAULT_PREFERENCES.cover
  };
}

// Orden de preferencia entre formatos de audio. Con 'auto' se prefiere M4A,
// que se reproduce en todas partes; con un formato elegido, ese gana. Si no
// hay formato elegido disponible, se usa el otro: es una preferencia, no un
// filtro.
export function formatRank(mime: string, format: AudioFormat): number {
  const isWebm = mime.startsWith('audio/webm');
  if (format === 'webm') return isWebm ? 1 : 0;
  return isWebm ? 0 : 1;
}

interface AudioFormatInfo {
  mime_type: string;
  is_original?: boolean;
  bitrate: number;
}

// Ordena los formatos de audio. Con 'auto' se conserva el orden de siempre:
// pista original primero, M4A después y, a igualdad, mayor bitrate. Con un
// formato elegido, ese formato va por delante.
export function compareFormats(a: AudioFormatInfo, b: AudioFormatInfo, format: AudioFormat): number {
  const rank = (value: AudioFormatInfo) => formatRank(value.mime_type, format);
  if (format !== 'auto') {
    const byFormat = rank(b) - rank(a);
    if (byFormat) return byFormat;
  }
  const byOriginal = Number(!!b.is_original) - Number(!!a.is_original);
  if (byOriginal) return byOriginal;
  const byFormat = rank(b) - rank(a);
  if (byFormat) return byFormat;
  return b.bitrate - a.bitrate;
}
