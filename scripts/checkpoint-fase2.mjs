#!/usr/bin/env node
// Checkpoint da fase 2: percorre as 7 etapas pelo teclado (Enter), grava um print
// por etapa e as posições (alvo, tooltip, Nexo, posição usada), e confere o fim
// (overlay some, onboarding:done persistido, foco na página).
// Uso: node scripts/checkpoint-fase2.mjs <pasta> [WxH ...]   (DPR=2 por padrão)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const DPR = Number(process.env.DPR ?? 2);
const [outDir = 'docs/checkpoints/fase2', ...sizes] = process.argv.slice(2);
const base = process.env.URL ?? 'http://localhost:5199/';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const report = {};

for (const size of sizes.length ? sizes : ['1440x900', '1920x1080']) {
  const [width, height] = size.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: DPR });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on(
    'console',
    (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text().slice(0, 200)),
  );
  await page.goto(`${base}?onboarding=reset#/home`);
  const steps = [];
  for (let i = 0; i < 7; i++) {
    await page.waitForFunction(
      () => document.documentElement.dataset.coachState === 'ready',
      null,
      { timeout: 20000 },
    );
    await page.waitForTimeout(i === 2 ? 2600 : 500); // etapa 3: deixa a demonstração do cursor completar
    const info = await page.evaluate(() => {
      const { coach, nexo } = window.__nexo;
      const l = coach.layout;
      const r = (x) =>
        x && {
          x: Math.round(x.x * 10) / 10,
          y: Math.round(x.y * 10) / 10,
          w: Math.round(x.w),
          h: Math.round(x.h),
        };
      return {
        step: document.documentElement.dataset.coachStep,
        route: location.hash,
        dots: [...document.querySelectorAll('.coach-dots span')]
          .map((s) => (s.classList.contains('is-done') ? '●' : '○'))
          .join(''),
        target: r(l.target),
        tooltip: r(l.tooltip),
        tooltipPlacement: l.placement,
        nexo: { x: Math.round(l.nexoAnchor.x * 10) / 10, y: Math.round(l.nexoAnchor.y * 10) / 10 },
        nexoPlacement: l.nexoPlacement,
        mode: nexo.mode,
        focus: document.activeElement?.className,
      };
    });
    steps.push(info);
    await page.screenshot({ path: `${outDir}/etapa${i + 1}-${size}.png` });
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => document.documentElement.dataset.coachState === 'closed', null, {
    timeout: 15000,
  });
  await page.waitForTimeout(300);
  const end = await page.evaluate(() => ({
    overlay: !!document.querySelector('.coach-overlay'),
    tooltip: !!document.querySelector('.coach-tooltip'),
    done: localStorage.getItem('onboarding:done'),
    focus: document.activeElement?.tagName + '.' + document.activeElement?.className,
    route: location.hash,
    canvasOpacity: window.__nexo.nexo.debugStage?.motion.opacity,
  }));
  await page.screenshot({ path: `${outDir}/fim-${size}.png` });
  report[size] = { steps, end, errors };
  await page.close();
}
await browser.close();
fs.writeFileSync(`${outDir}/posicoes.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
