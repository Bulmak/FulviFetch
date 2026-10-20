import {Innertube, Log, Constants} from 'youtubei.js/cf-worker';
import {DownloadFailure, extensionForMime, validateMediaUrl} from './core.ts';
import type {Candidate} from './media';
Log.setLevel(Log.Level.NONE);
interface PlaybackContext { videoId: string; visitorData: string; clientVersion: string; }
export type Report = (message: string, data?: Record<string, string | number | boolean>) => void;

// Only requests made by our own extension are adjusted. No other browsing tabs.
export async function installRequestHeaders(report: Report): Promise<() => void> {
  const extensionRoot = browser.runtime.getURL('');
  let reported = false;
  let mediaReported = false;
  const pendingMedia = new Map<string, {userAgent?: string; client: string}>();
  const listener = (details: browser.webRequest._OnBeforeSendHeadersDetails): browser.webRequest.BlockingResponse | undefined => {
    if (!details.originUrl?.startsWith(extensionRoot) && !details.documentUrl?.startsWith(extensionRoot)) return;
    const original = details.requestHeaders ?? [];
    const requestClient = new URL(details.url).searchParams.get('c');
    const client = original.find(header => header.name.toLowerCase() === 'x-youtube-client-name')?.value ?? (requestClient === 'VISIONOS' ? '101' : requestClient === 'IOS' ? '5' : undefined);
    const headers = original.filter(header => !['origin', 'referer', 'cookie', 'authorization'].includes(header.name.toLowerCase()) && !header.name.toLowerCase().startsWith('sec-fetch-'));
    const userAgent = client === '101' ? Constants.CLIENTS.VISIONOS.USER_AGENT : client === '5' ? Constants.CLIENTS.IOS.USER_AGENT : undefined;
    if (userAgent) {
      const ua = headers.find(header => header.name.toLowerCase() === 'user-agent');
      if (ua) ua.value = userAgent;
      else headers.push({name: 'User-Agent', value: userAgent});
    }
    headers.push({name: 'Origin', value: 'https://www.youtube.com'}, {name: 'Referer', value: 'https://www.youtube.com/'});
    if (new URL(details.url).hostname.endsWith('.googlevideo.com')) pendingMedia.set(details.requestId, {userAgent, client: client === '101' ? 'VISIONOS' : client === '5' ? 'IOS' : 'OTHER'});
    if (!reported) { reported = true; report('Preparando la conexión con YouTube.'); }
    return {requestHeaders: headers};
  };
  browser.webRequest.onBeforeSendHeaders.addListener(listener, {
    urls: ['https://www.youtube.com/youtubei/v1/player*', 'https://www.youtube.com/embed/*', 'https://*.googlevideo.com/*']
  }, ['blocking', 'requestHeaders']);
  const finalHeaders = (details: browser.webRequest._OnSendHeadersDetails) => {
    if (!pendingMedia.has(details.requestId)) return;
    const expected = pendingMedia.get(details.requestId)!; pendingMedia.delete(details.requestId);
    const value = (name: string) => details.requestHeaders?.find(header => header.name.toLowerCase() === name)?.value;
    const matches = value('origin') === 'https://www.youtube.com' && value('referer') === 'https://www.youtube.com/'
      && (!expected.userAgent || value('user-agent') === expected.userAgent) && !value('cookie') && !value('authorization');
    if (!mediaReported || !matches) {
      mediaReported = true;
      report('Conexión de descarga comprobada.', {headersMatch: matches, mediaClient: expected.client});
    }
  };
  browser.webRequest.onSendHeaders.addListener(finalHeaders, {urls: ['https://*.googlevideo.com/*']}, ['requestHeaders']);
  return () => {
    browser.webRequest.onBeforeSendHeaders.removeListener(listener);
    browser.webRequest.onSendHeaders.removeListener(finalHeaders);
    pendingMedia.clear();
  };
}

