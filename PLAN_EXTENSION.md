# Plan de la extensión de descarga de audio

Fecha: 15 de octubre de 2026.
Estado: etapa 1 validada; popup y descarga en segundo plano implementados el 19 de octubre de 2026. Ver `extension/VERIFICACION.md`.

## 1. Objetivo acordado

Crear nuestra propia extensión, empezando por Firefox de escritorio, para pegar
un enlace de YouTube, descargar su audio y guardarlo en formato original o MP3.
El usuario solo instalará la extensión y concederá los permisos necesarios.

- Sin instalar Python, yt-dlp, FFmpeg ni un programa auxiliar en el equipo.
- Sin Native Messaging, servidor local, Firebase ni backend remoto.
- Sin exigir que el usuario reproduzca el video o espere la duración de la canción.
- Con herramientas de extracción y conversión empaquetadas dentro de la extensión.
- Código y paquetes de distribución alojados en nuestro repositorio de GitHub.

El acceso a Internet seguirá siendo necesario para obtener el contenido de YouTube.
Si la técnica elegida necesita cargar brevemente un reproductor para obtener datos
de reproducción, se comprobará su viabilidad sin exigir reproducción completa,
sonido ni interacción adicional del usuario.

## 2. Alcance inicial

La primera versión admitirá un video por descarga y una tarea activa a la vez.
Se centrará en videos públicos que puedan verse sin iniciar sesión.

Quedan para etapas posteriores las listas de reproducción, directos, descargas de
video, acceso con cuenta, contenido privado, restricciones de edad y contenido de
membresía. Chrome, Edge y Android se abordarán después de validar Firefox de
escritorio.

Un video público también puede requerir verificaciones del cliente o tokens.
Que no necesite una cuenta no garantiza que se pueda descargar en todos los casos.
No se solicitará la contraseña de Google ni se leerán cookies de cuenta en la
primera versión.

## 3. Punto de partida

Ya existe un descargador de terminal que el usuario probó con éxito:

- `descargar_audio.py`.
- `requirements.txt`.
- yt-dlp y FFmpeg instalados localmente para ese programa.

Se conservará como referencia funcional. La extensión se desarrollará en una
carpeta independiente, propuesta como `extension/`, dentro del mismo repositorio.
Su ejecución no dependerá del entorno `.venv/` ni de los ejecutables de `tools/`.

## 4. Arquitectura propuesta, pendiente de validar

| Responsabilidad | Propuesta | Qué debemos comprobar |
| --- | --- | --- |
| Interfaz | HTML, CSS y TypeScript | Usabilidad y acceso desde la barra del navegador |
| Extracción de audio | YouTube.js (`youtubei.js`) | Acceso a flujos reproducibles desde Firefox sin backend |
| Descarga | Peticiones desde un contexto de extensión con permisos de dominio | Transferencia completa, fragmentos, errores y cancelación |
| Conversión y recorte | Mediabunny y `@mediabunny/mp3-encoder` | Decodificación del audio de entrada y generación de MP3 en Firefox |
| Guardado | API `downloads` del navegador | Nombres, extensiones y guardado mediante el gestor del navegador |
| Herramientas de desarrollo | Node.js, Vite y herramientas de WebExtensions | Generar un paquete reproducible |

Node.js y las herramientas de compilación serán requisitos para desarrollar, no
para el usuario final. Las librerías y sus recursos WebAssembly se incluirán en
el paquete; no se dependerá de cargar código ejecutable desde una CDN.

Flujo previsto:

```text
Enlace pegado o pestaña actual
    -> Validación del enlace y obtención de información
    -> Obtención del flujo de audio
    -> Descarga del audio
    -> Conservación del formato original o conversión/recorte
    -> Guardado con el gestor de descargas del navegador
```

Desde 0.2.0 el botón de la barra abre un popup. La descarga vive en el proceso
de fondo de Firefox y continúa cuando se cierra el panel. El popup recupera el
progreso al reabrirse; cerrar Firefox o recargar la extensión interrumpe la tarea.

## 5. Etapas y criterios de avance

### Etapa 1: demostrar la extracción y descarga

