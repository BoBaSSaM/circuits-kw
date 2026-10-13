import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium } from 'playwright';

const artifactDir = path.resolve(import.meta.dirname, '..');
const priceListStorageKey = 'circuits-kw-build-assist-prices';
const freshnessPeriodDays = 90;

function dateDaysAgo(days) {
  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return new Date(utcToday - days * 86_400_000).toISOString().slice(0, 10);
}

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

test('stale saved price lists warn on Build Assist, fresh lists clear the warning, and priced items reach the cart', {
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
    assert.equal(await page.getByTestId('row-bom-esp32').count(), 0);
    await page.getByTestId('button-generate-bom').click();
    await page.getByTestId('text-unpriced-esp32').waitFor();
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '—');
    const staleUpdatedAt = dateDaysAgo(freshnessPeriodDays);
    const stalePriceList = {
      pricesBySku: { 'ESP32-WRM-32D': 1.625 },
      source: 'Verified supplier list',
      updatedAt: staleUpdatedAt,
    };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: priceListStorageKey,
      value: stalePriceList,
    });
    await page.reload();
    await page.getByTestId('button-generate-bom').click();
    await page.getByTestId('input-assembly-count').fill('2');
    await page.getByTestId('notice-stale-price-list').waitFor();
    assert.match(await page.getByTestId('notice-stale-price-list').innerText(), /90/);
    assert.equal(await page.getByTestId('text-line-total-esp32').innerText(), '3.250 KWD');
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '3.250 KWD');
    await page.getByTestId('text-unpriced-soil').waitFor();
    await page.getByTestId('text-unpriced-bme280').waitFor();

    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '3.250 KWD');
    assert.match(await page.getByTestId('text-price-source').innerText(), /Verified supplier list/);
    assert.match(await page.getByTestId('text-price-source').innerText(), new RegExp(staleUpdatedAt));
    const savedPriceList = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), priceListStorageKey);
    assert.deepEqual(savedPriceList, stalePriceList);

    await page.reload();
    await page.getByTestId('button-generate-bom').click();
    await page.getByTestId('text-unpriced-soil').waitFor();
    await page.getByTestId('text-unpriced-bme280').waitFor();
    await page.getByTestId('input-assembly-count').fill('2');
    assert.equal(await page.getByTestId('text-line-total-esp32').innerText(), '3.250 KWD');
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '3.250 KWD');
    assert.match(await page.getByTestId('text-price-source').innerText(), /Verified supplier list/);
    assert.match(await page.getByTestId('text-price-source').innerText(), new RegExp(staleUpdatedAt));
    await page.getByTestId('notice-stale-price-list').waitFor();

    const freshUpdatedAt = dateDaysAgo(0);
    const freshPriceList = { ...stalePriceList, source: 'Fresh supplier list', updatedAt: freshUpdatedAt };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: priceListStorageKey,
      value: freshPriceList,
    });
    await page.reload();
    await page.getByTestId('button-generate-bom').click();
    await page.getByTestId('input-assembly-count').fill('2');
    assert.equal(await page.getByTestId('notice-stale-price-list').count(), 0);
    assert.match(await page.getByTestId('text-price-source').innerText(), /Fresh supplier list/);
    assert.match(await page.getByTestId('text-price-source').innerText(), new RegExp(freshUpdatedAt));

    await page.getByTestId('button-add-bom-cart').click();
    await page.getByTestId('link-cart').click();
    await page.getByTestId('row-cart-bom-esp32').waitFor();
    assert.equal(await page.getByTestId('row-cart-bom-esp32').count(), 1);
    assert.equal(await page.getByTestId('row-cart-bom-soil').count(), 0);
    assert.equal(await page.getByTestId('row-cart-bom-bme280').count(), 0);
    assert.equal(await page.getByTestId('input-quantity-bom-esp32').inputValue(), '2');
    assert.equal(await page.getByTestId('row-cart-bom-esp32').locator('.price').innerText(), '3.250 KWD');
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '3.250 KWD');

    await page.reload();
    const restoredBomRow = page.getByTestId('row-cart-bom-esp32');
    await restoredBomRow.waitFor();
    assert.equal(await restoredBomRow.count(), 1);
    assert.equal(await page.getByTestId('row-cart-bom-soil').count(), 0);
    assert.equal(await page.getByTestId('row-cart-bom-bme280').count(), 0);
    assert.equal(await page.getByTestId('input-quantity-bom-esp32').inputValue(), '2');
    assert.equal(await restoredBomRow.locator('.price').innerText(), '3.250 KWD');
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
  }
});

