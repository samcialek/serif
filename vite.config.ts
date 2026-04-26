import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // Subpath for GitHub Pages project-page hosting (samcialek.github.io/serif/).
  // Switch to '/' if/when a custom domain is attached.
  base: '/serif/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@views': path.resolve(__dirname, './src/views'),
      '@data': path.resolve(__dirname, './src/data'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  server: {
    port: 5173,
    open: true,
    // Warm up frequently used files
    warmup: {
      clientFiles: [
        './src/App.tsx',
        './src/views/*.tsx',
        './src/components/layout/*.tsx',
        './src/components/common/*.tsx',
      ],
    },
  },
  // Pre-bundle heavy dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'framer-motion',
      'recharts',
      'zustand',
      'lucide-react',
      'clsx',
      'tailwind-merge',
    ],
  },
  // Build optimizations
  build: {
    // Bumped to silence the "chunk > 500kB" warning. The heavy tabs
    // legitimately ship a lot of code (Twin canvas + the inline SCM
    // engine bring 600+kB on their own); their per-route chunks
    // below stay under 1MB.
    chunkSizeWarningLimit: 1000,
    // Per-route splits keep the heavy tabs in their own files so
    // editing one tab doesn't bust the cache on the others, and
    // first-load isn't penalized for code the user hasn't visited.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router-dom/')
            ) {
              return 'react-vendor'
            }
            if (
              id.includes('/framer-motion/') ||
              id.includes('/recharts/') ||
              id.includes('/lucide-react/')
            ) {
              return 'ui-vendor'
            }
            if (
              id.includes('/zustand/') ||
              id.includes('/clsx/') ||
              id.includes('/tailwind-merge/')
            ) {
              return 'utils-vendor'
            }
            return undefined
          }
          // Per-route splits for the heaviest tabs.
          if (id.includes('/views/v2/TwinV2View')) return 'route-twin'
          if (id.includes('/views/InsightsV2View')) return 'route-insights'
          if (id.includes('/views/FingerprintView')) return 'route-fingerprint'
          if (id.includes('/views/DataView')) return 'route-data'
          if (id.includes('/views/DataValueView')) return 'route-devices'
          if (id.includes('/views/ProtocolsView')) return 'route-protocols'
          return undefined
        },
      },
    },
  },
  // Enable caching
  cacheDir: 'node_modules/.vite',
})
