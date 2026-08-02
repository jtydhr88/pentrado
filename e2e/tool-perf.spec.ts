import { expect, test, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */

test.describe.configure({ mode: 'serial' })

const AVG_BUDGET_MS = 400
const MAX_BUDGET_MS = 1500

let page: Page

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000)
  page = await browser.newPage()
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__pentrado)
  await page.evaluate(async () => {
    const e = (window as any).__pentrado
    e.setArtboardSize(1024, 1024)
    e.fitView()
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 256, 256)
    grad.addColorStop(0, '#375a7f')
    grad.addColorStop(1, '#c96f2c')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
    const url = URL.createObjectURL(blob)
    while (e.layers.value.length < 12) {
      await e.addImageFromUrl(url, `L${e.layers.value.length}`)
      if (e.floating.value) e.anchorFloating('new')
    }
    for (const r of e.layers.value) e.renameLayer(r.node.id, 'meta'.repeat(400) + r.node.id)
    // Top paint layer covering the middle so every paint tool has pixels.
    e.addEmptyLayer()
    e.brushColor.value = '#4488bb'
    e.selectAll()
    e.fillSelection()
    e.selectNone()
  })
  await page.waitForTimeout(500)
})

test.afterAll(async () => {
  await page.close()
})

interface Gesture {
  path: Array<[number, number]>
  button?: number
  alt?: boolean
  stepsPerSegment?: number
}

async function measureGesture(g: Gesture): Promise<{ avgMs: number; maxMs: number }> {
  return page.evaluate(async (spec) => {
    const e = (window as any).__pentrado
    const vp = document.querySelector('[data-testid="pentrado-viewport"]') as HTMLElement
    const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
    const rect = canvas.parentElement!.getBoundingClientRect()
    const { width, height } = e.canvasSize.value
    const toClient = ([x, y]: [number, number]) => ({
      clientX: rect.left + (x / width) * rect.width,
      clientY: rect.top + (y / height) * rect.height,
    })
    const buttons = spec.button === 1 ? 4 : 1
    const fire = (type: string, pos: { clientX: number; clientY: number }) =>
      vp.dispatchEvent(
        new PointerEvent(type, {
          ...pos, bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
          button: spec.button ?? 0,
          buttons: type === 'pointerup' ? 0 : buttons,
          altKey: !!spec.alt,
        })
      )
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

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

    const steps = spec.stepsPerSegment ?? 3
    fire('pointerdown', toClient(spec.path[0]))
    await frame()
    for (let i = 1; i < spec.path.length; i++) {
      const [ax, ay] = spec.path[i - 1]
      const [bx, by] = spec.path[i]
      for (let s = 1; s <= steps; s++) {
        fire('pointermove', toClient([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]))
        await frame()
      }
    }
    fire('pointerup', toClient(spec.path[spec.path.length - 1]))
    await frame()
    await frame()
    cancelAnimationFrame(raf)
    const inner = frames.slice(1)
    return {
      avgMs: inner.reduce((a, b) => a + b, 0) / Math.max(1, inner.length),
      maxMs: Math.max(...inner, 0),
    }
  }, g as never)
}

async function measureClicks(points: Array<[number, number]>): Promise<{ avgMs: number; maxMs: number }> {
  return page.evaluate(async (pts) => {
    const e = (window as any).__pentrado
    const vp = document.querySelector('[data-testid="pentrado-viewport"]') as HTMLElement
    const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
    const rect = canvas.parentElement!.getBoundingClientRect()
    const { width, height } = e.canvasSize.value
    const toClient = ([x, y]: [number, number]) => ({
      clientX: rect.left + (x / width) * rect.width,
      clientY: rect.top + (y / height) * rect.height,
    })
    const fire = (type: string, pos: { clientX: number; clientY: number }, buttons: number) =>
      vp.dispatchEvent(
        new PointerEvent(type, {
          ...pos, bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons,
        })
      )
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
    const times: number[] = []
    for (const p of pts) {
      const t0 = performance.now()
      fire('pointerdown', toClient(p), 1)
      fire('pointerup', toClient(p), 0)
      await frame()
      await frame()
      times.push(performance.now() - t0)
    }
    return { avgMs: times.reduce((a, b) => a + b, 0) / times.length, maxMs: Math.max(...times) }
  }, points)
}

