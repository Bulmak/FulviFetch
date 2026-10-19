# Verificación de la etapa 1

Fecha: 18 de octubre de 2026.
Estado: prototipo de descarga original validado con tres videos públicos.
La conversión a MP3 y los recortes no están implementados.

## Entorno

- Windows, Firefox de escritorio 158.0, perfil temporal sin cuentas.
- Node.js 24.14.1, npm 11.11.0, Geckodriver 0.37.1.
- YouTube.js 18.2.0; versiones restantes fijadas en `package-lock.json`.
- Ejecución del paquete real instalado temporalmente mediante WebDriver.
- No se usó el descargador Python ni FFmpeg para realizar las descargas.
- FFprobe y FFmpeg se usaron después de descargar para inspeccionar los resultados;
  FFmpeg también generó un MP3 de diagnóstico fuera de la extensión.

## Descargas reales

| Video | Identificador | Resultado | Tamaño en bytes | Duración medida | Audio |
| --- | --- | --- | --- | --- | --- |
| Me at the zoo | `jNQXAC9IVRw` | Completo | 309288 | 19.063583 s | M4A, AAC |
| Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film | `aqz-KE-bpKQ` | Completo | 10271496 | 634.624580 s | M4A, AAC |
| YouTube Developers Live: Embedded Web Player Customization, grabación | `M7lc1UVf-VE` | Completo | 21746964 | 1343.692336 s | M4A, AAC |

En los tres casos se seleccionó el formato `itag=140` con el cliente `VISIONOS`.
El video no se reprodujo durante la descarga. Se verificaron bytes completos,
una única pista de audio y duración mediante FFprobe. Los casos de más de un
fragmento también ejercitaron la validación de rangos HTTP del prototipo.

El ejemplo adicional `BaW_jenozKc` fue rechazado como no disponible por YouTube.
No cuenta como descarga satisfactoria y no se usa para afirmar compatibilidad.

## Comprobaciones automatizadas

- 27 pruebas de enlaces, dominios, nombres, límites de tamaño, varios fragmentos,
  respuestas HTML, rangos incorrectos, transferencias truncadas y cancelación.
- Comprobación de tipos TypeScript y compilación con Vite.
- Validación de extensión con `web-ext lint`, sin errores ni advertencias.
- Pruebas en Firefox de enlace inválido y cancelación de una tarea iniciada,
  registradas por el comprobador de navegador.

## Hallazgos que guiaron la implementación

1. Las primeras consultas desde la extensión recibían HTTP 403. Se adaptaron
   las cabeceras exclusivamente de las peticiones originadas por la extensión.
2. Una sesión generada sin los datos actuales podía recibir `LOGIN_REQUIRED`.
   Leer la configuración de visitante del HTML público permitió obtener formatos
   en las pruebas, sin cookies de cuenta.
3. Las peticiones de audio deben conservar las cabeceras apropiadas del cliente
   elegido; corregirlas permitió completar también los archivos largos.
4. El prototipo final no necesita iframe, reproducción, scripts remotos ni PO
   Tokens proporcionados por el usuario. Otros videos podrían requerir métodos
   que esta versión todavía no implementa.
5. La búsqueda de puertos de Selenium provocó inicialmente un aviso de firewall
   para Node. El comprobador se ajustó a `127.0.0.1`; no se modificó el firewall.

## Alcance de estos resultados

Tres ejemplos exitosos no garantizan compatibilidad con todos los videos.
Los resultados dependen de la red, los requisitos que aplique YouTube y sus
cambios de implementación. El límite de 64 MiB es provisional; no se ha validado
el comportamiento con archivos cercanos al límite ni la compatibilidad con Android.
Los formatos WebM y los métodos de respaldo no cuentan con una descarga real
exitosa registrada en esta etapa.

## Actualización 0.1.1: recuperación de accesos rechazados

El usuario informó HTTP 403 para `xoyvEMOjUWw` con 0.1.0, mientras que el
programa Python podía descargarlo. El mismo enlace se descargó con 0.1.0 y
0.1.1 en el perfil limpio de pruebas: no se reprodujo el rechazo original.
No se ha confirmado si se debía a una URL intermitente, al perfil del navegador
u otra condición de la petición.

