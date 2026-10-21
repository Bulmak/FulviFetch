import {readdir, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Impide que se quede commiteado un `test.only` o `describe.only`: haría que
// la suite pasara sin ejecutar casi nada, tanto en local como en la CI.
const ONLY = /\b(?:test|describe|it)\.only\s*\(/;

export async function findOnly(folder: string): Promise<string[]> {
  const files = (await readdir(folder)).filter(name => name.endsWith('.test.ts'));
  const offenders: string[] = [];
  for (const name of files) {
    const text = await readFile(resolve(folder, name), 'utf8');
    if (ONLY.test(text)) offenders.push(name);
  }
  return offenders;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const offenders = await findOnly(resolve(import.meta.dirname, '..', 'tests'));
  if (offenders.length) {
    console.error('Hay pruebas marcadas como "only" en: ' + offenders.join(', ') + '. Quita el "only" antes de continuar.');
    process.exit(1);
  }
}
