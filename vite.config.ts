import { defineConfig } from 'vite';

// O GitHub Pages serve o site em https://gustavolima2-oss.github.io/teste-onboarding-nexos/.
// O `base` vale para `vite build` e `vite preview`. No dev server fica '/', para os
// scripts de teste e captura (http://localhost:5199/) continuarem funcionando.
const PAGES_BASE = '/teste-onboarding-nexos/';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'serve' && !isPreview ? '/' : PAGES_BASE,
  server: { open: true },
  build: {
    target: 'es2022',
    // O chunk do Nexo (three.js) tem ~675 kB (175 kB gzip) e carrega em paralelo,
    // depois da home (import dinâmico em main.ts).
    chunkSizeWarningLimit: 800,
    rollupOptions: { input: { main: 'index.html' } },
  },
}));
