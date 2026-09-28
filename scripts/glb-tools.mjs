#!/usr/bin/env node
// Transformações próprias do pipeline do Nexo (usadas por optimize-glb.sh).
//
//   dilate <in> <out> [--px 64]
//     Dilata as ilhas de UV da textura base: rasteriza os triângulos no espaço UV
//     para saber quais texels são usados e espalha a cor das bordas para fora.
//     Sem isso, os mipmaps misturam o fundo nas costuras (rachaduras e pontilhados).
//
//   smooth <in> <out> [--angle 60]
//     Recalcula as normais por POSIÇÃO com ângulo de suavização: casco liso (as costuras
//     de UV não viram vincos) e quinas acima do ângulo continuam definidas.

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [cmd, input, output, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? Number(rest[i + 1]) : fallback;
};

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

const doc = await io.read(input);

if (cmd === 'dilate') await dilate(doc, opt('px', 64));
else if (cmd === 'smooth') smooth(doc, opt('angle', 60));
else {
  console.error('Uso: glb-tools.mjs <dilate|smooth> <in> <out>');
  process.exit(1);
}

await io.write(output, doc);

// ---------------------------------------------------------------------------

async function dilate(doc, maxPx) {
  const root = doc.getRoot();
  const material = root.listMaterials()[0];
  const texture = material?.getBaseColorTexture();
  if (!texture) throw new Error('dilate: material sem baseColorTexture');

  const { data, info } = await sharp(Buffer.from(texture.getImage()))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const covered = new Uint8Array(W * H);

  // 1. Cobertura: rasteriza cada triângulo em UV (origem do glTF no canto superior esquerdo).
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!uv) continue;
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : uv.getCount();
      const get = (i) => (idx ? idx.getScalar(i) : i);
      const a = [0, 0];
      const b = [0, 0];
      const c = [0, 0];
      for (let t = 0; t < count; t += 3) {
        uv.getElement(get(t), a);
        uv.getElement(get(t + 1), b);
        uv.getElement(get(t + 2), c);
        rasterize(covered, W, H, a[0] * W, a[1] * H, b[0] * W, b[1] * H, c[0] * W, c[1] * H);
        tris++;
      }
    }
  }
  // Margem de 1 px: texels na borda do triângulo também são lidos pela filtragem bilinear.
  grow(covered, W, H);
  const used = covered.reduce((n, v) => n + v, 0);

  // 2. Dilatação: cada texel vazio vizinho de texels cobertos recebe a média deles.
  const px = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = data[i * 4];
    px[i * 3 + 1] = data[i * 4 + 1];
    px[i * 3 + 2] = data[i * 4 + 2];
  }
  // Frente de propagação: só os texels vazios vizinhos dos recém-preenchidos.
  const filled = covered.slice();
  const neighbors = (i, fn) => {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if ((dx || dy) && xx >= 0 && xx < W) fn(yy * W + xx);
      }
    }
  };
  const queued = new Uint8Array(W * H);
  let frontier = [];
  for (let i = 0; i < W * H; i++) {
    if (!filled[i]) continue;
    neighbors(i, (j) => {
      if (!filled[j] && !queued[j]) {
        queued[j] = 1;
        frontier.push(j);
      }
    });
  }
  for (let pass = 0; pass < maxPx && frontier.length; pass++) {
    const done = [];
    for (const i of frontier) {
      let r = 0;
      let g = 0;
      let bl = 0;
      let n = 0;
      neighbors(i, (j) => {
        if (!filled[j]) return;
        r += px[j * 3];
        g += px[j * 3 + 1];
        bl += px[j * 3 + 2];
        n++;
      });
      if (!n) continue;
      px[i * 3] = r / n;
      px[i * 3 + 1] = g / n;
      px[i * 3 + 2] = bl / n;
      done.push(i);
    }
    for (const i of done) filled[i] = 1; // só depois do passe: a frente avança 1 px por passe
    const next = [];
    for (const i of done) {
      neighbors(i, (j) => {
        if (!filled[j] && !queued[j]) {
          queued[j] = 1;
          next.push(j);
        }
      });
    }
    frontier = next;
  }
  // O que sobrou (longe de qualquer ilha) recebe a cor média usada.
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let i = 0; i < W * H; i++) {
    if (!covered[i]) continue;
    mr += px[i * 3];
    mg += px[i * 3 + 1];
    mb += px[i * 3 + 2];
  }
  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const f = filled[i];
    out[i * 3] = f ? px[i * 3] : mr / used;
    out[i * 3 + 1] = f ? px[i * 3 + 1] : mg / used;
    out[i * 3 + 2] = f ? px[i * 3 + 2] : mb / used;
  }
  const png = await sharp(out, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toBuffer();
  texture.setImage(new Uint8Array(png)).setMimeType('image/png');
  console.log(
    `dilate: ${tris} triângulos, ${W}×${H}, ${((used / (W * H)) * 100).toFixed(1)}% da textura usada, margem ${maxPx}px`,
  );
}

