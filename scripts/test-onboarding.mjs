#!/usr/bin/env node
// Testes do onboarding (fase 2): fluxo das 7 etapas, Nexo persistente entre telas,
// tooltip só depois da chegada, ida e volta 1→7→1 (estado consistente), FPS no voo com overlay desfocado, teclado, Esc em cada
// etapa, persistência, movimento reduzido, fallback sem WebGL, vídeo, prévia,
// voz gravada (grifo, anel, pausa, avanço automático, modo silencioso, boca) e memória
// do destroy().
// Uso: node scripts/test-onboarding.mjs [url]   (1440×900, DPR 2)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

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
      `etapa ${i + 1} (${IDS[i]}): rota ${ROUTES[i]}, ${i + 1}/7 bolinhas, alvo destacado, foco no Próximo`,
      s.id === IDS[i] &&
        s.route === ROUTES[i] &&
        s.dots === i + 1 &&
        s.totalDots === IDS.length &&
        s.targetSharp > 0 &&
        s.focus?.split(' ')[0] === 'coach-next',
      `${s.route} ${s.dots}/${s.totalDots} foco=${s.focus}`,
    );
    check(
      `etapa ${i + 1}: o mesmo canvas do Nexo (não remontou)`,
      s.sameCanvas && s.canvases === 1 && s.overlay === 1,
    );
    if (i < LAST) {
      // Espaço na etapa 2, Enter nas demais.
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
    inside.push(await page.evaluate(() => !!document.activeElement?.closest('.coach-tooltip')));
  }
  check('Tab circula só dentro do tooltip (Voltar, áudio, Próximo)', inside.every(Boolean));
  const cycle = [];
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('Tab');
    cycle.push(await page.evaluate(() => document.activeElement?.className.split(' ')[0]));
  }
  check(
    'Tab passa por Voltar, áudio e Próximo',
    ['coach-back', 'coach-audio', 'coach-next'].every((c) => cycle.includes(c)),
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
      !s.nextDisabled &&
      s.tipOpacity === 1 &&
      s.focus?.split(' ')[0] === 'coach-next' &&
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
    if (i % 2) await page.keyboard.press('ArrowRight');
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
  await run(() => page.click('.coach-next'), 'favoritas');
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

// ---------- 8. Voz gravada: áudio, grifo, gradiente, pausa, avanço automático, boca ----------
{
  const manifest = JSON.parse(
    readFileSync(new URL('../src/voice/voiceManifest.json', import.meta.url)),
  );
  const VOICE_IDS = Object.keys(manifest);
  const { page, context, errors } = await newPage();
  // Gravador por quadro, DEPOIS do tick da voz (mesmo quadro): boca x palavra ativa.
  const hookMouth = () =>
    page.evaluate(() => {
      window.__mouth = { frames: 0, bad: 0, talk: 0 };
      window.__nexo.gsap.ticker.add(() => {
        const f = window.__nexo.voice.lastFrame;
        const face = window.__nexo.nexo.debugStage?.face;
        if (!f || !face) return;
        window.__mouth.frames++;
        const talking = face.current === 'talk';
        if (talking) window.__mouth.talk++;
        if (talking !== f.speaking) window.__mouth.bad++;
      });
    });
  await page.goto(`${base}?onboarding=reset#/home`);
  await ready(page, IDS[0]);
  await hookMouth();
  const stepInfo = () =>
    page.evaluate(() => ({
      src: window.__nexo.voice.element?.src ?? '',
      spans: document.querySelectorAll('.coach-say-word').length,
      id: window.__nexo.voice.currentId,
    }));
  // (a) as 9 etapas: áudio certo e um span por palavra do manifesto. (b) avanço automático.
  const autos = [];
  for (let i = 0; i < IDS.length; i++) {
    await ready(page, IDS[i]);
    const t0 = await page.evaluate(() => performance.now());
    await page
      .waitForFunction(() => !window.__nexo.voice.element?.paused, null, { timeout: 5000 })
      .catch(() => {});
    const info = await stepInfo();
    const vid = VOICE_IDS[i];
    check(
      `voz etapa ${i + 1}: áudio ${vid}.mp3 e ${manifest[vid].words.length} spans`,
      info.id === vid &&
        info.src.endsWith(`audio/nexo/${vid}.mp3`) &&
        info.spans === manifest[vid].words.length,
      JSON.stringify(info),
    );
    if (i === IDS.length - 1) break;
    // Espera o avanço automático (sem tocar em nada): transição da etapa seguinte.
    const t1 = await page.evaluate(
      (next) =>
        new Promise((res) => {
          const tick = () => {
            if (document.documentElement.dataset.coachStep === next) res(performance.now());
            else requestAnimationFrame(tick);
          };
          tick();
        }),
      IDS[i + 1],
    );
    autos.push({
      step: i + 1,
      ms: Math.round(t1 - t0),
      expected: Math.round(manifest[vid].duration * 1000 + 400),
    });
  }
  const autoOk = autos.every((a) => Math.abs(a.ms - a.expected) < 300);
  check(
    'avanço automático em duração + ~400 ms (tolerância 300 ms) nas 8 trocas',
    autoOk,
    autos.map((a) => `${a.step}:${a.ms}/${a.expected}`).join(' '),
  );
  const mouth = await page.evaluate(() => window.__mouth);
  check(
    'boca: fala só com palavra ativa, sorriso no mesmo quadro em que ela termina',
    mouth.bad === 0 && mouth.talk > 0 && mouth.frames > 100,
    JSON.stringify(mouth),
  );
  await context.close();

  // (c) pausa e retomada; (d) Próximo no meio da fala.
  {
    const { page: p, context: c } = await newPage();
    await p.goto(`${base}?onboarding=reset&step=3`);
    await ready(p, IDS[2]);
    await p.waitForFunction(() => window.__nexo.voice.lastFrame?.t > 1.5, null, { timeout: 8000 });
    await p.keyboard.press(' '); // foco no "Próximo", dentro do tooltip
    const snap = () =>
      p.evaluate(() => ({
        progress: getComputedStyle(document.querySelector('.coach-next')).getPropertyValue(
          '--coach-progress',
        ),
        spoken: document.querySelectorAll('.coach-say-word.is-spoken').length,
        paused: window.__nexo.voice.element.paused,
        state: document.querySelector('.coach-audio').dataset.voice,
        pressed: document.querySelector('.coach-audio').getAttribute('aria-pressed'),
        face: window.__nexo.nexo.debugStage.face.current,
        t: window.__nexo.voice.lastFrame.t,
      }));
    const a = await snap();
    await p.waitForTimeout(700);
    const b = await snap();
    check(
      'pausa: áudio parado, gradiente e grifo congelados, boca no padrão, ícone em pausa',
      a.paused &&
        b.paused &&
        a.progress === b.progress &&
        a.spoken === b.spoken &&
        b.state === 'paused' &&
        b.pressed === 'true' &&
        b.face !== 'talk',
      JSON.stringify({ a, b }),
    );
    const expectStart = manifest[VOICE_IDS[2]].words
      .filter((w) => w.start <= a.t + 1e-3)
      .pop().start;
    await p.keyboard.press(' ');
    const r = await p.evaluate(() => ({ t: window.__nexo.voice.element.currentTime }));
    check(
      'retomar volta ao início da palavra ativa',
      Math.abs(r.t - expectStart) < 0.12,
      `currentTime ${r.t.toFixed(3)} / start ${expectStart}`,
    );
    await p.waitForTimeout(400);
    const el = await p.evaluateHandle(() => window.__nexo.voice.element);
    await p.click('.coach-next');
    const mid = await p.evaluate(
      (el) => ({
        paused: el.paused,
        t: el.currentTime,
        step: document.documentElement.dataset.coachStep,
      }),
      el,
    );
    check(
      'Próximo no meio da fala: áudio interrompido e avança',
      mid.paused && mid.step === IDS[3],
      JSON.stringify(mid),
    );
    await c.close();
  }

  // (e) autoplay bloqueado: modo silencioso (grifo e gradiente pelo relógio interno).
  {
    const { page: p, context: c, errors: e } = await newPage();
    await p.addInitScript(() => {
      HTMLMediaElement.prototype.play = function () {
        return Promise.reject(new DOMException('bloqueado', 'NotAllowedError'));
      };
    });
    await p.goto(`${base}?onboarding=reset&step=3`);
    await ready(p, IDS[2]);
    await p.waitForTimeout(1500);
    const s = await p.evaluate(() => ({
      state: document.querySelector('.coach-audio').dataset.voice,
      silent: window.__nexo.voice.isSilent,
      spoken: document.querySelectorAll('.coach-say-word.is-spoken').length,
      progress: Number(
        getComputedStyle(document.querySelector('.coach-next')).getPropertyValue(
          '--coach-progress',
        ),
      ),
    }));
    check(
      'autoplay bloqueado: modo silencioso, ícone "sem som", grifo e gradiente avançam',
      s.silent && s.state === 'muted' && s.spoken > 1 && s.progress > 0.1,
      JSON.stringify(s),
    );
    check('modo silencioso: sem erros', e.length === 0, e.join(' | '));
    await c.close();
  }
  check('voz: sem erros', errors.length === 0, errors.join(' | '));
}

await browser.close();
console.log(JSON.stringify(results));
console.log(failures ? `\n${failures} falha(s)` : '\nTudo ok');
process.exit(failures ? 1 : 0);