La versión 0.1.1 mejora la recuperación y el diagnóstico:

- Ante HTTP 403 o 410 vuelve a consultar la información de reproducción con
  datos nuevos de visitante y reanuda el fragmento pendiente.
- Admite un máximo de dos renovaciones por formato. Evita insistir contra la
  misma dirección cuando el acceso ya fue rechazado.
- Antes de continuar comprueba video, cliente, formato, pista, MIME y tamaño.
  Si cambian, rechaza el empalme para no crear un archivo corrupto.
- El diagnóstico incluye estado HTTP, posición del fragmento y renovaciones.
  También comprueba las cabeceras finales usando solo valores booleanos.
- La versión visible y la del diagnóstico corresponden al código compilado.

Pruebas realizadas:

- 27 pruebas unitarias aprobadas, incluidas renovación, límite de intentos,
  cambios de pista/formato y cancelación durante la renovación.
- Compilación y validación del paquete, sin errores ni advertencias.
- Descarga real de `xoyvEMOjUWw`: 2927049 bytes, AAC en M4A, 180.790567 segundos.
- Prueba en Firefox con un **403 simulado** en el fragmento que comienza en el
  byte 1048576. La extensión solicitó nueva información y terminó el archivo.
- Los audios de la descarga normal y de la prueba de recuperación resultaron
  idénticos al comparar sus SHA-256. El 403 se inyectó únicamente en el perfil
  de pruebas, no en el código distribuido.
- Enlace inválido y cancelación siguen funcionando en Firefox.

El usuario confirmó que la descarga funciona con la versión actual. Esta mejora
no garantiza resolver rechazos persistentes o requisitos adicionales de YouTube.

## Comprobación de audio en M4A y reproducción en Windows

Se probaron los enlaces completos de Compartir proporcionados por el usuario y
sus versiones `watch?v=…`, con 0.1.1 en Firefox 158.0. Las descargas finalizaron.
Los archivos de cada video fueron idénticos entre ambas formas de enlace al
comparar SHA-256.

