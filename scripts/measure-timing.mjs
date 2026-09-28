#!/usr/bin/env node
// Mede o tempo até o tooltip visível em cada etapa (1440×900, DPR 2):
// etapa 1 desde o carregamento (navigationStart), etapas 2–7 desde o clique em "Próximo".
// "Aparece" = primeiro quadro com opacidade > 0; "visível" = opacidade ≥ 0,99.
// Também confere, quadro a quadro, que a escala do Nexo nunca passa de 1 (sem overshoot)
// e o banking máximo.
// Uso: node scripts/measure-timing.mjs [url] [rodadas]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5199/';
const runs = Number(process.argv[3] ?? 3);
const browser = await chromium.launch({ channel: 'chrome' });
const IDS = [
  'ferramentas',
  'chips',
  'conversas',
  'favoritas',
  'seu-negocio',
  'negocio-cards',
  'waz',
];

const recorder = () => {
  const log = [];
  window.__rec = log;
  window.__clicks = [];
  document.addEventListener(
    'click',
    (e) => {
      if (e.target instanceof Element && e.target.closest('.coach-next'))
        window.__clicks.push(performance.now());
    },
    true,
  );
  const tick = () => {
    const tip = document.querySelector('.coach-tooltip');
    const st = window.__nexo?.nexo?.debugStage;
    log.push({
      t: performance.now(),
      tip: tip && !tip.hidden ? Number(getComputedStyle(tip).opacity) : 0,
      step: document.documentElement.dataset.coachStep,
      scale: st ? st.motion.scale : 1,
      bank: st ? st.motion.bank : 0,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const all = IDS.map(() => ({ appear: [], visible: [] }));
let maxScale = 0;
let maxBank = 0;
for (let r = 0; r < runs; r++) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.addInitScript(recorder);
  await page.goto(`${base}?onboarding=reset#/home`);
  for (let i = 0; i < IDS.length; i++) {
    await page.waitForFunction(
      (id) =>
        document.documentElement.dataset.coachState === 'ready' &&
        document.documentElement.dataset.coachStep === id,
      IDS[i],
      { timeout: 20000 },
    );
    await page.waitForTimeout(600);
    if (i < IDS.length - 1) await page.click('.coach-next');
  }
  const { log, clicks } = await page.evaluate(() => ({
    log: window.__rec,
    clicks: window.__clicks,
  }));
  for (let i = 0; i < IDS.length; i++) {
    const t0 = i === 0 ? 0 : clicks[i - 1];
    // Depois do clique, o tooltip antigo sai (opacidade 0) antes do novo entrar.
    const since = log.filter((f) => f.t > t0);
    const gone = i === 0 ? 0 : since.findIndex((f) => f.tip === 0);
    const after = since.slice(Math.max(gone, 0)).filter((f) => f.step === IDS[i]);
    const appear = after.find((f) => f.tip > 0);
    const visible = after.find((f) => f.tip >= 0.99);
    all[i].appear.push(appear ? appear.t - t0 : NaN);
    all[i].visible.push(visible ? visible.t - t0 : NaN);
  }
  for (const f of log) {
    maxScale = Math.max(maxScale, f.scale);
    maxBank = Math.max(maxBank, Math.abs(f.bank));
  }
  await context.close();
}
await browser.close();

const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`Mediana de ${runs} rodadas (ms)       aparece   visível`);
IDS.forEach((id, i) => {
  const from = i === 0 ? 'carregamento' : 'clique';
  console.log(
    `etapa ${i + 1} ${id.padEnd(14)} (${from.padEnd(12)})  ${String(Math.round(med(all[i].appear))).padStart(6)}  ${String(Math.round(med(all[i].visible))).padStart(7)}   [${all[i].visible.map(Math.round).join(', ')}]`,
  );
});
console.log(`escala máx. do Nexo: ${maxScale.toFixed(4)}  banking máx.: ${maxBank.toFixed(2)}°`);
