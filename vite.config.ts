/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Use base path for GitHub Pages, root for Azure Static Web Apps
  base: process.env.VITE_BASE_PATH || '/starrupture-planner/',
  plugins: [react(), tailwindcss()],
  publicDir: 'assets',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
})
