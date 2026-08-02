import { expect, test } from '@playwright/test'

import { addEmptyLayer, addFilledLayer, boot, expectClose, pixelAt, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

test('rectangle marquee + fill paints exactly the selected rect', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'marquee')
  await stroke(page, [[200, 200], [600, 500]])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ffaa00'
    e.fillSelection()
  })
  await settle(page)
  expectClose(await pixelAt(page, 400, 350), [255, 170, 0, 255])
  expect((await pixelAt(page, 700, 350))[3]).toBe(0)
  expect((await pixelAt(page, 400, 600))[3]).toBe(0)
})

test('ellipse marquee selects a disc, not its corners', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'marquee-ellipse')
  await stroke(page, [[300, 300], [700, 700]])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#00ffff'
    e.fillSelection()
  })
  await settle(page)
  expectClose(await pixelAt(page, 500, 500), [0, 255, 255, 255])
  expect((await pixelAt(page, 315, 315))[3]).toBeLessThan(30)
})

test('lasso selects a free-form polygon', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'lasso')
  await stroke(page, [[500, 200], [800, 700], [200, 700], [500, 200]], 6)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ff0000'
    e.fillSelection()
  })
  await settle(page)
  expectClose(await pixelAt(page, 500, 500), [255, 0, 0, 255])
  expect((await pixelAt(page, 250, 250))[3]).toBe(0)
})

test('magic wand picks the clicked color region and inverting flips it', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#3366cc')
  await setTool(page, 'marquee')
  await stroke(page, [[100, 100], [400, 400]])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ffffff'
    e.fillSelection()
    e.selectNone()
  })
  await settle(page)

  await setTool(page, 'wand')
  const target = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
    const rect = canvas.parentElement!.getBoundingClientRect()
    const { width, height } = (window as any).__pentrado.canvasSize.value
    return { cx: rect.left + (250 / width) * rect.width, cy: rect.top + (250 / height) * rect.height }
  })
  await page.mouse.click(target.cx, target.cy)
  await settle(page)
  expect(await page.evaluate(() => (window as any).__pentrado.hasSelection())).toBe(true)

  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#00ff00'
    e.fillSelection()
  })
  await settle(page)
  expectClose(await pixelAt(page, 250, 250), [0, 255, 0, 255])
  expectClose(await pixelAt(page, 700, 700), [51, 102, 204, 255])
})

test('grow expands and shrink contracts the selection', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'marquee')
  await stroke(page, [[400, 400], [600, 600]])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.selectionRadius.value = 30
    e.modifySelection('grow')
    e.brushColor.value = '#ffffff'
    e.fillSelection()
  })
  await settle(page)
  expect((await pixelAt(page, 385, 500))[3]).toBeGreaterThan(200)

  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.selectionRadius.value = 60
    e.modifySelection('shrink')
    e.brushColor.value = '#ff0000'
    e.fillSelection()
  })
  await settle(page)
  expectClose(await pixelAt(page, 500, 500), [255, 0, 0, 255])
  expectClose(await pixelAt(page, 400, 500), [255, 255, 255, 255])
})

test('feather softens the fill edge', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'marquee')
  await stroke(page, [[400, 400], [600, 600]])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.selectionRadius.value = 40
    e.modifySelection('feather')
    e.brushColor.value = '#000000'
    e.fillSelection()
  })
  await settle(page)
  const edge = await pixelAt(page, 400, 500)
  expect(edge[3]).toBeGreaterThan(30)
  expect(edge[3]).toBeLessThan(230)
  expect((await pixelAt(page, 500, 500))[3]).toBeGreaterThan(230)
})

test('cut / paste floats the pixels and anchors them as a new layer', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#cc2200')
  await setTool(page, 'marquee')
  await stroke(page, [[300, 300], [500, 500]])
  const counts = await page.evaluate(() => {
    const e = (window as any).__pentrado
    const before = e.layers.value.length
    e.cutSelection()
    e.pasteClipboard()
    e.anchorFloating('new')
    return { before, after: e.layers.value.length }
  })
  await settle(page)
  expect(counts.after).toBe(counts.before + 1)
  expectClose(await pixelAt(page, 400, 400), [204, 34, 0, 255])
})
