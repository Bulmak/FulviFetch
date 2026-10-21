# FulviFetch: experiencia de descarga

Objetivo: que descargar audio de YouTube deje de exigir copiar y pegar un
enlace, y permita dejar varios audios en cola mientras se reproduce el panel.

Rama: `feat/queue-and-download-ux` (base `main` en `8bbb489`).
Entrega: una sola pull request con commits por unidad de trabajo.
Pruebas: `npm run typecheck`, `npm test`, `npm run build`, `npm run lint:extension`.

## Specs

### S1 — Cola de descargas

El panel permite encolar varios videos. Al enviar un enlace mientras hay una
descarga en curso, el enlace **no** se rechaza: se queda en cola y se descarga
después, en orden, sin intervention del usuario.

La cola se guarda en `storage.session`, de modo que sobrevive a que Firefox
descargue el proceso de fondo y a que se cierre y se vuelva a abrir el panel.

Aceptación: dos enlaces enviados seguidos producen dos descargas sucesivas; el
segundo aparece en la cola mientras el primero se descarga; al terminar el
primero, el segundo arranca solo.

### S2 — Quitar elementos de la cola

Cada elemento en cola se puede quitar, y la cola se puede vaciar de una vez.
Quitar un elemento pendiente no afecta a la descarga en curso.

Aceptación: quitar un elemento lo desaparece de la lista y no se descarga;
vaciar la cola deja solo la descarga en curso.

### S3 — Cancelar y seguir

Cancelar la descarga en curso la detiene y la cola continúa con el siguiente
elemento. Cancelar no borra lo que falta por descargar.

Aceptación: con dos elementos en cola, cancelar durante el primero hace que el
segundo empiece sin pedir nada.

### S4 — Menú contextual sobre enlaces

Un menú contextual "FulviFetch: descargar el audio" aparece al hacer click
derecho sobre cualquier enlace que apunte a un video de YouTube, en cualquier
página. Al pulsarlo, el video se encola.

Aceptación: click derecho sobre un enlace `youtu.be/...` o
`youtube.com/watch?v=...` muestra la entrada del menú; al pulsarla, la descarga
empieza.

### S5 — Menú contextual sobre la página del video

Un menú contextual "FulviFetch: descargar el audio de este video" aparece al
hacer click derecho sobre la página de un video de YouTube.

Aceptación: en `youtube.com/watch?v=...`, la entrada del menú aparece y al
pulsarla se encola el video de la página.

### S6 — Atajo de teclado

Un atajo (`Ctrl+Shift+Y` por defecto) descarga el video de la pestaña activa,
sin abrir el panel.

Aceptación: con un video de YouTube en la pestaña activa, el atajo encola ese
video. El atajo se puede cambiar desde los ajustes de Firefox.

### S7 — Metadatos en el archivo guardado

El M4A guardado lleva los metadatos del video: título, autor y carátula. El
título y el autor se toman de la respuesta de YouTube; la carátula, de la
miniatura del video. Los metadatos no cambian los paquetes de audio, su
configuración ni su duración.

Aceptación: el archivo guardado muestra título y autor en un reproductor, y
tiene carátula; el audio es idéntico al de la descarga sin metadatos.

### S8 — Ver el archivo en el gestor de descargas

Terminada la descarga, el panel ofrece un botón que abre el gestor de
descargas de Firefox sobre el archivo recién guardado.

Aceptación: el botón aparece al terminar y abre el archivo en el gestor.

### S9 — Página de preferencias

Existe una página de preferencias con: formato preferido (M4A o WebM), si la
carátula se guarda dentro del archivo y si el nombre del archivo incluye el
identificador del video.

Aceptación: la página se abre desde el menú de extensiones y muestra las
preferencias guardadas.

### S10 — Las preferencias se aplican y se conservan

Las preferencias se guardan en `storage.local` (no se pierden al reiniciar
Firefox) y se aplican a las descargas siguientes.

Aceptación: elegir WebM hace que la siguiente descarga use WebM cuando ese
formato esté disponible; quitar el identificador del nombre lo elimina del
archivo guardado; reiniciar Firefox no borra las preferencias.

## Tasks

