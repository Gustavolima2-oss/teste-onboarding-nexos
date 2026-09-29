#!/usr/bin/env node
// Testes do onboarding (fase 2): fluxo das 7 etapas, Nexo persistente entre telas,
// tooltip só depois da chegada, ida e volta 1→7→1 (estado consistente), FPS no voo com overlay desfocado, teclado, Esc em cada
// etapa, persistência, movimento reduzido, fallback sem WebGL, vídeo, prévia,
// voz gravada (grifo, anel, pausa, avanço automático, modo silencioso, boca) e memória
// do destroy().
// Uso: node scripts/test-onboarding.mjs [url]   (1440×900, DPR 2)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const DPR = Number(process.env.DPR ?? 2);
const base = process.argv[2] ?? 'http://localhost:5199/';
// Autoplay liberado (determinístico); o modo silencioso é simulado rejeitando o play().
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--autoplay-policy=no-user-gesture-required'],
});
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
const ROUTES = [
  '#/home',
  '#/ferramentas',
  '#/ferramentas',
  '#/ferramentas',
  '#/ferramentas',
  '#/seu-negocio',
  '#/seu-negocio',
  '#/seu-negocio',
  '#/seu-negocio',
];
const LAST = IDS.length - 1;
/** Etapa 3 (Conversas): avança só pela ação (pin do card); o foco inicial é o pin. */
const ACTION_STEP = IDS.indexOf('conversas');
const PIN = '[data-coach="fav-conversas"]';
const focusFor = (i) => (i === ACTION_STEP ? 'tool-card-pin' : 'coach-next');
let failures = 0;
const results = {};
const check = (label, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) failures++;
};

async function newPage(opts = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: DPR,
    reducedMotion: opts.reducedMotion ?? 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const t = m.text();
    if (opts.allowWarning && opts.allowWarning.test(t)) return;
    errors.push(t.slice(0, 200));
  });
  return { page, context, errors };
}
const ready = (page, id) =>
  page.waitForFunction(
    (id) =>
      document.documentElement.dataset.coachState === 'ready' &&
      (!id || document.documentElement.dataset.coachStep === id),
    id,
    { timeout: 20000 },
  );
const state = (page) => page.evaluate(() => document.documentElement.dataset.coachState);

