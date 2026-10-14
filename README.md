# Descargar audio con Python

Este ejemplo pide un enlace, descarga un solo video y convierte su audio a MP3.
Los archivos se guardan en `audio`, junto al programa.

## Preparacion en Windows

1. Python 3.14.3 esta instalado en `C:\Python314\python.exe`.
   Abre una nueva terminal y comprueba `& 'C:\Python314\python.exe' --version`.
   Si necesitas reinstalarlo: https://www.python.org/downloads/windows/.
2. Descarga una compilacion para Windows de FFmpeg desde los enlaces de
   https://ffmpeg.org/download.html. Extrae `ffmpeg.exe` y `ffprobe.exe`
   de la carpeta `bin` y copialos a `E:\Extension_MP3\tools`.
   FFmpeg es un programa externo: instalar un paquete Python llamado ffmpeg
   no sustituye estos ejecutables.
3. Para el soporte completo de YouTube, instala Deno y comprueba
   `deno --version` en una nueva terminal. Consulta las instrucciones
   oficiales: https://docs.deno.com/runtime/getting_started/installation/.
   yt-dlp detecta Deno desde PATH.
4. En PowerShell, ejecuta:

```powershell
cd E:\Extension_MP3
& 'C:\Python314\python.exe' -m venv .venv
.\.venv\Scripts\python.exe -m pip install -U -r requirements.txt
.\.venv\Scripts\python.exe descargar_audio.py
```

No necesitas activar el entorno: usamos directamente su ejecutable.

## Como funciona

- `input` lee el enlace que pegas.
- `Path` construye la ruta de salida y crea la carpeta `audio`.
- `opciones` es un diccionario con la configuracion de yt-dlp.
- `format` selecciona el mejor audio disponible; `best` es una alternativa
  para sitios que solo ofrecen audio junto al video.
- `outtmpl` usa el titulo y el identificador del video como nombre.
- `noplaylist` evita descargar una lista completa al pegar un enlace de video.
- `postprocessors` indica a FFmpeg que extraiga o convierta el audio a MP3
  con una tasa objetivo de 192 kb/s. Convertir no mejora la calidad original.
- `YoutubeDL` crea el descargador; `download([url])` inicia la descarga.
- `try/except` muestra un mensaje si la descarga falla.
- `if __name__ == "__main__"` inicia el programa cuando ejecutas el archivo.

## Actualizar

Si un sitio cambia y la descarga deja de funcionar, actualiza yt-dlp:

```powershell
.\.venv\Scripts\python.exe -m pip install -U -r requirements.txt
```

Documentacion de yt-dlp: https://github.com/yt-dlp/yt-dlp.

Este ejemplo todavia no se ha ejecutado. Desde la sesion de Codex, Python muestra
su version, pero al ejecutar codigo falla al cargar el modulo `encodings`.
Comprueba el comando de creacion del entorno en tu propia terminal para determinar
si el problema tambien ocurre fuera de esta sesion. FFmpeg sigue pendiente de
verificacion.
