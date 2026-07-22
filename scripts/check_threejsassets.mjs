import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const artifactDir = path.resolve('artifacts/threejsassets-v91');
await fs.mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--disable-dev-shm-usage'
  ]
});

const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(String(error)));

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForFunction(() => window.NeonThreeAssetsV91?.ready === true, null, { timeout: 90000 });
await page.waitForTimeout(2500);

const result = await page.evaluate(() => {
  const canvas = document.getElementById('gameCanvas');
  const status = window.NeonThreeAssetsV91;
  return {
    title: document.title,
    ready: status?.ready === true,
    version: status?.version,
    threeRevision: status?.threeRevision,
    loader: status?.loader,
    assetKeys: Object.keys(status?.assets || {}),
    sources: Object.values(status?.assets || {}).map((asset) => asset.sourceUrl),
    canvas: {
      width: canvas?.width || 0,
      height: canvas?.height || 0,
      clientWidth: canvas?.clientWidth || 0,
      clientHeight: canvas?.clientHeight || 0
    },
    bridge: {
      ready: window.NeonThreeBridge?.ready === true,
      enabled: window.NeonThreeBridge?.enabled === true,
      capturedCars: window.NeonThreeBridge?.snapshot?.().cars?.length || 0
    },
    toast: document.getElementById('raceToast')?.textContent || '',
    eventFeed: document.getElementById('raceEventFeed')?.textContent || ''
  };
});

await page.screenshot({ path: path.join(artifactDir, 'page.png'), fullPage: true });
await page.locator('#gameCanvas').screenshot({ path: path.join(artifactDir, 'game-canvas.png') });

const report = {
  checkedAt: new Date().toISOString(),
  url: page.url(),
  result,
  consoleErrors,
  pageErrors
};
await fs.writeFile(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));

const failures = [];
if (!result.ready) failures.push('NeonThreeAssetsV91 was not ready');
if (result.version !== '9.1') failures.push(`unexpected version: ${result.version}`);
if (!String(result.loader).includes('GLTFLoader')) failures.push(`unexpected loader: ${result.loader}`);
if (result.assetKeys.length !== 3) failures.push(`expected 3 assets, got ${result.assetKeys.length}`);
if (result.canvas.width < 640 || result.canvas.height < 320) failures.push('canvas did not receive a usable WebGL size');
if (!result.bridge.ready || !result.bridge.enabled) failures.push('Three.js bridge was not ready/enabled');
if (result.bridge.capturedCars < 1) failures.push('no vehicle matrices were captured');
if (pageErrors.length) failures.push(`page errors: ${pageErrors.join(' | ')}`);
if (consoleErrors.some((message) => /GLB|DRACO|WebGL|threejsassets/i.test(message))) {
  failures.push(`relevant console errors: ${consoleErrors.join(' | ')}`);
}

if (failures.length) {
  console.error(JSON.stringify({ failures, report }, null, 2));
  await browser.close();
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
