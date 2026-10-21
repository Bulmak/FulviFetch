import {DownloadFailure, videoIdFromUrl} from './core.ts';

export type TaskResult = 'idle' | 'running' | 'complete' | 'failed' | 'cancelled';
export type EventData = Record<string, string | number | boolean>;

export interface QueueItem {
  id: string;
  videoId: string;
  url: string;
  label?: string;
}

export interface TaskState {
  version: string; revision: number; active: boolean; url: string; status: string; detail: string;
  title: string; received: number; total: number;
  queue: QueueItem[];
  downloadId?: number;
  diagnostic: {version: string; result: TaskResult; events: EventData[]; [key: string]: unknown};
}
export interface TaskUpdates {
  phase(status: string): void;
  report(message: string, data?: EventData): void;
  progress(received: number, total: number): void;
  metadata(data: EventData): void;
}
export type Executor = (videoId: string, signal: AbortSignal, updates: TaskUpdates) => Promise<EventData>;

// Límite de descargas pendientes: evita que la cola crezca sin control.
export const MAX_QUEUE = 20;

// El identificador de un elemento termina en su número de secuencia.
function sequenceOf(id: string): number {
  const match = /-(\d+)$/.exec(id);
  return match?.[1] ? Number(match[1]) : 0;
}

export class DownloadTask {
  private controller?: AbortController;
  private state: TaskState;
  private version: string;
  private execute: Executor;
  private changed: (state: TaskState) => void;
  private pending: QueueItem[] = [];
  private running = false;
  private sequence = 0;
  private idle: Array<() => void> = [];
  private interruption?: string;
  constructor(version: string, execute: Executor, changed: (state: TaskState) => void = () => {}) {
    this.version = version; this.execute = execute; this.changed = changed;
    this.state = {version, revision: 0, active: false, url: '', status: 'Listo para comenzar',
      detail: 'Audio original en M4A o WebM.', title: '', received: 0, total: 0, queue: [],
      diagnostic: {version, result: 'idle', events: []}};
  }
  snapshot(): TaskState { return structuredClone(this.state); }

  restore(saved?: TaskState) {
    if (!saved || saved.version !== this.version || !Array.isArray(saved.diagnostic?.events)) return;
    this.state = structuredClone(saved);
    this.pending = Array.isArray(saved.queue) ? saved.queue.map(item => ({...item})) : [];
    // Los identificadores terminan en el número de secuencia: al restaurar hay
    // que seguir desde el mayor para no repetir ninguno.
    this.sequence = Math.max(this.sequence, ...this.pending.map(item => sequenceOf(item.id)));
    if (this.state.active) {
      // Firefox descargó el proceso de fondo: la tarea activa vuelve a la
      // cola para no perderla y el estado deja de fingir que sigue en curso.
      const videoId = this.state.diagnostic.videoId;
      if (typeof videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        this.pending.unshift({id: this.nextId(videoId), videoId,
          url: this.state.url || 'https://www.youtube.com/watch?v=' + videoId});
      }
      this.state.active = false;
      this.state.status = 'Descarga interrumpida';
      this.state.detail = 'Firefox interrumpió la tarea. Se vuelve a encolar.';
      this.state.diagnostic.result = 'failed';
      this.state.diagnostic.code = 'BACKGROUND_INTERRUPTED';
      this.interruption = 'Firefox interrumpió la tarea anterior; se vuelve a encolar.';
    }
    this.syncQueue();
    this.publish();
    if (this.pending.length) this.startNext();
  }

  // Encola un enlace. Arranca de inmediato si no hay nada en curso.
  submit(input: string, label?: string): TaskState {
    const videoId = videoIdFromUrl(input);
    if (this.pending.length >= MAX_QUEUE) {
      throw new DownloadFailure('BUSY', `La cola admite hasta ${MAX_QUEUE} descargas pendientes.`);
    }
    const item: QueueItem = {id: this.nextId(videoId), videoId, url: 'https://www.youtube.com/watch?v=' + videoId};
    if (label) item.label = label;
    this.pending.push(item);
    this.syncQueue();
    if (this.running) this.publish();
    else this.startNext();
    return this.snapshot();
  }

  // Quita un elemento pendiente sin tocar la descarga en curso.
  remove(id: string) {
    const index = this.pending.findIndex(item => item.id === id);
    if (index < 0) return;
    this.pending.splice(index, 1);
    this.syncQueue();
    this.publish();
  }

  // Vacía la cola de pendientes; la descarga en curso sigue.
  clear() {
    if (!this.pending.length) return;
    this.pending = [];
    this.syncQueue();
    this.publish();
  }

  // Cancela la descarga en curso; la cola continúa con el siguiente elemento.
  cancel() { this.controller?.abort(new DOMException('Cancelado', 'AbortError')); }

  // Resuelve cuando no queda nada en curso ni pendiente.
  whenIdle(): Promise<TaskState> {
    if (!this.running && this.pending.length === 0) return Promise.resolve(this.snapshot());
    return new Promise(resolve => { this.idle.push(() => resolve(this.snapshot())); });
  }

  private nextId(videoId: string) { return `${videoId}-${++this.sequence}`; }
  private syncQueue() { this.state.queue = this.pending.map(item => ({...item})); }
  private publish() { this.state.revision++; this.changed(this.snapshot()); }
  private settle() { const waiters = this.idle; this.idle = []; for (const resolve of waiters) resolve(); }

  private startNext() {
    const item = this.pending.shift();
    if (!item) { this.settle(); return; }
    this.syncQueue();
    this.running = true;
    const controller = new AbortController(); this.controller = controller;
    const events: EventData[] = [];
    if (this.interruption) { events.push({message: this.interruption}); this.interruption = undefined; }
    this.state = {version: this.version, revision: this.state.revision, active: true,
      url: item.url, status: 'Obteniendo el audio', detail: 'Preparando la descarga.',
      title: item.label ?? '', received: 0, total: 0, queue: this.state.queue,
      diagnostic: {version: this.version, extractor: 'youtubei.js 18.2.0', videoId: item.videoId, result: 'running', events}};
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
        if (typeof data.downloadId === 'number') this.state.downloadId = data.downloadId;
        this.publish();
      }
    };
    void this.run(item.videoId, controller.signal, updates).finally(() => {
      this.controller = undefined;
      this.running = false;
      this.state.active = false;
      this.publish();
      if (this.pending.length) this.startNext();
      else this.settle();
    });
  }

  private async run(videoId: string, signal: AbortSignal, updates: TaskUpdates) {
    try {
      const metadata = await this.execute(videoId, signal, updates);
      signal.throwIfAborted();
      Object.assign(this.state.diagnostic, metadata);
      this.state.status = 'Audio guardado'; this.state.diagnostic.result = 'complete';
      updates.report('Encontrarás el archivo en FulviFetch, dentro de tus descargas.');
    } catch (error) {
      this.state.diagnostic.phase = this.state.status;
      this.state.diagnostic.received = this.state.received;
      this.state.diagnostic.total = this.state.total;
      this.state.status = signal.aborted ? 'Descarga cancelada' : 'No se pudo completar la descarga';
      this.state.diagnostic.result = signal.aborted ? 'cancelled' : 'failed';
      this.state.diagnostic.code = signal.aborted ? 'CANCELLED' : error instanceof DownloadFailure ? error.code : 'NETWORK_OR_EXTRACTOR_ERROR';
      updates.report(signal.aborted ? 'Puedes volver a intentarlo con el mismo enlace.'
        : error instanceof DownloadFailure ? error.message
        : 'No se pudo comunicar con YouTube. Copia el diagnóstico para revisar el fallo.');
    }
  }
}
