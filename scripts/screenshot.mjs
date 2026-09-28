#!/usr/bin/env node
// Screenshots de verificação com o Chrome instalado (playwright-core).
// Uso: node scripts/screenshot.mjs <url> <saida-sem-extensao> [WxH ...] [--measure] [--wait=ms] [--eval=js]
import { chromium } from 'playwright-core';

// Prints em DPR 2 por padrão (tela Retina). DPR=1 para comparar.
const DPR = Number(process.env.DPR ?? 2);

const [url, out, ...rest] = process.argv.slice(2);
const sizes = rest.filter((a) => /^\d+x\d+$/.test(a));
const measure = rest.includes('--measure');
const wait = Number(rest.find((a) => a.startsWith('--wait='))?.slice(7) ?? 800);
const evalJs = rest.find((a) => a.startsWith('--eval='))?.slice(7);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--enable-gpu'],
});
for (const size of sizes.length ? sizes : ['1440x900']) {
  const [width, height] = size.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: DPR });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (evalJs) await page.evaluate(evalJs);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}-${size}.png` });
  if (measure) {
    const boxes = await page.evaluate(() => {
      const q = {
        greeting: '.greeting',
        toolsTitle: '#tools-title',
        verTodas: '.btn-outline',
        tool1: '.tool--caixa',
        tool5: '.tool--prospeccao',
        teamTitle: '#team-title',
        pipo: '[data-coach="member-pipo"]',
        waz: '[data-coach="member-waz"]',
        maky: '[data-coach="member-maky"]',
        navFerramentas: '[data-coach="nav-ferramentas"]',
        wazHighlight: '.is-coach-target',
        tooltip: '.coach-tooltip',
        tooltipArrow: '.coach-arrow',
      };
      const r = {};
      for (const [k, sel] of Object.entries(q)) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        r[k] = [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 10) / 10).join(', ');
      }
      return r;
    });
    console.log(`\n${size}`);
    console.table(boxes);
  }
  if (logs.length) console.log(logs.join('\n'));
  await page.close();
}
await browser.close();
