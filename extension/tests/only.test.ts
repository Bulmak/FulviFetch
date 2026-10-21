import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {findOnly} from '../scripts/check-only.ts';

// La marca se construye por partes: este archivo lo revisa el propio guardia.
const mark = '.only(';

test('El guardia encuentra las pruebas marcadas como "only"', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'fulvifetch-only-'));
  writeFileSync(join(folder, 'a.test.ts'), "test('uno', () => {});\n");
  writeFileSync(join(folder, 'b.test.ts'), `test${mark}'dos', () => {});\n`);
  writeFileSync(join(folder, 'c.test.ts'), `describe${mark}'tres', () => {});\n`);
  writeFileSync(join(folder, 'notas.txt'), `test${mark}'cuatro', () => {});\n`);
  assert.deepEqual(await findOnly(folder), ['b.test.ts', 'c.test.ts']);
});

test('El guardia no se equivoca con un "only" que no marca una prueba', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'fulvifetch-only-'));
  writeFileSync(join(folder, 'a.test.ts'), "const solo = 'un valor';\ntest('uno', () => solo);\n");
  assert.deepEqual(await findOnly(folder), []);
});
