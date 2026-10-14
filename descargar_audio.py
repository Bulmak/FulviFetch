from pathlib import Path

import yt_dlp


def descargar_audio(url: str) -> None:
    # Guardamos los archivos junto al programa, en la carpeta audio.
    carpeta = Path(__file__).resolve().parent / "audio"
    carpeta.mkdir(exist_ok=True)

    opciones = {
        "format": "bestaudio/best",
        "outtmpl": str(carpeta / "%(title)s [%(id)s].%(ext)s"),
        "noplaylist": True,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
    }

    # Tambien podemos poner ffmpeg.exe y ffprobe.exe en tools.
    herramientas = Path(__file__).resolve().parent / "tools"
    if (herramientas / "ffmpeg.exe").is_file():
        opciones["ffmpeg_location"] = str(herramientas)

    # yt-dlp descarga el audio y llama a FFmpeg para convertirlo.
    with yt_dlp.YoutubeDL(opciones) as descargador:
        descargador.download([url])

    print(f"\nAudio guardado en: {carpeta}")


def main() -> None:
    url = input("Pega el enlace del video: ").strip()
    if not url.startswith(("https://", "http://")):
        print("Introduce un enlace que empiece por https:// o http://.")
        return

    try:
        descargar_audio(url)
    except yt_dlp.utils.DownloadError as error:
        print(f"\nNo se pudo descargar el audio: {error}")
    except KeyboardInterrupt:
        print("\nDescarga cancelada.")


if __name__ == "__main__":
    main()
