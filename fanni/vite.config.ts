import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'demo/portfolio/*.svg'],
      manifest: {
        name: 'فني — خدمات البيت بكربلاء',
        short_name: 'فني',
        description: 'اطلب فني موثوق قريب منك: سباكة، كهرباء، تبريد، نجارة وغيرها',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        background_color: '#F7F8FA',
        theme_color: '#203048',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // push notification handlers (public/push-sw.js)
        importScripts: ['push-sw.js'],
        // never cache Supabase API calls
        runtimeCaching: [],
      },
    }),
  ],
  server: { host: true, port: 5173 },
});
