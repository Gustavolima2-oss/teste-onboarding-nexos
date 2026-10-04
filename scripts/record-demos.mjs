#!/usr/bin/env node
// Grava os vídeos de demonstração do HANDOFF.md (1440×900, sem som: o Playwright não
// captura áudio). Precisa do dev server em :5199 (npx vite --port 5199).
// Uso: npm run demos [pasta]   (padrão: raiz do repositório)
import { chromium } from 'playwright-core';
import { renameSync } from 'node:fs';
const OUT = process.argv[2] ?? '.';
const BASE = 'http://localhost:5199/';
const IDS = [
  'ferramentas',
  'agentes',
  'conversas',
  'favoritas',
  'seu-negocio',
  'base',
  'produtos',
  'integracoes',
  'waz',
];
const size = { width: 1440, height: 900 };
const b = await chromium.launch({
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ready = (p, id) =>
  p.waitForFunction(
    (id) =>
      document.documentElement.dataset.coachState === 'ready' &&
      document.documentElement.dataset.coachStep === id,
    id,
    { timeout: 60000 },
  );
const unlocked = (p) =>
  p.waitForFunction(() => !document.querySelector('.coach-next').disabled, null, {
    timeout: 30000,
  });
const closed = (p) =>
  p.waitForFunction(() => document.documentElement.dataset.coachState === 'closed', null, {
    timeout: 20000,
  });
async function record(name, fn) {
  const ctx = await b.newContext({ viewport: size, recordVideo: { dir: OUT, size } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await fn(p);
  const v = p.video();
  await ctx.close();
  renameSync(await v.path(), `${OUT}/${name}`);
  console.log(name, 'ok', errs.length ? errs : '');
}
// 1) Modo com voz: fluxo completo, avanço automático no fim de cada fala.
await record('demo-modo-voz.webm', async (p) => {
  await p.goto(`${BASE}?onboarding=reset#/home`);
  for (let i = 0; i < 9; i++) {
    await ready(p, IDS[i]);
    if (i === 2) {
      await unlocked(p).catch(() => {});
      await p.waitForFunction(
        () => document.querySelector('.coach-audio').dataset.voice !== 'playing',
        null,
        { timeout: 20000 },
      );
      await p.waitForTimeout(1500);
      await p.click('[data-coach="fav-conversas"]');
    }
  }
  await unlocked(p);
  await p.waitForTimeout(1500);
  await p.click('.coach-next');
  await closed(p);
  await p.waitForTimeout(2000);
});
// 2) Modo texto: pausa na etapa 1, borda enchendo com o botão desativado, cliques em Próximo.
await record('demo-modo-texto.webm', async (p) => {
  await p.goto(`${BASE}?onboarding=reset#/home`);
  await ready(p, IDS[0]);
  await p.waitForTimeout(900);
  await p.click('.coach-audio');
  for (let i = 0; i < 9; i++) {
    if (i > 0) await ready(p, IDS[i]);
    if (i === 2) {
      await p.waitForTimeout(2500);
      await p.click('[data-coach="fav-conversas"]');
      continue;
    }
    await unlocked(p);
    await p.waitForTimeout(700);
    await p.click('.coach-next');
  }
  await closed(p);
  await p.waitForTimeout(2000);
});
// 3) Voltar: 6 → 5 (troca de tela) → 4 → 3 (o favorito sai da sidebar).
await record('demo-voltar.webm', async (p) => {
  await p.goto(`${BASE}?voice=off&onboarding=reset&step=6#/seu-negocio`);
  await ready(p, IDS[5]);
  await p.waitForTimeout(1500);
  for (const id of [IDS[4], IDS[3], IDS[2]]) {
    await p.click('.coach-back');
    await ready(p, id);
    await p.waitForTimeout(1600);
  }
  await p.waitForTimeout(1500);
});
await b.close();
