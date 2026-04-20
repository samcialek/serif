import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/serif-demo/',
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
    // Split chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion', 'recharts', 'lucide-react'],
          'utils': ['zustand', 'clsx', 'tailwind-merge'],
        },
      },
    },
  },
  // Enable caching
  cacheDir: 'node_modules/.vite',
})
