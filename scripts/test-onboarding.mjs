#!/usr/bin/env node
// Testes do onboarding (fase 2): fluxo das 7 etapas, Nexo persistente entre telas,
// tooltip só depois da chegada, ida e volta 1→7→1 (estado consistente), FPS no voo com overlay desfocado, teclado, Esc ignorado em cada
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
  '#/home',
];
const LAST = IDS.length - 1;
/** Etapa 3 (Conversas): avança só pela ação (pin do card); o foco inicial é o pin. */
const ACTION_STEP = IDS.indexOf('conversas');
const PIN = '[data-coach="fav-conversas"]';
/**
 * Foco na chegada: o pin na etapa 3. Nas demais, no modo com voz, o próprio tooltip (o
 * "Próximo" está desativado durante a fala e recebe o foco no fim); no modo texto, o
 * "Próximo" (ativo desde a entrada).
 */
const focusFor = (i, text = false) =>
  i === ACTION_STEP ? 'tool-card-pin' : text ? 'coach-next' : 'coach-tooltip';
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
  // Listeners de teclado ativos em window/document (confere que o fim não deixa nenhum).
  await page.addInitScript(() => {
    const live = new Map();
    window.__keyListeners = () => [...live.values()];
    const key = (t, type, fn, o) =>
      `${t === window ? 'window' : 'document'}|${type}|${typeof o === 'boolean' ? o : !!o?.capture}|${live.has(fn) ? '' : ''}`;
    const ids = new WeakMap();
    let n = 0;
    const id = (fn) => (ids.has(fn) ? ids.get(fn) : (ids.set(fn, ++n), n));
    const add = EventTarget.prototype.addEventListener;
    const rem = EventTarget.prototype.removeEventListener;
    const watched = (t, type) => (t === window || t === document) && /^key/.test(type);
    EventTarget.prototype.addEventListener = function (type, fn, o) {
      if (watched(this, type) && fn)
        live.set(
          `${key(this, type, fn, o)}${id(fn)}`,
          `${key(this, type, fn, o)}${String(fn).slice(0, 60)}`,
        );
      return add.call(this, type, fn, o);
    };
    EventTarget.prototype.removeEventListener = function (type, fn, o) {
      if (watched(this, type) && fn) live.delete(`${key(this, type, fn, o)}${id(fn)}`);
      return rem.call(this, type, fn, o);
    };
  });
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
/**
 * Garante o "Próximo" liberado: no modo com voz, leva a fala ao fim agora (voice.skip; o
 * avanço automático vem 400 ms depois); nos modos texto e armado, ele já está ativo.
 */
