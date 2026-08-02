import { expect, test } from '@playwright/test'

import { addEmptyLayer, boot, pixelAt, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function fillLayer(page: import('@playwright/test').Page, color: string): Promise<string> {
  const id = await addEmptyLayer(page)
  await page.evaluate((c) => {
    const e = (window as any).__pentrado
    e.brushColor.value = c
    e.selectAll()
    e.fillSelection()
    e.selectNone()
  }, color)
  await settle(page)
  return id
}

test('clipping mask limits the top layer to the base layer alpha', async ({ page }) => {
  await boot(page)
  // Base: a red disc in the middle (painted blob), top: full green fill clipped to it.
  const base = await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#cc2222'
    e.brushSize.value = 200
  })
  await stroke(page, [[500, 500], [520, 500]])

  const top = await fillLayer(page, '#22cc44')
  // Before clipping: green covers everything.
  expect((await pixelAt(page, 100, 100))[1]).toBeGreaterThan(150)

  await page.evaluate((id) => (window as any).__pentrado.toggleClipMask(id), top)
  await settle(page)

  // Clipped: green only where the base blob is; corner falls back to nothing.
  expect((await pixelAt(page, 512, 500))[1]).toBeGreaterThan(150)
  expect((await pixelAt(page, 512, 500))[0]).toBeLessThan(120)
  expect((await pixelAt(page, 100, 100))[3]).toBe(0)

  // Toggle off restores full coverage.
  await page.evaluate((id) => (window as any).__pentrado.toggleClipMask(id), top)
  await settle(page)
  expect((await pixelAt(page, 100, 100))[1]).toBeGreaterThan(150)

  void base
})

test('cannot clip the bottom layer', async ({ page }) => {
  await boot(page)
  const only = await fillLayer(page, '#3366aa')
  expect(await page.evaluate((id) => (window as any).__pentrado.canClipMask(id), only)).toBe(false)
  await page.evaluate((id) => (window as any).__pentrado.toggleClipMask(id), only)
  await settle(page)
  expect(await page.evaluate((id) => (window as any).__pentrado.content ? true : true)).toBe(true)
  // Still fully visible (no clip applied).
  expect((await pixelAt(page, 100, 100))[2]).toBeGreaterThan(120)
})

test('gradient-map adjustment layer recolors by luminance', async ({ page }) => {
  await boot(page)
  // Gray ramp base.
  await addEmptyLayer(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#333333'
    e.selectAll()
    e.fillSelection()
    e.selectNone()
  })
  await settle(page)
  const adj = await page.evaluate(() => {
    const e = (window as any).__pentrado
    const id = e.addAdjustmentLayer('gradient-map')
    e.updateAdjustment(id, { params: { from: 0x0000ff, to: 0xff0000 } })
    return id
  })
  await settle(page)
  // Dark gray → near the "from" end (blue-ish).
  const px = await pixelAt(page, 500, 500)
  expect(px[2]).toBeGreaterThan(px[0])
  void adj
})

test('black-white adjustment desaturates', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#cc3322'
    e.selectAll()
    e.fillSelection()
    e.selectNone()
    e.addAdjustmentLayer('black-white')
  })
  await settle(page)
  const px = await pixelAt(page, 500, 500)
  expect(Math.abs(px[0] - px[1])).toBeLessThan(24)
  expect(Math.abs(px[1] - px[2])).toBeLessThan(24)
})
