import { expect, test } from '@playwright/test'

import { addEmptyLayer, boot, docToClient, pixelAt, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function paintSquare(page: import('@playwright/test').Page): Promise<string> {
  const id = await addEmptyLayer(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#2266aa'
  })
  await setTool(page, 'brush')
  await page.evaluate(() => ((window as any).__pentrado.brushSize.value = 120))
  await stroke(page, [[450, 500], [550, 500]])
  return id
}

test('stroke effect outlines the shape and undo removes it', async ({ page }) => {
  await boot(page)
  const id = await paintSquare(page)
  await page.evaluate((lid) => {
    const e = (window as any).__pentrado
    e.setLayerFx(lid, [{ id: 'fx1', op: 'stroke', enabled: true, opacity: 1, params: { size: 10, position: 0, strokeOpacity: 1, color: 0xff2200 } }])
  }, id)
  await settle(page)
  // Just outside the painted blob: stroke color.
  const ring = await pixelAt(page, 500, 434)
  expect(ring[0]).toBeGreaterThan(200)
  expect(ring[2]).toBeLessThan(90)
  // Inside stays the paint color.
  const inside = await pixelAt(page, 500, 500)
  expect(inside[2]).toBeGreaterThan(120)

  await page.evaluate(() => (window as any).__pentrado.undo())
  await settle(page)
  expect((await pixelAt(page, 500, 430))[3]).toBe(0)
})

test('outer glow adds soft alpha around the shape', async ({ page }) => {
  await boot(page)
  const id = await paintSquare(page)
  await page.evaluate((lid) => {
    const e = (window as any).__pentrado
    e.setLayerFx(lid, [{ id: 'fx1', op: 'outer-glow', enabled: true, opacity: 1, params: { size: 30, glowOpacity: 1, color: 0xffee00 } }])
  }, id)
  await settle(page)
  const glow = await pixelAt(page, 500, 425)
  expect(glow[3]).toBeGreaterThan(30)
  expect(glow[0]).toBeGreaterThan(180)
})

test('color overlay recolors content but keeps alpha', async ({ page }) => {
  await boot(page)
  const id = await paintSquare(page)
  await page.evaluate((lid) => {
    const e = (window as any).__pentrado
    e.setLayerFx(lid, [{ id: 'fx1', op: 'color-overlay', enabled: true, opacity: 1, params: { overlayOpacity: 1, color: 0x22cc44 } }])
  }, id)
  await settle(page)
  const inside = await pixelAt(page, 500, 500)
  expect(inside[1]).toBeGreaterThan(160)
  expect(inside[2]).toBeLessThan(120)
  expect((await pixelAt(page, 200, 200))[3]).toBe(0)
})

test('crop applies as one undoable group and remaps content', async ({ page }) => {
  await boot(page)
  await paintSquare(page)
  const before = await page.evaluate(() => ({ ...(window as any).__pentrado.canvasSize.value }))

  await setTool(page, 'crop')
  const a = await docToClient(page, 300, 300)
  const b = await docToClient(page, 800, 750)
  await page.mouse.move(a.cx, a.cy)
  await page.mouse.down()
  await page.mouse.move(b.cx, b.cy, { steps: 4 })
  await page.mouse.up()
  await settle(page)

  const pending = await page.evaluate(() => (window as any).__pentrado.cropPending.value)
  expect(pending).toBe(true)
  await page.evaluate(() => (window as any).__pentrado.applyCrop())
  await settle(page)

  const size = await page.evaluate(() => ({ ...(window as any).__pentrado.canvasSize.value }))
  expect(size.width).toBe(500)
  expect(size.height).toBe(450)
  // Painted blob center (500,500) now sits at (200,200) in the cropped doc.
  const moved = await pixelAt(page, 200, 200)
  expect(moved[2]).toBeGreaterThan(120)

  await page.evaluate(() => (window as any).__pentrado.undo())
  await settle(page)
  const restored = await page.evaluate(() => ({ ...(window as any).__pentrado.canvasSize.value }))
  expect(restored.width).toBe(before.width)
  expect(restored.height).toBe(before.height)
  expect((await pixelAt(page, 500, 500))[2]).toBeGreaterThan(120)
})

test('after crop + undo, picking still works (view mapping resyncs)', async ({ page }) => {
  await boot(page)
  await paintSquare(page)
  await setTool(page, 'crop')
  const a = await docToClient(page, 300, 300)
  const b = await docToClient(page, 800, 750)
  await page.mouse.move(a.cx, a.cy)
  await page.mouse.down()
  await page.mouse.move(b.cx, b.cy, { steps: 4 })
  await page.mouse.up()
  await settle(page)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.applyCrop()
    e.tool.value = 'select'
  })
  await settle(page)
  await page.evaluate(() => (window as any).__pentrado.undo())
  await settle(page)

  await page.evaluate(() => (window as any).__pentrado.setActiveLayer(null))
  const hit = await docToClient(page, 500, 500)
  await page.mouse.click(hit.cx, hit.cy)
  await settle(page)
  expect(await page.evaluate(() => (window as any).__pentrado.activeId.value)).not.toBeNull()
})

test('escape clears a pending crop without changing the document', async ({ page }) => {
  await boot(page)
  await paintSquare(page)
  await setTool(page, 'crop')
  const a = await docToClient(page, 200, 200)
  const b = await docToClient(page, 600, 500)
  await page.mouse.move(a.cx, a.cy)
  await page.mouse.down()
  await page.mouse.move(b.cx, b.cy, { steps: 3 })
  await page.mouse.up()
  await settle(page)
  expect(await page.evaluate(() => (window as any).__pentrado.cropPending.value)).toBe(true)

  await page.getByTestId('pentrado-viewport').focus()
  await page.keyboard.press('Escape')
  await settle(page)
  expect(await page.evaluate(() => (window as any).__pentrado.cropPending.value)).toBe(false)
  const size = await page.evaluate(() => ({ ...(window as any).__pentrado.canvasSize.value }))
  expect(size.width).toBe(1024)
})
