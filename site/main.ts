import './tailwind.css'

import { createApp, defineComponent, h, shallowRef } from 'vue'
import IconGithub from '~icons/lucide/github'

import {
  LayerEditorCanvas,
  LayerEditorToolBar,
  LayerEditorToolStrip,
  LayerListPanel,
  useLayerEditorHotkeys,
  useLayerEditorStage,
  type PentradoHost,
} from '@jtydhr88/pentrado'
import { i18n } from './i18n'

const DB_NAME = 'pentrado-site'
const DB_STORE = 'documents'
const DOC_ID = 'doc'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbGet(db: IDBDatabase): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(DOC_ID)
    req.onsuccess = () => resolve(req.result?.json ?? null)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, json: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put({ id: DOC_ID, json, updatedAt: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function makeStorage(initial: string, db: IDBDatabase | null) {
  let state = initial
  let captured = ''
  let writeChain: Promise<void> = Promise.resolve()
  let warned = false
  return {
    subfolder: 'pentrado-site',
    readState: () => state,
    writeState: (json: string) => {
      state = json
      if (!db) return
      writeChain = writeChain
        .then(() => idbPut(db, json))
        .catch((e) => {
          if (!warned) {
            warned = true
            console.warn('[pentrado] persisting to IndexedDB failed — changes will not survive reload', e)
          }
        })
    },
    readCapturedImage: () => captured,
    beginCapture: () => (url: string, stale: boolean) => { if (!stale) captured = url },
    commitBatch: () => {},
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

const siteHost: PentradoHost = {
  async uploadBlob(blob) {
    return { url: await blobToDataUrl(blob) }
  },
  async uploadCanvas(canvas) {

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return canvas.toDataURL('image/png')
    return blobToDataUrl(blob)
  },
  toolbarActions: [
    {
      id: 'github',
      title: 'View source on GitHub',
      icon: IconGithub,
      run: () => {
        window.open('https://github.com/jtydhr88/pentrado', '_blank', 'noopener')
      },
    },
  ],
}

async function bootstrap(): Promise<void> {
  let db: IDBDatabase | null = null
  let initial = '{}'
  try {
    db = await openDb()
    initial = (await idbGet(db)) ?? '{}'
  } catch (e) {
    console.warn('[pentrado] IndexedDB unavailable — document will not survive reload', e)
  }
  void navigator.storage?.persist?.().catch(() => {})

  const storage = makeStorage(initial, db)

  const Root = defineComponent({
    setup() {
      const editor = useLayerEditorStage({ storage, instanceId: 'pentrado-site', host: siteHost })
      ;(window as unknown as { __pentrado?: unknown }).__pentrado = editor
      const canvasRef = shallowRef<{ setSpaceDown?: (v: boolean) => void } | null>(null)
      const hotkeys = useLayerEditorHotkeys(editor, {
        setSpaceDown: (v: boolean) => canvasRef.value?.setSpaceDown?.(v),
        isFullscreen: () => false,
        exitFullscreen: () => {},
      })
      requestAnimationFrame(() => requestAnimationFrame(() => editor.fitView()))
      return () =>
        h(
          'div',
          {
            class: 'ctv:flex ctv:h-full ctv:flex-col ctv:gap-1 ctv:text-xs ctv:text-base-foreground',
            tabindex: -1,
            onKeydown: hotkeys.onKeyDown,
            onKeyup: hotkeys.onKeyUp,
          },
          [
            h(LayerEditorToolBar, { editor }),
            h('div', { class: 'ctv:flex ctv:min-h-0 ctv:flex-1 ctv:gap-1' }, [
              h(LayerEditorToolStrip, { editor }),
              h('div', { class: 'ctv:relative ctv:min-w-0 ctv:flex-1' }, [
                h(LayerEditorCanvas, { editor, ref: canvasRef }),
              ]),
              h(LayerListPanel, { editor }),
            ]),
          ]
        )
    },
  })

  const app = createApp(Root)
  app.use(i18n)
  app.mount('#app')
}

void bootstrap()
