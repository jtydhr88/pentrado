import { expect, test } from '@playwright/test'

import { addEmptyLayer, boot, docToClient, expectClose, layerCount, pixelAt, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function clickDoc(page: import('@playwright/test').Page, x: number, y: number): Promise<void> {
  const at = await docToClient(page, x, y)
  await page.mouse.click(at.cx, at.cy)
}

async function drawTrianglePath(page: import('@playwright/test').Page): Promise<void> {
  await setTool(page, 'pen')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.shapeFillEnabled.value = true
    e.shapeFillColor.value = '#22aa66'
  })
  await clickDoc(page, 500, 200)
  await clickDoc(page, 800, 700)
  await clickDoc(page, 200, 700)
  await clickDoc(page, 500, 200)
  await settle(page)
}

test('pen draws a closed filled path layer', async ({ page }) => {
  await boot(page)
  await drawTrianglePath(page)
  expect(await layerCount(page)).toBe(1)
  expect(await page.evaluate(() => (window as any).__pentrado.activeNode.value?.kind)).toBe('vector')
  expectClose(await pixelAt(page, 500, 550), [34, 170, 102, 255])
  expect((await pixelAt(page, 250, 300))[3]).toBe(0)
})

test('pen with drag lays out curved segments', async ({ page }) => {
  await boot(page)
  await setTool(page, 'pen')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.shapeFillEnabled.value = false
    e.shapeStrokeEnabled.value = true
    e.shapeStrokeColor.value = '#ff2200'
    e.shapeStrokeWidth.value = 10
  })
  await stroke(page, [[200, 500], [200, 300]])
  await stroke(page, [[700, 500], [700, 700]])
  await page.evaluate(() => (window as any).__pentrado.penCommit())
  await settle(page)
  expect(await layerCount(page)).toBe(1)
  const mid = await pixelAt(page, 450, 350)
  expect(mid[3]).toBeGreaterThan(100)
  expect(mid[0]).toBeGreaterThan(180)
})

test('escape cancels a draft without creating a layer', async ({ page }) => {
  await boot(page)
  await setTool(page, 'pen')
  await clickDoc(page, 300, 300)
  await clickDoc(page, 600, 300)
  await page.getByTestId('pentrado-viewport').focus()
  await page.keyboard.press('Escape')
  await page.evaluate(() => (window as any).__pentrado.penCommit())
  await settle(page)
  expect(await layerCount(page)).toBe(0)
})

test('anchor drag reshapes the active path and undo restores it', async ({ page }) => {
  await boot(page)
  await drawTrianglePath(page)
  const before = await page.evaluate(() => (window as any).__pentrado.activeNode.value.transform.h)
  await stroke(page, [[500, 200], [500, 100]])
  await settle(page)
  const after = await page.evaluate(() => (window as any).__pentrado.activeNode.value.transform.h)
  expect(before - after).toBeLessThan(0)
  expect(after - before).toBeGreaterThan(80)

  await page.evaluate(() => (window as any).__pentrado.undo())
  await settle(page)
  const undone = await page.evaluate(() => (window as any).__pentrado.activeNode.value.transform.h)
  expect(Math.abs(undone - before)).toBeLessThan(2)
})

test('alt-click deletes an anchor and clicking a segment inserts one', async ({ page }) => {
  await boot(page)
  await drawTrianglePath(page)
  const count = () =>
    page.evaluate(() => (window as any).__pentrado.activeNode.value.path.strokes[0].anchors.length / 3)
  expect(await count()).toBe(3)

  const at = await docToClient(page, 800, 700)
  await page.keyboard.down('Alt')
  await page.mouse.click(at.cx, at.cy)
  await page.keyboard.up('Alt')
  await settle(page)
  expect(await count()).toBe(2)

  await clickDoc(page, 350, 450)
  await settle(page)
  expect(await count()).toBe(3)
})

test('path to selection fills exactly inside the path', async ({ page }) => {
  await boot(page)
  await drawTrianglePath(page)
  const vid = await page.evaluate(() => (window as any).__pentrado.activeId.value)
  await addEmptyLayer(page)
  await page.evaluate((id) => {
    const e = (window as any).__pentrado
    e.pathToSelection(id)
    e.brushColor.value = '#0000ff'
    e.fillSelection()
    e.selectNone()
  }, vid)
  await settle(page)
  const inside = await pixelAt(page, 500, 550)
  expect(inside[2]).toBeGreaterThan(200)
  expect((await pixelAt(page, 250, 300))[3]).toBe(0)
})

test('stroke path paints the brush along the outline', async ({ page }) => {
  await boot(page)
  await drawTrianglePath(page)
  const vid = await page.evaluate(() => (window as any).__pentrado.activeId.value)
  const ok = await page.evaluate((id) => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ff00ff'
    e.brushSize.value = 24
    return e.strokePathBrush(id)
  }, vid)
  expect(ok).toBe(true)
  await settle(page)
  const onEdge = await pixelAt(page, 500, 700)
  expect(onEdge[0]).toBeGreaterThan(180)
  expect(onEdge[2]).toBeGreaterThan(180)
})

test('text-to-path converts when a Typr font is available, degrades gracefully otherwise', async ({ page }) => {
  await boot(page)
  const tid = await page.evaluate(() => {
    const e = (window as any).__pentrado
    const id = e.addTextLayerAt({ x: 200, y: 450 })
    e.updateTextLayer(id, { text: 'PATH', fontSize: 160, color: '#ffffff' })
    return id
  })
  await page.waitForTimeout(1200)
  const result = await page.evaluate((id) => {
    const e = (window as any).__pentrado
    const ok = e.textToPath(id)
    return { ok, kinds: e.layers.value.map((r: any) => r.node.kind) }
  }, tid)
  if (result.ok) {
    // Font manifest present: a vector layer with glyph outlines must exist.
    expect(result.kinds).toContain('vector')
    await settle(page)
  } else {
    // Demo site ships no font manifest; conversion must refuse cleanly.
    expect(result.kinds).toEqual(['text'])
  }
})
