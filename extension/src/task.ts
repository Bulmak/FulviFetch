// SPDX-License-Identifier: MPL-2.0
import {DownloadFailure, videoIdFromUrl} from './core.ts';

export type TaskResult = 'idle' | 'running' | 'complete' | 'failed' | 'cancelled';
export type EventData = Record<string, string | number | boolean>;
export interface TaskState {
  version: string; revision: number; active: boolean; url: string; status: string; detail: string;
  title: string; received: number; total: number;
  diagnostic: {version: string; result: TaskResult; events: EventData[]; [key: string]: unknown};
}
export interface TaskUpdates {
  phase(status: string): void;
  report(message: string, data?: EventData): void;
  progress(received: number, total: number): void;
  metadata(data: EventData): void;
}
export type Executor = (videoId: string, signal: AbortSignal, updates: TaskUpdates) => Promise<EventData>;

export class DownloadTask {
  private controller?: AbortController;
  private state: TaskState;
  private version: string;
  private execute: Executor;
  private changed: (state: TaskState) => void;
  constructor(version: string, execute: Executor, changed: (state: TaskState) => void = () => {}) {
    this.version = version; this.execute = execute; this.changed = changed;
    this.state = {version, revision: 0, active: false, url: '', status: 'Listo para comenzar',
      detail: 'Audio original en M4A o WebM.', title: '', received: 0, total: 0,
      diagnostic: {version, result: 'idle', events: []}};
  }
  snapshot(): TaskState { return structuredClone(this.state); }
  restore(saved?: TaskState) {
    if (!saved || saved.version !== this.version || !Array.isArray(saved.diagnostic?.events)) return;
    this.state = structuredClone(saved);
    if (this.state.active) {
      this.state.active = false;
      this.state.status = 'Descarga interrumpida';
      this.state.detail = 'Firefox interrumpió la tarea. Vuelve a iniciar la descarga.';
      this.state.diagnostic.result = 'failed';
      this.state.diagnostic.code = 'BACKGROUND_INTERRUPTED';
    }
    this.publish();
  }
  private publish() { this.state.revision++; this.changed(this.snapshot()); }
  start(input: string): Promise<TaskState> {
    if (this.controller) throw new DownloadFailure('BUSY', 'Ya hay una descarga en curso.');
    const videoId = videoIdFromUrl(input);
    const controller = new AbortController(); this.controller = controller;
    this.state = {version: this.version, revision: this.state.revision, active: true,
      url: 'https://www.youtube.com/watch?v=' + videoId, status: 'Obteniendo el audio',
      detail: 'Preparando la descarga.', title: '', received: 0, total: 0,
      diagnostic: {version: this.version, extractor: 'youtubei.js 18.2.0', videoId, result: 'running', events: []}};
    this.publish();
    const updates: TaskUpdates = {
      phase: status => { this.state.status = status; this.publish(); },
      report: (message, data = {}) => {
        this.state.detail = message;
        this.state.diagnostic.events.push({message, ...data});
        if (this.state.diagnostic.events.length > 60) this.state.diagnostic.events.shift();
        this.publish();
      },
      progress: (received, total) => {
        this.state.received = received; this.state.total = total;
        this.state.detail = (received / 1048576).toFixed(1) + ' de ' + (total / 1048576).toFixed(1) + ' MiB';
        this.publish();
      },
      metadata: data => {
        Object.assign(this.state.diagnostic, data);
        if (typeof data.title === 'string') this.state.title = data.title;
        this.publish();
      }
    };
    return this.run(videoId, controller.signal, updates).finally(() => {
      this.controller = undefined; this.state.active = false; this.publish();
    }).then(() => this.snapshot());
  }
  private async run(videoId: string, signal: AbortSignal, updates: TaskUpdates) {
    try {
      const metadata = await this.execute(videoId, signal, updates);
      signal.throwIfAborted();
      Object.assign(this.state.diagnostic, metadata);
      this.state.status = 'Audio guardado'; this.state.diagnostic.result = 'complete';
      updates.report('Encontrarás el archivo en tu carpeta de descargas.');
    } catch (error) {
      this.state.diagnostic.phase = this.state.status;
      this.state.diagnostic.received = this.state.received;
      this.state.diagnostic.total = this.state.total;
      this.state.status = signal.aborted ? 'Descarga cancelada' : 'No se pudo completar la descarga';
      this.state.diagnostic.result = signal.aborted ? 'cancelled' : 'failed';
      this.state.diagnostic.code = signal.aborted ? 'CANCELLED' : error instanceof DownloadFailure ? error.code : 'NETWORK_OR_EXTRACTOR_ERROR';
      updates.report(signal.aborted ? 'Puedes volver a intentarlo con el mismo enlace.'
        : error instanceof DownloadFailure ? error.message
        : 'No se pudo comunicar con YouTube. Comprueba tu conexión y vuelve a intentarlo.');
    }
  }
  cancel() { this.controller?.abort(new DOMException('Cancelado', 'AbortError')); }
}
