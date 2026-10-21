# FulviFetch: prototipo para Firefox

Extensión independiente para descargar el audio original de videos públicos de
YouTube. La versión 0.3.3 se usa desde un popup en la barra de herramientas.

## Instalar o actualizar la prueba

El paquete ya está preparado en este computador.

1. Abre `about:debugging#/runtime/this-firefox` en Firefox de escritorio.
2. Si tienes la versión anterior, cierra sus pestañas y quita el complemento temporal.
   Desde 0.3.3 el ID del complemento cambió (`fulvifetch@bulmak.local`): hay que
   quitarlo aunque el número de versión sea el mismo.
3. Pulsa **Cargar complemento temporal** y selecciona el archivo
   `dist/manifest.json` de esta carpeta (`extension/dist/manifest.json`).
4. Abre el menú de extensiones, localiza **FulviFetch** y fija su
   botón a la barra de herramientas si quieres tenerlo siempre visible.
5. Pulsa el icono: se abre un panel pequeño, sin crear una pestaña.
6. Pega un enlace o pulsa **Usar video actual**, y después **Descargar audio**.
7. Puedes cerrar y volver a abrir el panel: la tarea continúa en segundo plano.

También puedes seleccionar `artifacts/fulvifetch-0.3.3.zip` desde el
diálogo de carga temporal. Comprueba que el panel muestre **0.3.3**.

El archivo se guarda en `FulviFetch`, dentro de las descargas de Firefox.
Puede aparecer un diálogo de guardado según tu configuración. No necesitas
reproducir el video. El botón muestra un indicador durante la descarga y una
marca al terminar; el panel recupera el progreso o el último resultado.

La instalación temporal desaparece al reiniciar Firefox. La instalación
permanente mediante un XPI firmado por Mozilla sigue pendiente.
Se requiere Firefox 142 o posterior; se probó en Firefox 158.0 sobre Windows.

## Funciones y límites

- Una descarga activa a la vez y hasta 20 en cola. Los enlaces que se envían
  mientras hay una descarga en curso se descargan después, en orden, sin
  cerrar el panel. Cada elemento de la cola se puede quitar y la cola se puede
  vaciar sin detener la descarga en curso.
- La cola se guarda en la memoria de la sesión del navegador: si Firefox
  descarga el proceso de fondo, la cola se conserva y se reanuda sola.
- Detección del video de la pestaña activa al abrir el panel o pulsar su botón.
- Menú contextual: "FulviFetch: descargar el audio" sobre cualquier enlace que
  apunte a un video de YouTube, y sobre la página de un video.
- Atajo de teclado (`Ctrl+Shift+Y`, ajustable en los ajustes de Firefox) para
  descargar el video de la pestaña activa sin abrir el panel.
- Se prefiere M4A/AAC: se reempaqueta localmente para mejorar su reproducción,
  conservando los paquetes AAC sin recodificar. WebM se guarda sin ese paso.
- Transferencia por fragmentos, comprobación de rangos e integridad y cancelación.
- Alternativa iOS si el primer cliente no ofrece audio; verificada con un video
  marcado para niños. No garantiza compatibilidad con todos esos videos.
- Renovación limitada de URLs rechazadas por HTTP 403/410.
- Diagnóstico copiable sin direcciones del audio, cookies ni tokens.
- Solo videos públicos accesibles sin cuenta; no se admiten directos.
- Límite provisional de 64 MiB tanto al descargar como al preparar el archivo.
  No convierte a MP3 ni recorta todavía. El reempaquetado puede aumentar el tamaño
  del contenedor aunque el audio comprimido sea idéntico.
- Cerrar el popup no cancela. Cerrar Firefox, desactivar o recargar la extensión
  interrumpe la tarea; todavía no hay reanudación después de esas operaciones.
- El último estado se conserva en memoria de sesión del navegador. Si el proceso
  de fondo se reinicia dentro de esa sesión, una tarea que estaba activa se
  presenta como interrumpida. Al reiniciar Firefox se descarta ese estado.
- YouTube puede cambiar sus requisitos; algunos videos todavía pueden fallar.
- Chrome, Edge y Android siguen pendientes de adaptación y pruebas.

## Arquitectura del popup

- `src/app.ts`: interfaz y mensajes de iniciar, consultar o cancelar.
- `src/task.ts`: estado de la tarea, cola de descargas y cancelación.
- `src/background.ts`: extracción, descarga, guardado y actualización del icono.
- `src/extractor.ts`: contexto de visitante, consultas a YouTube y cabeceras.
- `src/media.ts`: transferencia por fragmentos y verificación del archivo.
- `src/remux.ts`: reconstrucción del M4A con Mediabunny, sin decodificar audio.
- `src/core.ts`: validación de enlaces, nombres, tamaños y formatos.
- `src/writer.ts`: escritura agrupada del estado; evita una escritura por fragmento.
- `src/feedback.ts`: mensajes de error del panel según el código del fallo.
- `public/manifest.json`: popup, proceso de fondo y permisos.
- `index.html` y `src/style.css`: estructura y presentación del panel.

