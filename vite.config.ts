/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, mode }) => ({
  // Use /starrupture-planner/ only for GitHub Pages production build
  base: command === 'build' && mode !== 'azure' ? '/starrupture-planner/' : '/',
  plugins: [react(), tailwindcss()],
  publicDir: 'assets',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'xyflow': ['@xyflow/react', 'dagre'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
}))