// Gravador por quadro (antes do app rodar).
const recorder = () => {
  const log = [];
  window.__rec = log;
  const t0 = performance.now();
  const tick = () => {
    const n = window.__nexo?.nexo;
    const tip = document.querySelector('.coach-tooltip');
    log.push({
      t: performance.now() - t0,
      flying: n?.isFlying ?? false,
      tip: tip && !tip.hidden ? Number(getComputedStyle(tip).opacity) : 0,
      step: document.documentElement.dataset.coachStep,
      state: document.documentElement.dataset.coachState,
      gestureDone: window.__gestureDone ?? 0,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

// ---------- 1. Fluxo completo + FPS + Nexo persistente ----------
{
  const { page, context, errors } = await newPage();
  await page.addInitScript(recorder);
  await page.goto(`${base}?onboarding=reset#/home`);
  await ready(page, 'ferramentas');
  await page.evaluate(() => {
    window.__canvas = document.querySelector('.nexo-canvas');
    window.__loads = 0;
  });
  const perStep = [];
  for (let i = 0; i < IDS.length; i++) {
    await ready(page, IDS[i]);
    const s = await page.evaluate(() => ({
      id: document.documentElement.dataset.coachStep,
      route: location.hash,
      dots: document.querySelectorAll('.coach-dots span.is-done').length,
      totalDots: document.querySelectorAll('.coach-dots span').length,
      sameCanvas:
        window.__canvas === document.querySelector('.nexo-canvas') &&
        !!window.__canvas?.isConnected,
      canvases: document.querySelectorAll('.nexo-canvas').length,
      overlay: document.querySelectorAll('.coach-overlay').length,
      targetSharp: document.querySelectorAll('.is-coach-target').length,
      focus: document.activeElement?.className,
    }));
    perStep.push(s);
    check(
      `etapa ${i + 1} (${IDS[i]}): rota ${ROUTES[i]}, ${i + 1}/${IDS.length} bolinhas, alvo destacado, foco no ${i === ACTION_STEP ? 'pin' : 'Próximo'}`,
      s.id === IDS[i] &&
        s.route === ROUTES[i] &&
        s.dots === i + 1 &&
        s.totalDots === IDS.length &&
        s.targetSharp > 0 &&
        s.focus?.split(' ')[0] === focusFor(i),
      `${s.route} ${s.dots}/${s.totalDots} foco=${s.focus}`,
    );
    check(
      `etapa ${i + 1}: o mesmo canvas do Nexo (não remontou)`,
      s.sameCanvas && s.canvases === 1 && s.overlay === 1,
    );
    if (i < LAST) {
      // → na etapa 2, Enter nas demais (na 3, o Enter é do pin, que tem o foco: favorita).
      await page.keyboard.press(i === 1 ? 'ArrowRight' : 'Enter');
    }
  }
  // Análise do gravador: tooltip só depois da chegada, FPS no voo.
  const rec = await page.evaluate(() => window.__rec);
  let violations = 0;
  const flights = [];
  let cur = null;
  for (let k = 1; k < rec.length; k++) {
    const r = rec[k];
    const prev = rec[k - 1];
    if (r.flying && !prev.flying) cur = { start: r.t, frames: [] };
    if (cur && r.flying) cur.frames.push(r.t - prev.t);
    if (cur && !r.flying && prev.flying) {
      cur.end = r.t;
      flights.push(cur);
      cur = null;
    }
    // O tooltip ANTIGO pode estar saindo (180 ms) durante a antecipação; o que não
    // pode é o tooltip NOVO aparecer (0 → visível) com o Nexo ainda voando.
    if (r.flying && prev.tip === 0 && r.tip > 0) violations++;
  }
  check('o tooltip novo nunca aparece durante o voo', violations === 0, `${violations} quadros`);
  const all = flights.flatMap((f) => f.frames.slice(1));
  all.sort((a, b) => a - b);
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  const fps = 1000 / avg;
  const p95 = all[Math.floor(all.length * 0.95)] ?? 0;
  const slow = all.filter((d) => d > 25).length;
  results.fps = {
    flights: flights.length,
    frames: all.length,
    avgMs: +avg.toFixed(2),
    fps: +fps.toFixed(1),
    p95Ms: +p95.toFixed(1),
    slowFrames: slow,
  };
  console.log('  voo:', JSON.stringify(results.fps));
  check(
    `${IDS.length - 1} voos entre as ${IDS.length} etapas (2 deles entre telas)`,
    flights.length === IDS.length - 1,
    `${flights.length}`,
  );
  check('≥ 55 fps no voo (1440×900, DPR 2, overlay desfocado)', fps >= 55, `${fps.toFixed(1)} fps`);

  // Fim: Próximo na etapa 7 encerra.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.coachState === 'closed', null, {
    timeout: 15000,
  });
  await page.waitForTimeout(300);
  const end = await page.evaluate(() => ({
    overlay: !!document.querySelector('.coach-overlay'),
    tooltip: !!document.querySelector('.coach-tooltip'),
    done: localStorage.getItem('onboarding:done'),
    focusInPage: !!document.activeElement?.closest('.screen, .sidebar'),
    overflow: document.documentElement.style.overflow,
    nexoOpacity: window.__nexo.nexo.debugStage?.motion.opacity,
  }));
  check(
    'fim: overlay e tooltip removidos, rolagem destravada, Nexo saiu',
    !end.overlay && !end.tooltip && end.overflow === '' && end.nexoOpacity === 0,
  );
  check('fim: onboarding:done persistido e foco na página', end.done === '1' && end.focusInPage);

  // Persistência: recarregar não repete o onboarding.
  await page.goto(`${base}#/home`);
  await page.waitForTimeout(1500);
  check(
    'recarregar com onboarding:done não abre o tour',
    (await state(page)) === 'off' && !(await page.$('.coach-overlay')),
  );
  check('sem erros no console (fluxo completo)', errors.length === 0, errors.join(' | '));

  // Memória: renderer.info depois do fluxo e depois do destroy().
  await page.goto(`${base}?onboarding=reset#/home`);
  await ready(page, 'ferramentas');
  const mem = await page.evaluate(async () => {
    const { nexo } = window.__nexo;
    const info = nexo.debugStage.rendererInfo;
    const before = {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length,
    };
    nexo.destroy();
    await new Promise((r) => setTimeout(r, 100));
    const after = {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length,
    };
    return {
      before,
      after,
      canvas: !!document.querySelector('.nexo-canvas'),
      speaking: window.speechSynthesis?.speaking ?? false,
    };
  });
  results.memory = mem;
  console.log('  memória:', JSON.stringify(mem));
  // Resta 1 textura interna do three (LUT do material físico, criada pelo renderer);
  // o contexto WebGL é destruído em seguida (forceContextLoss), então a GPU libera tudo.
  check(
    'destroy(): geometrias, programas e texturas do projeto liberados, canvas removido',
    mem.after.geometries === 0 &&
      mem.after.textures <= 1 &&
      mem.after.programs === 0 &&
      !mem.canvas &&
      !mem.speaking,
    JSON.stringify(mem.after),
  );
  await context.close();
}

// ---------- 2. Teclado: Tab preso no tooltip; Esc em cada etapa ----------
{
  const { page, context, errors } = await newPage();
  await page.goto(`${base}?onboarding=reset&step=3#/ferramentas`);
  await ready(page, 'conversas');
  const inside = [];
  for (let k = 0; k < 5; k++) {
    await page.keyboard.press('Tab');
    inside.push(
      await page.evaluate(
        () =>
          !!document.activeElement?.closest('.coach-tooltip') ||
          !!document.activeElement?.matches('.is-coach-action'),
      ),
    );
  }
  check('Tab circula só no tooltip e no pin da etapa 3', inside.every(Boolean));
  const cycle = [];
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('Tab');
    cycle.push(await page.evaluate(() => document.activeElement?.className.split(' ')[0]));
  }
  check(
    'etapa 3: Tab passa por Voltar, áudio e o pin (sem Próximo)',
    ['coach-back', 'coach-audio', 'tool-card-pin'].every((c) => cycle.includes(c)) &&
      !cycle.includes('coach-next'),
    cycle.join(' → '),
  );
  const ring = await page.evaluate(() => document.activeElement?.matches(':focus-visible'));
  check('anel de foco só com teclado (:focus-visible)', ring === true);
  await context.close();

  for (let i = 1; i <= IDS.length; i++) {
    const { page: p, context: c, errors: e } = await newPage();
    await p.goto(`${base}?onboarding=reset&step=${i}`);
    await ready(p, IDS[i - 1]);
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.documentElement.dataset.coachState === 'closed', null, {
      timeout: 15000,
    });
    const r = await p.evaluate(() => ({
      overlay: !!document.querySelector('.coach-overlay'),
      targets: document.querySelectorAll(
        '.is-coach-target, .is-coach-leaving, .is-coach-layer, .is-coach-layer-leaving',
      ).length,
      done: localStorage.getItem('onboarding:done'),
      overflow: document.documentElement.style.overflow,
    }));
    check(
      `Esc na etapa ${i} encerra (overlay, alvos e trava removidos; done salvo)`,
      !r.overlay && r.targets === 0 && r.done === '1' && r.overflow === '' && e.length === 0,
      e.join(' | '),
    );
    await c.close();
  }
  void errors;
}

