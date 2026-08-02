import { expect, test } from '@playwright/test'

import { addEmptyLayer, boot, pixelAt, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

const COLORS = ['#ff0000', '#00aa00', '#0000ff', '#aaaa00', '#aa00aa', '#00aaaa', '#884422']

async function sevenStripes(page: import('@playwright/test').Page): Promise<string[]> {
  const ids: string[] = []
  await setTool(page, 'brush')
  for (let i = 0; i < 7; i++) {
    ids.push(await addEmptyLayer(page))
    await page.evaluate((c) => {
      const e = (window as any).__pentrado
      e.brushColor.value = c
      e.brushSize.value = 40
    }, COLORS[i])
    const x = 120 + i * 120
    await stroke(page, [[x, 200], [x, 800]])
  }
  return ids
}

test('painting the middle layer keeps every cached neighbor stripe intact', async ({ page }) => {
  await boot(page)
  const ids = await sevenStripes(page)

  await page.evaluate((id) => (window as any).__pentrado.setActiveLayer(id), ids[3])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ffffff'
    e.brushSize.value = 30
  })
  await stroke(page, [[100, 500], [900, 500]])

  const white = await pixelAt(page, 500, 500)
  expect(white[0]).toBeGreaterThan(230)
  expect(white[1]).toBeGreaterThan(230)
  expect(white[2]).toBeGreaterThan(230)

  const below = await pixelAt(page, 120, 300)
  expect(below[0]).toBeGreaterThan(200)
  expect(below[1]).toBeLessThan(90)
  const above = await pixelAt(page, 720, 300)
  expect(above[1]).toBeGreaterThan(120)
  expect(above[2]).toBeGreaterThan(120)

  await page.evaluate(() => (window as any).__pentrado.undo())
  await settle(page)
  const after = await pixelAt(page, 500, 500)
  expect(after[0]).toBeLessThan(120)
})

test('structure changes rebuild the caches correctly', async ({ page }) => {
  await boot(page)
  const ids = await sevenStripes(page)
  await page.evaluate((id) => (window as any).__pentrado.setActiveLayer(id), ids[3])

  await page.evaluate((id) => (window as any).__pentrado.toggleVisible(id), ids[0])
  await settle(page)
  expect((await pixelAt(page, 120, 500))[3]).toBe(0)

  await page.evaluate((id) => (window as any).__pentrado.setOpacity(id, 0.4), ids[6])
  await settle(page)
  const dimmed = await pixelAt(page, 840, 500)
  expect(dimmed[3]).toBeLessThan(160)
  expect(dimmed[3]).toBeGreaterThan(60)

  await page.evaluate((id) => (window as any).__pentrado.toggleVisible(id), ids[0])
  await settle(page)
  expect((await pixelAt(page, 120, 500))[3]).toBeGreaterThan(200)
})

test('a non-normal blend mode above the active layer still composites correctly', async ({ page }) => {
  await boot(page)
  const ids = await sevenStripes(page)
  await page.evaluate((id) => {
    const e = (window as any).__pentrado
    e.setBlendMode(id, 'multiply')
  }, ids[5])
  await page.evaluate((id) => (window as any).__pentrado.setActiveLayer(id), ids[2])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ffffff'
    e.brushSize.value = 30
  })
  await stroke(page, [[100, 600], [900, 600]])
  await settle(page)

  expect((await pixelAt(page, 720, 300))[3]).toBe(0)
  const crossed = await pixelAt(page, 720, 600)
  expect(crossed[3]).toBeGreaterThan(200)
  expect(crossed[0]).toBeLessThan(60)
  expect(crossed[1]).toBeGreaterThan(120)
  const painted = await pixelAt(page, 560, 600)
  expect(painted[0]).toBeGreaterThan(200)
})
