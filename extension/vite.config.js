import {readFileSync} from 'node:fs';
const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export default {
  base: './',
  define: {__APP_VERSION__: JSON.stringify(packageInfo.version)},
  build: {
    target: 'firefox142', sourcemap: false, minify: false,
    rollupOptions: {
      input: {popup: 'index.html', background: 'src/background.ts', options: 'options.html'},
      output: {entryFileNames: chunk => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'}
    }
  }
};
