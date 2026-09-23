// Run: node scripts/check-history.mjs (Playwright installed or PLAYWRIGHT_MODULE set).
// Browser plugin not available; use Playwright with mocked Google responses.
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
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const rows = Array.from({ length: 8 }, (_, i) => ({
    rowIndex: i + 2, PROPIEDAD: `Alojamiento ${i}`, FECHA: `2026-09-${String(20-i).padStart(2, '0')}`,
    'RESPONSABLE DEL REPORTE': 'Prueba', 'CLASIFICACION DE LA INCIDENCIA': 'MANTENIMIENTO',
    'DESCRIPCION DE LA INCIDENCIA': 'Incidencia de prueba', ESTADO: 'PENDIENTE'
  }));
  rows.push({ rowIndex: 10, PROPIEDAD: 123, ESTADO: 1, FECHA: 'sin fecha' });
  let reads = 0;
  let reply = rows;
  let delay = false;
  let release;
  let lastPost;
  await page.route('https://docs.google.com/**', route => route.fulfill({ json: { table: { rows: [] } } }));
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    const action = new URL(request.url()).searchParams.get('action');
    if (request.method() === 'POST') {
      lastPost = JSON.parse(request.postData());
      if (lastPost.action === 'delete') reply = rows.slice(1).map(r => ({ ...r, rowIndex: r.rowIndex - 1 }));
      return route.fulfill({ body: 'SUCCESS', headers: { 'access-control-allow-origin': '*' } });
    }
    if (action === 'read') {
      reads++;
      if (delay) await new Promise(resolve => { release = resolve; });
      return route.fulfill({ json: reply }).catch(() => {});
    }
    return route.fulfill({ json: action === 'getNextRef' ? { nextRef: '001' } : { refs: [] } });
  });
  await page.clock.install();
  await page.goto(server.resolvedUrls.local[0]);
  assert.match(await page.title(), /incidencias/i);
  await page.getByRole('button', { name: 'Ver Historial' }).click();
  await page.getByRole('heading', { name: 'Alojamiento 0', exact: true }).waitFor();
  assert.equal(await page.locator('.history-card').count(), 5);
  assert.equal(reads, 1);
  await page.getByRole('button', { name: 'Nuevo Reporte' }).click();
  await page.getByRole('button', { name: 'Ver Historial' }).click();
  await page.getByRole('heading', { name: 'Alojamiento 0', exact: true }).waitFor();
  assert.equal(reads, 1, 'Switching tabs must reuse recent history');
  await page.screenshot({ path: join(tmpdir(), 'incidencias-history-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByPlaceholder('Buscar por alojamiento...').fill('123');
  await page.getByRole('heading', { name: '123', exact: true }).waitFor();
  await page.screenshot({ path: join(tmpdir(), 'incidencias-history-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByPlaceholder('Buscar por alojamiento...').fill('Alojamiento 3');
  assert.equal(await page.locator('.history-card').count(), 1);
  await page.getByPlaceholder('Buscar por alojamiento...').fill('');
  reply = { error: 'Hoja no encontrada' };
  await page.getByRole('button', { name: 'Actualizar historial' }).click();
  await page.getByRole('alert').filter({ hasText: 'Hoja no encontrada' }).waitFor();
  assert.equal(await page.locator('.history-card').count(), 5, 'Refresh failure must retain existing rows');
  reply = rows;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await page.getByRole('alert').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Actualizar historial' }).waitFor();
  assert.equal(reads, 3);
  page.once('dialog', dialog => dialog.accept());
  await page.getByTitle('Borrar', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Alojamiento 0', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Alojamiento 1', exact: true }).waitFor();
  assert.equal(reads, 4, 'Delete must reload shifted sheet row indices');
  await page.getByTitle('Editar', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Guardar Cambios' }).click();
  await page.getByRole('button', { name: 'Enviar Incidencia' }).waitFor();
  assert.equal(lastPost.rowIndex, 2, 'Editing after deletion must target the new row index');
  await page.getByRole('button', { name: 'Ver Historial' }).click();
  await page.getByRole('heading', { name: 'Alojamiento 1', exact: true }).waitFor();
  assert.equal(reads, 5, 'Save must invalidate history');
  delay = true;
  await page.getByRole('button', { name: 'Actualizar historial' }).click();
  await page.getByRole('button', { name: 'Actualizando...' }).waitFor();
  assert.equal(await page.getByTitle('Editar', { exact: true }).first().isDisabled(), true);
  await page.clock.runFor(60001);
  await page.getByRole('alert').filter({ hasText: 'tardando demasiado' }).waitFor();
  delay = false;
  release();
  reply = [];
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await page.getByText('No hay registros.', { exact: true }).waitFor();
  reply = { error: 'Sin permisos' };
  await page.getByRole('button', { name: 'Actualizar historial' }).click();
  await page.getByRole('alert').filter({ hasText: 'Sin permisos' }).waitFor();
  assert.equal(await page.getByText('No hay registros.', { exact: true }).count(), 0);
  reply = rows;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await page.getByRole('heading', { name: 'Alojamiento 0', exact: true }).waitFor();
  const beforeExpiry = reads;
  await page.clock.runFor(60001);
  await page.getByRole('button', { name: 'Nuevo Reporte' }).click();
  await page.getByRole('button', { name: 'Ver Historial' }).click();
  await page.getByRole('button', { name: 'Actualizar historial' }).waitFor();
  assert.equal(reads, beforeExpiry + 1, 'Expired history must refresh');
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: load, pagination, filter, cache, retry, preservation, delete/edit indices, save invalidation, timeout, empty/error states.');
} finally {
  await browser.close();
  await server.close();
}
