import { test, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */

const HOLD_MS = 45_000

async function boot(page: Page, doc: number): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__pentrado)
  await page.evaluate((d) => {
    const e = (window as any).__pentrado
    e.setArtboardSize(d, d)
    e.fitView()
  }, doc)
}

async function makeContentUrl(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = c.height = 768
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 768, 768)
    grad.addColorStop(0, '#3a6ea5')
    grad.addColorStop(1, '#c05a2e')
    g.fillStyle = grad
    g.fillRect(0, 0, 768, 768)
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
    ;(window as any).__benchUrl = URL.createObjectURL(blob)
  })
}

test('hold: realistic 6000x6000 x 250 layers', async ({ page }) => {
  await boot(page, 6000)
  await makeContentUrl(page)
  await page.evaluate(async () => {
    const e = (window as any).__pentrado
    const url = (window as any).__benchUrl as string
    while (e.layers.value.length < 250) {
      await e.addImageFromUrl(url, `bench-${e.layers.value.length}`)
      if (e.floating.value) e.anchorFloating('new')
      if (e.layers.value.length % 10 === 0) await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
  })
  // Paint once so the merge caches and preview path are resident too.
  await page.evaluate(async () => {
    const e = (window as any).__pentrado
    e.tool.value = 'brush'
    const rows = e.layers.value
    e.setActiveLayer(rows[rows.length - 1].node.id)
  })
  const heap = await page.evaluate(() => ((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576)
  console.log(`[memhold] realistic ready, heapMB=${heap.toFixed(0)} — HOLDING ${HOLD_MS / 1000}s`)
  await page.waitForTimeout(HOLD_MS)
  console.log('[memhold] realistic done')
})

test('hold: worstcase 6000x6000 x 50 full-doc layers', async ({ page }) => {
  await boot(page, 6000)
  await page.evaluate(async () => {
    const e = (window as any).__pentrado
    while (e.layers.value.length < 50) {
      e.addEmptyLayer()
      e.brushColor.value = '#336699'
      e.selectAll()
      e.fillSelection()
      e.selectNone()
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
  })
  const heap = await page.evaluate(() => ((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576)
  console.log(`[memhold] worstcase ready, heapMB=${heap.toFixed(0)} — HOLDING ${HOLD_MS / 1000}s`)
  await page.waitForTimeout(HOLD_MS)
  console.log('[memhold] worstcase done')
})
