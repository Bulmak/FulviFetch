# Audio local: prototipo para Firefox

Extensión independiente para descargar el audio original de videos públicos de
YouTube. Primera etapa del [plan del proyecto](../PLAN_EXTENSION.md).

## Instalar la prueba sin compilar nada

El paquete ya está preparado en este computador.

1. Abre Firefox de escritorio actualizado.
2. Escribe `about:debugging#/runtime/this-firefox` en la barra de direcciones.
3. Pulsa **Cargar complemento temporal**.
4. Selecciona `E:\Extension_MP3\extension\dist\manifest.json`.
5. Abre **Audio local · Prototipo** desde el botón de extensiones de Firefox y
   pulsa su botón para abrir el descargador. Si Firefox solicita permisos de
   acceso a YouTube, concédelos para poder realizar la descarga.
6. Pega el enlace de un video público y pulsa **Descargar audio**.

También se puede seleccionar el ZIP de `artifacts/` desde el mismo diálogo de
complemento temporal. No se instala abriendo el ZIP desde el explorador de Windows.

El archivo se guarda en `Audio local`, dentro de la ubicación de descargas de
Firefox. Puede aparecer un diálogo de guardado si así está configurado Firefox.
Mantén abierta la página de la extensión hasta terminar. No hace falta abrir ni
reproducir el video de YouTube.

La instalación es temporal: al reiniciar Firefox hay que volver a cargarla.
La instalación permanente se preparará mediante un paquete firmado por Mozilla.
Esta prueba requiere Firefox 142 o posterior; se verificó en Firefox 158.0.

## Actualizar a la versión 0.1.1

1. Cierra las páginas antiguas de Audio local.
2. Abre `about:debugging#/runtime/this-firefox` y quita el complemento temporal.
3. Vuelve a cargar `extension/dist/manifest.json`, o el nuevo ZIP
   `artifacts/audio_local_prototipo-0.1.1.zip` desde el diálogo de carga temporal.
4. Abre la extensión y comprueba que arriba aparezca **0.1.1**.

Esta versión renueva el acceso al audio ante errores 403/410 y añade diagnóstico
por fragmento. Los rechazos persistentes pueden necesitar más investigación.
Si vuelve a fallar, copia el diagnóstico completo desde la página nueva.

## Qué funciona en esta versión

- Un enlace de video por tarea, con validación de dominio e identificador.
- Descarga en su contenedor original: se prefiere M4A/AAC y se admite WebM.
- Descarga por fragmentos con comprobación de rangos, tamaño y cabecera del archivo.
- Progreso en bytes, cancelación y guardado con el gestor del navegador.
- Renovación limitada de direcciones rechazadas, con verificación de la misma pista.
- Diagnóstico copiable sin direcciones temporales de audio, cookies ni tokens.
- Datos de visitante y versión del reproductor obtenidos desde HTML público.
- Sin reproductor integrado, ejecución de JavaScript remoto ni inicio de sesión.

## Límites de la prueba

- No convierte a MP3 ni recorta todavía.
- Solo videos públicos accesibles sin iniciar sesión. No se admiten directos.
- Los videos que requieran tokens adicionales o descifrado de URLs pueden fallar.
- Límite provisional de 64 MiB por archivo para limitar el uso de memoria.
- La tarea vive en su página: cerrarla interrumpe la operación.
- Puede haber cambios en YouTube que requieran actualizar la extensión.
- Se probó Firefox de escritorio en Windows; otros navegadores y Android no se
  consideran compatibles hasta realizar sus propias pruebas.

## Desarrollo

Las herramientas siguientes son necesarias para desarrollar, no para usar el
paquete ya generado. Node.js debe ser 22.18 o posterior; se usó 24.14.1.

```powershell
cd E:\Extension_MP3\extension
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run lint:extension
npm.cmd run package
```

- `dist/`: extensión lista para cargar, con las librerías incluidas.
- `artifacts/`: ZIP para la instalación temporal.
- `src/extractor.ts`: configuración de visitante, consultas de formatos y cabeceras.
- `src/media.ts`: transferencia por fragmentos y verificación de integridad.
- `src/core.ts`: enlaces, nombres, tamaños y validación de formatos.
- `src/app.ts`: interfaz, cancelación y guardado.
- `public/background.js`: abre la página desde el botón de la extensión.
- `tests/`: pruebas automatizadas sin acceso a Internet.
- `VERIFICACION.md`: entorno, ejemplos reales y resultados.

No se ejecuta Vite como servidor: se compilan archivos estáticos y Firefox los
carga directamente. No hay backend local ni remoto.

## Pruebas de navegador durante el desarrollo

`scripts/browser-check.mjs` usa Selenium y Geckodriver solo como herramientas de
prueba. Abre un Firefox sin interfaz con un perfil nuevo, sin usar sesiones
personales. No son parte del paquete distribuido.

En este equipo Geckodriver está en `../tools/geckodriver/geckodriver.exe` y Firefox
en `C:\Program Files\Mozilla Firefox\firefox.exe`. Las rutas se pueden configurar
con `GECKODRIVER_BIN` y `FIREFOX_BIN`. Para repetir las pruebas:

```powershell
node scripts/browser-check.mjs jNQXAC9IVRw aqz-KE-bpKQ M7lc1UVf-VE
```

Para probar la recuperación con un error artificial en el segundo fragmento:

```powershell
$env:SIMULATE_MEDIA_403_AT = '1048576'
node scripts/browser-check.mjs xoyvEMOjUWw
Remove-Item Env:\SIMULATE_MEDIA_403_AT
```

Ese fallo se inyecta solo durante la prueba. Los archivos de evidencia de la
prueba se distinguen con el sufijo `-fault403`.

Las comprobaciones de puertos de Selenium usan solo `127.0.0.1`. No se requiere
permitir conexiones entrantes desde redes públicas ni cambiar el firewall.
Los audios, capturas y diagnósticos de prueba quedan en `.test-artifacts/`,
excluido de Git.

## Dependencias y referencias

La extensión incluye YouTube.js 18.2.0 y sus dependencias; el build reúne los
avisos de licencia en `dist/THIRD_PARTY_NOTICES.txt`. No incluye yt-dlp ni los
binarios de FFmpeg del descargador Python.

Se consultó [LRC Editor](https://github.com/samgum/lrc-editor) como referencia de
arquitectura; la extensión no se conecta con ese sitio ni requiere instalarlo.

Referencias técnicas:

- [YouTube.js](https://ytjs.dev/guide/getting-started).
- [Mozilla: modificar cabeceras de peticiones](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onBeforeSendHeaders).
- [Mozilla: cargar temporalmente una extensión](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