- [x] Crear el esqueleto de la extensión y cargarlo temporalmente en Firefox.
- [x] Incorporar un campo de enlace y validar los dominios y el identificador.
- [x] Probar YouTube.js con peticiones desde el contexto de la extensión.
- [x] Resolver los datos de reproducción requeridos sin autenticación de cuenta.
- [x] Guardar el audio completo en el contenedor original, sin convertir.
- [x] Registrar versiones probadas, resultado y causa de cada fallo.

Criterio de avance: descargar varios videos públicos diferentes sin instalar
componentes externos, sin reproducir la canción completa y sin desactivar
protecciones del navegador. Una descarga aislada no bastará como validación.

Esta etapa es la principal incertidumbre. Si falla, se investigará la causa antes
de construir la interfaz completa. Cambiar a un backend o programa auxiliar sería
un cambio de requisitos que debe discutirse con el usuario.

### Etapa 2: validar MP3 y límites de recursos

- [ ] Empaquetar Mediabunny y su codificador MP3 WebAssembly.
- [ ] Verificar decodificación de los formatos obtenidos en la etapa 1.
- [ ] Exportar MP3 con una calidad inicial de 192 kb/s.
- [ ] Comparar duración, integridad y reproducción con el audio original.
- [ ] Medir tiempo y memoria con canciones cortas y archivos más largos.
- [ ] Liberar buffers, URLs temporales y workers después de cada tarea.

Criterio de avance: obtener MP3 reproducibles en Firefox sin depender de códecs
externos instalados por el usuario. Convertir a MP3 no mejora la calidad original.

Alternativa si hay incompatibilidades: evaluar FFmpeg WebAssembly empaquetado en
la extensión. Se compararán tamaño, memoria, velocidad y compatibilidad antes de
elegirlo. No se usarán los `.exe` de Windows dentro del navegador.

### Etapa 3: construir el flujo de uso

- [x] Añadir acceso desde el botón de la extensión.
- [x] Permitir pegar un enlace o tomarlo de la pestaña actual al pulsar el botón.
- [ ] Mostrar título, duración y formato cuando estén disponibles.
- [ ] Ofrecer formato original o MP3 y un nombre de salida editable.
- [ ] Mostrar estados: obteniendo información, descargando, convirtiendo y listo.
- [x] Mostrar porcentaje solo cuando exista un total conocido.
- [x] Permitir cancelar y volver a intentar sin duplicar tareas.
- [ ] Mostrar errores concretos y una acción útil para cada caso.

Criterio de avance: completar el flujo sin abrir terminales ni ajustar rutas del
sistema. El guardado utilizará las capacidades del navegador, no una ruta fija
como `E:\Extension_MP3\audio`.

### Etapa 4: incorporar recortes y tonos

- [ ] Permitir inicio y final en segundos o minutos y segundos.
- [ ] Admitir decimales, por ejemplo inicio `3.5` y final `16`.
- [ ] Validar que el final sea posterior al inicio y no exceda la duración.
- [ ] Añadir una vista previa local del fragmento.
- [ ] Exportar el recorte a MP3 sin modificar el archivo original.

Criterio de avance: exportar el ejemplo de 3.5 a 16 segundos con la duración
esperada de 12.5 segundos, considerando el padding propio de la codificación MP3.
La primera implementación podrá descargar el audio completo antes de recortar;
la descarga exclusiva de un fragmento sería una optimización posterior.

### Etapa 5: pruebas y paquete para Firefox

- [ ] Reducir los permisos a los dominios y funciones realmente necesarios.
- [ ] No almacenar credenciales, tokens ni direcciones temporales en registros.
- [ ] Probar permisos denegados, enlaces inválidos y contenido fuera del alcance.
- [ ] Probar desconexión, URL caducada, cancelación y varias descargas sucesivas.
- [ ] Verificar que no queden recursos de tareas anteriores en memoria.
- [ ] Revisar licencias y avisos de las dependencias antes de distribuirlas.
- [ ] Documentar instalación, uso, límites conocidos y proceso de actualización.
- [ ] Generar el paquete `.xpi` y solicitar firma de Mozilla como no listado.
- [ ] Publicar el paquete firmado en GitHub Releases cuando esté listo.

