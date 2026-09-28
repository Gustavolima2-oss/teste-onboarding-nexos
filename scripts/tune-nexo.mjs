#!/usr/bin/env node
// Calibração: aplica variações de tuning ao vivo e salva um crop do Nexo (caixa do
// node do Figma, 439×245) por variação. Cada variação recarrega a página.
// Uso: node scripts/tune-nexo.mjs <prefixo-saida> '<json: [{"yawDeg":-30, "js":"..."}]>' [url] [WxH]
import { chromium } from 'playwright-core';

// Prints em DPR 2 por padrão (tela Retina). DPR=1 para comparar.
const DPR = Number(process.env.DPR ?? 2);

const [out, variantsJson, url = 'http://localhost:5199/?step=1', size = '1920x1080'] =
  process.argv.slice(2);
const variants = JSON.parse(variantsJson);
const [width, height] = size.split('x').map(Number);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width, height }, deviceScaleFactor: DPR });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
let i = 0;
for (const v of variants) {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__nexo?.nexo?.debugStage?.stats.frames > 0, null, {
    timeout: 15000,
  });
  await p.evaluate((v) => {
    const s = window.__nexo.nexo.debugStage;
    const { js, ...t } = v;
    if (js) new Function('stage', js)(s);
    Object.assign(s.tuning, t);
    s.applyTuning();
  }, v);
  await p.waitForTimeout(200);
  const a = await p.evaluate(() => window.__nexo.nexo.debugStage.getAnchor());
  const x = Math.max(0, a.x - 195.3);
  const y = Math.max(0, a.y - 84.33);
  await p.screenshot({
    path: `${out}-${i}.png`,
    clip: { x, y, width: Math.min(385, width - x), height: Math.min(215, height - y) },
  });
  i++;
}
await b.close();
