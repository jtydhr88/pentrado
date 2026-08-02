import { test, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function boot(page: Page, doc: number, layers: number): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__pentrado)
  await page.evaluate(
    async ([d, n]) => {
      const e = (window as any).__pentrado
      e.setArtboardSize(d, d)
      e.fitView()
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const g = c.getContext('2d')!
      g.fillStyle = '#3388cc'
      g.fillRect(0, 0, 256, 256)
      g.fillStyle = '#ffbb00'
      g.beginPath()
      g.arc(128, 128, 90, 0, Math.PI * 2)
      g.fill()
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
      const url = URL.createObjectURL(blob)
      while (e.layers.value.length < n) {
        await e.addImageFromUrl(url, `L${e.layers.value.length}`)
        if (e.floating.value) e.anchorFloating('new')
        if (e.layers.value.length % 20 === 0) await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
      // Fatten each node's serialization (PSD layers carry heavy metadata) so
      // the per-frame stamp cost matches real imported documents.
      for (const r of e.layers.value) e.renameLayer(r.node.id, 'meta'.repeat(500) + r.node.id)
      e.tool.value = 'select'
    },
    [doc, layers] as const
  )
  await page.waitForTimeout(600)
}

async function dragActive(page: Page): Promise<{ avgMs: number; maxMs: number }> {
  return page.evaluate(async () => {
    const e = (window as any).__pentrado
    const vp = document.querySelector('[data-testid="pentrado-viewport"]') as HTMLElement
    const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
    const rect = canvas.parentElement!.getBoundingClientRect()
    const { width, height } = e.canvasSize.value
    const n = e.layers.value[e.layers.value.length - 1].node
    const cx = n.transform.x + n.transform.w / 2
    const cy = n.transform.y + n.transform.h / 2
    const toClient = (x: number, y: number) => ({
      clientX: rect.left + (x / width) * rect.width,
      clientY: rect.top + (y / height) * rect.height,
    })
    const fire = (type: string, pos: { clientX: number; clientY: number }) =>
      vp.dispatchEvent(
        new PointerEvent(type, {
          ...pos, bubbles: true, pointerId: 1, pointerType: 'mouse',
          buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
        })
      )
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
    const times: number[] = []
    fire('pointerdown', toClient(cx, cy))
    await frame()
    for (let i = 1; i <= 30; i++) {
      const t0 = performance.now()
      fire('pointermove', toClient(cx + i * 6, cy + i * 3))
      await frame()
      times.push(performance.now() - t0)
    }
    fire('pointerup', toClient(cx + 180, cy + 90))
    await frame()
    return { avgMs: times.reduce((a, b) => a + b, 0) / times.length, maxMs: Math.max(...times) }
  })
}

for (const doc of [1024, 4096]) {
  test(`move a 20-layer group among 100 @ ${doc}`, async ({ page }) => {
    await boot(page, doc, 100)
    const m = await page.evaluate(async () => {
      const e = (window as any).__pentrado
      const ids = e.layers.value.slice(80, 100).map((r: any) => r.node.id)
      e.setSelectedLayers(ids)
      e.groupActiveLayer()
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
      await frame()
      const times: number[] = []
      for (let i = 0; i < 30; i++) {
        const t0 = performance.now()
        e.nudgeActive(2, 1)
        await frame()
        times.push(performance.now() - t0)
      }
      return { avgMs: times.reduce((a, b) => a + b, 0) / times.length, maxMs: Math.max(...times) }
    })
    console.log(`[drag-group] doc=${doc} avg=${m.avgMs.toFixed(1)}ms max=${m.maxMs.toFixed(1)}ms`)
  })

  test(`drag active layer among 100 @ ${doc}`, async ({ page }) => {
    await boot(page, doc, 100)
    await dragActive(page)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
    const m = await dragActive(page)
    const { profile } = await cdp.send('Profiler.stop')
    console.log(`[drag] doc=${doc} avg=${m.avgMs.toFixed(1)}ms max=${m.maxMs.toFixed(1)}ms`)

    const nodes = new Map<number, { name: string; url: string; self: number }>()
    for (const nd of profile.nodes) {
      nodes.set(nd.id, { name: nd.callFrame.functionName || '(anon)', url: (nd.callFrame.url || '').split('/').slice(-1)[0], self: 0 })
    }
    const samples = profile.samples ?? []
    const deltas = profile.timeDeltas ?? []
    for (let i = 0; i < samples.length; i++) {
      const nd = nodes.get(samples[i])
      if (nd) nd.self += (deltas[i] ?? 0) / 1000
    }
    const top = [...nodes.values()].filter((x) => x.self > 4).sort((a, b) => b.self - a.self).slice(0, 12)
    for (const t of top) console.log(`[prof] ${t.self.toFixed(1)}ms ${t.name} (${t.url})`)
  })
}
