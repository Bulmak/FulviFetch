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
const bunny = JSON.parse(await readFile(new URL('../node_modules/mediabunny/package.json', import.meta.url), 'utf8'));
notices.push('\n\n## Mediabunny ' + bunny.version + ', MPL-2.0\n\n'
  + 'Included without changes to its source. Source under MPL-2.0 is available at:\n'
  + 'https://registry.npmjs.org/mediabunny/-/mediabunny-' + bunny.version + '.tgz (includes src/ and LICENSE)\n'
  + 'https://github.com/Vanilagy/mediabunny\n\n'
  + await readFile(new URL('../node_modules/mediabunny/LICENSE', import.meta.url), 'utf8'));
await writeFile(new URL('../dist/THIRD_PARTY_NOTICES.txt', import.meta.url), notices.join('\n'));
