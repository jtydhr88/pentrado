import { test, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function boot(page: Page, doc: number): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__pentrado)
  await page.evaluate((d) => {
    const e = (window as any).__pentrado
    e.setArtboardSize(d, d)
    e.fitView()
    e.addEmptyLayer()
    e.tool.value = 'brush'
    e.brushColor.value = '#cc3344'
    e.brushSize.value = 48
  }, doc)
  await page.waitForTimeout(300)
}

async function strokeWithPhases(page: Page): Promise<{ downMs: number; moveAvgMs: number; upMs: number }> {
  return page.evaluate(async () => {
    const vp = document.querySelector('[data-testid="pentrado-viewport"]') as HTMLElement
    const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
    const rect = canvas.parentElement!.getBoundingClientRect()
    const at = (t: number) => ({
      clientX: rect.left + rect.width * (0.2 + 0.6 * t),
      clientY: rect.top + rect.height * 0.5,
    })
    const fire = (type: string, pos: { clientX: number; clientY: number }) =>
      vp.dispatchEvent(
        new PointerEvent(type, {
          ...pos, bubbles: true, pointerId: 1, pointerType: 'mouse',
          buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
        })
      )
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

    await frame()
    const t0 = performance.now()
    fire('pointerdown', at(0))
    await frame()
    const downMs = performance.now() - t0

    const moves: number[] = []
    for (let i = 1; i <= 24; i++) {
      const m0 = performance.now()
      fire('pointermove', at(i / 24))
      await frame()
      moves.push(performance.now() - m0)
    }

    const t1 = performance.now()
    fire('pointerup', at(1))
    await frame()
    await frame()
    const upMs = performance.now() - t1

    return {
      downMs,
      moveAvgMs: moves.reduce((a, b) => a + b, 0) / moves.length,
      upMs,
    }
  })
}

for (const doc of [1024, 4096]) {
  test(`stroke latency phases + CPU profile @ ${doc}`, async ({ page }) => {
    await boot(page, doc)
    // Warm-up stroke (stamp caches, shaders).
    await strokeWithPhases(page)
    await page.waitForTimeout(1500)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await cdp.send('Profiler.start')
    const phases = await strokeWithPhases(page)
    await page.waitForTimeout(1200)
    const { profile } = await cdp.send('Profiler.stop')

    console.log(`[lat] doc=${doc} down=${phases.downMs.toFixed(1)}ms moveAvg=${phases.moveAvgMs.toFixed(1)}ms up=${phases.upMs.toFixed(1)}ms`)

    // Aggregate self time per function.
    const nodes = new Map<number, { name: string; url: string; line: number; self: number }>()
    for (const n of profile.nodes) {
      nodes.set(n.id, {
        name: n.callFrame.functionName || '(anonymous)',
        url: (n.callFrame.url || '').split('/').slice(-1)[0],
        line: n.callFrame.lineNumber,
        self: 0,
      })
    }
    const samples = profile.samples ?? []
    const deltas = profile.timeDeltas ?? []
    for (let i = 0; i < samples.length; i++) {
      const node = nodes.get(samples[i])
      if (node) node.self += (deltas[i] ?? 0) / 1000
    }
    const top = [...nodes.values()].filter((n) => n.self > 3).sort((a, b) => b.self - a.self).slice(0, 15)
    for (const t of top) console.log(`[prof] ${t.self.toFixed(1)}ms ${t.name} (${t.url}:${t.line})`)
  })
}