async function setTool(tool: string, extra?: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ([t, x]) => {
      const e = (window as any).__pentrado
      e.tool.value = t
      e.brushSize.value = 40
      e.brushColor.value = '#dd3366'
      e.selectNone?.()
      const rows = e.layers.value
      e.setActiveLayer(rows[rows.length - 1].node.id)
      for (const [k, v] of Object.entries(x ?? {})) {
        if (e[k] && 'value' in e[k]) e[k].value = v
      }
    },
    [tool, extra ?? {}] as const
  )
  await page.waitForTimeout(80)
}

function report(name: string, m: { avgMs: number; maxMs: number }): void {
  console.log(`[toolperf] ${name}: avg ${m.avgMs.toFixed(1)}ms max ${m.maxMs.toFixed(1)}ms`)
  expect(m.avgMs, `${name} avg`).toBeLessThan(AVG_BUDGET_MS)
  expect(m.maxMs, `${name} max`).toBeLessThan(MAX_BUDGET_MS)
}

const DIAG: Array<[number, number]> = [[300, 300], [500, 450], [700, 600]]

for (const tool of ['brush', 'eraser', 'airbrush', 'smudge', 'dodge', 'burn'] as const) {
  test(`paint frame rate: ${tool}`, async () => {
    await setTool(tool)
    report(tool, await measureGesture({ path: DIAG }))
  })
}

test('paint frame rate: clone (with source)', async () => {
  await setTool('clone')
  await measureGesture({ path: [[500, 500], [505, 505]], alt: true })
  report('clone', await measureGesture({ path: DIAG }))
})

test('picker drag frame rate', async () => {
  await setTool('picker')
  report('picker', await measureGesture({ path: DIAG }))
})

test('gradient drag frame rate', async () => {
  await setTool('gradient')
  report('gradient', await measureGesture({ path: [[250, 250], [800, 700]] }))
})

test('bucket click latency', async () => {
  await setTool('bucket')
  report('bucket', await measureClicks([[500, 500], [350, 350], [650, 650]]))
})

test('wand click latency', async () => {
  await setTool('wand')
  report('wand', await measureClicks([[500, 500], [350, 350]]))
  await page.evaluate(() => (window as any).__pentrado.selectNone())
})

for (const tool of ['marquee', 'marquee-ellipse', 'lasso'] as const) {
  test(`selection drag frame rate: ${tool}`, async () => {
    await setTool(tool)
    report(tool, await measureGesture({ path: [[250, 250], [750, 400], [600, 750]] }))
    await page.evaluate(() => (window as any).__pentrado.selectNone())
  })
}

test('select-tool layer drag frame rate', async () => {
  await setTool('select')
  report('select-move', await measureGesture({ path: [[512, 512], [600, 550], [680, 620]] }))
  await page.evaluate(() => (window as any).__pentrado.undo())
})

test('transform drag frame rate', async () => {
  await setTool('select')
  await page.evaluate(() => (window as any).__pentrado.startTransform())
  await page.waitForTimeout(80)
  report('transform-move', await measureGesture({ path: [[512, 512], [575, 550], [630, 590]] }))
  await page.evaluate(() => (window as any).__pentrado.transformCancel())
})

test('warp drag frame rate', async () => {
  await setTool('warp')
  report('warp', await measureGesture({ path: [[500, 500], [550, 525], [600, 560]] }))
  await page.evaluate(() => (window as any).__pentrado.warpCancel())
})

test('shape drag frame rate', async () => {
  await setTool('shape')
  report('shape', await measureGesture({ path: [[300, 300], [700, 650]] }))
  await page.evaluate(() => (window as any).__pentrado.undo())
})

test('pen draft drag frame rate', async () => {
  await setTool('pen')
  report('pen', await measureGesture({ path: [[300, 300], [500, 350], [650, 550]] }))
  await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.penCancel()
  })
})

test('pan drag frame rate', async () => {
  await setTool('select')
  report('pan', await measureGesture({ path: [[500, 500], [400, 450], [300, 400]], button: 1 }))
})

test('wheel zoom frame rate', async () => {
  const m = await page.evaluate(async () => {
    const vp = document.querySelector('[data-testid="pentrado-viewport"]') as HTMLElement
    const r = vp.getBoundingClientRect()
    const frame = () => new Promise<void>((res) => requestAnimationFrame(() => res()))
    const times: number[] = []
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      vp.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
          deltaY: i % 2 ? 120 : -120,
        })
      )
      await frame()
      times.push(performance.now() - t0)
    }
    return { avgMs: times.reduce((a, b) => a + b, 0) / times.length, maxMs: Math.max(...times) }
  })
  report('wheel-zoom', m)
})
