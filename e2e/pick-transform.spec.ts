import { expect, test } from '@playwright/test'

import { activeNode, addEmptyLayer, addFilledLayer, boot, docToClient, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

test('clicking transparent pixels falls through to the visible layer below (GIMP pick)', async ({ page }) => {
  await boot(page)
  const below = await addFilledLayer(page, '#ff0000')
  const above = await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#00ff00'
    e.brushSize.value = 120
  })
  await stroke(page, [[200, 500], [350, 500]])

  await setTool(page, 'select')
  await page.evaluate(() => (window as any).__pentrado.setSelectedLayers([]))

  const onStroke = await docToClient(page, 300, 500)
  await page.mouse.click(onStroke.cx, onStroke.cy)
  await settle(page)
  expect(await page.evaluate(() => (window as any).__pentrado.activeId.value)).toBe(above)

  await page.evaluate(() => (window as any).__pentrado.setSelectedLayers([]))
  const onGap = await docToClient(page, 800, 500)
  await page.mouse.click(onGap.cx, onGap.cy)
  await settle(page)
  expect(await page.evaluate(() => (window as any).__pentrado.activeId.value)).toBe(below)
})

test('select tool drags a layer; undo restores its position', async ({ page }) => {
  await boot(page)
  await boot(page)
  const id = await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.addEmptyLayer()
    return e.activeId.value
  })
  // Give the layer real pixels in a known spot so the pick hits it.
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ffffff'
    e.brushSize.value = 160
  })
  await stroke(page, [[400, 400], [600, 600]])

  const before = await activeNode(page)
  await setTool(page, 'select')
  await page.evaluate((lid) => (window as any).__pentrado.setActiveLayer(lid), id)
  await stroke(page, [[500, 500], [700, 500]])
  const after = await activeNode(page)
  expect(after.transform.x - before.transform.x).toBeGreaterThan(150)
  expect(Math.abs(after.transform.y - before.transform.y)).toBeLessThan(20)

  await page.evaluate(() => (window as any).__pentrado.undo())
  await settle(page)
  const undone = await activeNode(page)
  expect(Math.abs(undone.transform.x - before.transform.x)).toBeLessThan(2)
})

test('transform session scales the layer and apply commits it', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#ffcc00')
  const before = await activeNode(page)
  await page.evaluate(() => (window as any).__pentrado.startTransform())
  await settle(page)
  // Drag the bottom-right corner handle inward.
  await stroke(page, [[1023, 1023], [700, 700]])
  await page.evaluate(() => (window as any).__pentrado.transformApply())
  await settle(page)
  const after = await activeNode(page)
  expect(after.transform.w).toBeLessThan(before.transform.w - 100)
})

test('nudge moves the active layer by keyboard-sized steps', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#4488ff')
  const before = await activeNode(page)
  await page.evaluate(() => (window as any).__pentrado.nudgeActive(10, -5))
  const after = await activeNode(page)
  expect(after.transform.x - before.transform.x).toBe(10)
  expect(after.transform.y - before.transform.y).toBe(-5)
})
