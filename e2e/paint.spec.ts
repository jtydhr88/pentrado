import { expect, test } from '@playwright/test'

import { addEmptyLayer, addFilledLayer, boot, expectClose, pixelAt, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

test('brush stroke paints, undo removes it, redo restores it', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#00ff00'
    e.brushSize.value = 60
  })
  await stroke(page, [[200, 300], [500, 300], [800, 300]])

  expectClose(await pixelAt(page, 500, 300), [0, 255, 0, 255])
  expectClose(await pixelAt(page, 200, 300), [0, 255, 0, 255])
  expect((await pixelAt(page, 500, 600))[3]).toBe(0)

  await page.evaluate(() => (window as any).__pentrado.undo())
  await settle(page)
  expect((await pixelAt(page, 500, 300))[3]).toBe(0)

  await page.evaluate(() => (window as any).__pentrado.redo())
  await settle(page)
  expectClose(await pixelAt(page, 500, 300), [0, 255, 0, 255])
})

test('a fast diagonal stroke is continuous (no gaps between events)', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#0000ff'
    e.brushSize.value = 40
  })
  await stroke(page, [[100, 100], [900, 900]], 2)
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    const p = await pixelAt(page, 100 + 800 * t, 100 + 800 * t)
    expect(p[3], `alpha at t=${t}`).toBeGreaterThan(200)
  }
})

test('eraser clears painted pixels', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#ff0000')
  await setTool(page, 'eraser')
  await page.evaluate(() => {
    ;(window as any).__pentrado.brushSize.value = 80
  })
  await stroke(page, [[400, 400], [600, 400]])
  expect((await pixelAt(page, 500, 400))[3]).toBeLessThan(30)
  expectClose(await pixelAt(page, 500, 700), [255, 0, 0, 255])
})

test('brush opacity scales the stroke', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#000000'
    e.brushSize.value = 60
    e.brushOpacity.value = 0.5
  })
  await stroke(page, [[300, 500], [700, 500]])
  const p = await pixelAt(page, 500, 500)
  expect(p[3]).toBeGreaterThan(90)
  expect(p[3]).toBeLessThan(170)
})

test('painting on a mask hides layer content', async ({ page }) => {
  await boot(page)
  const id = await addFilledLayer(page, '#ff0000')
  await page.evaluate((lid) => {
    const e = (window as any).__pentrado
    e.addMask(lid, 'white')
    e.paintTarget.value = 'mask'
    e.brushColor.value = '#000000'
    e.brushSize.value = 100
  }, id)
  await setTool(page, 'brush')
  await stroke(page, [[400, 500], [600, 500]])
  expect((await pixelAt(page, 500, 500))[3]).toBeLessThan(40)
  expectClose(await pixelAt(page, 500, 800), [255, 0, 0, 255])
})

test('selection clips brush strokes', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ff00ff'
    e.brushSize.value = 80
  })
  await setTool(page, 'marquee')
  await stroke(page, [[300, 300], [700, 700]])
  expect(await page.evaluate(() => (window as any).__pentrado.hasSelection())).toBe(true)
  await setTool(page, 'brush')
  await stroke(page, [[100, 500], [900, 500]])
  expectClose(await pixelAt(page, 500, 500), [255, 0, 255, 255])
  expect((await pixelAt(page, 150, 500))[3]).toBe(0)
})
