import './styles/tokens.css';
import './styles/app.css';
import './styles/screens/home.css';
import './styles/screens/ferramentas.css';
import './styles/screens/seu-negocio.css';
import './styles/coachmark.css';
import './styles/nexo.css';
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Router } from './app/router';
import { Sidebar } from './app/sidebar';
import { appState } from './app/state';
import { SCREENS } from './screens';
import { Coachmark, TARGET_TRANSITION_MS, type StepLayout } from './coachmark/Coachmark';
import {
  FLOW_FAVORITES,
  NEXO_FIGMA_EXTENTS,
  STEPS,
  flowStateAt,
  type Step,
} from './coachmark/steps';
import type { Point } from './nexo/NexoGuide';
import { VoicePlayer, installAudioUnlock } from './voice/voice';
import { NexoDebug } from './debug/NexoDebug';
import { prefersReducedMotion } from './utils/reducedMotion';

// Orquestra o onboarding: 7 coach marks em 3 telas, com o Nexo guiando.
// ?step=N abre na etapa N. Dev: ?onboarding=reset reinicia; ?debug liga a tecla D;
// ?model=<url> troca o GLB; ?nowebgl força o fallback PNG.
// Modo demonstração (VITE_DEMO_MODE=true, ligado no build publicado; ver .env.production):
// o tour sempre começa do início (ignora onboarding:done). Atalhos R (reiniciar) e 1–7
// (ir para a etapa) valem no modo demonstração e no dev.

gsap.registerPlugin(CustomEase);
/** Easing padrão de entrada: cubic-bezier(0.22, 1, 0.36, 1). */
const EASE_OUT = CustomEase.create('nexoOut', 'M0,0 C0.22,1 0.36,1 1,1');

/**
 * Abertura (s, relativos ao início da home): o Nexo aparece em 0,6 s (500 ms) e,
 * na chegada, o escurecimento, o tooltip e o aceno curto começam juntos.
 */
const OPENING = { nexoAppear: 0.6, dimDuration: 0.45, nexoTimeoutMs: 3000 };
/**
 * Troca de etapa NA MESMA TELA: o tooltip sai (100 ms) enquanto o Nexo relaxa, depois
 * o voo (850 ms, FLIGHT.duration) com o destaque migrando; o overlay não pisca. O
 * tooltip novo entra junto com o gesto.
 */
const SAME_SCREEN = { takeoff: 0.1 };

/**
 * Tempo (s) em que a tela nova fica LIMPA (sem overlay, nítida) depois de entrar,
 * antes do overlay voltar. Ajuste aqui.
 */
const CLEAN_SCREEN_HOLD_S = 0.6;

/**
 * Troca de etapa ENTRE TELAS (s), nos dois sentidos:
 * tooltip e destaque saem (120 ms) → overlay some (200 ms, sem escurecer nem
 * desfocar) enquanto a tela antiga sai → tela nova entra limpa (fade + subida de
 * 12 px, 250 ms) → CLEAN_SCREEN_HOLD_S → overlay volta (300 ms) com o destaque →
 * tooltip entra junto com o gesto. O Nexo voa durante o intervalo, sobre a tela limpa,
 * e chega quando o overlay vai voltar.
 */
const CROSS_SCREEN = {
  tooltipOut: 0.12,
  highlightOut: 0.12,
  overlayOut: 0.2,
  screenIn: 0.25,
  rise: 12,
  overlayIn: 0.3,
};
/** Relaxamento do Nexo antes de decolar (NexoGuide, RELAX.duration). */
const NEXO_RELAX = 0.1;

const DONE_KEY = 'onboarding:done';
/** Voo do ícone do gatilho até a sidebar ao favoritar (s). */
const ACTION_FLY_S = 0.5;
/** Espera depois do fim da fala antes de avançar sozinho (s). */
const AUTO_ADVANCE_DELAY_S = 0.4;
/** Site de demonstração: tour sempre do início. */
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const SHORTCUTS = DEMO_MODE || import.meta.env.DEV;

