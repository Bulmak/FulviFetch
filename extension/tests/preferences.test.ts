import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PREFERENCES, compareFormats, formatRank, normalizePreferences} from '../src/preferences.ts';

test('Sin preferencias guardadas se usan las de fábrica', () => {
  assert.deepEqual(normalizePreferences(undefined), DEFAULT_PREFERENCES);
  assert.deepEqual(normalizePreferences({}), DEFAULT_PREFERENCES);
  assert.deepEqual(normalizePreferences('nonsense'), DEFAULT_PREFERENCES);
});

test('Las preferencias guardadas se normalizan', () => {
  assert.deepEqual(normalizePreferences({format: 'webm', includeId: false, cover: false}),
    {format: 'webm', includeId: false, cover: false});
  assert.deepEqual(normalizePreferences({format: 'inventado', includeId: 'sí', cover: 1}),
    DEFAULT_PREFERENCES);
});

test('El formato automático prefiere M4A y el elegido manda', () => {
  assert.equal(formatRank('audio/mp4', 'auto'), 1);
  assert.equal(formatRank('audio/webm', 'auto'), 0);
  assert.equal(formatRank('audio/webm', 'webm'), 1);
  assert.equal(formatRank('audio/mp4', 'webm'), 0);
  assert.equal(formatRank('audio/mp4', 'm4a'), 1);
});

test('Con el formato automático se conserva el orden original, M4A y bitrate', () => {
  const original = {mime_type: 'audio/webm', is_original: true, bitrate: 160000};
  const mp4 = {mime_type: 'audio/mp4', is_original: false, bitrate: 128000};
  assert.ok(compareFormats(original, mp4, 'auto') < 0);
  assert.ok(compareFormats(mp4, original, 'auto') > 0);
  const low = {mime_type: 'audio/mp4', is_original: false, bitrate: 48000};
  const high = {mime_type: 'audio/mp4', is_original: false, bitrate: 128000};
  assert.ok(compareFormats(low, high, 'auto') > 0);
});

test('Un formato elegido va por delante de la pista original', () => {
  const original = {mime_type: 'audio/webm', is_original: true, bitrate: 160000};
  const mp4 = {mime_type: 'audio/mp4', is_original: false, bitrate: 128000};
  assert.ok(compareFormats(original, mp4, 'm4a') > 0);
  assert.ok(compareFormats(mp4, original, 'webm') > 0);
});