const unlock = async (page) => {
  await page.evaluate(() => window.__nexo.voice.skip());
  await page.waitForFunction(() => !window.__nexo.coach.isNextLocked, null, { timeout: 10000 });
};
/** Modo texto desde o início (dev): "Próximo" sempre ativo, sem avanço automático. */
const TEXT = 'voice=off&';

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
      nextDisabled: document.querySelector('.coach-next').disabled,
      nextAria: document.querySelector('.coach-next').getAttribute('aria-disabled'),
      voice: window.__nexo.voice.isVoice,
    }));
    perStep.push(s);
    check(
      `etapa ${i + 1} (modo com voz): chega falando, com o Próximo desativado até o loader completar`,
      s.nextDisabled && s.nextAria === 'true' && s.voice,
      JSON.stringify({ next: s.nextDisabled, aria: s.nextAria, voice: s.voice }),
    );
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
    if (i === ACTION_STEP) {
      // Etapa 3: o Enter é do pin (que tem o foco): favorita e avança.
      await page.keyboard.press('Enter');
    } else if (i < LAST) {
      // Modo com voz (padrão): fim da fala → "Próximo" liberado → avança sozinho.
      await unlock(page);
    }
  }
  // Última etapa (Home): no fim da fala o "Finalizar" é ativado, mas não finaliza sozinho.
  await unlock(page);
  await page.waitForTimeout(1200);
  const last = await page.evaluate(() => ({
    state: document.documentElement.dataset.coachState,
    label: document.querySelector('.coach-next').textContent,
    enabled: !document.querySelector('.coach-next').disabled,
    focus: document.activeElement?.className.split(' ')[0],
  }));
  check(
    'última etapa: fim da fala ativa o "Finalizar" (com o foco nele) e não encerra sozinho',
    last.state === 'ready' &&
      last.label === 'Finalizar' &&
      last.enabled &&
      last.focus === 'coach-next',
    JSON.stringify(last),
  );
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

  // Fim: "Finalizar" (Enter) encerra.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.coachState === 'closed', null, {
    timeout: 15000,
  });
  await page.waitForTimeout(300);
  const end = await page.evaluate(() => {
    const html = document.documentElement;
    const sel = ':is(a[href], button:not([disabled]), input, select, textarea)';
    // Primeiro interativo da tela; a Home não tem nenhum, então o da sidebar.
    const first =
      document.querySelector(`.screen ${sel}`) ?? document.querySelector(`.sidebar ${sel}`);
    return {
      // Elementos do tour que não podem sobrar.
      leftovers: document.querySelectorAll(
        '.coach-overlay, .coach-tooltip, .coach-action-tip, .coach-fly, .nexo-canvas, .nexo-fallback, .nexo-debug-panel, .nexo-debug-ref',
      ).length,
      // Classes e atributos de destaque (z-index acima do overlay) em qualquer elemento.
      marked: [
        ...document.querySelectorAll(
          '[class*="is-coach"], [data-coach-highlight], [data-coach-advance]',
        ),
      ].map((e) => e.className || e.tagName),
      htmlClass: html.className,
      htmlStyle: html.getAttribute('style') ?? '',
      bodyStyle: document.body.getAttribute('style') ?? '',
      input: html.dataset.input ?? null,
      step: html.dataset.coachStep ?? null,
      // Nada com z-index fora do normal (overlay: 1000+) na página.
      highZ: [...document.querySelectorAll('body *')].filter(
        (e) => Number(getComputedStyle(e).zIndex) >= 100,
      ).length,
      done: localStorage.getItem('onboarding:done'),
      focusFirst: document.activeElement === first,
      focusRing: document.activeElement?.matches(':focus-visible') ?? false,
      route: location.hash,
      wazMessage: document.querySelector('[data-coach="member-waz"] .member-message')?.textContent,
      wazUnread: !!document.querySelector('[data-coach="member-waz"] .member-unread'),
      nexoMode: window.__nexo.nexo.mode,
      stage: window.__nexo.nexo.debugStage,
      keys: window.__keyListeners(),
    };
  });
  // Resta só o atalho de demonstração (R/1–9, fora do tour: dev e site de demonstração).
  // (o trecho do listener vem cortado em 60 caracteres: casa pelo começo dele).
  const keysLeft = end.keys.filter(
    (k) => !/^document\|keydown\|false\|\(e\) => \{\s*if \(e\.metaKey \|\| e\.ctrlKey/.test(k),
  );
  check(
    'fim: overlay, blur, tooltip, destaques e z-index removidos; rolagem destravada',
    end.leftovers === 0 &&
      end.marked.length === 0 &&
      end.htmlClass === '' &&
      !/--coach|overflow/.test(end.htmlStyle) &&
      !/padding-right/.test(end.bodyStyle) &&
      end.highZ === 0 &&
      end.input === null &&
      end.step === null,
    JSON.stringify({ ...end, keys: undefined }),
  );
  check(
    'fim: Nexo destruído (canvas e recursos liberados) e nenhum listener de teclado do tour',
    end.nexoMode === 'none' && end.stage === null && keysLeft.length === 0,
    JSON.stringify(end.keys),
  );
  check(
    'fim: onboarding:done persistido e foco no primeiro elemento interativo (com anel: finalizado pelo teclado)',
    end.done === '1' && end.focusFirst && end.focusRing,
    JSON.stringify({ focusFirst: end.focusFirst, focusRing: end.focusRing }),
  );
  check(
    'fim: a Home fica limpa com a mensagem do Waz e a bolinha de não lida (Figma 2631:3583)',
    end.route === '#/home' &&
      end.wazMessage === 'Oi aqui o Waz! Estou animado em me juntar ao seu time!' &&
      end.wazUnread,
    JSON.stringify({ route: end.route, msg: end.wazMessage, unread: end.wazUnread }),
  );

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

// ---------- 2. Teclado: Tab preso no tooltip; Esc não faz nada ----------
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

  // Esc em cada etapa: nada muda (etapa, estado, overlay, timer/voz) e não chega a
  // nenhum outro listener nem ao comportamento padrão; as outras teclas seguem normais.
  const escSnap = (p) =>
    p.evaluate(() => {
      const f = window.__nexo.voice.lastFrame;
      const d = document.documentElement.dataset;
      return {
        step: d.coachStep,
        state: d.coachState,
        overlay: !!document.querySelector('.coach-overlay'),
        tooltip: !document.querySelector('.coach-tooltip')?.hidden,
        route: location.hash,
        voice: f?.voice ?? false,
        mode: f?.mode ?? null,
        progress: f?.progress ?? 0,
        audioPaused: window.__nexo.voice.element?.paused ?? null,
      };
    });
  const pressEsc = (p) =>
    p.evaluate(() => {
      window.__escSeen = 0;
      window.__otherSeen = 0;
      const spy = (e) => (e.key === 'Escape' ? window.__escSeen++ : window.__otherSeen++);
      document.addEventListener('keydown', spy);
      document.body.addEventListener('keydown', spy, true);
      const ev = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.activeElement.dispatchEvent(ev);
      // Outra tecla (Shift) continua chegando aos listeners.
      document.activeElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }),
      );
      document.removeEventListener('keydown', spy);
      document.body.removeEventListener('keydown', spy, true);
      return {
        prevented: ev.defaultPrevented,
        escSeen: window.__escSeen,
        otherSeen: window.__otherSeen,
      };
    });
  for (let i = 1; i <= IDS.length; i++) {
    const { page: p, context: c, errors: e } = await newPage();
    // Modo com voz: a fala segue tocando (nenhuma fala termina em menos de ~1,9 s).
    await p.goto(`${base}?onboarding=reset&step=${i}`);
    await ready(p, IDS[i - 1]);
    const before = await escSnap(p);
    const ev = await pressEsc(p);
    // E a tecla real, algumas vezes.
    for (let k = 0; k < 3; k++) await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    const after = await escSnap(p);
    const same =
      after.step === before.step &&
      after.state === 'ready' &&
      after.overlay &&
      after.tooltip &&
      after.route === before.route &&
      after.voice === before.voice &&
      after.mode === before.mode &&
      // A fala segue tocando.
      after.voice &&
      after.progress > before.progress;
    check(
      `Esc na etapa ${i} não faz nada (mesma etapa, overlay, fala seguindo; sem padrão nem outros listeners)`,
      same && ev.prevented && ev.escSeen === 0 && ev.otherSeen === 2 && e.length === 0,
      JSON.stringify({ before, after, ev, e }),
    );
    await c.close();
  }
  // Com a voz (padrão): o Esc não pausa nem para a fala.
  {
    const { page: p, context: c, errors: e } = await newPage();
    await p.goto(`${base}?onboarding=reset&step=2#/ferramentas`);
    await ready(p, 'agentes');
    await p.waitForFunction(() => (window.__nexo.voice.lastFrame?.progress ?? 0) > 0.05);
    const before = await escSnap(p);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    const after = await escSnap(p);
    check(
      'Esc com a voz ligada: a fala continua (sem pausa, anel avançando)',
      after.voice &&
        after.mode === 'playing' &&
        after.audioPaused === false &&
        after.progress > before.progress &&
        after.step === 'agentes' &&
        e.length === 0,
      JSON.stringify({ before, after }),
    );
    await c.close();
  }
  // Não há outra saída: nenhum botão de fechar em nenhuma etapa.
  {
    const { page: p, context: c } = await newPage();
    const closers = [];
    for (let i = 1; i <= IDS.length; i++) {
      await p.goto(`${base}?onboarding=reset&step=${i}`);
      await ready(p, IDS[i - 1]);
      await p.waitForTimeout(300);
      closers.push(
        await p.evaluate(
          () =>
            document.querySelectorAll(
              '.coach-close, .coach-tooltip [aria-label*="Fechar"], .coach-tooltip [aria-label*="fechar"]',
            ).length,
        ),
      );
    }
    check(
      'nenhuma etapa tem botão de fechar (a única saída é o Finalizar)',
      closers.every((n) => n === 0),
      closers.join(','),
    );
    await c.close();
  }
  void errors;
}