/**
 * Atalhos de demonstração: R reinicia o tour; 1–7 abrem direto na etapa. Recarregam a
 * página (o estado do fluxo é montado do zero, como no ?step=N).
 */
function installShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    if (t instanceof HTMLVideoElement) return;
    const reload = (search: string, route: string) => {
      history.replaceState(null, '', `${location.pathname}${search}#${route}`);
      location.reload();
    };
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      reload(import.meta.env.DEV ? '?onboarding=reset' : '', '/home');
      return;
    }
    const n = Number(e.key);
    const step = Number.isInteger(n) && n >= 1 ? STEPS[n - 1] : undefined;
    if (step) {
      e.preventDefault();
      reload(`?step=${n}`, step.route);
    }
  });
}

type State = 'opening' | 'ready' | 'transition' | 'closing' | 'closed' | 'off';
/** Estado no <html data-coach-state> e etapa em data-coach-step (testes e capturas). */
const setState = (s: State, step?: string) => {
  const d = document.documentElement.dataset;
  d.coachState = s;
  if (step !== undefined) d.coachStep = step;
};
const wait = (s: number) => new Promise<void>((r) => gsap.delayedCall(s, r));
const center = (l: StepLayout): Point => l.nexoAnchor;
const tooltipCenter = (l: StepLayout): Point => ({
  x: l.tooltip.x + l.tooltip.w / 2,
  y: l.tooltip.y + l.tooltip.h / 2,
});
const targetCenter = (l: StepLayout): Point => ({
  x: l.target.x + l.target.w / 2,
  y: l.target.y + l.target.h / 2,
});

/**
 * Aplica o estado do fluxo da etapa `index` (derivado de steps.ts): serve para os
 * dois sentidos e para ?step=N. Só mexe nos favoritos que o fluxo controla.
 */
const applyFlowState = (index: number) => {
  const { favorites } = flowStateAt(index);
  FLOW_FAVORITES.forEach((id) => appState.setFavorite(id, favorites.has(id)));
};

const readDone = (): boolean => {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
};
const writeDone = () => {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* sem storage */
  }
};

/**
 * Entrada da home: sidebar com fade de 300 ms; saudação e blocos com fade +
 * translateY 16 → 0, 450 ms cada, stagger 40 ms. Com movimento reduzido: só fade.
 * clearProps: um transform que sobre cria contexto de empilhamento e prende os
 * alvos abaixo do overlay.
 */
function homeEntrance(tl: gsap.core.Timeline): void {
  const reduced = prefersReducedMotion();
  const clear = { clearProps: 'opacity,transform' };
  const els = Array.from(document.querySelectorAll<HTMLElement>('.screen [data-enter]'));
  tl.from('.sidebar', { opacity: 0, duration: 0.3, ease: 'power1.out', ...clear }, 0);
  els.forEach((el, i) => {
    if (reduced) tl.from(el, { opacity: 0, duration: 0.3, ease: 'power1.out', ...clear }, 0);
    else tl.from(el, { opacity: 0, y: 16, duration: 0.45, ease: EASE_OUT, ...clear }, i * 0.04);
  });
}