// ---------- 3. Movimento reduzido ----------
{
  const { page, context, errors } = await newPage({ reducedMotion: 'reduce' });
  await page.addInitScript(recorder);
  await page.goto(`${base}?onboarding=reset#/home`);
  await ready(page, 'ferramentas');
  const a = await page.evaluate(() => {
    const s = window.__nexo.nexo.debugStage;
    return { idle: s.idle.amount, x: s.getAnchor().x };
  });
  const t0 = await page.evaluate(() => window.__rec.length);
  await page.keyboard.press('Enter');
  await ready(page, 'agentes');
  const moves = await page.evaluate((t0) => {
    const s = window.__nexo.nexo.debugStage;
    return { motionX: s.motion.x, frames: window.__rec.length - t0 };
  }, t0);
  // Sem voo: motion.x nunca muda (só fade de opacidade).
  const sampled = await page.evaluate(() => window.__nexo.nexo.debugStage.motion);
  check('movimento reduzido: sem flutuação idle', a.idle === 0);
  check(
    'movimento reduzido: troca de etapa sem voo (só fade)',
    sampled.x === 0 && sampled.y === 0 && sampled.bank === 0,
    JSON.stringify(moves),
  );
  check('movimento reduzido: sem erros', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 4. Fallback sem WebGL ----------
{
  const { page, context, errors } = await newPage();
  await page.goto(`${base}?onboarding=reset&nowebgl#/home`);
  await ready(page, 'ferramentas');
  const f = await page.evaluate(() => {
    const img = document.querySelector('.nexo-fallback');
    const r = img?.getBoundingClientRect();
    return {
      mode: window.__nexo.nexo.mode,
      img: !!img,
      opacity: img && getComputedStyle(img).opacity,
      x: r?.x,
      y: r?.y,
      canvas: !!document.querySelector('.nexo-canvas'),
    };
  });
  check(
    'sem WebGL: PNG posicionado e visível, sem canvas',
    f.mode === 'png' && f.img && Number(f.opacity) > 0.9 && !f.canvas,
    JSON.stringify(f),
  );
  await page.keyboard.press('Enter');
  await ready(page, 'agentes');
  check('sem WebGL: fluxo segue para a etapa 2', (await state(page)) === 'ready');
  check('sem WebGL: sem erros', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 5. Prévia (etapa 3) e vídeo (etapa 6) ----------
{
  const { page, context, errors } = await newPage();
  await page.goto(`${base}?onboarding=reset&step=3#/ferramentas`);
  await ready(page, 'conversas');
  await page.waitForTimeout(1800);
  const demo = await page.evaluate(() => ({
    pinned: !!document.querySelector('.coach-preview-pin.is-pinned'),
    cursor: getComputedStyle(document.querySelector('.coach-preview-cursor')).opacity,
  }));
  check('prévia: o cursor clica e o ícone fica fixado', demo.pinned, JSON.stringify(demo));

  await page.goto(`${base}?onboarding=reset&step=6#/seu-negocio`);
  await ready(page, 'base');
  await page.click('.coach-play');
  await page.waitForTimeout(600);
  const v = await page.evaluate(() => {
    const video = document.querySelector('.coach-video');
    return {
      video: !!video,
      playing: video ? !video.paused : false,
      expr: window.__nexo.nexo.currentExpression,
    };
  });
  check(
    'vídeo: toca ao clicar em Play e o Nexo fica em "listen"',
    v.video && v.playing && v.expr === 'listen',
    JSON.stringify(v),
  );

  check('prévia/vídeo: sem erros', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 6. Ida e volta 1→7→1: nenhum estado inconsistente ----------
{
  const { page, context, errors } = await newPage();
  await page.goto(`${base}?onboarding=reset#/home`);
  await ready(page, 'ferramentas');
  await page.evaluate(() => {
    window.__canvas = document.querySelector('.nexo-canvas');
  });
  const CONVERSAS = IDS.indexOf('conversas');
  // Estado esperado em cada etapa, lido da página.
  const snapshot = () =>
    page.evaluate(() => {
      const { nexo, coach, appState } = window.__nexo;
      const tip = document.querySelector('.coach-tooltip');
      const back = document.querySelector('.coach-back');
      const layout = coach.layout;
      const pos = nexo.position;
      return {
        id: document.documentElement.dataset.coachStep,
        route: location.hash,
        dots: document.querySelectorAll('.coach-dots span.is-done').length,
        targets: document.querySelectorAll('.is-coach-target').length,
        leaving: document.querySelectorAll('.is-coach-leaving, .is-coach-layer-leaving').length,
        favState: appState.isFavorite('conversas'),
        favItems: document.querySelectorAll('[data-coach="nav-fav-conversas"]').length,
        footer: (() => {
          const f = document.querySelector('.coach-footer').getBoundingClientRect();
          const d = document.querySelector('.coach-dots').getBoundingClientRect();
          const n = document.querySelector('.coach-next').getBoundingClientRect();
          const t = tip.getBoundingClientRect();
          return { h: f.height, dotsX: d.x - t.x, nextRight: n.right - t.x };
        })(),
        backHidden: back.classList.contains('is-hidden'),
        backDisabled: back.disabled,
        nextDisabled: document.querySelector('.coach-next').disabled,
        tipOpacity: Number(getComputedStyle(tip).opacity),
        focus: document.activeElement?.className,
        nexoOff: layout ? Math.hypot(pos.x - layout.nexoAnchor.x, pos.y - layout.nexoAnchor.y) : -1,
        flying: nexo.isFlying,
        sameCanvas: window.__canvas === document.querySelector('.nexo-canvas'),
        overlays: document.querySelectorAll('.coach-overlay').length,
        screens: document.querySelectorAll('.screen:not(.is-probe)').length,
        probes: document.querySelectorAll('.screen.is-probe').length,
      };
    });
  const footers = [];
  const verify = async (i, dir) => {
    await ready(page, IDS[i]);
    await page.waitForTimeout(350); // fades da sidebar (250 ms) terminam
    const s = await snapshot();
    footers.push(s.footer);
    const favExpected = i > CONVERSAS;
    const ok =
      s.id === IDS[i] &&
      s.route === ROUTES[i] &&
      s.dots === i + 1 &&
      s.targets > 0 &&
      s.leaving === 0 &&
      s.favState === favExpected &&
      s.favItems === (favExpected ? 1 : 0) &&
      s.backHidden === (i === 0) &&
      s.backDisabled === (i === 0) &&
      s.nextDisabled === (i === ACTION_STEP) &&
      s.tipOpacity === 1 &&
      s.focus?.split(' ')[0] === focusFor(i) &&
      s.nexoOff < 1 &&
      !s.flying &&
      s.sameCanvas &&
      s.overlays === 1 &&
      s.screens === 1 &&
      s.probes === 0;
    check(
      `ida e volta (${dir}) etapa ${i + 1} (${IDS[i]}): rota, bolinhas, alvo, favorito, botões, Nexo`,
      ok,
      ok ? '' : JSON.stringify(s),
    );
  };
  // Ida: Próximo (clique) e seta direita alternados.
  for (let i = 0; i < LAST; i++) {
    await verify(i, 'ida');
    if (i === ACTION_STEP) await page.click(PIN);
    else if (i % 2) await page.keyboard.press('ArrowRight');
    else await page.click('.coach-next');
    if (i === 0) {
      // Durante o voo, Voltar e Próximo ficam desabilitados.
      const busy = await page.evaluate(() => ({
        next: document.querySelector('.coach-next').disabled,
        back: document.querySelector('.coach-back').disabled,
      }));
      check('durante o voo, Voltar e Próximo desabilitados', busy.next && busy.back);
    }
  }
  // Volta: seta esquerda e Voltar (clique) alternados.
  for (let i = LAST; i > 0; i--) {
    await verify(i, 'volta');
    if (i % 2) await page.keyboard.press('ArrowLeft');
    else await page.click('.coach-back');
  }
  await verify(0, 'volta');
  // Etapa 1: seta esquerda não faz nada.
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  check(
    'etapa 1: seta esquerda não volta (sem etapa anterior)',
    (await page.evaluate(() => document.documentElement.dataset.coachState)) === 'ready',
  );
  // Rodapé igual em todas as etapas (na 1, "Voltar" some mas ocupa o lugar).
  const f0 = footers[0];
  check(
    'rodapé: mesma altura, bolinhas no lugar e Próximo/Finalizar alinhado à direita em todas as etapas',
    footers.every(
      (f) => f.h === f0.h && Math.abs(f.dotsX - f0.dotsX) <= 1.5 && f.nextRight === f0.nextRight,
    ),
    JSON.stringify(f0),
  );
  check('ida e volta: sem erros', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 7. Alvo clicável e tela limpa na troca de tela ----------
{
  const { page, context, errors } = await newPage();
  await page.addInitScript(() => {
    window.__seq = [];
    const tick = () => {
      const out = document.querySelector('.screen:not(.is-probe)');
      window.__seq.push({
        t: performance.now(),
        dim: Number(document.documentElement.style.getPropertyValue('--coach-dim') || 1),
        screen: out ? Number(getComputedStyle(out).opacity) : 0,
        fly: window.__nexo?.nexo?.isFlying ?? false,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(`${base}?onboarding=reset#/home`);
  await ready(page, 'ferramentas');
  const sel = '[data-coach="nav-ferramentas"]';
  const look = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return { cursor: getComputedStyle(el).cursor, advance: el.hasAttribute('data-coach-advance') };
  }, sel);
  await page.hover(sel);
  const hover = await page.evaluate(
    (sel) => getComputedStyle(document.querySelector(sel)).boxShadow,
    sel,
  );
  check(
    'etapa 1: alvo navegável com cursor pointer e hover',
    look.cursor === 'pointer' && look.advance && hover !== 'none',
    `${look.cursor} ${hover}`,
  );
  // Sequência de uma troca: retorna a janela de tela limpa e o mínimo do overlay.
  const run = async (act, id) => {
    await page.waitForTimeout(400);
    const t0 = await page.evaluate(() => performance.now());
    await act();
    await ready(page, id);
    const log = (await page.evaluate(() => window.__seq)).filter((f) => f.t >= t0);
    const clean = log.filter((f) => f.dim === 0 && f.screen === 1);
    const cleanMs = clean.length ? clean[clean.length - 1].t - clean[0].t : 0;
    const flyEnd = log.findIndex((f, i) => i > 0 && !f.fly && log[i - 1].fly);
    const back = log.findIndex((f, i) => i > 0 && f.dim > 0 && log[i - 1].dim === 0);
    return {
      cleanMs: Math.round(cleanMs),
      minDim: Math.min(...log.map((f) => f.dim)),
      // O overlay só volta depois que o Nexo chegou.
      overlayAfterFlight: back > 0 && flyEnd > 0 && back >= flyEnd,
      route: await page.evaluate(() => location.hash),
    };
  };
  const cross = (label, r, route) =>
    check(
      `${label}: overlay some, tela limpa ~600 ms, overlay volta depois do voo`,
      r.minDim === 0 && r.cleanMs >= 550 && r.overlayAfterFlight && r.route === route,
      JSON.stringify(r),
    );
  cross('1→2 (clique no alvo)', await run(() => page.click(sel), 'agentes'), '#/ferramentas');
  const same = await run(() => page.click('.coach-next'), 'conversas');
  check('2→3 (mesma tela): o overlay não pisca', same.minDim === 1, JSON.stringify(same));
  await run(() => page.click(PIN), 'favoritas');
  const fav = await run(() => page.click('[data-coach="nav-fav-conversas"]'), 'seu-negocio');
  check('4→5 (clique no alvo, mesma tela): avança sem piscar o overlay', fav.minDim === 1);
  cross(
    '5→6 (clique no alvo)',
    await run(() => page.click('[data-coach="nav-seu-negocio"]'), 'base'),
    '#/seu-negocio',
  );
  cross('6→5 (Voltar)', await run(() => page.click('.coach-back'), 'seu-negocio'), '#/ferramentas');
  // Alvo sem targetClickAdvances (etapa 7, link do Waz): não avança nem navega.
  const { page: p7, context: c7 } = await newPage();
  await p7.goto(`${base}?onboarding=reset&step=9#/seu-negocio`);
  await ready(p7, 'waz');
  await p7.click('[data-coach="nav-waz"]', { force: true });
  await p7.waitForTimeout(400);
  const s7 = await p7.evaluate(() => ({
    step: document.documentElement.dataset.coachStep,
    state: document.documentElement.dataset.coachState,
    route: location.hash,
  }));
  check(
    'etapa 9: clicar no alvo não navegável não avança nem muda a rota',
    s7.step === 'waz' && s7.state === 'ready' && s7.route === '#/seu-negocio',
    JSON.stringify(s7),
  );
  await c7.close();
  check('alvo clicável / tela limpa: sem erros', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 8. Voz: sem voz por padrão (timer), voz pelo alto-falante, pausa, boca ----------
{
  const manifest = JSON.parse(
    readFileSync(new URL('../src/voice/voiceManifest.json', import.meta.url)),
  );
  const VOICE_IDS = Object.keys(manifest);
  // Timer do modo sem voz: max(duração × 2,5; 6 s) (SILENT_TIMER_FACTOR / SILENT_TIMER_MIN_MS).
  const timerMs = (vid) => Math.max(manifest[vid].duration * 2.5, 6) * 1000;
  const nextStepAt = (p, next) =>
    p.evaluate(
      (next) =>
        new Promise((res) => {
          const tick = () => {
            if (document.documentElement.dataset.coachStep === next) res(performance.now());
            else requestAnimationFrame(tick);
          };
          tick();
        }),
      next,
    );
  const snap = (p) =>
    p.evaluate(() => {
      const v = window.__nexo.voice;
      return {
        voice: v.isVoice,
        state: v.state,
        id: v.currentId,
        src: v.element?.src ?? '',
        audioPaused: v.element ? v.element.paused : true,
        spans: document.querySelectorAll('.coach-say-word').length,
        spoken: document.querySelectorAll('.coach-say-word.is-spoken').length,
        progress: Number(
          getComputedStyle(document.querySelector('.coach-next')).getPropertyValue(
            '--coach-progress',
          ) || 0,
        ),
        icon: document.querySelector('.coach-audio').dataset.voice,
        pressed: document.querySelector('.coach-audio').getAttribute('aria-pressed'),
        label: document.querySelector('.coach-audio').getAttribute('aria-label'),
        face: window.__nexo.nexo.debugStage?.face.current,
        t: v.lastFrame?.t ?? 0,
      };
    });
  // Boca x palavra ativa, conferida DEPOIS do tick da voz, no mesmo quadro.
  const hookMouth = (p) =>
    p.evaluate(() => {
      window.__mouth = { frames: 0, bad: 0, talk: 0, silentTalk: 0 };
      window.__nexo.gsap.ticker.add(() => {
        const f = window.__nexo.voice.lastFrame;
        const face = window.__nexo.nexo.debugStage?.face;
        if (!f || !face) return;
        window.__mouth.frames++;
        const talking = face.current === 'talk';
        if (talking) window.__mouth.talk++;
        if (talking && !f.voice) window.__mouth.silentTalk++;
        if (talking !== (f.voice && f.speaking)) window.__mouth.bad++;
      });
    });

  const { page, context, errors } = await newPage();
  await page.goto(`${base}?onboarding=reset#/home`);
  await ready(page, IDS[0]);
  await hookMouth(page);
  // (1) começa sem voz: texto todo branco, nenhum áudio, anel avançando.
  await page.waitForTimeout(900);
  const s0 = await snap(page);
  check(
    'sem voz por padrão: texto todo branco, nenhum áudio tocando, anel avançando, ícone "Ouvir o Nexo"',
    !s0.voice &&
      s0.audioPaused &&
      s0.spoken === s0.spans &&
      s0.spans === manifest[VOICE_IDS[0]].words.length &&
      s0.progress > 0.08 &&
      s0.icon === 'off' &&
      s0.pressed === 'false' &&
      s0.label === 'Ouvir o Nexo',
    JSON.stringify(s0),
  );
  await context.close();

  // (2) sem voz, avanço automático em max(duração × 2,5; 6 s), medido do instante em
  // que cada etapa fica "ready" (quando o timer começa).
  {
    const { page: p, context: c } = await newPage();
    await p.addInitScript(() => {
      window.__readyLog = [];
      const obs = () => {
        const d = document.documentElement.dataset;
        if (d.coachState === 'ready')
          window.__readyLog.push({ id: d.coachStep, t: performance.now() });
      };
      document.addEventListener('DOMContentLoaded', () =>
        new MutationObserver(obs).observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-coach-state'],
        }),
      );
    });
    await p.goto(`${base}?onboarding=reset#/home`);
    const autos = [];
    // Etapas 1 e 2 (a 3 só avança pela ação do pin).
    for (let i = 0; i < ACTION_STEP; i++) {
      await ready(p, IDS[i]);
      const t1 = await nextStepAt(p, IDS[i + 1]);
      const t0 = await p.evaluate(
        (id) => window.__readyLog.filter((r) => r.id === id).pop()?.t,
        IDS[i],
      );
      autos.push({
        step: i + 1,
        ms: Math.round(t1 - t0),
        expected: Math.round(timerMs(VOICE_IDS[i])),
      });
    }
    check(
      'sem voz: avanço automático em max(duração × 2,5; 6 s) (tolerância 250 ms)',
      autos.every((a) => Math.abs(a.ms - a.expected) < 250),
      autos.map((a) => `${a.step}:${a.ms}/${a.expected}`).join(' '),
    );
    await c.close();
  }

  // (3) alto-falante liga a voz; (4) avanço com voz e a seguinte já falando; (9) boca.
  {
    const { page: p, context: c, errors: e } = await newPage();
    await p.addInitScript(() => {
      window.__readyLog = [];
      document.addEventListener('DOMContentLoaded', () =>
        new MutationObserver(() => {
          const d = document.documentElement.dataset;
          if (d.coachState === 'ready')
            window.__readyLog.push({ id: d.coachStep, t: performance.now() });
        }).observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-coach-state'],
        }),
      );
    });
    await p.goto(`${base}?onboarding=reset&step=2`);
    await ready(p, IDS[1]);
    await hookMouth(p);
    await p.waitForTimeout(1200);
    const before = await snap(p);
    await p.click('.coach-audio');
    const tOn = await p.evaluate(() => performance.now());
    await p.waitForFunction(() => !window.__nexo.voice.element?.paused, null, { timeout: 5000 });
    await p.waitForTimeout(250);
    const on = await snap(p);
    const vid = VOICE_IDS[1];
    check(
      'alto-falante liga a voz: áudio certo tocando, texto cinza acendendo, spans = manifesto, anel reiniciado, ícone de pausa',
      on.voice &&
        !on.audioPaused &&
        on.src.endsWith(`audio/nexo/${vid}.mp3`) &&
        on.spans === manifest[vid].words.length &&
        on.spoken < on.spans &&
        on.progress < before.progress &&
        on.icon === 'playing' &&
        on.pressed === 'true' &&
        on.label === 'Pausar',
      JSON.stringify({ before: before.progress, on }),
    );
    const t1 = await nextStepAt(p, IDS[2]);
    const exp = manifest[vid].duration * 1000 + 400;
    check(
      'com voz: avanço automático em duração + ~400 ms (tolerância 300 ms)',
      Math.abs(t1 - tOn - exp) < 300,
      `${Math.round(t1 - tOn)}/${Math.round(exp)}`,
    );
    await ready(p, IDS[2]);
    await p.waitForFunction(() => !window.__nexo.voice.element?.paused, null, { timeout: 5000 });
    const next = await snap(p);
    check(
      'com voz: a etapa seguinte já começa falando',
      next.voice &&
        !next.audioPaused &&
        next.src.endsWith(`${VOICE_IDS[2]}.mp3`) &&
        next.icon === 'playing',
      JSON.stringify(next),
    );
    // (5) Pausar vale como desligar; ligar de novo recomeça do zero.
    await p.waitForFunction(() => window.__nexo.voice.lastFrame?.t > 1.2, null, { timeout: 8000 });
    // Espaço com o foco dentro do tooltip (na etapa 3 o foco inicial é o pin, onde o Espaço favorita).
    await p.focus('.coach-audio');
    const beforePause = await snap(p);
    await p.keyboard.press(' ');
    const a = await snap(p);
    await p.waitForTimeout(700);
    const b = await snap(p);
    check(
      'pausa: áudio parado, TODO o texto branco, anel congelado, boca no padrão, ícone do alto-falante',
      a.audioPaused &&
        b.audioPaused &&
        beforePause.spoken < beforePause.spans &&
        a.spoken === a.spans &&
        b.spoken === b.spans &&
        a.progress === b.progress &&
        b.progress > 0 &&
        b.icon === 'off' &&
        b.pressed === 'false' &&
        b.label === 'Ouvir o Nexo' &&
        b.face !== 'talk',
      JSON.stringify({ beforePause: beforePause.spoken, a, b }),
    );
    await p.keyboard.press(' ');
    await p.waitForTimeout(120);
    const again = await snap(p);
    check(
      'ligar a voz de novo recomeça do zero: áudio do início, texto cinza, anel perto de 0%',
      again.voice &&
        !again.audioPaused &&
        again.t < 0.4 &&
        again.spoken < again.spans &&
        again.progress < b.progress &&
        again.icon === 'playing',
      JSON.stringify(again),
    );
    // Etapa 3 com voz: o pin no meio da fala interrompe o áudio e avança.
    await p.waitForTimeout(400);
    const el3 = await p.evaluateHandle(() => window.__nexo.voice.element);
    await p.click(PIN);
    await p.waitForTimeout(50);
    // O áudio para na hora; o ícone voa até a sidebar (~500 ms) e só então o fluxo avança.
    const pinMid = await p.evaluate((el) => ({ paused: el.paused }), el3);
    const advanced = await p
      .waitForFunction((id) => document.documentElement.dataset.coachStep === id, IDS[3], {
        timeout: 3000,
      })
      .then(() => true)
      .catch(() => false);
    check(
      'etapa 3 com voz: clicar no pin no meio da fala interrompe o áudio e avança',
      pinMid.paused && advanced,
      JSON.stringify({ ...pinMid, advanced }),
    );
    // (7) Próximo no meio da fala (etapa 4, que já começa falando).
    await ready(p, IDS[3]);
    await p.waitForFunction(() => !window.__nexo.voice.element?.paused, null, { timeout: 5000 });
    await p.waitForTimeout(400);
    const el = await p.evaluateHandle(() => window.__nexo.voice.element);
    await p.click('.coach-next');
    const mid = await p.evaluate(
      (el) => ({ paused: el.paused, step: document.documentElement.dataset.coachStep }),
      el,
    );
    check(
      'Próximo no meio da fala: áudio interrompido e avança',
      mid.paused && mid.step === IDS[4],
      JSON.stringify(mid),
    );
    // A voz segue ligada: a etapa 5 fala. (6) Pausar e avançar leva a seguinte ao modo sem voz.
    await ready(p, IDS[4]);
    await p.waitForFunction(() => !window.__nexo.voice.element?.paused, null, { timeout: 5000 });
    await p.click('.coach-audio'); // pausa
    const paused5 = await snap(p);
    // Sem avanço automático depois da pausa: mais que a fala inteira da etapa + 400 ms.
    await p.waitForTimeout(manifest[VOICE_IDS[4]].duration * 1000 + 900);
    const still5 = await snap(p);
    const step5 = await p.evaluate(() => document.documentElement.dataset.coachStep);
    check(
      'pausa desliga o avanço automático da etapa (anel congelado, texto branco)',
      step5 === IDS[4] &&
        still5.progress === paused5.progress &&
        still5.spoken === still5.spans &&
        still5.state === 'paused',
      JSON.stringify({ step5, paused5: paused5.progress, still5 }),
    );
    await p.click('.coach-next');
    await ready(p, IDS[5]);
    await p.waitForTimeout(300);
    const off = await snap(p);
    check(
      'avançar com a voz pausada: a etapa seguinte entra sem voz (texto branco, timer, alto-falante)',
      !off.voice &&
        off.audioPaused &&
        off.spoken === off.spans &&
        off.icon === 'off' &&
        off.progress > 0,
      JSON.stringify(off),
    );
    await p.waitForTimeout(800);
    const mouth = await p.evaluate(() => window.__mouth);
    check(
      'boca: fala só com palavra ativa (mesmo quadro) e fica no padrão durante todo o modo sem voz',
      mouth.bad === 0 && mouth.silentTalk === 0 && mouth.talk > 0 && mouth.frames > 200,
      JSON.stringify(mouth),
    );
    check('voz ligada/pausa: sem erros', e.length === 0, e.join(' | '));
    await c.close();
  }

  // (8) play() rejeitado: cai no modo sem voz sem quebrar o fluxo.
  {
    // O aviso do fallback é esperado; qualquer outro aviso ou erro conta como falha.
    const { page: p, context: c, errors: e } = await newPage({ allowWarning: /\[Nexo\] a voz/ });
    const warns = [];
    p.on('console', (m) => m.type() === 'warning' && warns.push(m.text()));
    await p.addInitScript(() => {
      HTMLMediaElement.prototype.play = function () {
        return Promise.reject(new DOMException('bloqueado', 'NotAllowedError'));
      };
    });
    await p.goto(`${base}?onboarding=reset`);
    await ready(p, IDS[0]);
    await p.click('.coach-audio');
    await p.waitForTimeout(500);
    const s1 = await snap(p);
    const t1 = await nextStepAt(p, IDS[1]).then(() => true);
    check(
      'play() rejeitado: volta ao modo sem voz (texto branco, timer) e o fluxo avança',
      !s1.voice && s1.spoken === s1.spans && s1.icon === 'off' && s1.progress > 0 && t1,
      JSON.stringify(s1),
    );
    check(
      'play() rejeitado: registrado no console, sem erros',
      warns.some((w) => w.includes('[Nexo]')) && e.length === 0,
      `${warns.length} aviso(s); ${e.join(' | ')}`,
    );
    await c.close();
  }
  check('voz: sem erros', errors.length === 0, errors.join(' | '));
}

// ---------- 9. Etapa 3: avançar favoritando pelo pin do card ----------
{
  const { page, context, errors } = await newPage();
  const stepIs = () => page.evaluate(() => document.documentElement.dataset.coachStep);
  const pinState = () =>
    page.evaluate((sel) => {
      const pin = document.querySelector(sel);
      return {
        pressed: pin?.getAttribute('aria-pressed'),
        label: pin?.getAttribute('aria-label'),
        pulsing: !!pin?.classList.contains('is-pulsing'),
        favItems: document.querySelectorAll('[data-coach="nav-fav-conversas"]').length,
        nextVisible: getComputedStyle(document.querySelector('.coach-next-wrap')).visibility,
        nextDisabled: document.querySelector('.coach-next').disabled,
      };
    }, PIN);
  await page.goto(`${base}?onboarding=reset&step=3`);
  await ready(page, 'conversas');
  // Mais que o timer mínimo sem voz (6 s): nada avança sozinho nesta etapa.
  await page.waitForTimeout(7200);
  const idle = await pinState();
  check(
    'etapa 3: sem "Próximo" (rodapé igual) e sem avanço automático; pin pulsando',
    (await stepIs()) === 'conversas' &&
      idle.nextVisible === 'hidden' &&
      idle.nextDisabled &&
      idle.pulsing &&
      idle.pressed === 'false' &&
      idle.label === 'Fixar Conversas no menu',
    JSON.stringify(idle),
  );
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('etapa 3: seta direita não avança', (await stepIs()) === 'conversas');
  await page.hover(PIN);
  const tip = await page.evaluate(() => ({
    shown: !document.querySelector('.coach-action-tip').hidden,
    text: document.querySelector('.coach-action-tip').textContent,
    cursor: getComputedStyle(document.querySelector('[data-coach="fav-conversas"]')).cursor,
  }));
  check(
    'etapa 3: pin com cursor pointer e "Fixar no menu" no hover',
    tip.shown && tip.text === 'Fixar no menu' && tip.cursor === 'pointer',
    JSON.stringify(tip),
  );
  await page.click(PIN);
  await ready(page, 'favoritas');
  const after = await pinState();
  const hl = await page.evaluate(
    () =>
      document
        .querySelector('[data-coach="nav-fav-conversas"]')
        ?.classList.contains('is-coach-target') ?? false,
  );
  check(
    'clique no pin: favorita (pin pressionado), item na sidebar e avança para a 4 com o destaque nele',
    after.pressed === 'true' && after.favItems === 1 && hl,
    JSON.stringify({ after, hl }),
  );
  await page.waitForTimeout(300);
  await page.click('.coach-back');
  await ready(page, 'conversas');
  await page.waitForTimeout(450);
  const back = await pinState();
  check(
    'voltar da 4 para a 3: item sai da sidebar, pin volta ao normal e o pulso recomeça',
    back.favItems === 0 && back.pressed === 'false' && back.pulsing,
    JSON.stringify(back),
  );
  // Teclado: Enter e Espaço com o foco no pin favoritam e avançam.
  for (const key of ['Enter', ' ']) {
    await page.focus(PIN);
    await page.keyboard.press(key);
    await ready(page, 'favoritas');
    const k = await pinState();
    check(
      `teclado: ${key === ' ' ? 'Espaço' : 'Enter'} com foco no pin favorita e avança`,
      k.favItems === 1 && k.pressed === 'true',
      JSON.stringify(k),
    );
    await page.waitForTimeout(300);
    await page.click('.coach-back');
    await ready(page, 'conversas');
    await page.waitForTimeout(450);
  }
  check('etapa 3: sem erros', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 10. Destaque idêntico à tela sem overlay (pixel central do alvo) ----------
{
  const pixelAt = async (p, sel) => {
    const r = await p.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    }, sel);
    const png = PNG.sync.read(
      await p.screenshot({ clip: { x: r.x, y: r.y, width: 1, height: 1 } }),
    );
    return [png.data[0], png.data[1], png.data[2]];
  };
  const diffs = [];
  for (let i = 0; i < IDS.length; i++) {
    const { page: a, context: ca } = await newPage();
    await a.goto(`${base}?onboarding=reset&step=${i + 1}`);
    await ready(a, IDS[i]);
    await a.evaluate(() => window.__nexo.voice.pause());
    await a.mouse.move(1439, 899);
    await a.waitForTimeout(700);
    const sel = await a.evaluate(
      () => `[data-coach="${document.querySelector('.is-coach-target').dataset.coach}"]`,
    );
    const on = await pixelAt(a, sel);
    await ca.close();
    const { page: b, context: cb } = await newPage();
    await b.goto(
      `${base}preview.html${i > ACTION_STEP ? '?fav=conversas' : ''}#${ROUTES[i].slice(1)}`,
    );
    await b.waitForSelector(sel);
    await b.mouse.move(1439, 899);
    await b.waitForTimeout(900);
    const off = await pixelAt(b, sel);
    await cb.close();
    diffs.push({
      step: i + 1,
      sel,
      on,
      off,
      d: Math.max(...on.map((v, k) => Math.abs(v - off[k]))),
    });
  }
  check(
    'destaque: pixel central de cada alvo igual com e sem o onboarding (9 etapas, tolerância 2)',
    diffs.every((x) => x.d <= 2),
    diffs.map((x) => `${x.step}:${x.d}`).join(' '),
  );
}

// ---------- 11. Etapa 9: vídeo em loop no topo do tooltip ----------
{
  const loopState = (p) =>
    p.evaluate(() => {
      const v = document.querySelector('.coach-media video.coach-loop');
      const img = document.querySelector('.coach-media img.coach-poster');
      const media = document.querySelector('.coach-media').getBoundingClientRect();
      const r = v?.getBoundingClientRect();
      return {
        video: !!v,
        playing: !!v && !v.paused && v.currentTime > 0,
        muted: v?.muted,
        loop: v?.loop,
        controls: v?.controls,
        fit: v ? getComputedStyle(v).objectFit : null,
        sources: v ? [...v.querySelectorAll('source')].map((s) => s.type) : [],
        poster: !!img && img.complete && img.naturalWidth > 0,
        size: r ? [Math.round(r.width), Math.round(r.height)] : null,
        media: [Math.round(media.width), Math.round(media.height)],
      };
    });
  const { page, context, errors } = await newPage();
  await page.goto(`${base}?onboarding=reset&step=9`);
  await ready(page, 'waz');
  await page.waitForFunction(
    () => {
      const v = document.querySelector('video.coach-loop');
      return v && !v.paused && v.currentTime > 0.2;
    },
    null,
    { timeout: 8000 },
  );
  const on = await loopState(page);
  const ring = await page.evaluate(() => window.__nexo.voice.lastFrame?.progress ?? 0);
  check(
    'etapa 9: vídeo mudo em loop, sem controles, WebM antes do MP4, cobrindo o topo (378×210); o timer segue',
    on.playing &&
      on.muted &&
      on.loop &&
      !on.controls &&
      on.fit === 'cover' &&
      on.sources.join(',') === 'video/webm,video/mp4' &&
      on.size?.join('x') === on.media.join('x') &&
      on.media.join('x') === '378x210' &&
      ring > 0,
    JSON.stringify({ on, ring }),
  );
  // Aba em segundo plano: pausa; ao voltar, continua.
  const vis = await page.evaluate(async () => {
    const v = document.querySelector('video.coach-loop');
    const set = (hidden) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    set(true);
    const hiddenPaused = v.paused;
    set(false);
    await new Promise((r) => setTimeout(r, 300));
    return { hiddenPaused, resumed: !v.paused };
  });
  check(
    'etapa 9: o vídeo pausa com a aba em segundo plano e volta',
    vis.hiddenPaused && vis.resumed,
    JSON.stringify(vis),
  );
  // Saindo da etapa 9 (Voltar): o vídeo para e sai.
  const handle = await page.evaluateHandle(() => document.querySelector('video.coach-loop'));
  await page.click('.coach-back');
  await page.waitForTimeout(150);
  const left = await page.evaluate((v) => ({ paused: v.paused, attached: v.isConnected }), handle);
  check(
    'etapa 9: sair da etapa pausa e remove o vídeo',
    left.paused && !left.attached,
    JSON.stringify(left),
  );
  check('etapa 9 (vídeo): sem erros', errors.length === 0, errors.join(' | '));
  await context.close();

  // Movimento reduzido: só a capa.
  {
    const { page: p, context: c } = await newPage({ reducedMotion: 'reduce' });
    await p.goto(`${base}?onboarding=reset&step=9`);
    await ready(p, 'waz');
    await p.waitForTimeout(800);
    const r = await loopState(p);
    check(
      'etapa 9 com movimento reduzido: só a capa, sem vídeo',
      !r.video && r.poster,
      JSON.stringify(r),
    );
    await c.close();
  }
  // Falha ao carregar: a capa fica no lugar.
  {
    const { page: p, context: c } = await newPage({ allowWarning: /waz-nexo|Failed to load/ });
    await p.route(/waz-nexo\.(webm|mp4)/, (route) => route.abort());
    await p.goto(`${base}?onboarding=reset&step=9`);
    await ready(p, 'waz');
    await p.waitForTimeout(1500);
    const r = await loopState(p);
    const h = await p.evaluate(
      () => document.querySelector('.coach-tooltip').getBoundingClientRect().height,
    );
    check(
      'etapa 9: vídeo que falha sai e a capa fica, sem quebrar o layout',
      !r.video && r.poster && r.media.join('x') === '378x210' && h > 300,
      JSON.stringify({ r, h }),
    );
    await c.close();
  }
}

// ---------- 12. Etapas 6 e 7: thumb em vídeo sob o "Play" ----------
{
  const thumb = (p) =>
    p.evaluate(() => {
      const v = document.querySelector('.coach-media video.coach-loop');
      const play = document.querySelector('.coach-play');
      const r = play?.getBoundingClientRect();
      const top = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
      return {
        loop: !!v,
        playing: !!v && !v.paused && v.currentTime > 0.2,
        muted: v?.muted,
        fit: v ? getComputedStyle(v).objectFit : null,
        sources: v ? [...v.querySelectorAll('source')].map((s) => s.src.split('/').pop()) : [],
        playOnTop: !!top && !!play?.contains(top),
      };
    });
  for (const [n, name] of [
    [6, 'base-conhecimento'],
    [7, 'produtos-servicos'],
  ]) {
    const { page, context, errors } = await newPage();
    await page.goto(`${base}?onboarding=reset&step=${n}`);
    await ready(page, IDS[n - 1]);
    await page
      .waitForFunction(
        () => {
          const v = document.querySelector('video.coach-loop');
          return v && !v.paused && v.currentTime > 0.2;
        },
        null,
        { timeout: 8000 },
      )
      .catch(() => {});
    const t = await thumb(page);
    check(
      `etapa ${n}: thumb em vídeo (${name}, WebM antes do MP4) tocando mudo, "Play" por cima`,
      t.playing &&
        t.muted &&
        t.fit === 'cover' &&
        t.sources.join(',') === `${name}.webm,${name}.mp4` &&
        t.playOnTop,
      JSON.stringify(t),
    );
    if (n === 6) {
      await page.click('.coach-play');
      await page.waitForTimeout(600);
      const played = await page.evaluate(() => ({
        full:
          !!document.querySelector('video.coach-video') &&
          !document.querySelector('video.coach-video').paused,
        loopPaused: document.querySelector('video.coach-loop')?.paused,
      }));
      check(
        'etapa 6: "Play" continua abrindo o vídeo completo e pausa o thumb',
        played.full && played.loopPaused === true,
        JSON.stringify(played),
      );
    }
    check(`etapa ${n} (thumb): sem erros`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  const { page: p, context: c } = await newPage({ reducedMotion: 'reduce' });
  await p.goto(`${base}?onboarding=reset&step=6`);
  await ready(p, IDS[5]);
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => ({
    loop: !!document.querySelector('video.coach-loop'),
    poster: document.querySelector('.coach-media img.coach-poster')?.naturalWidth ?? 0,
  }));
  check('etapa 6 com movimento reduzido: só a capa', !r.loop && r.poster > 0, JSON.stringify(r));
  await c.close();
}

await browser.close();
console.log(JSON.stringify(results));
console.log(failures ? `\n${failures} falha(s)` : '\nTudo ok');
process.exit(failures ? 1 : 0);
