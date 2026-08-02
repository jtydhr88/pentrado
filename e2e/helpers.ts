import { expect, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).__pentrado)
  await expect(page.getByTestId('pentrado-main-canvas')).toBeVisible()
  await settle(page)
}

/** Wait out rAF-batched paint/present so canvas pixels reflect the last action. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 30)))
      )
  )
}

export async function setTool(page: Page, tool: string): Promise<void> {
  await page.evaluate((t) => {
    ;(window as any).__pentrado.tool.value = t
  }, tool)
}

export async function docToClient(page: Page, x: number, y: number): Promise<{ cx: number; cy: number }> {
  return page.evaluate(
    ([px, py]) => {
      const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
      const rect = canvas.parentElement!.getBoundingClientRect()
      const ed = (window as any).__pentrado
      const { width, height } = ed.canvasSize.value
      return {
        cx: rect.left + (px / width) * rect.width,
        cy: rect.top + (py / height) * rect.height,
      }
    },
    [x, y] as const
  )
}

/** Drag a pointer through the given document-space points. */
export async function stroke(page: Page, points: Array<[number, number]>, stepsPerSegment = 4): Promise<void> {
  const first = await docToClient(page, points[0][0], points[0][1])
  await page.mouse.move(first.cx, first.cy)
  await page.mouse.down()
  for (let i = 1; i < points.length; i++) {
    const p = await docToClient(page, points[i][0], points[i][1])
    await page.mouse.move(p.cx, p.cy, { steps: stepsPerSegment })
  }
  await page.mouse.up()
  await settle(page)
}

/** RGBA of the composited document pixel (doc coordinates, zoom-independent). */
export async function pixelAt(page: Page, x: number, y: number): Promise<[number, number, number, number]> {
  return page.evaluate(
    ([px, py]) => {
      const canvas = document.querySelector('[data-testid="pentrado-main-canvas"]') as HTMLCanvasElement
      const d = canvas.getContext('2d')!.getImageData(Math.round(px), Math.round(py), 1, 1).data
      return [d[0], d[1], d[2], d[3]] as [number, number, number, number]
    },
    [x, y] as const
  )
}

export async function layerCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__pentrado.layers.value.length)
}

export async function layerNames(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__pentrado.layers.value.map((r: any) => r.node.name))
}

export async function activeNode(page: Page): Promise<any> {
  return page.evaluate(() => {
    const n = (window as any).__pentrado.activeNode.value
    return n ? JSON.parse(JSON.stringify({ id: n.id, kind: n.kind, name: n.name, transform: n.transform, opacity: n.opacity })) : null
  })
}

/** Add an empty full-canvas raster layer and fill it with a color; returns its id. */
export async function addFilledLayer(page: Page, color: string): Promise<string> {
  const id = await page.evaluate((c) => {
    const e = (window as any).__pentrado
    e.addEmptyLayer()
    e.brushColor.value = c
    e.selectAll()
    e.fillSelection()
    e.selectNone()
    return e.activeId.value
  }, color)
  await settle(page)
  return id
}

export async function addEmptyLayer(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const e = (window as any).__pentrado
    e.addEmptyLayer()
    return e.activeId.value
  })
  await settle(page)
  return id
}

export function expectClose(actual: [number, number, number, number], want: [number, number, number, number], tol = 12): void {
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(actual[i] - want[i]), `channel ${i}: ${actual} vs ${want}`).toBeLessThanOrEqual(tol)
  }
}