// ---------- 3. Movimento reduzido ----------
{
  const { page, context, errors } = await newPage({ reducedMotion: 'reduce' });
  await page.addInitScript(recorder);
  await page.goto(`${base}?${TEXT}onboarding=reset#/home`);
  await ready(page, 'ferramentas');
  const a = await page.evaluate(() => {
    const s = window.__nexo.nexo.debugStage;
    return { idle: s.idle.amount, x: s.getAnchor().x };
  });
  const t0 = await page.evaluate(() => window.__rec.length);
  await unlock(page);
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
  await page.goto(`${base}?${TEXT}onboarding=reset&nowebgl#/home`);
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
  await unlock(page);
  await page.keyboard.press('Enter');
  await ready(page, 'agentes');
  check('sem WebGL: fluxo segue para a etapa 2', (await state(page)) === 'ready');
  check('sem WebGL: sem erros', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 5. Etapa 3: pin em destaque no card e cursor na prévia ----------
{
  const pinState = (p) =>
    p.evaluate(() => {
      const pin = document.querySelector('[data-coach="fav-conversas"]');
      const ring = getComputedStyle(pin, '::after');
      const tip = document.querySelector('.coach-action-tip');
      const pr = pin.getBoundingClientRect();
      const tr = tip.getBoundingClientRect();
      const m = new DOMMatrix(getComputedStyle(pin).transform);
      return {
        pulsing: pin.classList.contains('is-pulsing'),
        scale: +Math.hypot(m.a, m.b).toFixed(2),
        hop: getComputedStyle(pin).animationName,
        ring: ring.animationName,
        ringDur: ring.animationDuration,
        ringColor: ring.borderTopColor,
        ringOpacity: Number(ring.opacity),
        tipShown: !tip.hidden && getComputedStyle(tip).display !== 'none',
        tipText: tip.textContent,
        // Balão acima do pin, com a seta (::before) sobre o centro dele.
        tipAbove: tr.bottom <= pr.top + 2,
        arrowOverPin: Math.abs(tr.right - 18 - (pr.left + pr.width / 2)) <= 1.5,
        arrow: getComputedStyle(tip, '::before').content !== 'none',
      };
    });
  const { page, context, errors } = await newPage();
  await page.goto(`${base}?onboarding=reset&step=3#/ferramentas`);
  await ready(page, 'conversas');
  await page.waitForTimeout(300);
  const a = await pinState(page);
  check(
    'etapa 3: pin 1,5× com anel luminoso pulsando (1,2 s), salto e "Fixar no menu" sempre visível com seta',
    a.pulsing &&
      a.scale >= 1.45 &&
      a.hop === 'coach-pin-hop' &&
      a.ring === 'coach-pin-ring' &&
      a.ringDur === '1.2s' &&
      a.ringColor === 'rgb(255, 106, 31)' &&
      a.tipShown &&
      a.tipText === 'Fixar no menu' &&
      a.tipAbove &&
      a.arrowOverPin &&
      a.arrow,
    JSON.stringify(a),
  );
  // O mouse passando por cima não para o pulso nem esconde o balão.
  await page.hover('[data-coach="fav-conversas"]');
  await page.mouse.move(200, 800);
  await page.waitForTimeout(200);
  const b = await pinState(page);
  check(
    'etapa 3: o destaque continua com hover e fora dele (só para no clique)',
    b.pulsing && b.tipShown,
  );
  // Prévia: cursor de seta visível entra, para no pin, clica (onda) e o pin fica fixado.
  const demo = await page.evaluate(async () => {
    const cursor = document.querySelector('.coach-preview-cursor');
    const ripple = document.querySelector('.coach-preview-ripple');
    const pin = document.querySelector('.coach-preview-pin');
    const seen = { cursorMax: 0, rippleMax: 0, pinnedAt: -1, t0: performance.now() };
    await new Promise((res) => {
      const f = () => {
        const t = performance.now() - seen.t0;
        seen.cursorMax = Math.max(seen.cursorMax, Number(getComputedStyle(cursor).opacity));
        seen.rippleMax = Math.max(seen.rippleMax, Number(getComputedStyle(ripple).opacity));
        if (seen.pinnedAt < 0 && pin.classList.contains('is-pinned')) seen.pinnedAt = t;
        if (t > 4500) res();
        else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    return {
      ...seen,
      src: cursor.getAttribute('src').split('/').pop(),
      size: [cursor.offsetWidth, cursor.offsetHeight],
      // Repetição: duração do ciclo da timeline (s).
      cycle: (() => {
        const tl = window.__nexo.gsap.getTweensOf(cursor)[0]?.parent;
        return tl ? +(tl.duration() + tl.repeatDelay()).toFixed(2) : null;
      })(),
    };
  });
  check(
    'prévia: cursor de seta (SVG com contorno) visível, clica com onda e o pin fica fixado; repete a cada ~4 s',
    demo.src === 'cursor-arrow.svg' &&
      demo.size.join('x') === '20x27' &&
      demo.cursorMax === 1 &&
      demo.rippleMax > 0.5 &&
      demo.pinnedAt > 0 &&
      demo.cycle !== null &&
      demo.cycle >= 3.8 &&
      demo.cycle <= 4.4,
    JSON.stringify(demo),
  );
  // Clique no pin: o destaque para e o balão some.
  await page.click('[data-coach="fav-conversas"]');
  await page.waitForTimeout(100);
  const c = await page.evaluate(() => ({
    pulsing: document
      .querySelector('[data-coach="fav-conversas"]')
      .classList.contains('is-pulsing'),
    tip: document.querySelector('.coach-action-tip').hidden,
  }));
  check('etapa 3: o clique no pin para o destaque e esconde o balão', !c.pulsing && c.tip);
  // O pin avança em qualquer modo: com voz (acima, no meio da fala), texto e armado.
  const pinAdvances = async (url, init) => {
    const { page: q, context: cq } = await newPage();
    if (init) await q.addInitScript(init);
    await q.goto(url);
    await ready(q, 'conversas');
    const kind = await q.evaluate(() => window.__nexo.voice.currentKind);
    await q.click(PIN);
    const ok = await q
      .waitForFunction(() => document.documentElement.dataset.coachStep === 'favoritas', null, {
        timeout: 4000,
      })
      .then(() => true)
      .catch(() => false);
    await cq.close();
    return { kind, ok };
  };
  const pText = await pinAdvances(`${base}?${TEXT}onboarding=reset&step=3#/ferramentas`);
  const pArmed = await pinAdvances(`${base}?onboarding=reset&step=3#/ferramentas`, () => {
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new DOMException('bloqueado', 'NotAllowedError'));
  });
  check(
    'etapa 3: clicar no pin avança também nos modos texto e armado',
    pText.kind === 'text' && pText.ok && pArmed.kind === 'armed' && pArmed.ok,
    JSON.stringify({ pText, pArmed }),
  );
  check('etapa 3 (destaque e prévia): sem erros', errors.length === 0, errors.join(' | '));
  await context.close();

  // Movimento reduzido: anel e cursor parados, mas visíveis.
  const { page: p, context: rc } = await newPage({ reducedMotion: 'reduce' });
  await p.goto(`${base}?onboarding=reset&step=3#/ferramentas`);
  await ready(p, 'conversas');
  await p.waitForTimeout(300);
  const r = await pinState(p);
  const rCursor = await p.evaluate(() => {
    const c = document.querySelector('.coach-preview-cursor');
    return {
      opacity: Number(getComputedStyle(c).opacity),
      pinned: !!document.querySelector('.coach-preview-pin.is-pinned'),
    };
  });
  check(
    'movimento reduzido: anel parado e visível, sem salto; cursor parado e visível na prévia',
    r.pulsing &&
      r.ring === 'none' &&
      r.ringOpacity > 0.5 &&
      r.hop === 'none' &&
      r.tipShown &&
      rCursor.opacity === 1,
    JSON.stringify({ r, rCursor }),
  );
  await rc.close();
}

// ---------- 6. Ida e volta 1→9→1: nenhum estado inconsistente ----------
{
  const { page, context, errors } = await newPage();
  await page.goto(`${base}?${TEXT}onboarding=reset#/home`);
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
        nexoOpacity: nexo.debugStage?.motion.opacity,
        wazMessage: !!document.querySelector('[data-coach="member-waz"] .member-message'),
        wazState: appState.wazMessage,
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
      // Modo texto: "Próximo" ativo desde a chegada (só a etapa de ação não tem botão).
      s.nextDisabled === (i === ACTION_STEP) &&
      s.tipOpacity === 1 &&
      s.focus?.split(' ')[0] === focusFor(i, true) &&
      s.nexoOpacity === 1 &&
      s.nexoOff < 1 &&
      // Mensagem do Waz: só a partir da última etapa (na Home).
      s.wazState === (i === LAST ? 'new' : null) &&
      (i !== 0 || !s.wazMessage) &&
      (i !== LAST || s.wazMessage) &&
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
    if (i !== ACTION_STEP) await unlock(page);
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
  // Modo com voz: durante a fala, clique no alvo, Enter e seta direita não avançam.
  const sel = '[data-coach="nav-ferramentas"]';
  const { page: pv, context: cv } = await newPage();
  await pv.goto(`${base}?onboarding=reset#/home`);
  await ready(pv, 'ferramentas');
  await pv.click(sel);
  await pv.keyboard.press('Enter');
  await pv.keyboard.press('ArrowRight');
  await pv.waitForTimeout(400);
  const locked = await pv.evaluate(() => ({
    step: document.documentElement.dataset.coachStep,
    state: document.documentElement.dataset.coachState,
    next: document.querySelector('.coach-next').disabled,
    aria: document.querySelector('.coach-next').getAttribute('aria-disabled'),
    opacity: Number(getComputedStyle(document.querySelector('.coach-next')).opacity),
  }));
  check(
    'durante a fala: "Próximo" desativado (disabled, aria-disabled, esmaecido); alvo, Enter e → não avançam',
    locked.step === 'ferramentas' &&
      locked.state === 'ready' &&
      locked.next &&
      locked.aria === 'true' &&
      locked.opacity < 0.6,
    JSON.stringify(locked),
  );
  await cv.close();
  // O resto da seção no modo texto (alvo e "Próximo" ativos desde a entrada).
  await page.goto(`${base}?${TEXT}onboarding=reset#/home`);
  await ready(page, 'ferramentas');
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
    await unlock(page); // loader completo: alvo e "Próximo" liberados
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
  // Até a última etapa: 8→9 troca para a Home; Voltar faz a troca inversa.
  await run(() => page.click('[data-coach="nav-seu-negocio"]'), 'base');
  await run(() => page.click('.coach-next'), 'produtos');
  await run(() => page.click('.coach-next'), 'integracoes');
  cross('8→9 (Próximo, para a Home)', await run(() => page.click('.coach-next'), 'waz'), '#/home');
  cross(
    '9→8 (Voltar, para Seu negócio)',
    await run(() => page.click('.coach-back'), 'integracoes'),
    '#/seu-negocio',
  );
  // Alvo não navegável (última etapa, linha do Waz): clicar não avança nem navega.
  const { page: p7, context: c7 } = await newPage();
  await p7.goto(`${base}?${TEXT}onboarding=reset&step=9#/home`);
  await ready(p7, 'waz');
  await unlock(p7);
  await p7.click('[data-coach="member-waz"]', { force: true });
  await p7.waitForTimeout(400);
  const s7 = await p7.evaluate(() => ({
    step: document.documentElement.dataset.coachStep,
    state: document.documentElement.dataset.coachState,
    route: location.hash,
  }));
  check(
    'etapa 9: clicar no alvo não navegável não avança nem muda a rota',
    s7.step === 'waz' && s7.state === 'ready' && s7.route === '#/home',
    JSON.stringify(s7),
  );
  await c7.close();
  check('alvo clicável / tela limpa: sem erros', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 8. Modos: com voz (padrão), texto e voz armada; o "Próximo" segue o modo ----------
{
  const manifest = JSON.parse(
    readFileSync(new URL('../src/voice/voiceManifest.json', import.meta.url)),
  );
  const VOICE_IDS = Object.keys(manifest);
  /** Estado lido da página, de uma vez (o mesmo quadro). */
  const snapFn = () => {
    const v = window.__nexo.voice;
    const next = document.querySelector('.coach-next');
    const ring = document.querySelector('.coach-ring path');
    const audio = document.querySelector('.coach-audio');
    return {
      step: document.documentElement.dataset.coachStep,
      state: document.documentElement.dataset.coachState,
      kind: v.currentKind,
      mode: v.state,
      audioPaused: v.element ? v.element.paused : true,
      src: v.element?.src ?? '',
      spans: document.querySelectorAll('.coach-say-word').length,
      spoken: document.querySelectorAll('.coach-say-word.is-spoken').length,
      progress: v.lastFrame?.progress ?? 0,
      // Borda de progresso visível: dasharray com comprimento > 0 (vem como "15.6px, 100px").
      ring: (parseFloat(ring.style.strokeDasharray) || 0) > 0,
      icon: audio.dataset.voice,
      iconAnim: getComputedStyle(audio).animationName,
      label: audio.getAttribute('aria-label'),
      next: next.disabled ? 'off' : 'on',
      nextAria: next.getAttribute('aria-disabled'),
      nextOpacity: Number(getComputedStyle(next).opacity),
      back: document.querySelector('.coach-back').disabled ? 'off' : 'on',
      audioBtn: audio.disabled ? 'off' : 'on',
      face: window.__nexo.nexo.debugStage?.face.current,
      t: v.lastFrame?.t ?? 0,
    };
  };
  const snap = (p) => p.evaluate(snapFn);
  const playing = (p) =>
    p.waitForFunction(() => !window.__nexo.voice.element?.paused, null, { timeout: 6000 });
  /** Linha do tempo de uma etapa: fim da fala (botão ativo) e início da seguinte. */
  const timeline = (p, id, nextId, maxMs) =>
    p.evaluate(
      ({ id, nextId, maxMs }) =>
        new Promise((res) => {
          const r = { ready: -1, unlocked: -1, next: -1, enabledEarly: false };
          const t0 = performance.now();
          const f = () => {
            const d = document.documentElement.dataset;
            const t = performance.now();
            const btn = document.querySelector('.coach-next');
            if (r.ready < 0 && d.coachStep === id && d.coachState === 'ready') r.ready = t;
            if (r.ready >= 0 && r.unlocked < 0 && d.coachStep === id) {
              if (!btn.disabled) r.unlocked = t;
            }
            if (nextId && d.coachStep === nextId) r.next = t;
            if ((nextId ? r.next >= 0 : r.unlocked >= 0) || t - t0 > maxMs) {
              res({
                unlockMs: r.unlocked >= 0 ? Math.round(r.unlocked - r.ready) : -1,
                nextMs: r.next >= 0 ? Math.round(r.next - r.ready) : -1,
              });
            } else requestAnimationFrame(f);
          };
          f();
        }),
      { id, nextId, maxMs },
    );
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

  // (1) Modo com voz (padrão): fala ao entrar, grifo, borda acompanhando o áudio, "Próximo"
  // desativado durante a fala e avanço sozinho no fim (etapas 1 e 2).
  {
    const { page: p, context: c, errors: e } = await newPage();
    await p.goto(`${base}?onboarding=reset#/home`);
    await ready(p, IDS[0]);
    await hookMouth(p);
    await playing(p);
    await p.waitForTimeout(400);
    const s0 = await snap(p);
    check(
      'modo com voz: fala da etapa tocando, grifo (texto cinza acendendo), borda de progresso, ícone de pausa, Próximo desativado',
      s0.kind === 'voice' &&
        !s0.audioPaused &&
        s0.src.endsWith(`audio/nexo/${VOICE_IDS[0]}.mp3`) &&
        s0.spoken < s0.spans &&
        s0.ring &&
        s0.icon === 'playing' &&
        s0.label === 'Pausar' &&
        s0.next === 'off' &&
        s0.nextAria === 'true' &&
        s0.audioBtn === 'on',
      JSON.stringify(s0),
    );
    const lines = [];
    // Etapa 1 já começou; mede a 1 a partir de agora (só o avanço) e a 2 inteira.
    const t1 = await timeline(p, IDS[0], IDS[1], 15000);
    lines.push({ step: 1, ...t1 });
    const t2 = await timeline(p, IDS[1], IDS[2], 15000);
    lines.push({ step: 2, ...t2, dur: Math.round(manifest[VOICE_IDS[1]].duration * 1000) });
    check(
      'modo com voz: Próximo ativado no fim da fala e avanço automático ~400 ms depois',
      lines.every((l) => l.unlockMs > 0 && Math.abs(l.nextMs - l.unlockMs - 400) < 150) &&
        Math.abs(lines[1].unlockMs - lines[1].dur) < 350,
      JSON.stringify(lines),
    );
    // Etapa 3: no fim da fala, não avança.
    await ready(p, IDS[2]);
    await playing(p);
    await p.evaluate(() => window.__nexo.voice.skip());
    await p.waitForTimeout(1500);
    const s3 = await snap(p);
    check(
      'modo com voz: na etapa 3 (pin) o fim da fala não avança',
      s3.step === IDS[2] && s3.state === 'ready' && s3.mode === 'ended',
      JSON.stringify(s3),
    );
    const mouth = await p.evaluate(() => window.__mouth);
    check(
      'boca: fala só com palavra ativa (no mesmo quadro)',
      mouth.bad === 0 && mouth.talk > 0,
      JSON.stringify(mouth),
    );
    check('modo com voz: sem erros', e.length === 0, e.join(' | '));
    await c.close();
  }

  // (2) Modo texto: em todas as etapas (menos a 3, sem botão), o "Próximo" está ativo e
  // sem borda desde o primeiro quadro do tooltip, e clicar avança na hora.
  {
    const { page: p, context: c, errors: e } = await newPage();
    await p.goto(`${base}?${TEXT}onboarding=reset#/home`);
    const rows = [];
    for (let i = 0; i < IDS.length; i++) {
      // Primeiro quadro com o tooltip visível desta etapa: estado do botão e da borda. (O
      // tooltip anterior ainda sai depois que a etapa muda: espera ele sumir e o novo entrar.)
      const first = await p.evaluate(
        (id) =>
          new Promise((res) => {
            let gone = false; // na etapa 1 o tooltip começa oculto; nas outras, o antigo sai
            const f = () => {
              const tip = document.querySelector('.coach-tooltip');
              const d = document.documentElement.dataset;
              const visible = tip && !tip.hidden && Number(getComputedStyle(tip).opacity) > 0;
              if (!visible) gone = true;
              if (gone && d.coachStep === id && visible) {
                const btn = document.querySelector('.coach-next');
                const ring = parseFloat(
                  document.querySelector('.coach-ring path').style.strokeDasharray,
                );
                res({
                  next: btn.disabled ? 'off' : 'on',
                  opacity: Number(getComputedStyle(btn).opacity),
                  ring: (ring || 0) > 0,
                  white:
                    document.querySelectorAll('.coach-say-word.is-spoken').length ===
                    document.querySelectorAll('.coach-say-word').length,
                });
              } else requestAnimationFrame(f);
            };
            f();
          }),
        IDS[i],
      );
      await ready(p, IDS[i]);
      await p.waitForTimeout(150);
      const s1 = await snap(p);
      let advancedMs = -1;
      if (i === ACTION_STEP) {
        await p.click(PIN);
      } else {
        // Clica e mede quanto tempo até a transição começar.
        advancedMs = await p.evaluate(() => {
          const t0 = performance.now();
          document.querySelector('.coach-next').click();
          const st = document.documentElement.dataset.coachState;
          return st === 'transition' || st === 'closing' ? Math.round(performance.now() - t0) : -1;
        });
      }
      rows.push({ step: i + 1, first, kind: s1.kind, ring: s1.ring, next: s1.next, advancedMs });
      if (i === LAST) break;
    }
    const bad = rows.filter(
      (r, i) =>
        r.kind !== 'text' ||
        r.ring ||
        r.first.ring ||
        !r.first.white ||
        (i === ACTION_STEP
          ? r.next !== 'off'
          : r.first.next !== 'on' || r.first.opacity !== 1 || r.next !== 'on' || r.advancedMs < 0),
    );
    check(
      'modo texto: em todas as etapas, Próximo/Finalizar ativo (aparência normal) e sem borda desde a entrada do tooltip; clicar avança na hora',
      bad.length === 0,
      JSON.stringify(
        bad.length ? bad : rows.map((r) => `${r.step}:${r.first.next}/${r.advancedMs}ms`),
      ),
    );
    // Nunca há avanço automático: depois do último clique o tour encerrou; antes disso, nada
    // avançou sozinho (todas as transições vieram dos cliques acima).
    await p.waitForFunction(() => document.documentElement.dataset.coachState === 'closed', null, {
      timeout: 10000,
    });
    check('modo texto: fluxo inteiro pelos cliques, sem erros', e.length === 0, e.join(' | '));
    await c.close();

    // Sem avanço automático no modo texto, mesmo esperando bem mais que qualquer fala.
    const { page: q, context: cq } = await newPage();
    await q.goto(`${base}?${TEXT}onboarding=reset&step=2#/ferramentas`);
    await ready(q, IDS[1]);
    await q.waitForTimeout(manifest[VOICE_IDS[1]].duration * 1000 + 1500);
    const still = await snap(q);
    check(
      'modo texto: nunca avança sozinho',
      still.step === IDS[1] && still.state === 'ready' && still.next === 'on',
      JSON.stringify(still),
    );
    await cq.close();
  }

  // (3) Pausar no meio da fala: no mesmo instante, texto todo branco, botão ativo, sem borda
  // e áudio parado. As seguintes seguem no modo texto. (4) Religar: fala do início, borda
  // do zero, botão desativado.
  {
    const { page: p, context: c, errors: e } = await newPage();
    await p.goto(`${base}?onboarding=reset&step=2#/ferramentas`);
    await ready(p, IDS[1]);
    await hookMouth(p);
    await p.waitForFunction(() => (window.__nexo.voice.lastFrame?.t ?? 0) > 1.2, null, {
      timeout: 8000,
    });
    const instant = await p.evaluate((fn) => {
      const read = new Function(`return (${fn})()`);
      const before = read();
      document.querySelector('.coach-audio').click(); // pausa (mesma tarefa)
      return { before, after: read() };
    }, snapFn.toString());
    const { before, after } = instant;
    check(
      'pausar no meio da fala: no mesmo instante texto todo branco, Próximo ativo, sem borda, áudio parado',
      before.kind === 'voice' &&
        before.ring &&
        before.next === 'off' &&
        before.spoken < before.spans &&
        after.kind === 'text' &&
        after.spoken === after.spans &&
        after.next === 'on' &&
        !after.ring &&
        after.audioPaused &&
        after.icon === 'off',
      JSON.stringify(instant),
    );
    await p.waitForTimeout(200);
    const b = await snap(p);
    check('pausar: a boca volta ao padrão', b.face !== 'talk', JSON.stringify(b));
    // Seguinte: modo texto.
    await p.click('.coach-next');
    await ready(p, IDS[2]);
    await p.waitForTimeout(300);
    const t3 = await snap(p);
    check(
      'depois de pausar, a etapa seguinte entra no modo texto (sem áudio, texto branco, sem borda)',
      t3.kind === 'text' &&
        t3.audioPaused &&
        t3.spoken === t3.spans &&
        !t3.ring &&
        t3.icon === 'off',
      JSON.stringify(t3),
    );
    // Etapa 3 → 4 pelo pin (modo texto); na 4, o ícone religa a voz do início.
    await p.click(PIN);
    await ready(p, IDS[3]);
    await p.waitForTimeout(300);
    const t4 = await snap(p);
    await p.click('.coach-audio');
    await playing(p);
    await p.waitForTimeout(120);
    const again = await snap(p);
    check(
      'religar a voz: fala do início da etapa, texto cinza, borda do zero e Próximo desativado',
      t4.kind === 'text' &&
        t4.next === 'on' &&
        again.kind === 'voice' &&
        !again.audioPaused &&
        again.t < 0.5 &&
        again.progress < 0.25 &&
        again.spoken < again.spans &&
        again.next === 'off' &&
        again.icon === 'playing' &&
        again.src.endsWith(`${VOICE_IDS[3]}.mp3`),
      JSON.stringify({ t4, again }),
    );
    const tl = await timeline(p, IDS[3], IDS[4], 12000);
    check('voz religada: o fim da fala volta a avançar sozinho', tl.nextMs > 0, JSON.stringify(tl));
    await ready(p, IDS[4]);
    await playing(p);
    const t5 = await snap(p);
    check(
      'voz religada: a etapa seguinte já começa falando',
      t5.kind === 'voice',
      JSON.stringify(t5),
    );
    const mouth = await p.evaluate(() => window.__mouth);
    check(
      'boca: no padrão em todo o modo texto e só com palavra ativa na voz',
      mouth.bad === 0 && mouth.silentTalk === 0 && mouth.talk > 0,
      JSON.stringify(mouth),
    );
    check('pausar/religar: sem erros', e.length === 0, e.join(' | '));
    await c.close();
  }

  // (5) Autoplay bloqueado: voz armada (texto branco, ícone pulsando, Próximo ativo e sem
  // borda); o primeiro clique em qualquer lugar inicia a fala da etapa; o primeiro clique no
  // Próximo avança e a seguinte já fala; o primeiro clique no ícone liga a fala.
  const blocked = () => {
    const play = HTMLMediaElement.prototype.play;
    let interacted = false;
    document.addEventListener('pointerdown', () => (interacted = true), true);
    document.addEventListener('keydown', () => (interacted = true), true);
    HTMLMediaElement.prototype.play = function () {
      if (!interacted) return Promise.reject(new DOMException('bloqueado', 'NotAllowedError'));
      return play.call(this);
    };
  };
  {
    const { page: p, context: c, errors: e } = await newPage();
    await p.addInitScript(blocked);
    await p.goto(`${base}?onboarding=reset#/home`);
    await ready(p, IDS[0]);
    await p.waitForTimeout(500);
    const a = await snap(p);
    check(
      'autoplay bloqueado: voz armada (texto branco, ícone pulsando), Próximo ativo e sem borda, sem erro',
      a.kind === 'armed' &&
        a.spoken === a.spans &&
        a.icon === 'armed' &&
        a.iconAnim === 'coach-audio-armed' &&
        a.next === 'on' &&
        a.nextOpacity === 1 &&
        !a.ring &&
        e.length === 0,
      JSON.stringify(a),
    );
    // Primeiro clique em qualquer lugar (fora de controles): a fala da etapa começa do início.
    await p.mouse.click(1300, 820);
    await playing(p);
    const b = await snap(p);
    check(
      'autoplay bloqueado: o primeiro clique em qualquer lugar inicia a fala da etapa atual',
      b.kind === 'voice' &&
        b.step === IDS[0] &&
        !b.audioPaused &&
        b.icon === 'playing' &&
        b.next === 'off' &&
        b.src.endsWith(`${VOICE_IDS[0]}.mp3`),
      JSON.stringify(b),
    );
    await c.close();
  }
  {
    const { page: p, context: c, errors: e } = await newPage();
    await p.addInitScript(blocked);
    await p.goto(`${base}?onboarding=reset#/home`);
    await ready(p, IDS[0]);
    await p.waitForTimeout(500);
    await p.click('.coach-next'); // primeiro clique: no Próximo
    await ready(p, IDS[1]);
    await playing(p);
    const s2 = await snap(p);
    check(
      'autoplay bloqueado: o primeiro clique no Próximo avança e a etapa seguinte já fala',
      s2.kind === 'voice' && !s2.audioPaused && s2.icon === 'playing' && e.length === 0,
      JSON.stringify(s2),
    );
    await c.close();
  }
  {
    const { page: p, context: c, errors: e } = await newPage();
    await p.addInitScript(blocked);
    await p.goto(`${base}?onboarding=reset&step=2#/ferramentas`);
    await ready(p, IDS[1]);
    await p.waitForTimeout(500);
    // Primeiro clique: no ícone (pulsando; force: o Playwright espera elementos parados).
    await p.click('.coach-audio', { force: true });
    await playing(p);
    await p.waitForTimeout(300);
    const s = await snap(p);
    check(
      'autoplay bloqueado: o primeiro clique no ícone liga a fala (não pausa)',
      s.kind === 'voice' &&
        s.step === IDS[1] &&
        !s.audioPaused &&
        s.icon === 'playing' &&
        e.length === 0,
      JSON.stringify(s),
    );
    await c.close();
  }
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
    const q = [i > ACTION_STEP ? 'fav=conversas' : '', i === LAST ? 'waz=message' : '']
      .filter(Boolean)
      .join('&');
    await b.goto(`${base}preview.html${q ? `?${q}` : ''}#${ROUTES[i].slice(1)}`);
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

// ---------- 12. Etapas 6, 7 e 8: tooltip só de texto, sem sobreposição ----------
{
  const inter = (a, b, pad = 0) =>
    a.x < b.x + b.w + pad &&
    b.x < a.x + a.w + pad &&
    a.y < b.y + b.h + pad &&
    b.y < a.y + a.h + pad;
  for (const [W, H] of [
    [1440, 900],
    [1920, 1080],
  ]) {
    const context = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Referência: tooltip de texto da etapa 5 (largura, padding, tipografia, rodapé).
    await page.goto(`${base}?onboarding=reset&step=5#/ferramentas`);
    await ready(page, 'seu-negocio');
    const look = () =>
      page.evaluate(() => {
        const tip = document.querySelector('.coach-tooltip');
        const cs = getComputedStyle(tip);
        const say = getComputedStyle(document.querySelector('.coach-say'));
        return {
          kind: tip.dataset.kind,
          w: tip.offsetWidth,
          padding: cs.padding,
          font: `${say.fontFamily} ${say.fontSize} ${say.fontWeight} ${say.lineHeight}`,
          footer: [...document.querySelectorAll('.coach-footer > *')]
            .map((e) => e.className.split(' ')[0])
            .join(','),
          footerH: document.querySelector('.coach-footer').offsetHeight,
        };
      });
    const ref = await look();
    for (const n of [6, 7, 8]) {
      await page.goto(`${base}?onboarding=reset&step=${n}#/seu-negocio`);
      await ready(page, IDS[n - 1]);
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const l = window.__nexo.coach.layout;
        const media = document.querySelector('.coach-media');
        return {
          layout: l,
          media: { hidden: media.hidden, children: media.childElementCount },
          videos: document.querySelectorAll('video').length,
          play: !!document.querySelector('.coach-play, .coach-close, .coach-poster'),
          vw: innerWidth,
          vh: innerHeight,
        };
      });
      const t = await look();
      const l = r.layout;
      const inside = (b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= r.vw && b.y + b.h <= r.vh;
      check(
        `${W}×${H} etapa ${n}: tooltip só de texto (sem vídeo, capa, Play nem ×), igual ao das outras etapas`,
        t.kind === 'text' &&
          r.media.hidden &&
          r.media.children === 0 &&
          r.videos === 0 &&
          !r.play &&
          JSON.stringify({ ...t, kind: 0 }) === JSON.stringify({ ...ref, kind: 0 }),
        JSON.stringify({ t, ref, media: r.media, videos: r.videos }),
      );
      check(
        `${W}×${H} etapa ${n}: tooltip e Nexo não cobrem o alvo nem um ao outro, dentro da tela`,
        l.placement === 'right' &&
          !inter(l.tooltip, l.target) &&
          !inter(l.nexo, l.target, 12) &&
          !inter(l.nexo, l.tooltip) &&
          inside(l.tooltip) &&
          inside(l.nexo),
        JSON.stringify({
          placement: l.placement,
          nexoPlacement: l.nexoPlacement,
          t: l.tooltip,
          n: l.nexo,
          a: l.target,
        }),
      );
    }
    check(`${W}×${H}: etapas 6–8 sem erros`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
}

// ---------- 12b. Anel de foco: só com teclado, arredondado ----------
{
  const { page, context, errors } = await newPage();
  const ring = (sel) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const cs = getComputedStyle(el);
      return {
        focused: document.activeElement === el,
        outline: cs.outlineStyle,
        radius: cs.borderRadius,
      };
    }, sel);
  const shown = (r) => r.focused && r.outline !== 'none' && r.radius !== '0px';
  const hidden = (r) => r.outline === 'none';
  await page.goto(`${base}?${TEXT}onboarding=reset&step=2#/ferramentas`);
  await ready(page, 'agentes');
  await unlock(page); // o Próximo precisa estar ativo para receber foco
  // Mouse: alto-falante (duas vezes: liga e pausa), Voltar e Próximo sem anel.
  await page.click('.coach-audio');
  const a1 = await ring('.coach-audio');
  await page.click('.coach-audio');
  const a2 = await ring('.coach-audio');
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.up();
  // Teclado: Tab até o alto-falante, Voltar e Próximo; o anel aparece com cantos redondos.
  const kb = {};
  for (let k = 0; k < 4; k++) {
    await page.keyboard.press('Tab');
    const cls = await page.evaluate(() => document.activeElement?.className.split(' ')[0]);
    if (['coach-audio', 'coach-back', 'coach-next'].includes(cls)) kb[cls] = await ring(`.${cls}`);
  }
  check(
    'alto-falante: sem anel depois do clique com o mouse',
    a1.focused && hidden(a1) && hidden(a2),
    JSON.stringify({ a1, a2 }),
  );
  check(
    'teclado: anel arredondado no alto-falante, Voltar e Próximo',
    ['coach-audio', 'coach-back', 'coach-next'].every((c) => kb[c] && shown(kb[c])),
    JSON.stringify(kb),
  );
  // Voltar e Próximo com o mouse: sem anel (Voltar leva à etapa 1, com foco no Próximo).
  await page.click('.coach-back');
  await ready(page, 'ferramentas');
  const nx = await ring('.coach-next');
  check(
    'Voltar/Próximo pelo mouse: o foco que fica não mostra anel',
    hidden(nx),
    JSON.stringify(nx),
  );
  // Pin da etapa 3: foco inicial sem anel (mouse); Tab mostra anel arredondado.
  await page.goto(`${base}?onboarding=reset&step=3#/ferramentas`);
  await ready(page, 'conversas');
  await page.mouse.click(700, 450);
  const pinMouse = await ring('[data-coach="fav-conversas"]');
  let pinKb = null;
  for (let k = 0; k < 4 && !pinKb; k++) {
    await page.keyboard.press('Tab');
    const isPin = await page.evaluate(() =>
      document.activeElement?.matches('[data-coach="fav-conversas"]'),
    );
    if (isPin) pinKb = await ring('[data-coach="fav-conversas"]');
  }
  check(
    'pin da etapa 3: sem anel pelo mouse; com Tab, anel arredondado',
    hidden(pinMouse) && pinKb && shown(pinKb),
    JSON.stringify({ pinMouse, pinKb }),
  );
  check('anel de foco: sem erros', errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---------- 13. Última etapa na Home: linha do Waz com a mensagem; Finalizar ----------
{
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(m.text()));
  await page.goto(`${base}?${TEXT}onboarding=reset&step=8#/seu-negocio`);
  await ready(page, 'integracoes');
  await unlock(page);
  // Mensagem entrando na Home: opacidade e deslize amostrados por quadro, e quando o
  // destaque (overlay de volta) começa.
  const entry = page.evaluate(
    () =>
      new Promise((res) => {
        const log = [];
        const t0 = performance.now();
        const f = () => {
          const msg = document.querySelector('.screen:not(.is-probe) .member-message');
          const dim = Number(document.documentElement.style.getPropertyValue('--coach-dim') || 1);
          if (msg) {
            const m = new DOMMatrix(getComputedStyle(msg).transform);
            log.push({
              t: performance.now() - t0,
              o: Number(getComputedStyle(msg).opacity),
              y: m.f,
              dim,
            });
          }
          const d = document.documentElement.dataset;
          if (d.coachStep === 'waz' && d.coachState === 'ready') res(log);
          else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }),
  );
  await page.click('.coach-next');
  const log = await entry;
  const full = log.findIndex((r) => r.o === 1);
  const dimBack = log.findIndex((r, k) => k > 0 && r.dim > 0 && log[k - 1].dim === 0);
  check(
    '8→9: a Home entra com a mensagem do Waz em fade + deslize, antes do overlay/destaque voltar',
    log.length > 0 &&
      log[0].o < 0.2 &&
      log.some((r) => r.y > 1) &&
      full > 0 &&
      dimBack > 0 &&
      full <= dimBack,
    JSON.stringify({ first: log[0], full: log[full], dimBack: log[dimBack] }),
  );
  await page.waitForTimeout(300);
  const l = await page.evaluate(() => {
    const { coach } = window.__nexo;
    const row = document.querySelector('[data-coach="member-waz"]');
    const cs = getComputedStyle(row);
    return {
      route: location.hash,
      layout: coach.layout,
      target: row.classList.contains('is-coach-target'),
      bg: cs.backgroundColor,
      radius: cs.borderRadius,
      message: row.querySelector('.member-message')?.textContent,
      unread: row.querySelector('.member-unread')?.getBoundingClientRect().toJSON(),
      label: document.querySelector('.coach-next').textContent,
      // Acima do overlay: o ponto no meio da linha é a própria linha.
      onTop: row.contains(
        document.elementFromPoint(
          row.getBoundingClientRect().x + 400,
          row.getBoundingClientRect().y + 48,
        ),
      ),
    };
  });
  const L = l.layout;
  const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
  check(
    'última etapa (1920×1080): linha do Waz em (508, 325) 832×96, card branco destacado, com a mensagem e a bolinha',
    l.route === '#/home' &&
      l.target &&
      l.onTop &&
      l.bg === 'rgb(255, 255, 255)' &&
      l.radius === '16px' &&
      l.message === 'Oi aqui o Waz! Estou animado em me juntar ao seu time!' &&
      near(L.target.x, 508) &&
      near(L.target.y, 325) &&
      near(L.target.w, 832) &&
      near(L.target.h, 96) &&
      l.unread &&
      near(l.unread.x, 1312) &&
      near(l.unread.y, 341) &&
      l.label === 'Finalizar',
    JSON.stringify({ ...l, layout: undefined, target: L.target }),
  );
  check(
    'última etapa: tooltip abaixo da linha, alinhado à direita (962, 444), e o Nexo à direita dele (Figma)',
    L.placement === 'bottom' &&
      near(L.tooltip.x, 962) &&
      near(L.tooltip.y, 444) &&
      near(L.tooltip.x + L.tooltip.w, L.target.x + L.target.w) &&
      L.nexoPlacement === 'right' &&
      near(L.nexoAnchor.x, 1500.3) &&
      near(L.nexoAnchor.y, 521.3, 4),
    JSON.stringify({
      tooltip: L.tooltip,
      nexo: L.nexoAnchor,
      placement: [L.placement, L.nexoPlacement],
    }),
  );
  // Finalizar: tooltip sai, o Nexo voa para fora da tela, overlay some; Home limpa.
  await unlock(page);
  const exitLog = page.evaluate(
    () =>
      new Promise((res) => {
        const out = { flew: false, offscreen: false };
        const f = () => {
          const n = window.__nexo.nexo;
          if (n.isFlying) out.flew = true;
          const st = n.debugStage;
          if (st) {
            const x = st.getAnchor().x + st.motion.x;
            const y = st.getAnchor().y + st.motion.y;
            if (x > innerWidth || y < 0) out.offscreen = true;
          }
          if (document.documentElement.dataset.coachState === 'closed') res(out);
          else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }),
  );
  await page.click('.coach-next');
  const ex = await exitLog;
  await page.waitForTimeout(500);
  const end = await page.evaluate(() => {
    const row = document.querySelector('[data-coach="member-waz"]');
    return {
      route: location.hash,
      screens: document.querySelectorAll('.screen').length,
      overlay: !!document.querySelector('.coach-overlay'),
      tooltip: !!document.querySelector('.coach-tooltip'),
      canvas: !!document.querySelector('.nexo-canvas'),
      marked: document.querySelectorAll('[class*="is-coach"]').length,
      message: row?.querySelector('.member-message')?.textContent,
      unread: !!row?.querySelector('.member-unread'),
      rect: row?.getBoundingClientRect().toJSON(),
      state: window.__nexo.appState.wazMessage,
      focusRing: document.activeElement?.matches(':focus-visible') ?? false,
    };
  });
  check(
    'Finalizar: o Nexo voa para fora da tela e o overlay some',
    ex.flew && ex.offscreen && !end.overlay && !end.tooltip && !end.canvas,
    JSON.stringify(ex),
  );
  check(
    'depois do Finalizar: Home limpa com a mensagem e a bolinha do Waz, nada destacado, nenhuma outra tela (Figma 2631:3583)',
    end.route === '#/home' &&
      end.screens === 1 &&
      end.marked === 0 &&
      end.message === 'Oi aqui o Waz! Estou animado em me juntar ao seu time!' &&
      end.unread &&
      !end.focusRing && // finalizado com o mouse: sem anel de foco
      near(end.rect.x, 508) &&
      near(end.rect.y, 325) &&
      end.state === 'shown',
    JSON.stringify(end),
  );
  // Print comparável ao Figma 2631:3583.
  const png = PNG.sync.read(await page.screenshot());
  const px = (x, y) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)];
  const bgPx = px(1600, 900);
  check(
    'depois do Finalizar: fundo da Home sem overlay (#FDFDFD)',
    bgPx.join(',') === '253,253,253',
    bgPx.join(','),
  );
  check('última etapa na Home: sem erros', errors.length === 0, errors.join(' | '));
  await context.close();

  // Voltar da última etapa: troca inversa para Seu negócio (etapa 8), sem a mensagem.
  {
    const { page: p, context: c, errors: e } = await newPage();
    await p.goto(`${base}?${TEXT}onboarding=reset&step=9#/home`);
    await ready(p, 'waz');
    await p.click('.coach-back');
    await ready(p, 'integracoes');
    const b = await p.evaluate(() => ({
      route: location.hash,
      state: window.__nexo.appState.wazMessage,
    }));
    check(
      'Voltar da última etapa: volta para a etapa 8 em Seu negócio',
      b.route === '#/seu-negocio' && b.state === null && e.length === 0,
      JSON.stringify({ b, e }),
    );
    await c.close();
  }
}

await browser.close();
console.log(JSON.stringify(results));
console.log(failures ? `\n${failures} falha(s)` : '\nTudo ok');
process.exit(failures ? 1 : 0);
