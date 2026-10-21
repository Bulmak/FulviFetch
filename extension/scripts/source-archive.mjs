// Empaqueta el código fuente que Mozilla pide para poder revisar la extensión.
// El paquete sale del árbol de Git, así que solo contiene lo commiteado.
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '..');
const info = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const artifacts = resolve(root, 'artifacts');
const output = resolve(artifacts, `fulvifetch-source-${info.version}.zip`);

mkdirSync(artifacts, {recursive: true});
const result = spawnSync('git',
  ['archive', '--format=zip', `--output=${output}`, 'HEAD', 'extension', 'README.md'],
  {cwd: repo, stdio: 'inherit'});

if (result.status !== 0) {
  console.error('No se pudo crear el paquete del código fuente. ¿Está todo commiteado?');
  process.exit(result.status ?? 1);
}
console.log('Código fuente para Mozilla: ' + output);
console.log('Instrucciones de compilación: dentro del paquete, en README.md.');
console.log('El paquete sale del último commit: commiteá antes de generarlo.');
