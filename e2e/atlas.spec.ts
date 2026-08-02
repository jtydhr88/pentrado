import { expect, test } from '@playwright/test'

import { boot, pixelAt, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function bootPainted(page: import('@playwright/test').Page): Promise<void> {
  await boot(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.setArtboardSize(4096, 4096)
    e.fitView()
    e.addEmptyLayer()
  })
  await settle(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#dd2200'
    e.brushSize.value = 80
  })
  await stroke(page, [[1000, 2048], [3000, 2048]])
}

async function setTransform(
  page: import('@playwright/test').Page,
  tf: { x: number; y: number; w: number; h: number; rotation: number }
): Promise<void> {
  await page.evaluate((t) => {
    const e = (window as any).__pentrado
    const n = e.activeNode.value
    n.transform = { ...t }

    e.setOpacity(n.id, 0.999)
  }, tf)
  await settle(page)
}

test('a scaled tiled layer samples the atlas without seams', async ({ page }) => {
  await bootPainted(page)

  await setTransform(page, { x: 512, y: 512, w: 3072, h: 3072, rotation: 0 })
  const hit = await pixelAt(page, 2048, 2048)
  expect(hit[0]).toBeGreaterThan(180)
  expect((await pixelAt(page, 2048, 800))[3]).toBe(0)

  for (const x of [1400, 1800, 2200, 2600]) {
    const px = await pixelAt(page, x, 2048)
    expect(px[3], `x=${x}`).toBeGreaterThan(180)
  }
})

test('a rotated tiled layer renders through the atlas correctly', async ({ page }) => {
  await bootPainted(page)
  await setTransform(page, { x: 0, y: 0, w: 4096, h: 4096, rotation: Math.PI / 2 })
  // The horizontal stroke through the center becomes vertical.
  const hit = await pixelAt(page, 2048, 1500)
  expect(hit[0]).toBeGreaterThan(180)
  expect((await pixelAt(page, 1200, 1200))[3]).toBe(0)
})

test('below 0.5 scale the layer falls back to the monolithic path and still renders', async ({ page }) => {
  await bootPainted(page)
  await setTransform(page, { x: 1536, y: 1536, w: 1024, h: 1024, rotation: 0 })
  const hit = await pixelAt(page, 2048, 2048)
  expect(hit[0]).toBeGreaterThan(150)
  expect((await pixelAt(page, 512, 512))[3]).toBe(0)
})

test('multiply on a tiled layer keeps clip-to-backdrop semantics via drawZero', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.setArtboardSize(4096, 4096)
    e.fitView()
  })
  await settle(page)
  // Bottom: white stroke. Top tiled layer: multiply fill.
  await page.evaluate(() => (window as any).__pentrado.addEmptyLayer())
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ffffff'
    e.brushSize.value = 100
  })
  await stroke(page, [[1000, 2000], [3000, 2000]])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.addEmptyLayer()
    e.brushColor.value = '#00aa00'
    e.selectAll()
    e.fillSelection()
    e.selectNone()
    e.setBlendMode(e.activeId.value, 'multiply')
  })
  await settle(page)
  // Multiply over transparency vanishes; over the white stroke it shows green.
  expect((await pixelAt(page, 2000, 500))[3]).toBe(0)
  const crossed = await pixelAt(page, 2000, 2000)
  expect(crossed[1]).toBeGreaterThan(120)
  expect(crossed[0]).toBeLessThan(80)
})
