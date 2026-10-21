# FulviFetch

Extensión para Firefox que descarga el audio de videos públicos de YouTube desde
un popup en la barra de herramientas. Versión actual: **0.4.0**.

Funciona dentro del navegador: no requiere Python, FFmpeg, programas auxiliares
ni un servidor. Guarda M4A/AAC o WebM; la conversión a MP3 y los recortes siguen
pendientes.

## Probar la extensión

1. Abre `about:debugging#/runtime/this-firefox` en Firefox de escritorio.
2. Pulsa **Cargar complemento temporal** y selecciona
   `extension/dist/manifest.json`.
3. Abre **FulviFetch** desde la barra, pega el enlace y pulsa
   **Descargar audio**.

Si ya la tienes instalada, pulsa **Recargar**. Puedes cerrar el popup durante la
descarga. La instalación temporal desaparece al reiniciar Firefox.

Consulta la [guía de instalación y desarrollo](extension/README.md) para los
permisos, requisitos y límites del prototipo.

## Organización

| Carpeta | Contenido |
| --- | --- |
| [extension/](extension/) | Código, pruebas y configuración de la extensión |
| `docs/` (solo local) | Plan, resultados de verificación y sugerencias |
| `.local/audio/` | Audios personales y archivos de comparación conservados en este equipo |
| `.local/tools/` | Herramientas opcionales para pruebas de desarrollo |

`docs/` y `.local/` están excluidos de Git, igual que `.atl/` (metadatos
locales de las herramientas). Las herramientas de esa carpeta se usan para
comprobar el prototipo durante el desarrollo; no forman parte de la extensión.

Dentro de `extension/`, `src/` contiene el código, `public/` el manifiesto y los
iconos, `tests/` las pruebas, `scripts/` la automatización y `licenses/` los avisos
auxiliares. `node_modules/`, `dist/`, `artifacts/` y `.test-artifacts/` son carpetas
locales generadas, excluidas de Git.

## Desarrollo

Se necesita Node.js para compilar y probar el proyecto:

```powershell
cd extension
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run package
npm.cmd run lint:extension
```

`npm run typecheck` comprueba los tipos del código y también los de las
pruebas. La CI (`.github/workflows/ci.yml`) ejecuta en cada push y pull request
la comprobación de tipos, las pruebas, la compilación y la validación con
`web-ext`.

El empaquetado genera `extension/dist/` y el ZIP en `extension/artifacts/`.

## Instalación permanente

Firefox solo admite complementos firmados por Mozilla. La firma se pide en
addons.mozilla.org con el canal **auto-distribuido** (unlisted): no aparece en
el catálogo, pero se instala de forma permanente como cualquier otro.

Los pasos, la firma con `npm run sign` y el paquete de fuentes que pide Mozilla
están en [extension/README.md](extension/README.md#instalación-permanente).