| Video | Identificador | Bytes | Duración | Volumen medio / máximo |
| --- | --- | --- | --- | --- |
| One Piece, conmemoración del episodio 1000 | `dM7x1PNZDo0` | 1800133 | 111.177143 s | -26.8 / -8.9 dBFS |
| Jamiroquai, (Don't) Give Hate a Chance | `LHj_WC_IzFc` | 3659478 | 226.069478 s | -10.8 / 0.0 dBFS |

FFprobe identificó AAC LC estéreo a 44100 Hz en ambos archivos. FFmpeg decodificó
los archivos completos para medir su volumen: ninguno era totalmente silencioso.

### Modern Talking: Brother Louie Mix '98 (Radio Edit)

Se probaron estas tres formas de enlazar el mismo video:

- `https://www.youtube.com/watch?v=llmbcMmZuQ4&list=RDllmbcMmZuQ4&start_radio=1`
- `https://www.youtube.com/watch?v=llmbcMmZuQ4`
- `https://youtu.be/llmbcMmZuQ4?si=m170G1HBGx7X5puP`

Los tres enlaces produjeron un archivo de 3308972 bytes, 204.306667 segundos y
AAC LC estéreo a 44100 Hz. También se examinó, sin modificarlo, el archivo que
el usuario tenía en su carpeta de descargas. Los cuatro archivos tuvieron el
mismo SHA-256:

`79A35F834681CD26A12D616F96B6553EB22E172F40B3F4AC83ACFF24B37916FD`

FFmpeg decodificó el archivo completo sin errores: volumen medio -10.3 dBFS y
máximo 0.0 dBFS. No detectó silencios de al menos dos segundos por debajo de
-60 dBFS. El usuario confirmó que ese M4A se escucha en Firefox y queda mudo en
el reproductor de Windows. También confirmó que otros archivos de música sí
se escuchan en ese reproductor.

Se generó una copia MP3 local con FFmpeg para el diagnóstico: 4803339 bytes y
204.322540 segundos. El usuario confirmó que esa copia sí se escucha en Windows.
Esta conversión no forma parte de la extensión.

Los resultados apuntan a un problema de reproducción de ese M4A concreto en
Windows. No se ha identificado la causa interna ni se ha reproducido una
diferencia de contenido por usar un enlace de lista o Compartir. Se mantiene
la descarga original; la conversión a MP3 en el navegador sigue pendiente.

El comprobador de Firefox acepta identificadores y enlaces completos. Los audios,
capturas y diagnósticos se guardan en `.test-artifacts/`, excluido de Git.

## Actualización 0.2.0: popup y descarga en segundo plano

Fecha: 19 de octubre de 2026.

El botón de la extensión abre un popup de 390 px en la barra de Firefox.
No crea una pestaña. Permite pegar un enlace o utilizar el video de la pestaña
activa. El proceso de fondo gestiona una tarea para toda la extensión, su
cancelación y el guardado. El popup muestra progreso y recupera el estado al
volver a abrirse. El botón presenta actividad y una marca al terminar.

Cambios relevantes:

- Vite compila dos entradas: interfaz y proceso de fondo.
- El controlador de tarea evita descargas simultáneas y conserva diagnósticos.
- Los estados se escriben en orden en storage.session. Una interrupción del
  proceso no se presenta como una descarga que sigue activa.
- Se añadieron storage y activeTab. No se ampliaron los dominios de red.
- No se necesita mantener una pestaña abierta ni un servidor auxiliar.
- La conversión a MP3 sigue pendiente; los archivos guardados son originales.

Comprobaciones:

- 33 pruebas unitarias aprobadas, incluidas aislamiento de la interfaz,
  concurrencia, cancelación y recuperación del estado.
- TypeScript, compilación, empaquetado y web-ext lint completados; la validación
  de la extensión no reportó errores, advertencias ni avisos.
- Popup nativo abierto desde el botón de la barra en Firefox 158.0, perfil nuevo.
  Detección del video activo y ausencia de desbordamiento horizontal verificadas.
- Descargas reales de jNQXAC9IVRw (309288 bytes) y llmbcMmZuQ4 (3308972 bytes),
  cerrando el popup durante 2,5 segundos y recuperando el resultado al reabrirlo.
- Enlace de otro dominio rechazado y cancelación comprobada desde el popup.
- Prueba larga con aqz-KE-bpKQ: 10271496 bytes completos. Se añadió una pausa
  artificial de 5 segundos antes de cada petición de audio y un 403 simulado
  en el fragmento del byte 1048576, únicamente en una copia del paquete de prueba.
- El popup permaneció cerrado durante 36 segundos, sin consultar el proceso
  desde la interfaz. Al reabrirlo seguía descargando y había recibido 6291456
  bytes. Renovó el acceso una vez y terminó la descarga.
- Se conservó el tiempo de suspensión nativo de Firefox: 30000 ms. No se
  modificaron las preferencias del navegador personal ni del paquete distribuido.
- El archivo de esa prueba coincide en SHA-256 con los resultados anteriores:
  A38931B7ADE66F99FDCA01A1BF8383321142D6673544CD9A0309CC0851C336F0.
- El número de pestañas se mantuvo en uno durante todas las pruebas del popup.
- Se inspeccionaron capturas del popup inicial y después de guardar.

Una prueba de estrés adicional redujo la suspensión a 2 segundos e introdujo
pausas artificiales de 5 segundos: el proceso se suspendió. Una promesa de
mensajería pendiente por sí sola no garantiza mantenerlo vivo indefinidamente.
El diseño final confirma el inicio inmediatamente y utiliza la actividad real
de las peticiones y del progreso, con esperas de red de 15/20 segundos, por debajo
de los 30 segundos nativos. Se verificó la transferencia lenta y su recuperación
con ese comportamiento real del navegador.

Cerrar Firefox, recargar o desactivar la extensión sigue interrumpiendo las
tareas. No se implementó reanudación después de esas operaciones. El estado
de sesión se descarta al reiniciar Firefox. La compatibilidad fuera de Firefox
de escritorio y la firma del XPI siguen pendientes.
