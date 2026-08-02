import { expect, test } from '@playwright/test'

import { addFilledLayer, boot, expectClose, layerCount, pixelAt, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

test('shape tool drags out a filled vector rectangle layer', async ({ page }) => {
  await boot(page)
  await setTool(page, 'shape')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.shapeKind.value = 'rect'
    e.shapeFillEnabled.value = true
    e.shapeFillColor.value = '#22cc88'
  })
  await stroke(page, [[300, 300], [700, 600]])
  expect(await layerCount(page)).toBe(1)
  expect(await page.evaluate(() => (window as any).__pentrado.activeNode.value?.kind)).toBe('vector')
  expectClose(await pixelAt(page, 500, 450), [34, 204, 136, 255])
  expect((await pixelAt(page, 200, 450))[3]).toBe(0)
})

test('text layer renders glyph pixels', async ({ page }) => {
  await boot(page)
  const id = await page.evaluate(() => {
    const e = (window as any).__pentrado
    const tid = e.addTextLayerAt({ x: 300, y: 480 })
    e.updateTextLayer(tid, { text: 'HELLO PENTRADO', fontSize: 96, color: '#ffffff' })
    return tid
  })
  await settle(page)
  expect(id).toBeTruthy()
  const inked = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
    const d = canvas.getContext('2d')!.getImageData(250, 400, 600, 200).data
    let n = 0
    for (let p = 3; p < d.length; p += 4) if (d[p] > 128) n++
    return n
  })
  expect(inked).toBeGreaterThan(500)
})

test('invert adjustment layer flips the colors underneath', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#ff0000')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.addAdjustmentLayer()
    const id = e.activeId.value
    e.updateAdjustment(id, { op: 'invert' })
  })
  await settle(page)
  const px = await pixelAt(page, 500, 500)
  expect(px[0]).toBeLessThan(60)
  expect(px[1]).toBeGreaterThan(190)
  expect(px[2]).toBeGreaterThan(190)
})

test('fill layer covers the canvas with its color', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.addFillLayer({ kind: 'solid', color: '#8000ff' })
  })
  await settle(page)
  expectClose(await pixelAt(page, 500, 500), [128, 0, 255, 255])
})

test('drop-shadow fx bleeds outside the layer bounds', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.addEmptyLayer()
    e.brushColor.value = '#ffffff'
    e.tool.value = 'brush'
  })
  await setTool(page, 'marquee')
  await stroke(page, [[400, 400], [600, 600]])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ffffff'
    e.fillSelection()
    e.selectNone()
    e.cropToContent(e.activeId.value)
  })
  await settle(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.setLayerFx(e.activeId.value, [
      { id: 'fx1', op: 'drop-shadow', enabled: true, opacity: 1, params: { x: 30, y: 30, stdDev: 10, shadowOpacity: 1, color: 0 } },
    ])
  })
  await settle(page)
  const shadow = await pixelAt(page, 620, 620)
  expect(shadow[3]).toBeGreaterThan(60)
  expect(shadow[0]).toBeLessThan(80)
  expectClose(await pixelAt(page, 500, 500), [255, 255, 255, 255])
})

test('gaussian blur fx softens edges live', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.addEmptyLayer()
  })
  await setTool(page, 'marquee')
  await stroke(page, [[400, 400], [600, 600]])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ff0000'
    e.fillSelection()
    e.selectNone()
    e.setLayerFx(e.activeId.value, [
      { id: 'fx1', op: 'gaussian-blur', enabled: true, opacity: 1, params: { stdDev: 12 } },
    ])
  })
  await settle(page)
  const edge = await pixelAt(page, 400, 500)
  expect(edge[3]).toBeGreaterThan(30)
  expect(edge[3]).toBeLessThan(225)
})
