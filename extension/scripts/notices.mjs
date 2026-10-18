import {readFile, writeFile} from 'node:fs/promises';
const notices = [
  '# Dependencias incluidas\n\nYouTube.js (youtubei.js), MIT. https://github.com/LuanRT/YouTube.js\n',
  await readFile(new URL('../node_modules/youtubei.js/LICENSE', import.meta.url), 'utf8'),
  '\n\n---\n\nDependencias de YouTube.js incluidas por el empaquetador: ver sus avisos a continuación.\n'
];
for (const name of ['fflate', 'meriyah']) {
  for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    try { notices.push(`\n\n## ${name}\n\n` + await readFile(new URL(`../node_modules/${name}/${filename}`, import.meta.url), 'utf8')); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
for (const name of ['protobuf-es-Apache-2.0.txt', 'protobuf-BSD-3-Clause.txt']) {
  notices.push('\n\n## @bufbuild/protobuf 2.16.0\n\n' + await readFile(new URL('../licenses/' + name, import.meta.url), 'utf8'));
}
await writeFile(new URL('../dist/THIRD_PARTY_NOTICES.txt', import.meta.url), notices.join('\n'));
