import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  /**
   * GitHub Pages 的项目页挂在 /<repo>/ 子路径下，构建产物必须带上这个前缀，
   * 否则 index.html 里引用的资源会 404。本地 dev 仍走根路径，不受影响。
   */
  base: command === 'build' ? '/trae-lab-lottery/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))