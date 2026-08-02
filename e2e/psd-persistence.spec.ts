import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { addFilledLayer, boot, expectClose, layerCount, pixelAt, settle } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

test('PSD export downloads a valid file and re-import restores the layers', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#ff0000')
  await addFilledLayer(page, '#00ff00')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.renameLayer(e.activeId.value, 'Green Top')
  })

  const downloadPromise = page.waitForEvent('download')
  await page.locator('button', { hasText: 'Export PSD' }).click()
  const download = await downloadPromise
  const path = await download.path()
  const bytes = readFileSync(path!)
  expect(bytes.length).toBeGreaterThan(1000)
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('8BPS')

  // Wipe the document, then round-trip the exported file back in.
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    for (const row of [...e.layers.value]) e.removeLayer(row.node.id)
  })
  await settle(page)
  expect(await layerCount(page)).toBe(0)

  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('button', { hasText: 'Import PSD' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(path!)
  await page.waitForFunction(() => (window as any).__pentrado.layers.value.length >= 2)
  await settle(page)

  const names = await page.evaluate(() => (window as any).__pentrado.layers.value.map((r: any) => r.node.name))
  expect(names).toContain('Green Top')
  expectClose(await pixelAt(page, 500, 500), [0, 255, 0, 255])
})

test('document survives a page reload via IndexedDB', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#dd6600')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.renameLayer(e.activeId.value, 'Persistent Layer')
  })
  // Leave time for the debounced storage write + content upload to settle.
  await page.waitForTimeout(1500)

  await page.reload()
  await page.waitForFunction(() => !!(window as any).__pentrado)
  await page.waitForFunction(() => (window as any).__pentrado.layers.value.length >= 1, undefined, { timeout: 15_000 })
  const names = await page.evaluate(() => (window as any).__pentrado.layers.value.map((r: any) => r.node.name))
  expect(names).toContain('Persistent Layer')
})
