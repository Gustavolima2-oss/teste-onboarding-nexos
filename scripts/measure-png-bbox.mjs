#!/usr/bin/env node
// Mede a caixa visível (alpha > 0) dos PNGs de posição do Nexo exportados do
// Figma e converte para offsets relativos ao tooltip de cada etapa.
// Uso: npm run measure:png
// Saída: tabela no console + scripts/png-bbox.json (valores copiados para src/coachmark/steps.ts).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Caixas dos nodes no frame base 1920×1080 (get_design_context / get_metadata).
// Fase 2 — Figma HYM49734BUPEwZfnNLLDY4 (seção 2350:2826). O PNG do Nexo é o mesmo
// da fase 1 (4096×2286), desenhado em 385×214,87 em todos os frames.
const PNG_SRC = 'scripts/nexo-figma-source.png';
const NODE = { w: 385, h: 214.87 };
const STEPS = [
  {
    id: 'ferramentas',
    png: PNG_SRC,
    node: { x: 390, y: 65.07, ...NODE },
    tooltip: { x: 80, y: 77, w: 378, h: 163 },
  },
  {
    id: 'chips',
    png: PNG_SRC,
    node: { x: 1382, y: 188, ...NODE },
    tooltip: { x: 1040, y: 203, w: 378, h: 243 },
  },
  {
    id: 'conversas',
    png: PNG_SRC,
    node: { x: 1350, y: 334, ...NODE },
    tooltip: { x: 1004, y: 264.16, w: 378, h: 425 },
  },
  {
    id: 'favoritas',
    png: PNG_SRC,
    node: { x: 446, y: 196, ...NODE },
    tooltip: { x: 100, y: 227, w: 378, h: 163 },
  },
  {
    id: 'seu-negocio',
    png: PNG_SRC,
    node: { x: 406, y: 75, ...NODE },
    tooltip: { x: 93, y: 96, w: 378, h: 163 },
  },
  {
    id: 'negocio-cards',
    png: PNG_SRC,
    node: { x: 1558, y: 451, ...NODE },
    tooltip: { x: 1242, y: 367, w: 378, h: 441 },
  },
  {
    id: 'waz',
    png: PNG_SRC,
    node: { x: 416, y: 142, ...NODE },
    tooltip: { x: 70, y: 160, w: 378, h: 179 },
  },
];

/**
 * Corpo (a esfera com a tela), sem os braços: nas colunas centrais a primeira
 * sequência opaca a partir do topo é a esfera (os braços não cruzam o centro).
 * Altura = maior dessas sequências; centro x = ponto médio das bordas nas linhas
 * do topo (acima dos anéis dos ombros).
 */
function bodyBox(file, vis) {
  const { width, height, data } = PNG.sync.read(fs.readFileSync(path.join(root, file)));
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] > 128;
  const cx0 = Math.round((vis.minX + vis.maxX) / 2);
  let best = { top: 0, bottom: 0, x: cx0 };
  for (let x = cx0 - 400; x <= cx0 + 600; x += 4) {
    let y = 0;
    while (y < height && !opaque(x, y)) y++;
    const top = y;
    while (y < height && opaque(x, y)) y++;
    if (y - top > best.bottom - best.top) best = { top, bottom: y, x };
  }
  const mids = [];
  for (let k = 1; k <= 5; k++) {
    const y = best.top + Math.round(((best.bottom - best.top) * k) / 50);
    let l = best.x;
    while (l > 0 && opaque(l, y)) l--;
    let r = best.x;
    while (r < width - 1 && opaque(r, y)) r++;
    mids.push((l + r) / 2);
  }
  const cx = mids.reduce((a, b) => a + b, 0) / mids.length;
  return { cx, cy: (best.top + best.bottom) / 2, h: best.bottom - best.top };
}

function visibleBox(file) {
  const png = PNG.sync.read(fs.readFileSync(path.join(root, file)));
  const { width, height, data } = png;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { width, height, minX, minY, maxX: maxX + 1, maxY: maxY + 1 };
}

const round = (n) => Math.round(n * 10) / 10;
const out = {};

for (const s of STEPS) {
  const b = visibleBox(s.png);
  // O PNG é desenhado com object-cover no node; a proporção é praticamente a
  // mesma (4096×2286 ≈ 439×245), então a escala é uniforme.
  const scale = Math.max(s.node.w / b.width, s.node.h / b.height);
  const dx = s.node.x + (s.node.w - b.width * scale) / 2;
  const dy = s.node.y + (s.node.h - b.height * scale) / 2;
  const vis = {
    x: dx + b.minX * scale,
    y: dy + b.minY * scale,
    w: (b.maxX - b.minX) * scale,
    h: (b.maxY - b.minY) * scale,
  };
  const center = { x: vis.x + vis.w / 2, y: vis.y + vis.h / 2 };
  const body = bodyBox(s.png, b);
  const bodyCenter = { x: dx + body.cx * scale, y: dy + body.cy * scale };
  const tooltipCenter = { x: s.tooltip.x + s.tooltip.w / 2, y: s.tooltip.y + s.tooltip.h / 2 };
  out[s.id] = {
    pngSize: { w: b.width, h: b.height },
    visibleInFrame: { x: round(vis.x), y: round(vis.y), w: round(vis.w), h: round(vis.h) },
    center: { x: round(center.x), y: round(center.y) },
    body: { cx: round(bodyCenter.x), cy: round(bodyCenter.y), h: round(body.h * scale) },
    // Caixa visível inteira (com braços) relativa ao centro do corpo.
    extents: {
      left: round(vis.x - bodyCenter.x),
      right: round(vis.x + vis.w - bodyCenter.x),
      top: round(vis.y - bodyCenter.y),
      bottom: round(vis.y + vis.h - bodyCenter.y),
    },
    // Offset do CENTRO DO CORPO a partir da borda direita / centro vertical do tooltip.
    nexoOffset: {
      x: round(bodyCenter.x - (s.tooltip.x + s.tooltip.w)),
      y: round(bodyCenter.y - tooltipCenter.y),
      height: round(body.h * scale),
    },
  };
}

console.table(
  Object.fromEntries(
    Object.entries(out).map(([k, v]) => [
      k,
      {
        ...v.visibleInFrame,
        cx: v.center.x,
        cy: v.center.y,
        offX: v.nexoOffset.x,
        offY: v.nexoOffset.y,
      },
    ]),
  ),
);
fs.writeFileSync(path.join(root, 'scripts/png-bbox.json'), JSON.stringify(out, null, 2) + '\n');
console.log('Gravado em scripts/png-bbox.json');