| ID | Specs | Ruta | Riesgo | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1, S2, S3 | inline | item 3 (contrato del estado y del protocolo) | `ed621c0` |
| T2 | S4, S5, S6 | inline | ninguno | `d94d796` |
| T3 | S7 | inline | ninguno | `78be438` |
| T4 | S8, S9, S10 | inline | ninguno | `4928693` |

Ruta declarada: **inline** para las cuatro unidades. No hay razón de Writer:
las unidades comparten `src/background.ts`, `src/app.ts` y el manifiesto, así
que no pueden ir en paralelo con superficies de edición disjuntas, y el
contexto de la sesión está por debajo del límite de delegación.

T1 nombra un ítem de riesgo: cambia la forma del estado guardado y la
semántica de `START_TASK`, que consume la prueba de navegador. Por eso lleva
verificador independiente al final de la feature.

Estrategia de entrega: `single-pr`, una rama y una pull request con un commit
por unidad de trabajo. Lo eligió la persona usuaria.

## Log

- L1 (2026-10-21): "Podemos darle al Tier 1 y asi despues hacemos un test real
  con mi navegador para probar y creamos una nueva rama y lo subimos, asi
  despues mi colega si le parece se hace un merge."
- L1b (2026-10-21): "Puedes realizar el tier 3. Despues veremos en cuanto a
  funciones extra." — el Tier 3 quedó cerrado antes de empezar esta feature
  (commits `288ccf6`, `476bc70`, `8bbb489`).
- Decisión: el recorte de audio (T5, no listado arriba) queda fuera de esta
  entrega. Necesita un selector de intervalo en el panel y es la pieza con
  menor relación valor/complejidad del Tier 1; queda como unidad siguiente.
- Decisión: el atajo de teclado es `Ctrl+Shift+Y`, que Firefox no reserva.
- Decisión (S9): la preferencia de "calidad" se cambió por "guardar la
  carátula". Entre las calidades disponibles de YouTube la diferencia real es
  el bitrate, y el extractor ya elige el mayor; una opción de "calidad
  normal" obligaba a definir un criterio que no existe. La carátula sí es una
  decisión clara del usuario y encaja con los metadatos de T3.
- Verificación por unidad: `npm run typecheck`, `npm test`, `npm run build` y
  `npm run lint:extension` en verde al cerrar cada commit. La suite pasó de
  57 a 93 pruebas.
- T1 lleva además una comprobación de cola en `scripts/browser-check.mjs`:
  envía dos enlaces seguidos y comprueba que el segundo queda en cola y que
  los dos videos se guardan.
- Verificador independiente de T1: S1, S2 y S3 cumplidas, sin bloqueantes. Sus
  dos avisos se corrigieron en `de8d419` (identificadores repetidos en la cola
  y mensaje de cola llena).
- Revisión nativa de la rama completa: **aprobada** y acuse registrado. Dos
  hallazgos severos se corrigieron antes de aprobarla:
  - `R3-cover-invalid-url` (CRITICAL): la validación de la carátula estaba
    fuera del bloque de protección y una dirección no admitida tumbaba la
    descarga. Corregido en `b79be8a`.
  - `R3-ci-forbid-only` (BLOCKER): la CI no impedía un `test.only` commiteado.
    Corregido en `b79be8a` con `scripts/check-only.ts`.
  - `R4-persistence-not-awaited` (CRITICAL): la cola y el estado final se
    escribían sin esperar. Corregido en `fdd00df`.
- Avisos de legibilidad que la revisión deja como trabajo posterior, no
  bloqueantes: constantes con nombre para los números mágicos (200 ms, 200
  caracteres, 15 s); agrupar los parámetros posicionales de
  `audioCandidates`, `remuxM4a` y `filenameFor`; `validateImageUrl` duplica
  comprobaciones de `validateMediaUrl`; `fetchImage` duplica el streaming de
  `downloadAudio`; `compareFormats` calcula el rango dos veces;
  `DownloadTask.restore` hace demasiadas cosas a la vez; el campo `idle`
  guarda esperas y no un estado; y `START_TASK` pide el estado dos veces.
- Pendiente de una prueba en un Firefox real: la comprobación de navegador no
  se puede ejecutar en el equipo donde se escribió el código.