Firefox MV3 usa un proceso de fondo no persistente. El manejador de inicio
acepta la tarea y devuelve el estado inicial. La ejecución pertenece al proceso
de fondo, no a la vida del popup. Las peticiones generan eventos de red y sus
esperas están limitadas a 15/20 segundos, por debajo del tiempo normal de
inactividad de Firefox (30 segundos). No se usa una
pestaña oculta ni un temporizador permanente para mantenerlo despierto.
El estado se guarda ordenadamente en `storage.session` para recuperar la
interfaz. La cola de descargas viaja en el mismo estado: si el proceso de
fondo se descarga, la cola se restaura y continúa por su cuenta.

Los permisos son `activeTab`, para leer el enlace al usar el botón o el atajo,
`storage`, para mantener el estado, y `menus`, para el menú contextual. No se
solicitan permisos para todas las webs.

## Desarrollo

Node.js se necesita para desarrollar, no para utilizar el paquete generado.
Se usó Node.js 24.14.1 y npm 11.11.0.

```powershell
cd extension
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run package
npm.cmd run lint:extension
```

`npm run typecheck` comprueba los tipos del código **y** de las pruebas: los
archivos de `tests/` también se verifican, no solo los de `src/`.

`dist/` contiene los archivos compilados y `artifacts/` el ZIP de instalación
temporal. Ambos están excluidos de Git y se generan desde el código fuente.
No se usa Vite como servidor: Firefox carga archivos estáticos empaquetados.

## Integración continua

`.github/workflows/ci.yml` ejecuta en cada push y pull request la comprobación
de tipos, las pruebas, la compilación y `web-ext lint` con Node 24 y Node 26.
Las pruebas de navegador no forman parte de la CI: necesitan un Firefox real y
acceso a YouTube, así que se ejecutan a mano con `scripts/browser-check.mjs`.

## Pruebas de navegador

`scripts/browser-check.mjs` usa Selenium, Geckodriver y un perfil desechable.
Abre el popup nativo desde la barra, verifica el video actual, cierra y reabre
el panel durante descargas reales, comprueba archivos guardados, enlaces
inválidos y cancelación, y verifica que no se hayan abierto pestañas adicionales.

El script funciona en Windows, Linux y macOS. Busca Firefox y Geckodriver en las
rutas habituales de cada sistema y, antes de eso, en `../.local/tools/`. Si no
los encuentra, hay que indicar sus rutas:

```powershell
$env:FIREFOX_BIN = 'C:\Program Files\Mozilla Firefox\firefox.exe'
$env:GECKODRIVER_BIN = 'E:\ruta\a\geckodriver.exe'
node scripts/browser-check.mjs jNQXAC9IVRw llmbcMmZuQ4
```

El identificador del botón de la barra se deriva de
`browser_specific_settings.gecko.id` del manifiesto, así que cambiar el ID del
complemento no rompe esta comprobación.

```powershell
node scripts/browser-check.mjs jNQXAC9IVRw llmbcMmZuQ4
```

También acepta enlaces completos. Para simular una transferencia lenta y un 403
en el segundo fragmento mientras el popup permanece cerrado:

```powershell
$env:SLOW_MEDIA_MS = '5000'
$env:CLOSE_POPUP_MS = '36000'
$env:SIMULATE_MEDIA_403_AT = '1048576'
node scripts/browser-check.mjs aqz-KE-bpKQ
Remove-Item Env:\SLOW_MEDIA_MS, Env:\CLOSE_POPUP_MS, Env:\SIMULATE_MEDIA_403_AT
```

La instrumentación se añade a una copia del paquete dentro de `.test-artifacts/`;
no modifica `dist/` ni el ZIP distribuido. El perfil de prueba conserva el tiempo
de suspensión nativo de Firefox y registra su valor en la evidencia.
Las capturas, diagnósticos y audios quedan en `.test-artifacts/`, excluido de Git.
Selenium busca puertos en `127.0.0.1`; no requiere abrir el firewall a redes públicas.

## Dependencias y referencias

Se incluyen YouTube.js 18.2.0 y Mediabunny 1.61.6. La compilación reúne sus licencias
en `dist/THIRD_PARTY_NOTICES.txt`, accesible desde el apartado de diagnóstico.
Mediabunny se distribuye bajo MPL-2.0, sin modificar su código fuente. Se incluye
la licencia y la dirección del paquete original con su fuente. El uso privado
no exige publicar nuestro código; al distribuir se conservan los avisos y se
informa cómo obtener la fuente de los componentes MPL.
No se incluye ni se ejecuta FFmpeg para descargar o preparar el audio.

- [Plan del proyecto](../docs/PLAN_EXTENSION.md).
- [Resultados de pruebas](../docs/VERIFICACION.md).
- [YouTube.js](https://ytjs.dev/guide/getting-started).
- [Mediabunny: copia de paquetes](https://mediabunny.dev/guide/media-sources).
- [Mozilla: preguntas sobre MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).
- [Mozilla: procesos de fondo](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts).
- [Mozilla: ciclo de vida y promesas de eventos](https://firefox-source-docs.mozilla.org/toolkit/components/extensions/webextensions/events.html).
- [Mozilla: instalación temporal](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

Se consultó [LRC Editor](https://github.com/samgum/lrc-editor) como referencia de
arquitectura. No se conecta a ese servicio ni requiere instalarlo.
