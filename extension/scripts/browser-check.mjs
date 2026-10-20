// Browser checks use only a disposable profile. Test fault injection never enters dist/.
import portprober from 'selenium-webdriver/net/portprober.js';
const findFreePort = portprober.findFreePort;
portprober.findFreePort = (host = '127.0.0.1') => findFreePort(host);
const {Builder, By, until} = await import('selenium-webdriver');
const {default: firefox} = await import('selenium-webdriver/firefox.js');
import assert from 'node:assert/strict';
import {mkdir, readdir, readFile, writeFile, cp, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {videoIdFromUrl} from '../src/core.ts';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.test-artifacts');
await mkdir(output, {recursive: true});
const delay = Number(process.env.SLOW_MEDIA_MS || 0);
const closeMs = Number(process.env.CLOSE_POPUP_MS || 2500);
const deniedOffset = process.env.SIMULATE_MEDIA_403_AT === undefined ? null : Number(process.env.SIMULATE_MEDIA_403_AT);
assert.ok(Number.isFinite(delay) && delay >= 0 && delay <= 10000);
assert.ok(Number.isFinite(closeMs) && closeMs >= 0 && closeMs <= 55000);
const manifest = JSON.parse(await readFile(resolve(root, 'dist/manifest.json'), 'utf8'));
let archive = resolve(root, 'artifacts', 'audio_local_prototipo-' + manifest.version + '.zip');
if (delay || deniedOffset !== null) {
  const source = resolve(output, 'instrumented-popup');
  await cp(resolve(root, 'dist'), source, {recursive: true});
  const prefix = [
    'const testFetch = globalThis.fetch.bind(globalThis); let testDenied = false;',
    'globalThis.fetch = async (input, init) => {',
    'const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);',
    'if (url.hostname.endsWith(".googlevideo.com")) {',
    'const range = new Headers(init?.headers).get("Range") || "";',
    'if (' + JSON.stringify(deniedOffset !== null) + ' && !testDenied && range.startsWith("bytes=' + deniedOffset + '-")) { testDenied = true; return new Response(null, {status:403}); }',
    'if (' + delay + ') await new Promise(resolve => setTimeout(resolve, ' + delay + '));',
    '} return testFetch(input, init); };'
  ].join('\n');
  await writeFile(resolve(source, 'background.js'), prefix + '\n' + await readFile(resolve(source, 'background.js'), 'utf8'));
  const cli = resolve(root, 'node_modules/web-ext/bin/web-ext.js');
  const build = spawnSync(process.execPath, [cli, 'build', '--source-dir', source, '--artifacts-dir', resolve(output, 'instrumented-package'), '--overwrite-dest'], {encoding: 'utf8', windowsHide: true});
  if (build.status !== 0) throw new Error(build.stdout + build.stderr);
  archive = resolve(output, 'instrumented-package', 'audio_local_prototipo-' + manifest.version + '.zip');
}
const options = new firefox.Options()
  .setBinary(process.env.FIREFOX_BIN || 'C:\\Program Files\\Mozilla Firefox\\firefox.exe')
  .addArguments('-headless')
  .setPageLoadStrategy('eager')
  .setPreference('browser.download.folderList', 2)
  .setPreference('browser.download.dir', output)
  .setPreference('browser.download.useDownloadDir', true)
  .setPreference('browser.helperApps.neverAsk.saveToDisk', 'audio/mp4,audio/webm,application/octet-stream')
  .setPreference('media.volume_scale', '0.0')
  .setPreference('media.autoplay.default', 5);
const service = new firefox.ServiceBuilder(process.env.GECKODRIVER_BIN || resolve(root, '..', '.local', 'tools/geckodriver/geckodriver.exe')).addArguments('--allow-system-access');
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
const results = [];
const buttonId = 'audio-local_bulmak_local-BAP';
async function popup(script) {
  const response = await driver.executeAsyncScript(function(script, done) {
    const frame = document.querySelector('browser.webextension-popup-browser');
    if (!frame?.browsingContext?.currentWindowGlobal) { done({error: 'El popup no está abierto.'}); return; }
    frame.browsingContext.currentWindowGlobal.getActor('MarionetteCommands').sendQuery(
      'MarionetteCommandsParent:executeScript', {script, args: [], opts: {async: false, sandboxName: null}}
    ).then(done, error => done({error: String(error)}));
  }, script);
  if (response?.error) throw new Error(JSON.stringify(response.error));
  return response;
}
async function openPopup() {
  await driver.findElement(By.id(buttonId)).click();
  await driver.wait(until.elementLocated(By.css('browser.webextension-popup-browser')), 10000);
  await driver.wait(async () => {
    try { return await popup('return !!document.getElementById("url") && document.getElementById("status").textContent !== "Conectando…"'); }
    catch { return false; }
  }, 10000, 'El popup no terminó de cargar.');
}
async function closePopup() {
  await driver.executeScript(() => document.querySelector('browser.webextension-popup-browser')?.closest('panel')?.hidePopup());
  await driver.wait(async () => !await driver.executeScript(() => !!document.querySelector('browser.webextension-popup-browser')), 5000);
}
async function capture(name) {
  const png = await driver.executeAsyncScript(function(done) {
    const frame = document.querySelector('browser.webextension-popup-browser');
    frame.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, 'rgb(17,24,39)').then(bitmap => {
      const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
      done(canvas.toDataURL('image/png').split(',')[1]);
    }, error => done({error: String(error)}));
  });
  if (typeof png !== 'string') throw new Error(JSON.stringify(png));
  await writeFile(resolve(output, name + '.png'), png, 'base64');
}
const snapshot = () => popup('return browser.runtime.sendMessage({type:"GET_TASK"})');
const args = process.argv.slice(2).length ? process.argv.slice(2) : ['jNQXAC9IVRw'];
try {
  await driver.installAddon(archive, true);
  // Load a YouTube video with autoplay blocked to verify "use current video".
  await driver.get('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  await driver.setContext('chrome');
  const initialTabs = await driver.executeScript(() => gBrowser.tabs.length);
  const idleTimeout = await driver.executeScript(() => Services.prefs.getIntPref('extensions.background.idle.timeout', 30000));
  console.log('Tiempo de inactividad nativo de Firefox: ' + idleTimeout + ' ms.');
  await driver.executeScript(() => window.CustomizableUI.addWidgetToArea('audio-local_bulmak_local-browser-action', window.CustomizableUI.AREA_NAVBAR));
  await openPopup();
  console.log('Estado inicial: ' + JSON.stringify(await popup('return {url:document.getElementById("url").value,status:document.getElementById("status").textContent,detail:document.getElementById("detail").textContent}')));
  await driver.wait(async () => await popup('return document.getElementById("url").value') === 'https://www.youtube.com/watch?v=jNQXAC9IVRw', 10000, 'No se detectó el video activo.');
  const dimensions = await popup('return {width:document.body.scrollWidth, height:document.body.offsetHeight, overflow:document.documentElement.scrollWidth > window.innerWidth}');
  assert.equal(dimensions.width, 390); assert.equal(dimensions.overflow, false);
  await capture('popup-idle');
  console.log('Popup nativo abierto; video actual detectado; ancho de 390 px.');
  for (const value of args) {
    const inputUrl = /^https?:\/\//.test(value) ? value : 'https://www.youtube.com/watch?v=' + value;
    const id = videoIdFromUrl(inputUrl);
    await popup('document.getElementById("url").value = ' + JSON.stringify(inputUrl) + '; document.getElementById("download-form").requestSubmit();');
    await driver.wait(async () => (await snapshot()).active, 5000);
    await closePopup();
    console.log('Popup cerrado durante ' + closeMs + ' ms; sin pestañas de la extensión.');
    await new Promise(resolve => setTimeout(resolve, closeMs));
    await openPopup();
    let state = await snapshot();
    console.log('Estado al reabrir: ' + state.status + '; bytes recibidos: ' + state.received);
    let last = '';
    await driver.wait(async () => {
      state = await snapshot();
      if (state.status !== last) { console.log(state.status); last = state.status; }
      return !state.active;
    }, 180000, 'La descarga no terminó.', 1000);
    assert.equal(state.diagnostic.result, 'complete', JSON.stringify(state.diagnostic));
    assert.equal(await driver.executeScript(() => gBrowser.tabs.length), initialTabs);
    if (deniedOffset !== null) assert.ok(state.diagnostic.events.some(event => event.refresh > 0), 'No se ejercitó el 403.');
    const downloads = await popup('return browser.downloads.search({state:"complete"}).then(items => items.map(item => ({filename:item.filename,bytes:item.fileSize})))');
    const saved = downloads.find(item => item.filename.includes('[' + id + ']'));
    assert.ok(saved, 'El archivo no apareció en el gestor de descargas.');
    assert.equal((await stat(saved.filename)).size, state.diagnostic.bytes);
    const evidence = {...state.diagnostic, popupClosedMs: closeMs, testMediaDelayMs: delay, backgroundIdleTimeoutMs: idleTimeout};
    if (deniedOffset !== null) evidence.testFault = {http:403, offset:deniedOffset};
    results.push(evidence);
    const suffix = deniedOffset !== null ? '-fault403' : delay ? '-slow' : '';
    await writeFile(resolve(output, id + '-popup' + suffix + '.json'), JSON.stringify(evidence, null, 2));
    await capture(id + '-popup' + suffix);
    console.log(JSON.stringify({id, result:state.diagnostic.result, bytes:state.diagnostic.bytes, tabs:initialTabs}));
  }
  await popup('document.getElementById("url").value = "https://example.com/video"; document.getElementById("download-form").requestSubmit();');
  assert.equal(await popup('return document.getElementById("status").textContent'), 'Revisa el enlace');
  console.log('Enlace inválido rechazado en el popup.');
  await popup('document.getElementById("url").value = "https://www.youtube.com/watch?v=M7lc1UVf-VE"; document.getElementById("download-form").requestSubmit();');
  await driver.wait(async () => (await snapshot()).active, 5000);
  await popup('document.getElementById("cancel").click();');
  await driver.wait(async () => !(await snapshot()).active, 10000);
  assert.equal((await snapshot()).diagnostic.result, 'cancelled');
  console.log('Cancelación comprobada desde el popup.');
} catch (error) {
  try { console.log('Fallo en popup: ' + JSON.stringify(await popup('return {html:document.body.innerText.slice(0,2000)}'))); } catch {}
  throw error;
} finally {
  await writeFile(resolve(output, 'popup-results.json'), JSON.stringify(results, null, 2));
  await driver.quit();
}
