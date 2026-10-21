import {videoIdFromUrl} from './core.ts';

export interface VideoRequest {
  videoId: string;
  url: string;
  label?: string;
}

// Convierte un enlace (del menú contextual o de una pestaña) en una solicitud
// de descarga. Devuelve undefined cuando el enlace no es de un video de
// YouTube, para no encolar nada.
export function requestFromUrl(candidate: string | undefined, label?: string): VideoRequest | undefined {
  if (!candidate) return undefined;
  let videoId: string;
  try { videoId = videoIdFromUrl(candidate); } catch { return undefined; }
  const clean = label?.replace(/ - YouTube$/, '')?.trim();
  return {videoId, url: 'https://www.youtube.com/watch?v=' + videoId, ...(clean ? {label: clean} : {})};
}
