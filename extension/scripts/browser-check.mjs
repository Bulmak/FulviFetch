import portprober from 'selenium-webdriver/net/portprober.js';
import {videoIdFromUrl} from '../src/core.ts';
const findFreePort = portprober.findFreePort;
portprober.findFreePort = (host = '127.0.0.1') => findFreePort(host);
const {Builder, By, until} = await import('selenium-webdriver');
const {default: firefox} = await import('selenium-webdriver/firefox.js');
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.test-artifacts');
await mkdir(output, {recursive: true});
const uuid = '31b9459a-0204-4bc3-a031-71836d977056';
const options = new firefox.Options()
  .setBinary(process.env.FIREFOX_BIN || 'C:\\Program Files\\Mozilla Firefox\\firefox.exe')
  .addArguments('-headless')
  .setPreference('extensions.webextensions.uuids', JSON.stringify({'audio-local@bulmak.local': uuid}))
  .setPreference('browser.download.folderList', 2)
  .setPreference('browser.download.dir', output)
  .setPreference('browser.download.useDownloadDir', true)
  .setPreference('browser.download.always_ask_before_handling_new_types', false)
  .setPreference('browser.helperApps.neverAsk.saveToDisk', 'audio/mp4,audio/webm,application/octet-stream')
  .setPreference('media.volume_scale', '0.0');
const service = new firefox.ServiceBuilder(process.env.GECKODRIVER_BIN || resolve(root, '..', 'tools', 'geckodriver', 'geckodriver.exe')).addArguments('--allow-system-access');
let driver;
const results = [];
try {
  driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
  await driver.manage().window().setRect({width: 1100, height: 1000});
  const artifacts = await readdir(resolve(root, 'artifacts'));
  const manifest = JSON.parse(await readFile(resolve(root, 'dist', 'manifest.json'), 'utf8'));
  const archive = artifacts.find(name => name.endsWith('-' + manifest.version + '.zip'));
  if (!archive) throw new Error('Falta el paquete de la extension.');
  await driver.installAddon(resolve(root, 'artifacts', archive), true);
  await driver.get(`moz-extension://${uuid}/index.html`);
  await driver.wait(until.elementLocated(By.id('url')), 15000);
  const loadedVersion = await driver.executeScript('return browser.runtime.getManifest().version');
  if (loadedVersion !== manifest.version) throw new Error('Se instalo una version equivocada.');
  console.log('Firefox iniciado con extension ' + loadedVersion);
  for (const inputValue of process.argv.slice(2).length ? process.argv.slice(2) : ['jNQXAC9IVRw']) {
    const inputUrl = new URL(/^https?:\/\//.test(inputValue) ? inputValue : `https://www.youtube.com/watch?v=${inputValue}`);
    const videoId = videoIdFromUrl(inputUrl.href);
    if (process.env.SIMULATE_MEDIA_403_AT !== undefined) {
      const deniedOffset = Number(process.env.SIMULATE_MEDIA_403_AT);
      await driver.executeScript(function(offset) {
        const originalFetch = window.fetch.bind(window);
        let injected = false;
        window.fetch = async function(input, init) {
          const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
          const range = new Headers(init?.headers).get('Range') || '';
          if (!injected && url.hostname.endsWith('.googlevideo.com') && range.startsWith('bytes=' + offset + '-')) {
            injected = true; return new Response(null, {status: 403});
          }
          return originalFetch(input, init);
        };
      }, deniedOffset);
    }
    const input = await driver.findElement(By.id('url'));
    await input.clear(); await input.sendKeys(inputUrl.href);
    await driver.findElement(By.id('download')).click();
    let lastDiagnostic = '';
    await driver.wait(async () => {
      const text = await driver.executeScript("return document.getElementById('diagnostic').textContent");
      if (text !== lastDiagnostic) { lastDiagnostic = text; await writeFile(resolve(output, 'live.json'), text); console.log('Estado: ' + await driver.findElement(By.id('status')).getText()); }
      try { return ['complete', 'failed', 'cancelled'].includes(JSON.parse(text).result); } catch { return false; }
    }, 180000, 'La prueba no termino a tiempo.', 1000);
    const text = await driver.executeScript("return document.getElementById('diagnostic').textContent");
    const diagnostic = JSON.parse(text);
    if (process.env.SIMULATE_MEDIA_403_AT !== undefined && !diagnostic.events.some(item => item.refresh > 0)) throw new Error('No se ejercito la recuperacion 403.');
    if (process.env.SIMULATE_MEDIA_403_AT !== undefined) diagnostic.testFault = {http: 403, offset: Number(process.env.SIMULATE_MEDIA_403_AT)};
    results.push(diagnostic);
    const evidenceName = videoId + (process.env.SIMULATE_MEDIA_403_AT !== undefined ? '-fault403' : '');
    await writeFile(resolve(output, `${evidenceName}.json`), JSON.stringify(diagnostic, null, 2));
    await writeFile(resolve(output, `${evidenceName}.png`), await driver.takeScreenshot(), 'base64');
    console.log(JSON.stringify(diagnostic, null, 2));
  }
  const invalidInput = await driver.findElement(By.id('url'));
  await invalidInput.clear(); await invalidInput.sendKeys('https://example.com/video');
  await driver.findElement(By.id('download')).click();
  await driver.wait(until.elementTextIs(driver.findElement(By.id('status')), 'Revisa el enlace'), 5000);
  console.log('Enlace de otro dominio rechazado.');
  await invalidInput.clear(); await invalidInput.sendKeys('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
  await driver.findElement(By.id('download')).click();
  await driver.wait(until.elementIsEnabled(driver.findElement(By.id('cancel'))), 5000);
  await driver.findElement(By.id('cancel')).click();
  await driver.wait(until.elementTextIs(driver.findElement(By.id('status')), 'Descarga cancelada'), 10000);
  console.log('Cancelacion de tarea comprobada en Firefox.');
} finally {
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  await driver?.quit();
}
if (results.some(result => result.result !== 'complete')) process.exitCode = 1;
