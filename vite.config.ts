import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
    // Rust build outputs must not trigger browser reloads during desktop development.
    watch: { ignored: ['**/src-tauri/**', '**/artifacts/**'] },
  },
  // macOS 13 ships WebKit with Safari 16 language support.
  build: { target: 'safari16' },
  clearScreen: false,
});
