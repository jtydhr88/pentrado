import { expect, test } from '@playwright/test'

import { addFilledLayer, boot, settle } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

test('guides can be added, moved and removed with undo', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    const idx = e.guideAddLive('x', 200)
    e.guideMoveLive(idx, 256)
    e.guideEndDrag(idx, { added: true, keep: true })
  })
  expect(await page.evaluate(() => (window as any).__pentrado.guides())).toEqual([{ axis: 'x', pos: 256 }])
  await page.evaluate(() => (window as any).__pentrado.undo())
  expect(await page.evaluate(() => (window as any).__pentrado.guides())).toEqual([])
})

test('dragging out of the ruler creates a live guide', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#333333')
  const vp = page.getByTestId('pentrado-viewport')
  const box = (await vp.boundingBox())!
  const ruler = page.locator('canvas').first()
  const rulerBox = (await ruler.boundingBox())!
  await page.mouse.move(rulerBox.x + box.width / 2, rulerBox.y + rulerBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  await settle(page)
  const guides = await page.evaluate(() => (window as any).__pentrado.guides())
  expect(guides.length).toBe(1)
  expect(guides[0].axis).toBe('y')
})

test('wheel zooms around the cursor and fit view restores', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#552255')
  const vp = page.getByTestId('pentrado-viewport')
  const box = (await vp.boundingBox())!
  const z0 = await page.evaluate(() => (window as any).__pentrado.panZoom.zoom())
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -400)
  await settle(page)
  const z1 = await page.evaluate(() => (window as any).__pentrado.panZoom.zoom())
  expect(z1).toBeGreaterThan(z0)
  await page.locator('button[title="Fit view"]').click()
  await settle(page)
  const z2 = await page.evaluate(() => (window as any).__pentrado.panZoom.zoom())
  expect(Math.abs(z2 - z0)).toBeLessThan(0.01)
})

test('snap grid setting is applied', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => (window as any).__pentrado.setSnapGrid(32))
  expect(await page.evaluate(() => (window as any).__pentrado.snapGridSize.value)).toBe(32)
})