// Read configuration as data. No iframe, playback or downloaded JavaScript.
async function pageContext(videoId: string, signal: AbortSignal): Promise<PlaybackContext | null> {
  const response = await fetch(`https://www.youtube.com/embed/${videoId}`, {
    credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
  });
  if (!response.ok) { await response.body?.cancel(); return null; }
  const reader = response.body?.getReader();
  if (!reader) return null;
  let html = ''; let size = 0; const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read(); if (part.done) { html += decoder.decode(); break; }
      size += part.value.length;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); return null; }
      html += decoder.decode(part.value, {stream: true});
    }
  } finally { reader.releaseLock(); }
  const visitor = /"VISITOR_DATA":("(?:[^"\\]|\\.)*")/.exec(html)?.[1];
  const version = /"INNERTUBE_CLIENT_VERSION":("(?:[^"\\]|\\.)*")/.exec(html)?.[1];
  if (!visitor || !version) return null;
  const visitorData = JSON.parse(visitor), clientVersion = JSON.parse(version);
  if (typeof visitorData !== 'string' || typeof clientVersion !== 'string' || !/^\d+\.[\d.]+$/.test(clientVersion)) return null;
  return {videoId, visitorData, clientVersion};
}

function sessionFetch(signal: AbortSignal, context: PlaybackContext | null, report: Report): typeof fetch {
  return async (input, init) => {
    signal.throwIfAborted();
    const requestUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (requestUrl.protocol !== 'https:' || !['www.youtube.com', 'youtubei.googleapis.com'].includes(requestUrl.hostname)) {
      throw new DownloadFailure('UNEXPECTED_HOST', 'La extracción intentó acceder a un servidor no previsto.');
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.delete('Cookie'); headers.delete('Authorization');
    let body = init?.body;
    if (requestUrl.pathname === '/youtubei/v1/player' && typeof body === 'string') {
      const data = JSON.parse(body);
      // Request downloadable playback formats; the default iOS response can
      // advertise URLs which reject subsequent byte ranges. This is not a token.
      if (data.context?.client?.clientName === Constants.CLIENTS.IOS.NAME) data.params = '2AMB';
      if (['WEB_EMBEDDED_PLAYER', 'WEB', 'MWEB'].includes(data.context?.client?.clientName)) {
        if (data.context.client.clientName === 'WEB_EMBEDDED_PLAYER') data.context.thirdParty = {embedUrl: 'https://www.youtube.com/'};
        if (context && data.videoId === context.videoId) {
          data.context.client.clientVersion = context.clientVersion;
          headers.set('X-Youtube-Client-Version', context.clientVersion);
        }
      }
      body = JSON.stringify(data);
    }
    const response = await fetch(input, {...init, body, headers, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])});
    if (requestUrl.pathname === '/youtubei/v1/player') {
      const payload = await response.clone().json().catch(() => null);
      report('Información de reproducción recibida.', {
        http: response.status,
        playability: String(payload?.playabilityStatus?.status ?? 'UNKNOWN').slice(0, 60),
        formats: payload?.streamingData?.adaptiveFormats?.length ?? 0,
        playerReason: typeof payload?.playabilityStatus?.reason === 'string' ? payload.playabilityStatus.reason.slice(0, 160) : ''
      });
    }
    return response;
  };
}

