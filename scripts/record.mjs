#!/usr/bin/env node
// Grava vídeos de verificação (screencast do DevTools, reamostrado a 60 fps, VP8/WebM
// com o ffmpeg do Playwright). Cenários:
//   flow      fluxo completo das 7 etapas (1440×900)
//   talk      fala sem narração e com narração (close no rosto)
//   look      olhar seguindo o mouse (close)
//   gestures  cada gesto (laboratório, close)
// Uso: node scripts/record.mjs <cenário> <saida.webm>
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [scenario = 'flow', out = `${scenario}.webm`] = process.argv.slice(2);
const base = process.env.URL ?? 'http://localhost:5199/';
const FPS = 60;
const DPR = 2;
const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const ffmpeg = path.join(
  cache,
  fs.readdirSync(cache).find((d) => d.startsWith('ffmpeg-')),
  'ffmpeg-mac',
);

const scenes = {
  flow: { size: [1440, 900], crop: null },
  talk: { size: [1440, 900], crop: [400, 20, 420, 300] },
  look: { size: [1440, 900], crop: [300, 0, 700, 420] },
  gestures: { size: [800, 600], crop: [200, 100, 400, 400] },
};
const scene = scenes[scenario];
if (!scene) throw new Error(`cenário desconhecido: ${scenario}`);
const [width, height] = scene.size;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: DPR });
const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async (f) => {
  frames.push({ t: f.metadata.timestamp, data: Buffer.from(f.data, 'base64') });
  await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
const ready = (id) =>
  page.waitForFunction(
    (id) =>
      document.documentElement.dataset.coachState === 'ready' &&
      (!id || document.documentElement.dataset.coachStep === id),
    id,
    { timeout: 20000 },
  );
const label = async (text) =>
  page.evaluate((text) => {
    let el = document.getElementById('rec-label');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rec-label';
      el.style.cssText =
        'position:fixed;left:12px;bottom:12px;z-index:999;padding:6px 10px;border-radius:6px;background:#000c;color:#fff;font:600 13px/1.2 system-ui';
      document.body.append(el);
    }
    el.textContent = text;
  }, text);

await page.goto('about:blank');
await cdp.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 92,
  maxWidth: width * DPR,
  maxHeight: height * DPR,
  everyNthFrame: 1,
});

if (scenario === 'flow') {
  await page.goto(`${base}?onboarding=reset#/home`);
  for (let i = 0; i < 7; i++) {
    await ready();
    await page.waitForTimeout(i === 2 ? 3000 : 1600);
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => document.documentElement.dataset.coachState === 'closed', null, {
    timeout: 15000,
  });
  await page.waitForTimeout(800);
} else if (scenario === 'talk') {
  await page.goto(`${base}?onboarding=reset&step=1#/home`);
  await ready('ferramentas');
  await label('Fala sem narração (duração pelo texto)');
  await page.evaluate(() =>
    window.__nexo.nexo.talk({
      text: 'É aqui que ficam os módulos e ferramentas disponíveis.',
      narrate: false,
    }),
  );
  await page.waitForTimeout(600);
  await label('Fala com narração (barras por palavra)');
  await page.evaluate(() =>
    window.__nexo.nexo.talk({
      text: 'É aqui que ficam os módulos e ferramentas disponíveis. Vamos começar!',
      narrate: true,
    }),
  );
  await page.waitForTimeout(800);
} else if (scenario === 'look') {
  await page.goto(`${base}?onboarding=reset&step=1#/home`);
  await ready('ferramentas');
  await page.waitForTimeout(800);
  const c = { x: 585, y: 150 };
  await label('Olhar seguindo o mouse (±28° / ±16°)');
  for (let a = 0; a <= Math.PI * 4; a += 0.06) {
    await page.mouse.move(c.x + Math.cos(a) * 420, c.y + 120 + Math.sin(a) * 260);
    await page.waitForTimeout(16);
  }
  await label('Mouse parado 2 s → volta a olhar para o tooltip');
  await page.waitForTimeout(3200);
} else if (scenario === 'gestures') {
  await page.goto(`${base}lab.html`);
  await page.waitForFunction(() => window.__lab?.ready, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  for (const g of ['wave', 'present', 'point', 'think', 'bye', 'idle']) {
    await label(g);
    await page.evaluate((g) => window.__lab.gesture(g, { dx: -300, dy: -40 }), g);
    await page.waitForTimeout(g === 'wave' || g === 'bye' ? 900 : 1300);
  }
}
await cdp.send('Page.stopScreencast');
await browser.close();

// Reamostra para FPS constante (cada quadro de saída usa o último recebido).
const start = frames.find((f) => f.data.length > 20000)?.t ?? frames[0].t;
const usable = frames.filter((f) => f.t >= start);
const end = usable.at(-1).t;
const total = Math.floor((end - start) * FPS);
// Recorte em frações do quadro real (o screencast pode vir em 1x ou 2x, conforme a página).
const c = scene.crop;
const vf = c
  ? `crop=iw*${c[2] / width}:ih*${c[3] / height}:iw*${c[0] / width}:ih*${c[1] / height}`
  : `scale=${width}:${height}:flags=lanczos`;
const enc = spawn(
  ffmpeg,
  [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'image2pipe',
    '-c:v',
    'mjpeg',
    '-r',
    String(FPS),
    '-i',
    'pipe:0',
    '-vf',
    vf,
    '-c:v',
    'libvpx',
    '-b:v',
    '8M',
    '-crf',
    '6',
    '-qmin',
    '2',
    '-qmax',
    '24',
    '-deadline',
    'good',
    '-auto-alt-ref',
    '0',
    out,
  ],
  { stdio: ['pipe', 'ignore', 'inherit'] },
);
let k = 0;
for (let n = 0; n < total; n++) {
  const t = start + n / FPS;
  while (k + 1 < usable.length && usable[k + 1].t <= t) k++;
  if (!enc.stdin.write(usable[k].data)) await new Promise((r) => enc.stdin.once('drain', r));
}
enc.stdin.end();
await new Promise((r) => enc.on('close', r));
console.log(
  `${scenario}: ${usable.length} quadros em ${(end - start).toFixed(1)} s → ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`,
);
