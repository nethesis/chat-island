import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Two builds from one source:
//   npm run build         -> dist/        ES module library, React as a peer (nethvoice-cti, NethLink)
//   npm run build:widget  -> dist-widget/ self-contained script that mounts on every <div class="chat-island">
const widget = process.env.BUILD === 'widget'

export default defineConfig({
  plugins: [react()],
  define: widget ? { 'process.env.NODE_ENV': '"production"' } : {},
  build: widget
    ? {
        outDir: 'dist-widget',
        lib: { entry: resolve(__dirname, 'src/index.widget.tsx'), name: 'ChatIsland', formats: ['iife'], fileName: () => 'index.widget.js' },
        rollupOptions: { output: { assetFileNames: 'index.widget.[ext]' } },
      }
    : {
        outDir: 'dist',
        lib: { entry: resolve(__dirname, 'src/index.ts'), formats: ['es'], fileName: () => 'index.js' },
        rollupOptions: {
          // React stays the host's; the CommonJS shim zustand pulls in must stay out too,
          // or the bundle carries a require("react") that no browser can satisfy.
          external: ['react', 'react-dom', 'react/jsx-runtime', /^use-sync-external-store/],
          output: { assetFileNames: 'index.[ext]' },
        },
      },
})