Criterio de avance: instalar y usar el paquete en un perfil limpio de Firefox
normal, sin Python, FFmpeg externo, servidor ni herramientas de desarrollo.
La firma y revisión de Mozilla son un paso externo: su aprobación no está
asegurada por haber completado las pruebas.

### Etapa 6: otros navegadores y Android

- [ ] Adaptar manifiestos y diferencias de APIs para Chrome y Edge.
- [ ] Probar instalación local y todas las operaciones en cada navegador.
- [ ] Investigar Firefox Android como una entrega independiente.

No se prometerá compatibilidad móvil por compartir código con escritorio.
La compatibilidad de WebCodecs y los límites de memoria deben verificarse aparte.

## 6. Matriz mínima de pruebas

| Caso | Resultado esperado |
| --- | --- |
| Enlace público de `youtube.com/watch` | Audio completo o error explicado |
| Enlace corto `youtu.be` y enlace con parámetros de lista | Un solo video |
| Varias canciones y una grabación más larga | Sin truncamientos; recursos medidos |
| Video privado o que exige iniciar sesión | Aviso de que no está admitido |
| Enlace inválido o de otro dominio | Rechazo antes de iniciar peticiones innecesarias |
| Conexión interrumpida o URL caducada | Error recuperable, sin archivo presentado como correcto |
| Cancelación durante descarga o conversión | Tarea detenida y recursos liberados |
| Cierre del popup | El proceso de fondo mantiene la tarea y el panel recupera su estado |
| Recorte de 3.5 a 16 segundos | Fragmento esperado y original conservado |
| Instalación en un perfil limpio | Solo extensión y sus permisos |

## 7. Incertidumbres y mantenimiento

- YouTube puede cambiar los clientes, los desafíos y los requisitos de tokens.
  Se necesitarán versiones nuevas de la extensión cuando cambie la extracción.
- CORS, permisos de dominio, cabeceras y políticas de ejecución son problemas
  distintos. Conceder acceso a un dominio no resuelve los demás automáticamente.
- YouTube.js puede requerir adaptar la ejecución de lógica del reproductor a las
  restricciones de la extensión. No se ejecutará código remoto sin un diseño
  compatible con las restricciones del navegador y los requisitos de distribución.
- La disponibilidad de códecs varía según navegador, versión y plataforma.
- Los archivos largos pueden requerir límites o almacenamiento temporal para no
  agotar memoria. El primer prototipo medirá esto antes de fijar un límite.
- Los proyectos encontrados son referencias de arquitectura, no dependencias
  auditadas ni pruebas de funcionamiento en nuestro entorno.

La selección de YouTube.js y Mediabunny es una propuesta, no una garantía de
compatibilidad. La primera entrega será una prueba de extracción; solo después
se confirmará la arquitectura de la extensión completa.

## 8. Fuentes consultadas

- [YouTube.js: configuración y ejecución JavaScript](https://ytjs.dev/guide/getting-started).
- [LRC Editor: extensión de referencia](https://github.com/samgum/lrc-editor#media-companion-extension).
- [Permisos de dominio en Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions).
- [Política de ejecución y WebAssembly en extensiones](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy).
- [Mediabunny: formatos y códecs](https://mediabunny.dev/guide/supported-formats-and-codecs).
- [Mediabunny: codificador MP3](https://mediabunny.dev/guide/extensions/mp3-encoder).
- [FFmpeg WebAssembly: alternativa de procesamiento](https://github.com/ffmpegwasm/ffmpeg.wasm).
- [Mozilla: instalación temporal para desarrollo](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).
- [Mozilla: firma y distribución, incluida la no listada](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).
- [Compatibilidad de AudioDecoder por plataforma](https://github.com/mdn/browser-compat-data/blob/main/api/AudioDecoder.json).
- [yt-dlp: explicación de PO Tokens](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide).

## 9. Próxima acción

Probar manualmente el prototipo siguiendo `extension/README.md` y revisar los
resultados de `extension/VERIFICACION.md`. La próxima etapa de implementación
será validar la conversión a MP3; los recortes corresponden a una etapa posterior.
