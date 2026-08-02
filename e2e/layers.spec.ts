import { expect, test } from '@playwright/test'

import { addFilledLayer, boot, expectClose, layerCount, layerNames, pixelAt, settle } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

test('layer stacking, visibility toggle and delete', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#ff0000')
  const topId = await addFilledLayer(page, '#0000ff')
  expect(await layerCount(page)).toBe(2)
  expectClose(await pixelAt(page, 500, 500), [0, 0, 255, 255])

  await page.locator('button[title="Hide layer"]').first().click()
  await settle(page)
  expectClose(await pixelAt(page, 500, 500), [255, 0, 0, 255])
  await page.locator('button[title="Show layer"]').first().click()
  await settle(page)
  expectClose(await pixelAt(page, 500, 500), [0, 0, 255, 255])

  await page.evaluate((id) => (window as any).__pentrado.removeLayer(id), topId)
  await settle(page)
  expect(await layerCount(page)).toBe(1)
  expectClose(await pixelAt(page, 500, 500), [255, 0, 0, 255])
})

test('opacity and blend mode change the composite', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#ffffff')
  const topId = await addFilledLayer(page, '#000000')
  await page.evaluate((id) => (window as any).__pentrado.setOpacity(id, 0.5), topId)
  await settle(page)
  // Normal mode blends in linear light: 50% black over white lands at
  // srgb(lin 0.5) ≈ 188, not 128.
  const gray = await pixelAt(page, 500, 500)
  expect(gray[0]).toBeGreaterThan(160)
  expect(gray[0]).toBeLessThan(215)

  await page.evaluate((id) => {
    const e = (window as any).__pentrado
    e.setOpacity(id, 1)
    e.setBlendMode(id, 'screen')
  }, topId)
  await settle(page)
  expectClose(await pixelAt(page, 500, 500), [255, 255, 255, 255])
})

test('duplicate, reorder, merge down and flatten', async ({ page }) => {
  await boot(page)
  const a = await addFilledLayer(page, '#ff0000')
  const b = await addFilledLayer(page, '#00ff00')
  await page.evaluate((id) => (window as any).__pentrado.duplicateLayer(id), b)
  await settle(page)
  expect(await layerCount(page)).toBe(3)

  // Move the red base layer to the top of the stack.
  await page.evaluate((id) => {
    const e = (window as any).__pentrado
    e.moveLayer(id, 1)
    e.moveLayer(id, 1)
  }, a)
  await settle(page)
  expectClose(await pixelAt(page, 500, 500), [255, 0, 0, 255])

  const merged = await page.evaluate((id) => {
    const e = (window as any).__pentrado
    e.mergeDown(id)
    return { count: e.layers.value.length }
  }, a)
  expect(merged.count).toBe(2)

  await page.evaluate(() => (window as any).__pentrado.flattenImage())
  await settle(page)
  expect(await layerCount(page)).toBe(1)
  expectClose(await pixelAt(page, 500, 500), [255, 0, 0, 255])
})

test('group and ungroup keep the composite intact', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#123456')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.groupActiveLayer()
  })
  await settle(page)
  expectClose(await pixelAt(page, 500, 500), [18, 52, 86, 255])
  const kinds = await page.evaluate(() => (window as any).__pentrado.layers.value.map((r: any) => r.node.kind))
  expect(kinds).toContain('group')
  await page.evaluate(() => (window as any).__pentrado.ungroupActiveLayer())
  await settle(page)
  expectClose(await pixelAt(page, 500, 500), [18, 52, 86, 255])
})

test('rename via double-click in the layer panel', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#888888')
  const row = page.getByText('Layer 1', { exact: true })
  await row.dblclick()
  // The rename input mounts focused with its text selected.
  await page.keyboard.type('Background')
  await page.keyboard.press('Enter')
  expect(await layerNames(page)).toContain('Background')
})

test('undo walks back a whole mixed session', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#ff0000')
  const b = await addFilledLayer(page, '#00ff00')
  await page.evaluate((id) => (window as any).__pentrado.setOpacity(id, 0.3), b)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    for (let i = 0; i < 10 && e.canUndo.value; i++) e.undo()
  })
  await settle(page)
  expect(await layerCount(page)).toBe(0)
  expect((await pixelAt(page, 500, 500))[3]).toBe(0)
})
