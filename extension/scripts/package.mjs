// Empaqueta la extensión como XPI. Es el formato que Firefox acepta en
// "Instalar complemento desde el archivo…" y el que espera el instalador de
// las pruebas de navegador.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const info = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const cli = resolve(root, 'node_modules', 'web-ext', 'bin', 'web-ext.js');
const filename = `fulvifetch-${info.version}.xpi`;

const result = spawnSync(process.execPath, [cli, 'build',
  '--source-dir', resolve(root, 'dist'),
  '--artifacts-dir', resolve(root, 'artifacts'),
  '--filename', filename,
  '--overwrite-dest'], {stdio: 'inherit'});

if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Paquete: ' + resolve(root, 'artifacts', filename));
