import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 等のサブパス配信に対応:
//   ビルド時に環境変数 VITE_BASE_PATH='/temer-plus/' のように指定
//   未指定なら '/' （開発サーバ・ルート配信向け）
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    port: 5173,
    open: true,
  },
});
