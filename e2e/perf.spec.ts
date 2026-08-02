import { expect, test } from '@playwright/test'

import { addEmptyLayer, addFilledLayer, boot, settle, setTool } from './helpers'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Budgets are deliberately generous: headless runs composite on SwiftShader
// (software WebGL), which is several times slower than any real GPU. These
// tests exist to catch order-of-magnitude regressions, not to benchmark.

/**
 * Dispatch a scripted stroke directly on the viewport and measure how long the
 * app takes to process it, plus per-frame timings while it runs.
 */
async function measureStroke(
  page: import('@playwright/test').Page,
  points: number
): Promise<{ totalMs: number; frames: number; maxFrameMs: number; avgFrameMs: number }> {
  return page.evaluate(async (n) => {
    const vp = document.querySelector('[data-testid="pentrado-viewport"]') as HTMLElement
    const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
    const rect = canvas.parentElement!.getBoundingClientRect()
    const at = (t: number) => ({
      clientX: rect.left + rect.width * (0.1 + 0.8 * t),
      clientY: rect.top + rect.height * (0.5 + 0.25 * Math.sin(t * Math.PI * 4)),
    })
    const fire = (type: string, pos: { clientX: number; clientY: number }) =>
      vp.dispatchEvent(
        new PointerEvent(type, {
          ...pos,
          bubbles: true,
          pointerId: 1,
          pointerType: 'mouse',
          buttons: type === 'pointerup' ? 0 : 1,
          isPrimary: true,
        })
      )

    const frameTimes: number[] = []
    let last = performance.now()
    let raf = 0
    const tick = () => {
      const now = performance.now()
      frameTimes.push(now - last)
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const t0 = performance.now()
    fire('pointerdown', at(0))
    for (let i = 1; i <= n; i++) {
      fire('pointermove', at(i / n))
      // Yield every few samples so rAF-batched paint work actually runs.
      if (i % 4 === 0) await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
    fire('pointerup', at(1))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
    const totalMs = performance.now() - t0
    cancelAnimationFrame(raf)

    const inner = frameTimes.slice(1)
    return {
      totalMs,
      frames: inner.length,
      maxFrameMs: Math.max(...inner, 0),
      avgFrameMs: inner.length ? inner.reduce((a, b) => a + b, 0) / inner.length : 0,
    }
  }, points)
}

test('60-sample brush stroke stays interactive', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#22aaee'
    e.brushSize.value = 48
  })
  const m = await measureStroke(page, 60)
  console.log(`[perf] brush stroke: total ${m.totalMs.toFixed(0)}ms, frames ${m.frames}, avg ${m.avgFrameMs.toFixed(1)}ms, max ${m.maxFrameMs.toFixed(1)}ms`)
  expect(m.totalMs).toBeLessThan(10_000)
  expect(m.avgFrameMs).toBeLessThan(250)
})

test('second stroke benefits from warm caches (stamp/texture/mip)', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ffffff'
    e.brushSize.value = 48
  })
  const cold = await measureStroke(page, 40)
  const warm = await measureStroke(page, 40)
  console.log(`[perf] cold ${cold.totalMs.toFixed(0)}ms vs warm ${warm.totalMs.toFixed(0)}ms`)
  expect(warm.totalMs).toBeLessThan(cold.totalMs * 2.5)
})

test('undo/redo of a paint stroke is fast (region undo, not full-layer)', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#ff0000'
    e.brushSize.value = 32
  })
  await measureStroke(page, 30)
  await settle(page)
  const times = await page.evaluate(async () => {
    const e = (window as any).__pentrado
    const t0 = performance.now()
    e.undo()
    const undoMs = performance.now() - t0
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    const t1 = performance.now()
    e.redo()
    const redoMs = performance.now() - t1
    return { undoMs, redoMs }
  })
  console.log(`[perf] undo ${times.undoMs.toFixed(1)}ms, redo ${times.redoMs.toFixed(1)}ms`)
  expect(times.undoMs).toBeLessThan(1500)
  expect(times.redoMs).toBeLessThan(1500)
})

test('many strokes keep undo history usable (patch-sized snapshots)', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'brush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#00ff88'
    e.brushSize.value = 24
  })
  for (let i = 0; i < 12; i++) await measureStroke(page, 10)
  await settle(page)
  const undoable = await page.evaluate(() => {
    const e = (window as any).__pentrado
    let n = 0
    while (e.canUndo.value && n < 50) {
      e.undo()
      n++
    }
    return n
  })
  console.log(`[perf] undo steps available after 12 strokes: ${undoable}`)
  expect(undoable).toBeGreaterThanOrEqual(12)
})

test('mandala airbrush stroke stays interactive (scattered damage rects)', async ({ page }) => {
  await boot(page)
  await addEmptyLayer(page)
  await setTool(page, 'airbrush')
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.brushColor.value = '#8833ff'
    e.brushSize.value = 48
    e.symmetryMode.value = 'mandala'
    e.symmetrySectors.value = 8
  })
  const m = await measureStroke(page, 40)
  await page.evaluate(() => ((window as any).__pentrado.symmetryMode.value = 'none'))
  console.log(`[perf] mandala-8 airbrush: total ${m.totalMs.toFixed(0)}ms, avg frame ${m.avgFrameMs.toFixed(1)}ms, max ${m.maxFrameMs.toFixed(1)}ms`)
  expect(m.totalMs).toBeLessThan(15_000)
  expect(m.avgFrameMs).toBeLessThan(400)
})

test('fx parameter sweep re-renders within budget', async ({ page }) => {
  await boot(page)
  await addFilledLayer(page, '#cc3355')
  const ms = await page.evaluate(async () => {
    const e = (window as any).__pentrado
    const id = e.activeId.value
    const t0 = performance.now()
    for (let s = 2; s <= 16; s += 2) {
      e.setLayerFx(id, [{ id: 'fx1', op: 'gaussian-blur', enabled: true, opacity: 1, params: { stdDev: s } }])
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
    return performance.now() - t0
  })
  console.log(`[perf] 8-step gaussian sweep on 1024x1024: ${ms.toFixed(0)}ms`)
  expect(ms).toBeLessThan(20_000)
})

test('full-canvas fill and flatten complete within budget', async ({ page }) => {
  await boot(page)
  const ms = await page.evaluate(async () => {
    const e = (window as any).__pentrado
    const t0 = performance.now()
    for (let i = 0; i < 4; i++) {
      e.addEmptyLayer()
      e.brushColor.value = '#123456'
      e.selectAll()
      e.fillSelection()
      e.selectNone()
    }
    e.flattenImage()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    return performance.now() - t0
  })
  console.log(`[perf] 4 fills + flatten: ${ms.toFixed(0)}ms`)
  expect(ms).toBeLessThan(15_000)
})
