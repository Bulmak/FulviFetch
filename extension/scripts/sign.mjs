// Firma la extensión con AMO para poder instalarla de forma permanente en
// Firefox. Las credenciales se sacan de addons.mozilla.org/developers →
// Developer Hub → API keys → Submit a new add-on → On your own (unlisted).
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'node_modules', 'web-ext', 'bin', 'web-ext.js');
const apiKey = process.env.AMO_API_KEY;
const apiSecret = process.env.AMO_API_SECRET;
const channel = process.env.AMO_CHANNEL || 'unlisted';

if (!apiKey || !apiSecret) {
  console.error('Faltan las credenciales de AMO. Definí AMO_API_KEY y AMO_API_SECRET.');
  console.error('Se sacan de addons.mozilla.org/developers → Developer Hub → API keys.');
  process.exit(1);
}
if (!existsSync(cli)) {
  console.error('Falta web-ext. Ejecutá antes: npm ci');
  process.exit(1);
}
if (!existsSync(resolve(root, 'dist', 'manifest.json'))) {
  console.error('Falta dist/manifest.json. Ejecutá antes: npm run build');
  process.exit(1);
}

const args = [cli, 'sign',
  '--source-dir', resolve(root, 'dist'),
  '--artifacts-dir', resolve(root, 'artifacts', 'signed'),
  '--api-key', apiKey,
  '--api-secret', apiSecret,
  '--channel', channel];

const child = spawn(process.execPath, args, {stdio: 'inherit'});
child.on('exit', code => process.exit(code ?? 1));
