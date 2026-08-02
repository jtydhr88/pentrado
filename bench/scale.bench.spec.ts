import { test, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */

const REALISTIC_CHECKPOINTS = [10, 25, 50, 100, 150, 200, 250]
const WORSTCASE_CHECKPOINTS = [5, 10, 25, 50, 100]
const STROKE_SAMPLES = 24
const COMPOSITE_BUDGET_MS = 30_000
const ADD_BUDGET_MS = 240_000

interface Checkpoint {
  layers: number
  addMs: number
  compositeMs: number[]
  strokeAvgFrameMs: number
  strokeMaxFrameMs: number
  undoMs: number
  heapMB: number
  estPlacedMB: number
  estTexMB: number
}

function estDocLayerMB(doc: number): number {
  return (doc * doc * 4) / (1024 * 1024)
}

async function boot(page: Page, doc: number): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__pentrado)
  await page.evaluate((d) => {
    const e = (window as any).__pentrado
    e.setArtboardSize(d, d)
    e.fitView()
  }, doc)
  await settle(page)
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))))
  )
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
    let seed = 42
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${(rnd() * 255) | 0},${(rnd() * 255) | 0},${(rnd() * 255) | 0},0.5)`
      g.beginPath()
      g.arc(rnd() * 768, rnd() * 768, 4 + rnd() * 40, 0, Math.PI * 2)
      g.fill()
    }
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
    ;(window as any).__benchUrl = URL.createObjectURL(blob)
  })
}

interface AddResult {
  ms: number
  reached: number
}

/** Add layers until the document holds `target` of them, or the time cap hits. */
async function addRealisticLayers(page: Page, target: number): Promise<AddResult> {
  return page.evaluate(
    async ([n, cap]) => {
      const e = (window as any).__pentrado
      const url = (window as any).__benchUrl as string
      const t0 = performance.now()
      while (e.layers.value.length < n && performance.now() - t0 < cap) {
        await e.addImageFromUrl(url, `bench-${e.layers.value.length}`)
        if (e.floating.value) e.anchorFloating('new')
        if (e.layers.value.length % 10 === 0) await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
      return { ms: performance.now() - t0, reached: e.layers.value.length }
    },
    [target, ADD_BUDGET_MS] as const
  )
}

async function addWorstCaseLayers(page: Page, target: number): Promise<AddResult> {
  return page.evaluate(
    async ([n, cap]) => {
      const e = (window as any).__pentrado
      const t0 = performance.now()
      while (e.layers.value.length < n && performance.now() - t0 < cap) {
        e.addEmptyLayer()
        e.brushColor.value = '#336699'
        e.selectAll()
        e.fillSelection()
        e.selectNone()
        await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
      return { ms: performance.now() - t0, reached: e.layers.value.length }
    },
    [target, ADD_BUDGET_MS] as const
  )
}

/** Force a full recomposite (opacity nudge on bottom layer) and time it, including a sync readback. */
async function measureComposite(page: Page, runs = 3): Promise<number[]> {
  const out: number[] = []
  for (let i = 0; i < runs; i++) {
    out.push(
      await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const e = (window as any).__pentrado
            const row = e.layers.value[0]
            const t0 = performance.now()
            e.setOpacity(row.node.id, row.node.opacity > 0.95 ? 0.9 : 1)
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
                canvas.getContext('2d')!.getImageData(0, 0, 1, 1)
                resolve(performance.now() - t0)
              })
            )
          })
      )
    )
  }
  return out
}

async function measureStroke(page: Page, points: number): Promise<{ avgFrameMs: number; maxFrameMs: number }> {
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.tool.value = 'brush'
    e.symmetryMode.value = 'none'
    e.brushColor.value = '#ff3366'
    e.brushSize.value = 48
    const rows = e.layers.value
    e.setActiveLayer(rows[rows.length - 1].node.id)
  })
  return page.evaluate(async (n) => {
    const vp = document.querySelector('[data-testid="pentrado-viewport"]') as HTMLElement
    const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
    const rect = canvas.parentElement!.getBoundingClientRect()
    const at = (t: number) => ({
      clientX: rect.left + rect.width * (0.2 + 0.6 * t),
      clientY: rect.top + rect.height * (0.5 + 0.2 * Math.sin(t * Math.PI * 3)),
    })
    const fire = (type: string, pos: { clientX: number; clientY: number }) =>
      vp.dispatchEvent(
        new PointerEvent(type, {
          ...pos, bubbles: true, pointerId: 1, pointerType: 'mouse',
          buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
        })
      )
    const frames: number[] = []
    let last = performance.now()
    let raf = 0
    const tick = () => {
      const now = performance.now()
      frames.push(now - last)
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    fire('pointerdown', at(0))
    for (let i = 1; i <= n; i++) {
      fire('pointermove', at(i / n))
      if (i % 4 === 0) await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
    fire('pointerup', at(1))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
    cancelAnimationFrame(raf)
    const inner = frames.slice(1)
    return {
      avgFrameMs: inner.length ? inner.reduce((a, b) => a + b, 0) / inner.length : 0,
      maxFrameMs: Math.max(...inner, 0),
    }
  }, points)
}

async function measureUndo(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const e = (window as any).__pentrado
    const t0 = performance.now()
    e.undo()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    return performance.now() - t0
  })
}

async function heapMB(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = (performance as any).memory
    return m ? m.usedJSHeapSize / (1024 * 1024) : -1
  })
}

async function runRamp(
  page: Page,
  doc: number,
  checkpoints: number[],
  addFn: (page: Page, target: number) => Promise<AddResult>,
  tag: string
): Promise<void> {
  let crashed = false
  page.on('crash', () => {
    crashed = true
    console.log(`[bench] ${tag} doc=${doc} *** RENDERER CRASHED ***`)
  })
  page.on('console', (msg) => {
    const t = msg.text()
    if (/webgl|gpu|context lost|out of memory|^\[page\]/i.test(t)) console.log(`[bench] ${tag} doc=${doc} console: ${t}`)
  })
  await boot(page, doc)
  await makeContentUrl(page)

  for (const target of checkpoints) {
    if (crashed) break
    const cp: Partial<Checkpoint> = { layers: target }
    let reached = target
    try {
      const add = await addFn(page, target)
      cp.addMs = add.ms
      reached = add.reached
      cp.layers = reached
      cp.compositeMs = await measureComposite(page)
      const s = await measureStroke(page, STROKE_SAMPLES)
      cp.strokeAvgFrameMs = s.avgFrameMs
      cp.strokeMaxFrameMs = s.maxFrameMs
      cp.undoMs = await measureUndo(page)
      cp.heapMB = await heapMB(page)
      cp.estPlacedMB = Math.round(estDocLayerMB(doc) * reached)
      cp.estTexMB = Math.round(estDocLayerMB(doc) * reached)
      console.log(`[bench] ${tag} doc=${doc} ${JSON.stringify(cp)}`)
    } catch (e) {
      console.log(`[bench] ${tag} doc=${doc} FAILED at layers=${target}: ${String(e).slice(0, 300)}`)
      break
    }
    if (reached < target) {
      console.log(`[bench] ${tag} doc=${doc} add budget hit at ${reached}/${target}, stopping ramp`)
      break
    }
    const medianComposite = [...cp.compositeMs!].sort((a, b) => a - b)[1]
    if (medianComposite > COMPOSITE_BUDGET_MS) {
      console.log(`[bench] ${tag} doc=${doc} composite budget exceeded, stopping ramp at ${target}`)
      break
    }
  }
}

for (const doc of [2048, 4096, 6000]) {
  test(`realistic 768px content layers @ ${doc}x${doc}`, async ({ page }) => {
    await runRamp(page, doc, REALISTIC_CHECKPOINTS, addRealisticLayers, 'realistic')
  })
}

for (const doc of [2048, 4096, 6000]) {
  test(`full-doc filled layers (worst case) @ ${doc}x${doc}`, async ({ page }) => {
    await runRamp(page, doc, WORSTCASE_CHECKPOINTS, addWorstCaseLayers, 'worstcase')
  })
}