async function start(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV && params.get('onboarding') === 'reset') {
    try {
      localStorage.removeItem(DONE_KEY);
    } catch {
      /* sem storage */
    }
  }
  const initial = Math.min(Math.max(Number(params.get('step') ?? 1) - 1, 0), STEPS.length - 1);
  const runOnboarding = DEMO_MODE || !readDone() || params.has('step');
  if (SHORTCUTS) installShortcuts();

  // Casca: sidebar persistente + área das telas.
  const sidebar = new Sidebar();
  const outlet = document.createElement('div');
  outlet.className = 'screen';
  app.append(sidebar.el, outlet);
  const router = new Router(outlet, SCREENS);
  router.onChange((r) => sidebar.setRoute(r));
  const first = STEPS[initial];
  if (runOnboarding && first) {
    // ?step=N: começa com o estado que o fluxo teria nessa etapa.
    applyFlowState(initial);
    history.replaceState(null, '', `${location.pathname}${location.search}#${first.route}`);
  }
  router.start();

  // A cascata da home é montada antes de qualquer await (sem flash no primeiro quadro).
  const tl = gsap.timeline();
  homeEntrance(tl);
  if (!runOnboarding || !first) {
    setState('off');
    return;
  }
  setState('opening', first.id);

  // O GLB carrega em paralelo; acima de 3 s segue com o PNG.
  const model = import.meta.env.DEV ? (params.get('model') ?? undefined) : undefined;
  // three.js + Nexo num chunk separado: a home não espera o 3D para aparecer.
  const { NexoGuide } = await import('./nexo/NexoGuide');
  const nexo = new NexoGuide({ modelUrl: model });
  const mounted = nexo.mount();
  const ready = Promise.race([mounted, wait(OPENING.nexoTimeoutMs / 1000)]).then(() => {
    if (nexo.mode === 'none') nexo.useFallback();
  });
  const debug = new NexoDebug(nexo);

  let busy = true;
  let opening: gsap.core.Timeline | null = tl;
  let transition: gsap.core.Timeline | null = null;
  let current = initial;
  let closing = false;
  /**
   * Voz ligada nesta sessão. O tour começa SEM voz (texto branco + timer de leitura); o
   * clique no alto-falante liga. Avançar com a voz pausada desliga para as seguintes.
   */
  let voiceOn = false;
  /** Avanço automático agendado (fim da fala + 400 ms). */
  let autoAdvance: gsap.core.Tween | null = null;
  const cancelAutoAdvance = () => {
    autoAdvance?.kill();
    autoAdvance = null;
  };

  // Voz gravada: o player publica grifo, gradiente e boca a cada quadro.
  installAudioUnlock();
  const voice = new VoicePlayer({
    onFrame: (f) => {
      coach.setVoiceProgress(f.progress, f.spoken);
      // Tocando: ícone de pausa. Desligada, pausada ou terminada: alto-falante.
      coach.setVoiceState(f.voice && f.mode === 'playing' ? 'playing' : 'off');
      // Boca: só com voz e palavra ativa; entre palavras, na pausa, no fim e sem voz, sorriso
      // no mesmo quadro.
      nexo.speakLevel(f.voice && f.speaking ? (f.level ?? 'auto') : null);
    },
    onEnd: (id, spoken) => {
      const step = STEPS[current];
      if (busy || closing || !step || step.voice !== id) return;
      cancelAutoAdvance();
      // Etapa de ação: nunca avança sozinha; no fim da fala, o gatilho começa a pulsar.
      if (step.advanceOn === 'action') {
        coach.setActionPulse(true);
        return;
      }
      // Com voz: fim do áudio + 400 ms. Sem voz: o timer já é a espera.
      autoAdvance = gsap.delayedCall(spoken ? AUTO_ADVANCE_DELAY_S : 0, () => {
        autoAdvance = null;
        if (busy || closing || STEPS[current]?.voice !== id) return;
        // Mesma transição do clique em "Próximo" (na última etapa, encerra o tour).
        if (current >= STEPS.length - 1) void finish(true);
        else void go(current, current + 1);
      });
    },
  });
  nexo.useVoice(voice);
  /** Para a fala e zera grifo, gradiente e boca, antes de qualquer outra animação. */
  const silence = () => {
    cancelAutoAdvance();
    voice.stop();
    coach.setVoiceProgress(0, 0);
    nexo.speakLevel(null);
  };

  const coach: Coachmark = new Coachmark({
    steps: STEPS,
    nexoExtents: () => nexo.debugStage?.visibleExtents ?? NEXO_FIGMA_EXTENTS,
    onLayout: (layout, reason) => {
      // Resize: reposiciona sem animar (se estiver voando, o voo é concluído no destino novo).
      if (reason !== 'resize') return;
      nexo.placeAt(center(layout));
      nexo.lookAt(tooltipCenter(layout));
    },
    onNext: (index) => {
      if (busy) return;
      if (index >= STEPS.length - 1) void finish(true);
      else void go(index, index + 1);
    },
    onBack: (index) => {
      if (busy || index <= 0) return;
      void go(index, index - 1);
    },
    onClose: () => void finish(false),
    onAction: (index, el) => {
      if (busy || closing || index !== current) return;
      void runAction(index, el);
    },
    onVoiceToggle: () => {
      if (busy) return;
      // Tocando: pausar vale como desligar (texto branco, anel congelado, sem avanço).
      if (voice.isVoice && voice.state === 'playing') voice.pause();
      else {
        // Sem voz, pausada ou terminada: liga a voz e fala a etapa do início, anel do zero.
        voiceOn = true;
        cancelAutoAdvance();
        coach.setActionPulse(false); // na etapa de ação, volta a pulsar quando a fala acabar
        coach.prepareText(true);
        void voice.enableVoice();
      }
    },
    onVideo: (playing) => {
      const layout = coach.layout;
      if (playing) {
        voice.pause(); // fala ou timer
        void nexo.gesture('idle');
        nexo.setExpression('listen');
        if (layout) nexo.lookAt(tooltipCenter(layout));
      } else {
        nexo.setExpression('smile');
        void nexo.gesture('think');
        // Sem voz, o timer de leitura volta a correr quando o vídeo para.
        if (!voice.isVoice && voice.isPaused) void voice.resume();
      }
    },
  });
  /**
   * Depois da chegada: tooltip e gesto começam juntos; a fala começa quando o tooltip
   * termina de entrar (o Nexo já pousou). O áudio da etapa seguinte é pré-carregado.
   */
  async function present(step: Step, layout: StepLayout): Promise<void> {
    if (closing) return;
    const gesture = step.nexo.gesture;
    void nexo.gesture(gesture, gesture === 'point' ? { target: targetCenter(layout) } : {});
    nexo.lookAt(tooltipCenter(layout));
    debug.setStep(step.id);
    busy = false;
    coach.prepareText(voiceOn);
    await coach.showTooltip();
    if (closing || STEPS[current] !== step) return;
    setState('ready', step.id);
    if (step.advanceOn === 'action' && !voiceOn) {
      // Etapa de ação sem voz: sem timer e sem avanço automático; o gatilho pulsa.
      voice.arm(step.voice);
      coach.setActionPulse(true);
    } else {
      // Timer de leitura (sem voz) ou fala: começa com o tooltip já na tela.
      void voice.start(step.voice, voiceOn);
    }
    const next = STEPS[STEPS.indexOf(step) + 1];
    if (next) voice.preload(next.voice);
    if (step.tooltip.kind === 'preview') coach.startDemo();
    // Thumb em vídeo (etapas 6, 7 e 9): começa com o tooltip já na tela.
    if (step.tooltip.media?.sources) coach.startLoop();
  }

  // ---------- ação da etapa (advanceOn 'action') ----------
  /**
   * O usuário fez a ação da etapa (ex.: clicou no pin): efeito (favorito), feedback de
   * escala no gatilho (0,85 → 1,1 → 1, 250 ms), o ícone voa até o lugar dele na sidebar
   * (500 ms, em arco) e o fluxo avança com a transição normal.
   */
  async function runAction(index: number, el: HTMLElement): Promise<void> {
    const step = STEPS[index];
    if (!step?.action) return;
    busy = true;
    coach.setBusy(true);
    silence();
    step.action.run();
    const reduced = prefersReducedMotion();
    gsap.to(el, {
      keyframes: reduced
        ? [{ scale: 1, duration: 0.25 }]
        : [
            { scale: 0.85, duration: 0 },
            { scale: 1.1, duration: 0.12, ease: 'power2.out' },
            { scale: 1, duration: 0.13, ease: 'power2.inOut' },
          ],
      clearProps: 'transform',
    });
    const dest = step.action.flyTo ? document.querySelector<HTMLElement>(step.action.flyTo) : null;
    if (dest) await flyIcon(el, dest, reduced ? 0.2 : ACTION_FLY_S);
    if (closing || current !== index) return;
    void go(index, index + 1);
  }

  /** Um clone do ícone do destino viaja do gatilho até ele, em arco, acima do overlay. */
  function flyIcon(from: HTMLElement, to: HTMLElement, duration: number): Promise<void> {
    const icon = to.querySelector('img');
    if (!icon) return Promise.resolve();
    // O item acabou de entrar na sidebar (fade); ele só aparece quando o ícone pousa.
    gsap.killTweensOf(to);
    gsap.set(to, { opacity: 0, scale: 1 });
    const a = from.getBoundingClientRect();
    const b = icon.getBoundingClientRect();
    const fly = document.createElement('img');
    fly.src = icon.src;
    fly.alt = '';
    fly.className = 'coach-fly';
    fly.width = b.width;
    fly.height = b.height;
    document.body.append(fly);
    const p0 = { x: a.x + a.width / 2 - b.width / 2, y: a.y + a.height / 2 - b.height / 2 };
    const p2 = { x: b.x, y: b.y };
    const p1 = { x: (p0.x + p2.x) / 2, y: Math.min(p0.y, p2.y) - 90 };
    const st = { t: 0 };
    return gsap
      .to(st, {
        t: 1,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          const u = 1 - st.t;
          const x = u * u * p0.x + 2 * u * st.t * p1.x + st.t * st.t * p2.x;
          const y = u * u * p0.y + 2 * u * st.t * p1.y + st.t * st.t * p2.y;
          fly.style.transform = `translate(${x}px, ${y}px)`;
        },
      })
      .then(() => {
        fly.remove();
        gsap.to(to, { opacity: 1, duration: 0.15, clearProps: 'opacity,transform' });
      })
      .then(() => undefined);
  }

  // ---------- troca de etapa ----------
  /**
   * Troca de etapa, nos dois sentidos (Próximo e Voltar usam a mesma coreografia):
   * tooltip sai → voo até a etapa `to` (com troca de rota por baixo, se mudar) →
   * destaque migra → tooltip entra junto com o gesto.
   */
  async function go(from: number, to: number): Promise<void> {
    const cur = STEPS[from];
    const step = STEPS[to];
    if (!cur || !step || closing) return;
    busy = true;
    current = to;
    setState('transition', step.id);
    // Pausar vale como desligar: a etapa seguinte entra sem voz.
    if (voice.isVoice && voice.isPaused) voiceOn = false;
    silence();
    coach.setBusy(true);
    const cross = cur.route !== step.route;
    const hidden = coach.hideTooltip(cross ? { duration: CROSS_SCREEN.tooltipOut } : {});
    // Entre telas, o destaque apaga junto com o tooltip (a tela vai ficar limpa).
    if (cross) coach.unhighlight(CROSS_SCREEN.highlightOut * 1000);
    // Estado do fluxo da etapa de destino: ao avançar da 3, "Conversas" entra nos
    // favoritos; ao voltar da 4 para a 3, sai (com fade, na sidebar).
    applyFlowState(to);

    let layout: StepLayout;
    if (cross) {
      // Mede a próxima tela numa sonda invisível: o voo precisa do destino já na decolagem.
      const unprobe = router.probe(step.route);
      layout = await coach.goTo(to, { highlight: false });
      unprobe();
    } else {
      layout = await coach.goTo(to, { highlight: false });
    }

    const tl = gsap.timeline();
    transition = tl;
    const stale = () => closing || transition !== tl;
    if (!cross) {
      // O NexoGuide relaxa 100 ms (junto com a saída do tooltip) e então decola.
      const flight = nexo.flyTo(center(layout), { facing: step.nexo.facing });
      tl.call(() => coach.highlight(TARGET_TRANSITION_MS), [], SAME_SCREEN.takeoff);
      await tl.then();
      await hidden;
      await flight; // 'arrived'
    } else {
      const c = CROSS_SCREEN;
      // O voo cobre overlay saindo + tela entrando + tela limpa; chega quando o overlay volta.
      const flight = nexo.flyTo(center(layout), {
        facing: step.nexo.facing,
        duration: c.tooltipOut - NEXO_RELAX + c.overlayOut + c.screenIn + CLEAN_SCREEN_HOLD_S,
      });
      let swapped: Promise<void> = Promise.resolve();
      tl.call(
        () => {
          void coach.dim(0, c.overlayOut, 'power2.inOut');
          // A tela antiga sai junto com o overlay; a nova entra limpa, subindo 12 px.
          swapped = router
            .go(step.route, { out: c.overlayOut, in: c.screenIn, rise: c.rise })
            .then(async () => {
              if (stale()) return;
              layout = await coach.goTo(to, { highlight: false });
            });
        },
        [],
        c.tooltipOut,
      );
      await tl.then();
      await hidden;
      await swapped;
      if (stale()) return;
      await wait(CLEAN_SCREEN_HOLD_S);
      await flight; // 'arrived'
      if (stale()) return;
      // Overlay volta com o destaque da etapa; o tooltip entra quando ele termina.
      coach.highlight(c.overlayIn * 1000);
      await coach.dim(1, c.overlayIn, 'power2.inOut');
    }
    if (closing || transition !== tl) return;
    await present(step, coach.layout ?? layout);
  }

  // ---------- fim (Próximo na última etapa ou Esc) ----------
  async function finish(withGesture: boolean): Promise<void> {
    if (closing) return;
    closing = true;
    busy = true;
    silence();
    setState('closing');
    opening?.kill();
    transition?.kill();
    opening = null;
    transition = null;
    coach.setBusy(true);
    const hidden = coach.hideTooltip();
    if (withGesture) await nexo.gesture('bye');
    const exited = nexo.exit();
    coach.unhighlight(TARGET_TRANSITION_MS);
    await Promise.all([hidden, coach.dim(0, 0.45, 'power2.inOut'), exited]);
    coach.close();
    writeDone();
    setState('closed');
    // Foco no primeiro elemento interativo da página.
    document
      .querySelector<HTMLElement>('.screen a, .screen button, .screen input, .sidebar a')
      ?.focus();
  }

  // ---------- abertura ----------
  coach.open({ dimmed: false });
  let layout = await coach.goTo(initial, { highlight: false });

  // ~900 ms: o Nexo aparece. Se o modelo ainda não carregou, pausa aqui (até 3 s).
  tl.addPause(OPENING.nexoAppear, () => void ready.then(() => tl.resume()));
  tl.call(
    () => {
      // Refaz o layout com a silhueta real do modelo (antes valia a caixa do Figma).
      layout = coach.relayout() ?? layout;
      void nexo.appearAt(center(layout)).then(async () => {
        if (closing) return;
        // Escurecimento, destaque, tooltip e aceno começam juntos.
        void coach.dim(1, OPENING.dimDuration, 'power2.inOut');
        coach.highlight(OPENING.dimDuration * 1000);
        opening = null;
        await present(first, layout);
      });
    },
    [],
    OPENING.nexoAppear + 0.001, // depois da pausa acima, que espera o modelo
  );

  if (params.has('debug')) debug.toggle(true);
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __nexo: { nexo, coach, debug, router, gsap, appState, voice, opening: tl },
    });
  }
}

void start();
