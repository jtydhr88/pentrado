import { expect, test } from '@playwright/test'

import { addFilledLayer, boot, layerCount, pixelAt, settle } from './helpers'

test('app boots with toolbar, tool strip and layer panel', async ({ page }) => {
  await boot(page)
  await expect(page.locator('button[title="Brush"]')).toBeVisible()
  await expect(page.locator('button[title="Undo"]')).toBeVisible()
  await expect(page.locator('button', { hasText: 'Export PSD' })).toBeVisible()
  expect(await layerCount(page)).toBe(0)
})

test('WebGL compositing pipeline produces pixels end-to-end', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#ff0000')
  await settle(page)
  const px = await pixelAt(page, 512, 512)
  expect(px[0]).toBeGreaterThan(200)
  expect(px[1]).toBeLessThan(60)
  expect(px[3]).toBe(255)
})

test('tool strip buttons switch the active tool', async ({ page }) => {
  await boot(page)
  await page.locator('button[title="Brush"]').click()
  expect(await page.evaluate(() => (window as unknown as { __pentrado: { tool: { value: string } } }).__pentrado.tool.value)).toBe('brush')
  await expect(page.locator('button[title="Brush"]')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('button[title="Lasso"]').click()
  expect(await page.evaluate(() => (window as unknown as { __pentrado: { tool: { value: string } } }).__pentrado.tool.value)).toBe('lasso')
})
