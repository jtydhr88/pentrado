import { test, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__pentrado)
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.setArtboardSize(6000, 6000)
    e.fitView()
  })
}

test('hold: 50 low-churn 6000x6000 tiled layers', async ({ page }) => {
  page.on('console', (m) => {
    if (m.text().includes('materialize')) console.log(`[page] ${m.text().slice(0, 600)}`)
  })
  await boot(page)
  await page.evaluate(async () => {
    const e = (window as any).__pentrado
    const patch = new Uint8ClampedArray(64 * 64 * 4)
    for (let i = 0; i < patch.length; i += 4) {
      patch[i] = 200
      patch[i + 3] = 255
    }
    for (let n = 0; n < 50; n++) {
      e.addEmptyLayer()
      const node = e.activeNode.value
      const next = e.content.derive(node.contentId, [
        { x: (n % 10) * 500 + 100, y: Math.floor(n / 10) * 900 + 100, w: 64, h: 64, pixels: patch },
      ])
      if (next) node.contentId = next
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
    e.setOpacity(e.layers.value[0].node.id, 0.999)
  })
  // Force major GC so discarded canvases release their GPU backing — the
  // sampler should then see the architecture's true resident footprint.
  await page.evaluate(() => {
    const g = (window as any).gc
    if (g) {
      g()
      g()
    }
  })
  const heap = await page.evaluate(() => ((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576)
  const stats = await page.evaluate(() => JSON.stringify((window as any).__pentrado.content.stats()))
  console.log(`[memhold] stats=${stats}`)
  const glStats = await page.evaluate(() => JSON.stringify((window as any).__pentrado.glStats()))
  console.log(`[memhold] gl=${glStats}`)
  console.log(`[memhold] low-churn ready, heapMB=${heap.toFixed(0)} — HOLDING 60s`)
  await page.waitForTimeout(30_000)
  // Second GC late in the hold: by now the site's persistence pipeline
  // (PNG-encoding every layer) has finished, so its transient canvases die.
  await page.evaluate(() => {
    const g = (window as any).gc
    if (g) {
      g()
      g()
    }
  })
  console.log('[memhold] mid-hold GC done — HOLDING 30s more')
  await page.waitForTimeout(30_000)
  console.log('[memhold] low-churn done')
})
