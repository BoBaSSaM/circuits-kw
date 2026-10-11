import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium } from 'playwright';

const artifactDir = path.resolve(import.meta.dirname, '..');
const priceListStorageKey = 'circuits-kw-build-assist-prices';

async function getAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(serverProcess, url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Vite exited before it was ready (exit code ${serverProcess.exitCode}).`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await delay(250);
  }
  throw new Error(`Vite did not become ready at ${url} within 30 seconds.`);
}

async function findChromiumPath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/repl/tools/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next common Chromium location.
    }
  }
}

test('price CSV import updates Build Assist, preserves valid data on rejection, and excludes unmatched SKUs from cart', {
  timeout: 90_000,
}, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn('pnpm', ['exec', 'vite', '--config', 'vite.config.ts', '--host', '127.0.0.1'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'build-assist-prices-'));
  const validCsvPath = path.join(tempDir, 'valid-prices.csv');
  const invalidCsvPath = path.join(tempDir, 'invalid-prices.csv');
  await writeFile(validCsvPath, 'sku,unit_price,currency\nesp32-wrm-32d,1.625,KWD\n');
  await writeFile(invalidCsvPath, 'sku,unit_price,currency\nESP32-WRM-32D,9.999,USD\n');

  let browser;
  try {
    await waitForServer(serverProcess, baseUrl);
    const executablePath = await findChromiumPath();
    assert.ok(executablePath, 'Set CHROMIUM_PATH or install Chromium to run browser tests.');
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`${baseUrl}/build-assist`);
    await page.getByTestId('input-assembly-count').fill('2');
    await page.getByTestId('input-price-source').fill('Verified supplier list');
    await page.getByTestId('input-price-updated-at').fill('2026-10-10');
    await page.getByTestId('input-price-csv').setInputFiles(validCsvPath);
    await page.getByTestId('button-import-price-csv').click();

    await page.getByTestId('status-price-list').getByText('Price list imported successfully.').waitFor();
    assert.equal(await page.getByTestId('text-line-total-esp32').innerText(), '3.250 KWD');
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '3.250 KWD');
    await page.getByTestId('text-unpriced-soil').waitFor();
    await page.getByTestId('text-unpriced-bme280').waitFor();

    await page.getByTestId('input-price-source').fill('Rejected replacement');
    await page.getByTestId('input-price-updated-at').fill('2026-10-11');
    await page.getByTestId('input-price-csv').setInputFiles(invalidCsvPath);
    await page.getByTestId('button-import-price-csv').click();
    await page.getByTestId('status-price-list').getByText('currency must be KWD').waitFor();

    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '3.250 KWD');
    assert.match(await page.getByTestId('text-price-source').innerText(), /Verified supplier list/);
    assert.match(await page.getByTestId('text-price-source').innerText(), /2026-10-10/);
    const savedPriceList = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), priceListStorageKey);
    assert.deepEqual(savedPriceList, {
      pricesBySku: { 'ESP32-WRM-32D': 1.625 },
      source: 'Verified supplier list',
      updatedAt: '2026-10-10',
    });

    await page.reload();
    await page.getByTestId('text-unpriced-soil').waitFor();
    await page.getByTestId('text-unpriced-bme280').waitFor();
    await page.getByTestId('input-assembly-count').fill('2');
    assert.equal(await page.getByTestId('text-line-total-esp32').innerText(), '3.250 KWD');
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '3.250 KWD');
    assert.match(await page.getByTestId('text-price-source').innerText(), /Verified supplier list/);
    assert.match(await page.getByTestId('text-price-source').innerText(), /2026-10-10/);

    await page.getByTestId('button-add-bom-cart').click();
    await page.getByTestId('link-cart').click();
    await page.getByTestId('row-cart-bom-esp32').waitFor();
    assert.equal(await page.getByTestId('row-cart-bom-esp32').count(), 1);
    assert.equal(await page.getByTestId('row-cart-bom-soil').count(), 0);
    assert.equal(await page.getByTestId('row-cart-bom-bme280').count(), 0);
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '3.250 KWD');
    assert.deepEqual(pageErrors, []);
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}`;
    throw error;
  } finally {
    await browser?.close();
    serverProcess.kill('SIGTERM');
    if (serverProcess.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => serverProcess.once('exit', resolve)),
        delay(2_000),
      ]);
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
