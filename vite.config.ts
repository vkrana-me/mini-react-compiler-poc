import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { reactCompilerPlugin } from './vite-plugin-react-compiler'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    reactCompilerPlugin()
  ],
  optimizeDeps: {
    include: ['monaco-editor', 'xterm', 'xterm-addon-fit']
  },
  define: {
    global: 'globalThis',
  },
})
