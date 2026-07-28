import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tauriのデスクトップアプリとして動かす前提の設定
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tauri側のエラー表示を消さない
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Rust側はcargoが見ているので除外
      ignored: ['**/src-tauri/**'],
    },
  },
})
