import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium as playwrightChromium } from 'playwright';

const artifactDir = path.resolve(import.meta.dirname, '..');

async function getAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(serverProcess, url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`Next.js exited with code ${serverProcess.exitCode}.`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Wait until the local test server is ready.
    }
    await delay(250);
  }
  throw new Error(`Next.js did not become ready at ${url}.`);
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
      // Check the next common Chromium location.
    }
  }
}

test('buyers can download one-page English and Arabic PDF demo receipts', { timeout: 180_000 }, async () => {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn('npm', ['run', 'dev'], {
    cwd: artifactDir,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port), NEXT_DIST_DIR: `.next-receipt-test-${port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let serverOutput = '';
  serverProcess.stdout.setEncoding('utf8').on('data', chunk => { serverOutput += chunk; });
  serverProcess.stderr.setEncoding('utf8').on('data', chunk => { serverOutput += chunk; });
  let browser;

  try {
    await waitForServer(serverProcess, baseUrl);
    const executablePath = await findChromiumPath();
    browser = await playwrightChromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const context = await browser.newContext({ acceptDownloads: true });
    await context.addInitScript(() => {
      localStorage.setItem('circuits-kw-cart', JSON.stringify([{
        id: 'test-part',
        name: 'Test Part',
        price: 1.25,
        kind: 'component',
        sku: 'TEST-001',
        qty: 2,
      }]));
      localStorage.setItem('circuits-kw-language', 'en');
    });
    await context.route('**/api/catalog', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ products: [], kits: [] }),
    }));
    await context.route('**/api/orders', route => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'receipt-test-order',
          orderNumber: 'CKW-RECEIPT-0001',
          placedAt: '2026-10-17T12:00:00.000Z',
          items: [{ id: 'test-part', kind: 'component', sku: 'TEST-001', name: 'Test Part', price: 1.25, qty: 2 }],
          subtotal: 2.5,
          status: 'new',
        }),
      });
    });

    const page = await context.newPage();
    await page.goto(`${baseUrl}/checkout`);
    await page.getByTestId('input-checkout-name').fill('Demo Buyer');
    await page.getByTestId('input-checkout-email').fill('buyer@example.com');
    await page.getByTestId('input-checkout-phone').fill('+965 5555 5555');
    await page.getByTestId('select-checkout-governorate').selectOption({ label: 'Capital' });
    await page.getByTestId('input-checkout-area').fill('Kuwait City');
    await page.getByTestId('input-checkout-block').fill('1');
    await page.getByTestId('input-checkout-street').fill('Main Street');
    await page.getByTestId('input-checkout-building').fill('10');
    await page.getByTestId('button-place-demo-order').click();
    await page.getByTestId('demo-order-confirmation').waitFor();

    const downloadPdf = async () => {
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('button-download-demo-receipt-pdf').click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'demo-receipt-CKW-RECEIPT-0001.pdf');
      const filePath = await download.path();
      assert.ok(filePath, 'the downloaded PDF should be available');
      const pdfBytes = await readFile(filePath);
      assert.equal(pdfBytes.subarray(0, 8).toString('ascii'), '%PDF-1.4');
      const pdfStructure = pdfBytes.toString('latin1');
      assert.match(pdfStructure, /\/Subtype \/Image/);
      assert.match(pdfStructure, /\/Width 1240 \/Height 1754/);
      assert.match(pdfStructure, /\/Count 1/);
    };

    await downloadPdf();
    await page.getByTestId('button-language-ar').click();
    assert.match(await page.getByTestId('button-download-demo-receipt-pdf').innerText(), /تنزيل الإيصال PDF/);
    await downloadPdf();
    await context.close();
  } catch (error) {
    if (serverOutput) console.error(serverOutput);
    throw error;
  } finally {
    await browser?.close();
    if (process.platform !== 'win32' && serverProcess.pid) {
      try {
        process.kill(-serverProcess.pid, 'SIGTERM');
      } catch {
        serverProcess.kill('SIGTERM');
      }
    } else {
      serverProcess.kill('SIGTERM');
    }
  }
});
