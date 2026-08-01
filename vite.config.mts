import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'

export default defineConfig({
  root: fileURLToPath(new URL('./site', import.meta.url)),
  base: './',
  plugins: [vue(), tailwindcss(), Icons({ compiler: 'vue3', autoInstall: false })],
  resolve: {
    alias: {
      '@jtydhr88/pentrado': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
  },
})
