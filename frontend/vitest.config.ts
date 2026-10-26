import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Local, test-only Vitest configuration for the deterministic frontend harness.
// The production build still uses `vite.config.ts`; this file does not affect it.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/cockpit/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    clearMocks: true,
    restoreMocks: true
  }
})
