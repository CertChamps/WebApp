import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    host: true,
    // Don't let Vite recurse into the Capacitor shell or its baked-in
    // copy of an old build (where stale minified JS confuses the scanner).
    fs: {
      deny: ['capacitor-shell/**'],
    },
  },
  // Constrain dependency pre-bundling to the real entry only, so the
  // scanner won't crawl into capacitor-shell/ios/App/App/public/*.html.
  optimizeDeps: {
    entries: ['index.html'],
  },
})
