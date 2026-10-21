import {DownloadFailure} from './core.ts';

export interface Feedback {
  status: string;
  detail: string;
  // Indica que hay una tarea en curso: la interfaz debe releer el estado real
  // en vez de habilitar de nuevo los controles de descarga.
  keepRunning: boolean;
}

export function feedbackFor(error: unknown): Feedback {
  if (error instanceof DownloadFailure) {
    if (error.code === 'BUSY') {
      return {
        status: 'Ya hay una descarga en curso',
        detail: 'Espera a que termine la otra descarga o cancélala desde este panel.',
        keepRunning: true
      };
    }
    if (error.code === 'INVALID_URL') {
      return {status: 'Revisa el enlace', detail: error.message, keepRunning: false};
    }
  }
  return {
    status: 'No se pudo iniciar la descarga',
    detail: error instanceof Error ? error.message : 'No se pudo comunicar con la extensión.',
    keepRunning: false
  };
}
