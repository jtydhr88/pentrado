import { expect, test } from '@playwright/test'

import { addEmptyLayer, addFilledLayer, boot, docToClient, expectClose, layerCount, pixelAt, settle, setTool, stroke } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

test('color picker tool reads the composite color into the brush', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#3366cc')
  await setTool(page, 'picker')
  const at = await docToClient(page, 500, 500)
  await page.mouse.click(at.cx, at.cy)
  await settle(page)
  expect(await page.evaluate(() => (window as any).__pentrado.brushColor.value)).toBe('#3366cc')
})

test('ctrl-click picks color while the brush tool is active', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#22aa55')
  await setTool(page, 'brush')
  const at = await docToClient(page, 400, 400)
  await page.keyboard.down('Control')
  await page.mouse.click(at.cx, at.cy)
  await page.keyboard.up('Control')
  await settle(page)
  expect(await page.evaluate(() => (window as any).__pentrado.brushColor.value)).toBe('#22aa55')
  expectClose(await pixelAt(page, 400, 400), [34, 170, 85, 255])
})

test('FG/BG swatch: swap button, X/D hotkeys, picker ctrl sets background', async ({ page }) => {
  await boot(page)
  await expect(page.getByTestId('pentrado-fg-color')).toBeVisible()
  await expect(page.getByTestId('pentrado-bg-color')).toBeVisible()

  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#112233'
    e.backgroundColor.value = '#aabbcc'
  })
  await page.getByTestId('pentrado-swap-colors').click()
  expect(await page.evaluate(() => (window as any).__pentrado.brushColor.value)).toBe('#aabbcc')
  expect(await page.evaluate(() => (window as any).__pentrado.backgroundColor.value)).toBe('#112233')

  await page.getByTestId('pentrado-viewport').focus()
  await page.keyboard.press('x')
  expect(await page.evaluate(() => (window as any).__pentrado.brushColor.value)).toBe('#112233')
  await page.keyboard.press('d')
  expect(await page.evaluate(() => (window as any).__pentrado.brushColor.value)).toBe('#000000')
  expect(await page.evaluate(() => (window as any).__pentrado.backgroundColor.value)).toBe('#ffffff')

  await addFilledLayer(page, '#ff6600')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#123456'
    e.backgroundColor.value = '#ffffff'
  })
  await setTool(page, 'picker')
  const at = await docToClient(page, 500, 500)
  await page.keyboard.down('Control')
  await page.mouse.click(at.cx, at.cy)
  await page.keyboard.up('Control')
  expect(await page.evaluate(() => (window as any).__pentrado.backgroundColor.value)).toBe('#ff6600')
  expect(await page.evaluate(() => (window as any).__pentrado.brushColor.value)).toBe('#123456')
})

test('gradient uses the background color as its end stop', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'gradient')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ff0000'
    e.backgroundColor.value = '#0000ff'
    e.gradientShape.value = 'linear'
    e.gradientToTransparent.value = false
  })
  await stroke(page, [[100, 500], [900, 500]])
  const left = await pixelAt(page, 110, 500)
  const right = await pixelAt(page, 890, 500)
  expect(left[0]).toBeGreaterThan(200)
  expect(right[2]).toBeGreaterThan(200)
  expect(right[0]).toBeLessThan(60)
})

test('gradient tool paints a linear FG-to-transparent ramp', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'gradient')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#0000ff'
    e.gradientShape.value = 'linear'
    e.gradientToTransparent.value = true
  })
  await stroke(page, [[100, 500], [900, 500]])
  const left = await pixelAt(page, 110, 500)
  const mid = await pixelAt(page, 500, 500)
  const right = await pixelAt(page, 950, 500)
  expect(left[3]).toBeGreaterThan(220)
  expect(left[2]).toBeGreaterThan(200)
  expect(mid[3]).toBeGreaterThan(80)
  expect(mid[3]).toBeLessThan(180)
  expect(right[3]).toBeLessThan(40)

  await page.evaluate(() => (window as any).__pentrado.undo())
  await settle(page)
  expect((await pixelAt(page, 110, 500))[3]).toBe(0)
})

test('smudge drags color across an edge', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'marquee')
  await stroke(page, [[0, 0], [512, 1023]])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ff0000'
    e.fillSelection()
    e.selectNone()
  })
  await settle(page)
  expect((await pixelAt(page, 600, 500))[3]).toBe(0)

  await setTool(page, 'smudge')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushSize.value = 80
    e.brushOpacity.value = 1
  })
  await stroke(page, [[480, 500], [640, 500]], 8)
  const dragged = await pixelAt(page, 580, 500)
  expect(dragged[3]).toBeGreaterThan(40)
  expect(dragged[0]).toBeGreaterThan(120)
})

test('smudge/clone previews keep the rest of the layer visible mid-stroke', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#cc0000')
  for (const tool of ['smudge', 'clone'] as const) {
    await setTool(page, tool)
    if (tool === 'clone') {
      const src = await docToClient(page, 200, 200)
      await page.keyboard.down('Alt')
      await page.mouse.click(src.cx, src.cy)
      await page.keyboard.up('Alt')
    }
    const from = await docToClient(page, 500, 500)
    const to = await docToClient(page, 560, 500)
    await page.mouse.move(from.cx, from.cy)
    await page.mouse.down()
    await page.mouse.move(to.cx, to.cy, { steps: 4 })
    await settle(page)
    // Pointer still down: pixels far from the brush must not vanish.
    expectClose(await pixelAt(page, 850, 850), [204, 0, 0, 255])
    await page.mouse.up()
    await settle(page)
  }
})

