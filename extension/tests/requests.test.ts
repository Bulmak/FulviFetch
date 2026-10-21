import test from 'node:test';
import assert from 'node:assert/strict';
import {requestFromUrl} from '../src/requests.ts';

test('Convierte un enlace de YouTube en una solicitud de descarga', () => {
  const request = requestFromUrl('https://youtu.be/jNQXAC9IVRw?t=10');
  assert.deepEqual(request, {videoId: 'jNQXAC9IVRw', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw'});
});

test('Acepta las formas de enlace de YouTube que se usan', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=example',
    'https://m.youtube.com/watch?v=jNQXAC9IVRw',
    'https://music.youtube.com/watch?v=jNQXAC9IVRw',
    'https://www.youtube.com/shorts/jNQXAC9IVRw',
    'https://www.youtube.com/embed/jNQXAC9IVRw'
  ]) assert.equal(requestFromUrl(url)?.videoId, 'jNQXAC9IVRw');
});

test('Ignora los enlaces que no son de un video de YouTube', () => {
  assert.equal(requestFromUrl('https://example.com/video'), undefined);
  assert.equal(requestFromUrl('https://www.youtube.com/playlist?list=example'), undefined);
  assert.equal(requestFromUrl(undefined), undefined);
  assert.equal(requestFromUrl(''), undefined);
});

test('Usa el título de la pestaña como etiqueta y quita el sufijo de YouTube', () => {
  const request = requestFromUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw', 'Modern Talking - Brother Louie - YouTube');
  assert.equal(request?.label, 'Modern Talking - Brother Louie');
});

test('Omite la etiqueta cuando no hay un título útil', () => {
  assert.equal(requestFromUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw', '   ')?.label, undefined);
  assert.equal(requestFromUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw', undefined)?.label, undefined);
});
