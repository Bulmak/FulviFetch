// Escritor con pérdida: conserva el último estado y lo escribe como máximo una
// vez por intervalo. Las escrituras son en serie, así que un estado antiguo
// nunca pisa a uno más reciente, y el último valor siempre llega a destino.
export interface StateWriter<T> {
  push(value: T): void;
  flush(): Promise<void>;
}

export function createThrottledWriter<T>(write: (value: T) => Promise<void> | void, delayMs = 200): StateWriter<T> {
  let pending: {value: T} | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<void> = Promise.resolve();

  const commit = (value: T): Promise<void> => {
    chain = chain.catch(() => undefined).then(() => write(value));
    return chain;
  };

  const commitPending = (): void => {
    timer = undefined;
    const current = pending;
    if (!current) return;
    pending = undefined;
    void commit(current.value);
  };

  return {
    push(value: T) {
      pending = {value};
      // La primera llamada de cada intervalo agenda la escritura; las
      // siguientes se agrupan y solo la última sobrevive.
      if (timer === undefined) timer = setTimeout(commitPending, delayMs);
    },
    async flush() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      commitPending();
      // Un fallo de escritura no debe romper la cadena ni la tarea en curso.
      await chain.catch(() => undefined);
    }
  };
}