export async function* audioCandidates(videoId: string, signal: AbortSignal, report: Report): AsyncGenerator<Candidate> {
  const context = await pageContext(videoId, signal).catch(() => { signal.throwIfAborted(); return null; });
  const api = await Innertube.create({
    generate_session_locally: true, retrieve_player: false, retrieve_innertube_config: false,
    enable_session_cache: false, visitor_data: context?.visitorData, fetch: sessionFetch(signal, context, report)
  });
  let total = 0;
  let unavailable = 0;
  const clients = ['VISIONOS', 'IOS', 'WEB_EMBEDDED', 'WEB', 'MWEB'] as const;
  for (const client of clients) {
    signal.throwIfAborted();
    report('Buscando audio disponible.', {client});
    try {
      const info = await api.getBasicInfo(videoId, {client});
      if (info.playability_status?.status !== 'OK') throw new DownloadFailure('PLAYABILITY_' + (info.playability_status?.status ?? 'UNKNOWN'), 'YouTube no permitió reproducir este video con este cliente.');
      if (info.basic_info.id !== videoId) throw new DownloadFailure('IDENTITY_MISMATCH', 'YouTube devolvió información de otro video.');
      if (info.basic_info.is_live || info.basic_info.is_private) throw new DownloadFailure('OUT_OF_SCOPE', 'Los directos y videos privados no están admitidos.');
      const formats = (info.streaming_data?.adaptive_formats ?? []).filter(format => {
        if (!format.has_audio || format.has_video || !format.url || format.drm_families?.length || format.is_type_otf) return false;
        try { extensionForMime(format.mime_type); validateMediaUrl(format.url); return true; } catch { return false; }
      }).sort((a, b) => Number(!!b.is_original) - Number(!!a.is_original)
        || Number(b.mime_type.startsWith('audio/mp4')) - Number(a.mime_type.startsWith('audio/mp4')) || b.bitrate - a.bitrate);
      report(formats.length ? 'Audio disponible; preparando la descarga.' : 'Este método no ofreció un archivo descargable.', {client, formats: formats.length});
      for (const format of formats.slice(0, 3)) {
        total++;
        const candidate: Candidate = {url: format.url!, mime: format.mime_type, title: info.basic_info.title || 'Audio', videoId, itag: format.itag, size: format.content_length, client, audioTrack: format.audio_track?.id};
        candidate.refresh = async refreshSignal => {
          refreshSignal.throwIfAborted();
          const freshContext = await pageContext(videoId, refreshSignal);
          const freshApi = await Innertube.create({generate_session_locally: true, retrieve_player: false, retrieve_innertube_config: false,
            enable_session_cache: false, visitor_data: freshContext?.visitorData, fetch: sessionFetch(refreshSignal, freshContext, report)});
          const freshInfo = await freshApi.getBasicInfo(videoId, {client});
          if (freshInfo.basic_info.id !== videoId || freshInfo.playability_status?.status !== 'OK') {
            throw new DownloadFailure('REFRESH_UNAVAILABLE', 'YouTube no permitió actualizar el acceso al audio. Prueba de nuevo en unos minutos.');
          }
          const freshFormat = freshInfo.streaming_data?.adaptive_formats.find(item => item.itag === candidate.itag && item.audio_track?.id === candidate.audioTrack && item.has_audio && !item.has_video);
          if (!freshFormat?.url || freshFormat.drm_families?.length) throw new DownloadFailure('MEDIA_CHANGED', 'El formato elegido dejó de estar disponible. Vuelve a iniciar la descarga.');
          return {...candidate, url: freshFormat.url, mime: freshFormat.mime_type, size: freshFormat.content_length, audioTrack: freshFormat.audio_track?.id};
        };
        yield candidate;
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof DownloadFailure && error.code === 'OUT_OF_SCOPE') throw error;
      if (error instanceof Error && error.message === 'This video is unavailable') unavailable++;
      report('No se pudo obtener audio con este método.', {client, code: error instanceof DownloadFailure ? error.code : 'PLAYER_REQUEST_FAILED', error: error instanceof Error ? error.name : 'UNKNOWN'});
    }
  }
  if (unavailable === clients.length) throw new DownloadFailure('VIDEO_UNAVAILABLE', 'YouTube indica que el video no está disponible. Prueba otro enlace público.');
  throw new DownloadFailure(total ? 'ALL_DOWNLOADS_FAILED' : 'NO_DIRECT_AUDIO', total
    ? 'YouTube ofreció formatos, pero no permitió completar su descarga. Copia el diagnóstico para revisar esta prueba.'
    : 'No se obtuvo audio directo. El video puede requerir acceso con cuenta, tokens o un método todavía no implementado.');
}