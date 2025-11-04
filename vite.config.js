import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Electron에서 file:// 프로토콜 사용을 위한 상대 경로
  assetsInclude: ['**/*.MP3', '**/*.mp3', '**/*.wav', '**/*.ogg']
})