test('imports a zero-cost supplier CSV row and keeps the BOM item in the cart', {
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
    assert.equal(await page.getByTestId('details-price-list').evaluate((details) => details.open), false);
    await page.getByTestId('summary-price-list').click();
    await page.getByTestId('input-price-list-source').fill('Free parts supplier');
    await page.getByTestId('input-price-list-file').setInputFiles({
      name: 'free-parts.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('sku,price,currency\nSNS-SOIL-CAP-12,0.000,KWD\n'),
    });
    await page.getByTestId('button-import-price-csv').click();
    await page.getByTestId('status-build-assist').waitFor();
    assert.equal(await page.getByTestId('row-bom-esp32').count(), 0);
    await page.getByTestId('button-generate-bom').click();

    assert.equal(await page.getByTestId('text-unpriced-soil').count(), 0);
    assert.equal(await page.getByTestId('text-line-total-soil').innerText(), '0.000 KWD');
    assert.equal(await page.getByTestId('text-build-assist-total').innerText(), '0.000 KWD');
    const savedPriceList = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), priceListStorageKey);
    assert.equal(savedPriceList.pricesBySku['SNS-SOIL-CAP-12'], 0);

    await page.getByTestId('button-add-bom-cart').click();
    await page.getByTestId('link-cart').click();
    const zeroCostCartRow = page.getByTestId('row-cart-bom-soil');
    await zeroCostCartRow.waitFor();
    assert.equal(await zeroCostCartRow.count(), 1);
    assert.equal(await zeroCostCartRow.locator('.price').innerText(), '0.000 KWD');
    assert.equal(await page.locator('.summary-card .summary-total .mono').innerText(), '0.000 KWD');
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
  }
});

test('recovers from malformed saved cart data and keeps valid cart entries unchanged', {
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

    await page.goto(`${baseUrl}/cart`);
    await page.evaluate(() => localStorage.setItem('circuits-kw-cart', '{malformed json'));
    await page.reload();
    await page.getByTestId('link-empty-cart-components').waitFor();
    assert.equal(await page.locator('[data-testid^="row-cart-"]').count(), 0);

    await page.evaluate(() => localStorage.setItem('circuits-kw-cart', JSON.stringify({ items: [] })));
    await page.reload();
    await page.getByTestId('link-empty-cart-components').waitFor();
    assert.equal(await page.locator('[data-testid^="row-cart-"]').count(), 0);

    const validCart = [{
      id: 'valid-cart-item',
      name: 'Saved component',
      price: 1.25,
      kind: 'component',
      sku: 'SAVED-001',
      qty: 3,
    }];
    await page.evaluate((items) => localStorage.setItem('circuits-kw-cart', JSON.stringify(items)), [
      ...validCart,
      { id: 'invalid-cart-item', name: 'Missing cart fields' },
    ]);
    await page.reload();
    const restoredRow = page.getByTestId('row-cart-valid-cart-item');
    await restoredRow.waitFor();
    assert.equal(await restoredRow.locator('.price').innerText(), '3.750 KWD');
    assert.equal(await page.getByTestId('input-quantity-valid-cart-item').inputValue(), '3');
    assert.equal(await page.getByTestId('row-cart-invalid-cart-item').count(), 0);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('circuits-kw-cart'))), validCart);
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
  }
});
