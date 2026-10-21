import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {widgetBaseFor, locateBinary} from '../scripts/support.ts';

test('El identificador del widget se deriva del ID del complemento', () => {
  assert.equal(widgetBaseFor('audio-local@bulmak.local'), 'audio-local_bulmak_local');
  assert.equal(widgetBaseFor('fulvifetch@bulmak.local'), 'fulvifetch_bulmak_local');
  assert.equal(widgetBaseFor('fulvifetch@example.com'), 'fulvifetch_example_com');
});

test('Una ruta configurada que no existe no se usa en silencio', () => {
  const folder = mkdtempSync(join(tmpdir(), 'fulvifetch-'));
  const binary = join(folder, 'geckodriver');
  writeFileSync(binary, '');
  process.env.FULVIFETCH_TEST_BINARY = binary;
  try {
    assert.equal(locateBinary('FULVIFETCH_TEST_BINARY', []), binary);
    process.env.FULVIFETCH_TEST_BINARY = join(folder, 'ausente');
    assert.equal(locateBinary('FULVIFETCH_TEST_BINARY', []), undefined);
  } finally {
    delete process.env.FULVIFETCH_TEST_BINARY;
  }
});

test('Sin variable de entorno se busca en las rutas propuestas', () => {
  const folder = mkdtempSync(join(tmpdir(), 'fulvifetch-'));
  const binary = join(folder, 'firefox');
  writeFileSync(binary, '');
  delete process.env.FULVIFETCH_TEST_BINARY;
  assert.equal(locateBinary('FULVIFETCH_TEST_BINARY', ['/no/existe', binary]), binary);
  assert.equal(locateBinary('FULVIFETCH_TEST_BINARY', ['/no/existe']), undefined);
});
