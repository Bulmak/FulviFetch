import {readFileSync} from 'node:fs';
const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export default {
  base: './',
  define: {__APP_VERSION__: JSON.stringify(packageInfo.version)},
  build: {target: 'firefox142', sourcemap: false, minify: false}
};
