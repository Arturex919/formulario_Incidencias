// Prueba contra el Apps Script de PRODUCCIÓN, solo lectura: cualquier POST se bloquea.
// Run: node scripts/prueba-real.mjs   (Playwright instalado o PLAYWRIGHT_MODULE=<ruta a node_modules/playwright>)
// Tarda 1-3 min: el Apps Script es lento. Capturas en el directorio temporal del sistema.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });
const t0 = Date.now(), s = () => `${Math.round((Date.now() - t0) / 1000)}s`;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://script.google.com/**', r =>
    r.request().method() === 'POST' ? r.abort() : r.continue());
  await page.goto(server.resolvedUrls.local[0]);

  // Nuevo Reporte: REF numérica y subida bloqueada hasta elegir propiedad
  await page.waitForFunction(() => /^\d+$/.test(document.querySelector('.ref-counter-badge strong')?.textContent || ''), null, { timeout: 180000 });
  const ref = await page.locator('.ref-counter-badge strong').textContent();
  assert.equal((await page.locator('.upload-text p').first().textContent()).trim(), 'Primero elige la propiedad.');
  assert.ok(await page.locator('#invoice-upload').isDisabled());
  console.log(`[${s()}] Nuevo Reporte OK · próxima REF ${ref}`);

  // Historial: carga filas reales
  await page.getByRole('button', { name: /Ver Historial/ }).click();
  await page.waitForFunction(() => document.querySelector('.history-card') || /No se pudo cargar/.test(document.body.innerText), null, { timeout: 180000 });
  const cards = await page.locator('.history-card').count();
  assert.ok(cards > 0, 'El historial no cargó: ' + await page.locator('.history-list').innerText());
  console.log(`[${s()}] Historial OK · ${cards} tarjetas en la primera página`);

  // Administración: 4 trimestres con carpeta y propiedades cargadas
  await page.getByRole('button', { name: /Administración/ }).click();
  await page.waitForFunction(() => document.querySelector('.admin-quarter') || document.querySelector('.form-card [role=alert]'), null, { timeout: 200000 });
  assert.ok(await page.locator('.admin-quarter').count(), 'Administración: ' + await page.locator('.form-card [role=alert]').first().innerText().catch(() => ''));
  const quarters = (await page.locator('.admin-quarter').allInnerTexts()).map(t => t.split('Color del trimestre')[0].replace(/\s+/g, ' ').trim());
  console.log(`[${s()}] Trimestres: ${quarters.join(' | ')}`);
  assert.equal(quarters.filter(q => q.includes('Abrir carpeta')).length, 4, 'Falta alguna carpeta trimestral');
  await page.waitForFunction(() => !/Cargando propiedades/.test(document.body.innerText), null, { timeout: 180000 });
  const props = await page.locator('section[aria-label="Propiedades de Administración"]').innerText();
  console.log(`[${s()}] Propiedades: ${props.split('\n')[1]}`);
  assert.ok(!/^0 de Lodgify/m.test(props), 'Lodgify devolvió 0 propiedades');

  // Ayuda
  await page.getByRole('button', { name: /Ayuda/ }).click();
  await page.getByText('Resumen rápido').waitFor({ timeout: 10000 });
  await page.screenshot({ path: join(tmpdir(), 'incidencias-ayuda.png'), fullPage: true });

  assert.deepEqual(errors, []);
  console.log(`[${s()}] prueba-real OK`);
} finally {
  await browser.close();
  await server.close();
}
