import { expect, test } from '@playwright/test'

import { boot, pixelAt, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function bootBig(page: import('@playwright/test').Page): Promise<void> {
  await boot(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.setArtboardSize(4096, 4096)
    e.fitView()
    e.addEmptyLayer()
  })
  await settle(page)
}

function stats(page: import('@playwright/test').Page) {
  return page.evaluate(() => (window as any).__pentrado.content.stats())
}

test('blank tiled layers cost nothing and never hit the compositor', async ({ page }) => {
  await bootBig(page)
  const s = await stats(page)
  expect(s.tiled).toBe(1)
  expect(s.tileBytes).toBe(0)
  expect((await pixelAt(page, 2000, 2000))[3]).toBe(0)
})

test('painting on a tiled layer derives COW contents and undo/redo round-trips', async ({ page }) => {
  await bootBig(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ff4400'
    e.brushSize.value = 60
  })
  await stroke(page, [[800, 800], [1400, 900]])

  const hit = await pixelAt(page, 1100, 850)
  expect(hit[0]).toBeGreaterThan(200)
  expect((await pixelAt(page, 3000, 3000))[3]).toBe(0)

  const s = await stats(page)
  expect(s.tileBytes).toBeGreaterThan(0)
  expect(s.tileBytes).toBeLessThan(4096 * 4096 * 4 * 0.4)

  await page.evaluate(() => (window as any).__pentrado.undo())
  await settle(page)
  expect((await pixelAt(page, 1100, 850))[3]).toBe(0)

  await page.evaluate(() => (window as any).__pentrado.redo())
  await settle(page)
  expect((await pixelAt(page, 1100, 850))[0]).toBeGreaterThan(200)
})

test('a full-canvas fill re-collapses to uniform tiles', async ({ page }) => {
  await bootBig(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#204060'
    e.selectAll()
    e.fillSelection()
    e.selectNone()
  })
  await settle(page)
  const px = await pixelAt(page, 2048, 2048)
  expect(px[0]).toBeGreaterThan(20)
  expect(px[2]).toBeGreaterThan(80)
  const s = await stats(page)

  expect(s.tileBytes).toBe(0)
})

test('swap pages history tiles out to OPFS and undo restores them', async ({ page }) => {
  await bootBig(page)
  const hasSwap = await page.evaluate(() => (window as any).__pentrado.content.hasSwap())
  expect(hasSwap).toBe(true)

  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#00cc44'
    e.brushSize.value = 60
    e.content.setTileBudget(0)
  })
  await stroke(page, [[500, 500], [1200, 600]])

  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.startFilter('desaturate')
    e.applyFilter()
  })
  await settle(page)
  await page.waitForFunction(
    () => (window as any).__pentrado.content.stats().swappedOut > 0,
    undefined,
    { timeout: 5000 }
  )

  await page.evaluate(() => (window as any).__pentrado.undo())
  await page.waitForTimeout(500)
  await settle(page)
  const restored = await pixelAt(page, 850, 550)
  expect(restored[1]).toBeGreaterThan(150)
  expect(restored[0]).toBeLessThan(120)
})
