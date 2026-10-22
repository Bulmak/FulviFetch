<p align="center">
  <img src="extension/public/icons/icon-128.png" width="112" height="112" alt="Logo de FulviFetch">
</p>

# FulviFetch

**Tu música, en tu equipo.**

Extensión para Firefox que descarga el audio de videos públicos de YouTube
directamente a tu equipo. Sin analítica.

## Qué puedes hacer

- **Capturar y descargar** el audio del video abierto con un clic.
- Pegar otro enlace mediante **O pega el link aquí**.
- Guardar el audio original en **M4A/AAC o WebM**, según los formatos disponibles.
- Continuar la descarga con el panel cerrado mientras Firefox siga abierto.
- Consultar el progreso y cancelar la descarga desde el panel.

Los archivos se guardan directamente en la carpeta de descargas configurada en
Firefox, con el título del video. Si ya existe un archivo con el mismo nombre,
Firefox añade un número para evitar sobrescribirlo.

## Instalación

Requiere **Firefox 142 o posterior** en escritorio. Se ha probado en Windows.

1. Abre la sección de [Releases](https://github.com/Bulmak/FulviFetch/releases).
2. Descarga el archivo **`.xpi` firmado por Mozilla** de la versión que quieras instalar.
3. En Firefox, abre `about:addons` y pulsa el menú del engranaje.
4. Elige **Instalar complemento desde archivo…** y selecciona el `.xpi`.
5. Confirma la instalación y fija FulviFetch a la barra de herramientas.

El código de `main` corresponde a la **0.3.5**, preparada para su envío a la
tienda oficial de Mozilla. Mientras no esté publicada allí, puedes instalar el
`.xpi` firmado disponible en Releases y actualizarlo manualmente.

## Cómo usarlo

Abre un video de YouTube, pulsa el icono de FulviFetch y selecciona
**Capturar y descargar**. El enlace se obtiene al pulsar el botón; no necesitas
reproducir el video.

Para descargar desde otro enlace, pulsa **O pega el link aquí**, pega la URL y
selecciona **Descargar**. Puedes cerrar el panel y volver a abrirlo para consultar
el progreso.

## Privacidad

FulviFetch no utiliza analítica ni servidores propios. Las peticiones para
obtener y descargar el audio se realizan directamente a YouTube y sus servidores
de contenido. El procesamiento del archivo se realiza dentro del navegador.

## Límites actuales

- Una descarga activa a la vez.
- Solo videos públicos accesibles sin iniciar sesión; no admite directos.
- Límite de **64 MiB** tanto para el audio descargado como para el archivo preparado.
- Todavía no convierte a MP3, recorta audio ni descarga listas completas.
- Cerrar Firefox o desactivar la extensión interrumpe la descarga.
- Chrome, Edge y Android todavía no cuentan con una versión probada.
- Los cambios de YouTube pueden afectar la disponibilidad de algunos videos.

## Desarrollo

Se utilizó **Node.js 24.14.1** con **npm 11.11.0**. Node.js solo es necesario para
desarrollar y compilar la extensión.

Desde una terminal de Windows, en la raíz del repositorio:

```powershell
cd extension
npm.cmd ci
npm.cmd test
npm.cmd run package
npm.cmd run lint:extension
```

La compilación genera `extension/dist/` y el ZIP de instalación temporal en
`extension/artifacts/`. Para probarla, abre
`about:debugging#/runtime/this-firefox`, pulsa **Cargar complemento temporal** y
selecciona `extension/dist/manifest.json`. Esa instalación desaparece al
reiniciar Firefox.

Consulta la [guía de desarrollo](extension/README.md) para conocer la arquitectura
y las pruebas de navegador.

## Herramientas utilizadas

- [YouTube.js](https://github.com/LuanRT/YouTube.js): obtiene la información y los formatos de audio.
- [Mediabunny](https://github.com/Vanilagy/mediabunny): prepara los archivos M4A localmente, conservando el audio AAC sin recodificar.

Las licencias de las dependencias incluidas se pueden consultar desde el enlace
**Licencias** del panel de FulviFetch.

## Licencia

El código propio de FulviFetch se distribuye bajo la
[Mozilla Public License 2.0 (MPL-2.0)](LICENSE).
Puedes usarlo, estudiarlo, modificarlo y distribuirlo, también con fines comerciales.
Si distribuyes modificaciones de archivos cubiertos por esta licencia, debes
poner su código fuente a disposición de los destinatarios bajo MPL-2.0.

Las dependencias conservan sus respectivas licencias y avisos de autoría.