test('clone stamps pixels from the alt-picked source', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'marquee')
  await stroke(page, [[100, 100], [300, 300]])
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ff8800'
    e.fillSelection()
    e.selectNone()
  })
  await settle(page)

  await setTool(page, 'clone')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushSize.value = 90
    e.brushOpacity.value = 1
  })
  const src = await docToClient(page, 200, 200)
  await page.keyboard.down('Alt')
  await page.mouse.click(src.cx, src.cy)
  await page.keyboard.up('Alt')
  await stroke(page, [[600, 600], [660, 600]], 6)
  const cloned = await pixelAt(page, 630, 600)
  expect(cloned[3]).toBeGreaterThan(180)
  expect(cloned[0]).toBeGreaterThan(200)
  expect(cloned[1]).toBeGreaterThan(90)
})

test('dodge brightens and burn darkens', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#808080')
  await setTool(page, 'dodge')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushSize.value = 80
    e.brushOpacity.value = 0.9
  })
  await stroke(page, [[200, 300], [400, 300]], 6)
  const dodged = await pixelAt(page, 300, 300)
  expect(dodged[0]).toBeGreaterThan(140)

  await setTool(page, 'burn')
  await stroke(page, [[200, 700], [400, 700]], 6)
  const burned = await pixelAt(page, 300, 700)
  expect(burned[0]).toBeLessThan(120)
  expectClose(await pixelAt(page, 800, 500), [128, 128, 128, 255])
})

test('airbrush builds up while the pointer is held still', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'airbrush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#000000'
    e.brushSize.value = 80
  })
  const at = await docToClient(page, 500, 500)
  await page.mouse.move(at.cx, at.cy)
  await page.mouse.down()
  await page.waitForTimeout(150)
  await page.mouse.up()
  await settle(page)
  const short = (await pixelAt(page, 500, 500))[3]
  expect(short).toBeGreaterThan(10)

  await page.evaluate(() => (window as any).__pentrado.undo())
  await settle(page)
  await page.mouse.move(at.cx, at.cy)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
  await settle(page)
  const long = (await pixelAt(page, 500, 500))[3]
  expect(long).toBeGreaterThan(short)
})

test('mirror symmetry paints both halves at once', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#dd00dd'
    e.brushSize.value = 50
    e.symmetryMode.value = 'mirror-h'
  })
  await stroke(page, [[200, 300], [300, 400]])
  expect((await pixelAt(page, 250, 350))[3]).toBeGreaterThan(200)
  expect((await pixelAt(page, 1023 - 250, 350))[3]).toBeGreaterThan(200)
  await page.evaluate(() => ((window as any).__pentrado.symmetryMode.value = 'none'))
})

test('mandala symmetry stamps every sector', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#111111'
    e.brushSize.value = 60
    e.symmetryMode.value = 'mandala'
    e.symmetrySectors.value = 4
  })
  const at = await docToClient(page, 512 + 300, 512)
  await page.mouse.click(at.cx, at.cy)
  await settle(page)
  expect((await pixelAt(page, 812, 512))[3]).toBeGreaterThan(150)
  expect((await pixelAt(page, 512, 812))[3]).toBeGreaterThan(150)
  expect((await pixelAt(page, 212, 512))[3]).toBeGreaterThan(150)
  expect((await pixelAt(page, 512, 212))[3]).toBeGreaterThan(150)
  await page.evaluate(() => ((window as any).__pentrado.symmetryMode.value = 'none'))
})

test('copy visible / new from visible / merge visible', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#ff0000')
  await addFilledLayer(page, '#0000ff')
  await page.evaluate((id) => (window as any).__pentrado.setOpacity(id, 0.5), await page.evaluate(() => (window as any).__pentrado.activeId.value))

  await page.evaluate(() => (window as any).__pentrado.newFromVisible())
  await settle(page)
  expect(await layerCount(page)).toBe(3)

  const merged = await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.mergeVisible()
    return e.layers.value.length
  })
  await settle(page)
  expect(merged).toBe(1)
  const px = await pixelAt(page, 500, 500)
  expect(px[3]).toBe(255)

  const pasted = await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.copyVisible()
    e.pasteClipboard()
    e.anchorFloating('new')
    return e.layers.value.length
  })
  await settle(page)
  expect(pasted).toBe(2)
})

test('repeat last filter re-applies with the same parameters', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#ff0000')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.startFilter('desaturate')
    e.updateFilterParam('amount', 1)
    e.applyFilter()
  })
  await settle(page)
  const gray = await pixelAt(page, 500, 500)
  expect(Math.abs(gray[0] - gray[2])).toBeLessThan(10)

  await addFilledLayer(page, '#00ff00')
  await page.evaluate(() => (window as any).__pentrado.repeatLastFilter())
  await settle(page)
  const gray2 = await pixelAt(page, 500, 500)
  expect(Math.abs(gray2[0] - gray2[1])).toBeLessThan(10)
})
