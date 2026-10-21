# Zorro restaurado

Variante regenerada con la herramienta integrada de imágenes a partir de
la imagen original de 1254 × 1254 px. Conserva la composición, con contornos
limpios y colores más intensos. Se conserva únicamente este paquete mejorado.

La herramienta devolvió una imagen de 1254 × 1254 px, la misma resolución que
la fuente: esta es una restauración visual, no un aumento de resolución.

- `zorro-maestro.png`: imagen regenerada con transparencia real.
- `icons/`: PNG de 16, 32, 48, 64, 96, 128, 256, 512 y 1024 px.
- `zorro.ico`: ICO con tamaños de 16 a 256 px.
- `vista_previa.png`: vista sobre fondo claro y oscuro; muestras pequeñas a tamaño real.

Los tamaños se exportan directamente desde la imagen maestra mediante
remuestreo bicúbico de alta calidad, conservando el canal alfa. Para repetir:

```powershell
./media/exportar-iconos.ps1 -Source ./media/mejorados/zorro-maestro.png
```

No se ha cambiado el manifiesto de FulviFetch.

## Prompt usado (herramienta integrada, sin API ni CLI)

Edit the supplied fox headphones logo as the edit target. Recreate it at high
resolution (2048 x 2048 if possible) with exceptionally clean smooth contours
and crisp polished vector-like raster shapes. Preserve the exact identity,
composition, direction of the fox face, curled dark charcoal/slate tail, burnt
orange fur, muted red central disc and white headphones. Keep the same restrained
gradients and closed smiling eye. Improve contour smoothness and clarity, remove
jagged raster edges. Entire logo centered with small even transparent margins so
no tip is clipped. Actual transparent background outside the silhouette; white
headphones remain opaque. No text, no extra elements, no shadow outside the logo.
This is a faithful quality restoration for browser extension icons, not a redesign.
