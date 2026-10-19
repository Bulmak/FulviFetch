# Audio local: prototipo para Firefox

Extensión independiente para descargar el audio original de videos públicos de
YouTube. La versión 0.2.0 se usa desde un popup en la barra de herramientas.

## Instalar o actualizar la prueba

El paquete ya está preparado en este computador.

1. Abre `about:debugging#/runtime/this-firefox` en Firefox de escritorio.
2. Si tienes la versión anterior, cierra sus pestañas y quita el complemento temporal.
3. Pulsa **Cargar complemento temporal** y selecciona
   `E:\Extension_MP3\extension\dist\manifest.json`.
4. Abre el menú de extensiones, localiza **Audio local · Prototipo** y fija su
   botón a la barra de herramientas si quieres tenerlo siempre visible.
5. Pulsa el icono: se abre un panel pequeño, sin crear una pestaña.
6. Pega un enlace o pulsa **Usar video actual**, y después **Descargar audio**.
7. Puedes cerrar y volver a abrir el panel: la tarea continúa en segundo plano.

También puedes seleccionar `artifacts/audio_local_prototipo-0.2.0.zip` desde el
diálogo de carga temporal. Comprueba que el panel muestre **0.2.0**.

El archivo se guarda en `Audio local`, dentro de las descargas de Firefox.
Puede aparecer un diálogo de guardado según tu configuración. No necesitas
reproducir el video. El botón muestra un indicador durante la descarga y una
marca al terminar; el panel recupera el progreso o el último resultado.

La instalación temporal desaparece al reiniciar Firefox. La instalación
permanente mediante un XPI firmado por Mozilla sigue pendiente.
Se requiere Firefox 142 o posterior; se probó en Firefox 158.0 sobre Windows.

## Funciones y límites

- Un video y una descarga activa para toda la extensión, aunque haya varios paneles.
- Detección del video de la pestaña activa al abrir el panel o pulsar su botón.
- Audio original: se prefiere M4A/AAC y se admite WebM.
- Transferencia por fragmentos, comprobación de rangos e integridad y cancelación.
- Renovación limitada de URLs rechazadas por HTTP 403/410.
- Diagnóstico copiable sin direcciones del audio, cookies ni tokens.
- Solo videos públicos accesibles sin cuenta; no se admiten directos.
- Límite provisional de 64 MiB. No convierte a MP3 ni recorta todavía.
- Cerrar el popup no cancela. Cerrar Firefox, desactivar o recargar la extensión
  interrumpe la tarea; todavía no hay reanudación después de esas operaciones.
- El último estado se conserva en memoria de sesión del navegador. Si el proceso
  de fondo se reinicia dentro de esa sesión, una tarea que estaba activa se
  presenta como interrumpida. Al reiniciar Firefox se descarta ese estado.
- YouTube puede cambiar sus requisitos; algunos videos todavía pueden fallar.
- Chrome, Edge y Android siguen pendientes de adaptación y pruebas.

## Arquitectura del popup

- `src/app.ts`: interfaz y mensajes de iniciar, consultar o cancelar.
- `src/task.ts`: estado de una tarea, exclusión de descargas simultáneas y cancelación.
- `src/background.ts`: extracción, descarga, guardado y actualización del icono.
- `src/extractor.ts`: contexto de visitante, consultas a YouTube y cabeceras.
- `src/media.ts`: transferencia por fragmentos y verificación del archivo.
- `src/core.ts`: validación de enlaces, nombres, tamaños y formatos.
- `public/manifest.json`: popup, proceso de fondo y permisos.
- `index.html` y `src/style.css`: estructura y presentación del panel.

Firefox MV3 usa un proceso de fondo no persistente. El manejador de inicio
acepta la tarea y devuelve el estado inicial. La ejecución pertenece al proceso
de fondo, no a la vida del popup. Las peticiones generan eventos de red y sus
esperas están limitadas a 15/20 segundos, por debajo del tiempo normal de
inactividad de Firefox (30 segundos). No se usa una
pestaña oculta ni un temporizador permanente para mantenerlo despierto.
El estado se guarda ordenadamente en `storage.session` para recuperar la interfaz.

Los permisos nuevos son `activeTab`, para leer el enlace al usar el botón,
y `storage`, para mantener el estado. No se solicitan permisos para todas las webs.

## Desarrollo

Node.js se necesita para desarrollar, no para utilizar el paquete generado.
Se usó Node.js 24.14.1 y npm 11.11.0.

```powershell
cd E:\Extension_MP3\extension
npm.cmd ci
npm.cmd test
npm.cmd run package
npm.cmd run lint:extension
```

`dist/` contiene los archivos compilados y `artifacts/` el ZIP de instalación
temporal. Ambos están excluidos de Git y se generan desde el código fuente.
No se usa Vite como servidor: Firefox carga archivos estáticos empaquetados.

## Pruebas de navegador

`scripts/browser-check.mjs` usa Selenium, Geckodriver y un perfil desechable.
Abre el popup nativo desde la barra, verifica el video actual, cierra y reabre
el panel durante descargas reales, comprueba archivos guardados, enlaces
inválidos y cancelación, y verifica que no se hayan abierto pestañas adicionales.

En este equipo Geckodriver está en `../tools/geckodriver/geckodriver.exe` y Firefox
en `C:\Program Files\Mozilla Firefox\firefox.exe`. Se pueden configurar sus rutas
con `GECKODRIVER_BIN` y `FIREFOX_BIN`.

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

Se incluye YouTube.js 18.2.0 y sus dependencias. La compilación reúne sus licencias
en `dist/THIRD_PARTY_NOTICES.txt`. No incluye yt-dlp ni FFmpeg del programa Python.

- [Plan del proyecto](../PLAN_EXTENSION.md).
- [Resultados de pruebas](VERIFICACION.md).
- [YouTube.js](https://ytjs.dev/guide/getting-started).
- [Mozilla: procesos de fondo](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts).
- [Mozilla: ciclo de vida y promesas de eventos](https://firefox-source-docs.mozilla.org/toolkit/components/extensions/webextensions/events.html).
- [Mozilla: instalación temporal](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

Se consultó [LRC Editor](https://github.com/samgum/lrc-editor) como referencia de
arquitectura. No se conecta a ese servicio ni requiere instalarlo.
