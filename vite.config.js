import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Configuration Vite : plugin React + PWA (app installable, hors-ligne).
// `base` correspond au sous-dossier où le site est publié sur GitHub Pages
// (https://benjaminthouverez-cpu.github.io/carta2/).
export default defineConfig({
  base: '/carta2/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // met à jour l'app en arrière-plan
      injectRegister: 'auto', // injecte l'enregistrement du service worker
      includeAssets: ['carta.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Carta 2.0',
        short_name: 'Carta 2',
        description: 'Vos sujets, à l’encre sur papier',
        lang: 'fr',
        start_url: '/carta2/',
        scope: '/carta2/',
        display: 'standalone',
        background_color: '#f7efdd',
        theme_color: '#9a5b34',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'carta.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
})