function rasterize(mask, W, H, x0, y0, x1, y1, x2, y2) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-12) {
    // Triângulo degenerado: marca os vértices.
    for (const [x, y] of [
      [x0, y0],
      [x1, y1],
      [x2, y2],
    ]) {
      const xi = Math.min(W - 1, Math.max(0, Math.floor(x)));
      const yi = Math.min(H - 1, Math.max(0, Math.floor(y)));
      mask[yi * W + xi] = 1;
    }
    return;
  }
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      // Testa o centro do texel e os cantos (cobertura conservadora).
      for (const [ox, oy] of [
        [0.5, 0.5],
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const px = x + ox;
        const py = y + oy;
        const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
        const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
          mask[y * W + x] = 1;
          break;
        }
      }
    }
  }
}

function grow(mask, W, H) {
  const src = mask.slice();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (src[y * W + x]) continue;
      for (let dy = -1; dy <= 1 && !mask[y * W + x]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && src[yy * W + xx]) {
            mask[y * W + x] = 1;
            break;
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * Normais com ângulo de suavização (crease): cada canto de triângulo soma as normais
 * (ponderadas pela área) das faces que tocam a MESMA POSIÇÃO e diferem menos que
 * `angleDeg` da face do canto. Casco liso, quinas (tela) definidas. A saída é
 * desindexada (um vértice por canto); rode `weld` depois para reindexar.
 */
function smooth(doc, angleDeg) {
  const cosMax = Math.cos((angleDeg * Math.PI) / 180);
  let corners = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const idx = prim.getIndices();
      const count = idx ? idx.getCount() : pos.getCount();
      const get = (i) => (idx ? idx.getScalar(i) : i);
      const faces = count / 3;
      const fn = new Float64Array(faces * 3); // normal da face, ponderada pela área
      const fu = new Float64Array(faces * 3); // normal unitária
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const c = [0, 0, 0];
      const keyOf = new Map();
      const cornerKey = new Int32Array(count);
      const key = (p) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`;
      for (let f = 0; f < faces; f++) {
        pos.getElement(get(f * 3), a);
        pos.getElement(get(f * 3 + 1), b);
        pos.getElement(get(f * 3 + 2), c);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        fn.set([nx, ny, nz], f * 3);
        fu.set([nx / len, ny / len, nz / len], f * 3);
        for (const [k, p] of [[0, a], [1, b], [2, c]]) {
          const kk = key(p);
          let id = keyOf.get(kk);
          if (id === undefined) keyOf.set(kk, (id = keyOf.size));
          cornerKey[f * 3 + k] = id;
        }
      }
      // faces por posição
      const byPos = Array.from({ length: keyOf.size }, () => []);
      for (let i = 0; i < count; i++) byPos[cornerKey[i]].push(Math.floor(i / 3));

      // Saída desindexada: POSITION, NORMAL e todos os outros atributos por canto.
      const semantics = prim.listSemantics();
      const out = {};
      for (const sem of semantics) {
        const acc = prim.getAttribute(sem);
        const size = acc.getElementSize();
        out[sem] = { acc, size, arr: new Float32Array(count * size) };
      }
      const el = [];
      for (let i = 0; i < count; i++) {
        const v = get(i);
        for (const sem of semantics) {
          if (sem === 'NORMAL') continue;
          const o = out[sem];
          o.acc.getElement(v, el);
          for (let k = 0; k < o.size; k++) o.arr[i * o.size + k] = el[k];
        }
        const f = Math.floor(i / 3);
        let sx = 0, sy = 0, sz = 0;
        for (const g of byPos[cornerKey[i]]) {
          const dot = fu[f * 3] * fu[g * 3] + fu[f * 3 + 1] * fu[g * 3 + 1] + fu[f * 3 + 2] * fu[g * 3 + 2];
          if (dot < cosMax) continue;
          sx += fn[g * 3];
          sy += fn[g * 3 + 1];
          sz += fn[g * 3 + 2];
        }
        const len = Math.hypot(sx, sy, sz) || 1;
        if (!out.NORMAL) out.NORMAL = { size: 3, arr: new Float32Array(count * 3) };
        out.NORMAL.arr.set([sx / len, sy / len, sz / len], i * 3);
      }
      const buffer = pos.getBuffer();
      for (const [sem, o] of Object.entries(out)) {
        const acc = doc.createAccessor().setType(o.size === 2 ? 'VEC2' : o.size === 4 ? 'VEC4' : 'VEC3').setArray(o.arr).setBuffer(buffer);
        prim.setAttribute(sem, acc);
      }
      prim.setIndices(null);
      corners += count;
      console.log(`smooth: ${faces} faces, ${keyOf.size} posições, crease ${angleDeg}°`);
    }
  }
  if (!corners) throw new Error('smooth: nenhuma malha');
}
