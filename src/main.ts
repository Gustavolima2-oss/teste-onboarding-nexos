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
import { isKeyboardModality } from './utils/inputModality';

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

type State = 'opening' | 'invite' | 'ready' | 'transition' | 'closing' | 'closed' | 'off';
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
/** Centro da mídia do tooltip: onde o Nexo fica na etapa em que entra no vídeo (intoMedia). */
const mediaCenter = (l: StepLayout): Point | null =>
  l.media ? { x: l.media.x + l.media.w / 2, y: l.media.y + l.media.h / 2 } : null;

/**
 * Aplica o estado do fluxo da etapa `index` (derivado de steps.ts): serve para os
 * dois sentidos e para ?step=N. Só mexe nos favoritos que o fluxo controla e na
 * mensagem do Waz (que chega 'new': a Home anima a entrada dela).
 */
const applyFlowState = (index: number) => {
  const { favorites, wazMessage } = flowStateAt(index);
  FLOW_FAVORITES.forEach((id) => appState.setFavorite(id, favorites.has(id)));
  appState.setWazMessage(wazMessage ? (appState.wazMessage ?? 'new') : null);
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
   * O usuário pausou a voz: o tour segue no modo texto (texto branco, borda no tempo do
   * áudio, sem avanço automático) até ele clicar no ícone de som de novo. O tour começa COM
   * voz; se o navegador bloquear o som, um convite "Começar" vem antes da primeira etapa.
   * Dev: ?voice=off começa no modo texto.
   */
  let textMode = import.meta.env.DEV && params.get('voice') === 'off';
  /** Avanço automático agendado (fim da fala + 400 ms). */
  let autoAdvance: gsap.core.Tween | null = null;
  const cancelAutoAdvance = () => {
    autoAdvance?.kill();
    autoAdvance = null;
  };

  // Voz gravada: o player publica grifo, gradiente e boca a cada quadro.
  const uninstallAudioUnlock = installAudioUnlock();
  const voice = new VoicePlayer({
    onFrame: (f) => {
      // Borda de progresso (fala ou timer do modo texto) e grifo (no modo texto, tudo branco).
      coach.setVoiceProgress(f.progress, f.spoken);
      // Ícone: pausa enquanto fala; alto-falante no modo texto.
      coach.setVoiceState(f.kind === 'voice' && f.mode === 'playing' ? 'playing' : 'off');
      // "Próximo": desativado enquanto a borda enche, nos dois modos; ativo quando completa.
      if (f.id) coach.setNextLocked(f.mode !== 'ended');
      // Boca: só com voz e palavra ativa; entre palavras, na pausa, no fim e no modo texto,
      // sorriso no mesmo quadro.
      nexo.speakLevel(f.voice && f.speaking ? (f.level ?? 'auto') : null);
    },
    onEnd: (id, spoken) => {
      const step = STEPS[current];
      if (busy || closing || !step || step.voice !== id) return;
      cancelAutoAdvance();
      // Borda completa: o "Próximo" já foi ativado (onFrame). Avanço automático só no modo
      // com voz, 400 ms depois do fim da fala; nunca no modo texto, na etapa de ação (avança
      // pelo pin) nem na última (o "Finalizar" só é ativado).
      if (!spoken || step.advanceOn === 'action' || current >= STEPS.length - 1) return;
      autoAdvance = gsap.delayedCall(AUTO_ADVANCE_DELAY_S, () => {
        autoAdvance = null;
        if (busy || closing || STEPS[current]?.voice !== id) return;
        // Mesma transição do clique em "Próximo".
        void go(current, current + 1);
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
      nexo.placeAt((nexo.isVanished && mediaCenter(layout)) || center(layout));
      nexo.lookAt(tooltipCenter(layout));
    },
    onNext: (index) => {
      // Só com o "Próximo" liberado (o botão e o clique no alvo já respeitam isso).
      if (busy || coach.isNextLocked) return;
      if (index >= STEPS.length - 1) void finish();
      else void go(index, index + 1);
    },
    onBack: (index) => {
      if (busy || index <= 0) return;
      void go(index, index - 1);
    },
    onAction: (index, el) => {
      if (busy || closing || index !== current) return;
      void runAction(index, el);
    },
    onVoiceToggle: () => {
      if (busy) return;
      if (voice.isVoice && (voice.state === 'playing' || voice.state === 'paused')) {
        // Falando: pausar leva ao modo texto na hora (texto branco, boca no padrão; a borda
        // continua de onde estava, no ritmo do modo texto) nesta etapa e nas seguintes.
        textMode = true;
        voice.toText();
      } else {
        // Modo texto ou fala terminada: religa a voz e fala a etapa do início (texto cinza,
        // borda do zero, "Próximo" desativado até o fim da fala).
        textMode = false;
        cancelAutoAdvance();
        coach.prepareText(true);
        void voice.enableVoice();
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
    coach.prepareText(!textMode);
    // Nos dois modos, o "Próximo" fica desativado até a borda completar.
    coach.setNextLocked(true);
    const shown = coach.showTooltip();
    // O Nexo acabou de entrar no vídeo: ele começa junto com o tooltip.
    if (step.nexo.intoMedia) coach.startLoop();
    await shown;
    if (closing || STEPS[current] !== step) return;
    setState('ready', step.id);
    // A fala (ou o timer do modo texto) começa com o tooltip já na tela.
    void voice.start(step.voice, textMode ? 'text' : 'voice');
    // Etapa de ação: o pin ganha o destaque assim que o tooltip entra (até o clique).
    if (step.advanceOn === 'action') coach.setActionPulse(true);
    const next = STEPS[STEPS.indexOf(step) + 1];
    if (next) voice.preload(next.voice);
    if (step.tooltip.kind === 'preview') coach.startDemo();
    // Vídeo em loop (última etapa): garante que começou.
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

    /**
     * Voo do Nexo até a etapa: para dentro da mídia (intoMedia: o vídeo já o mostra), de
     * dentro dela (voltando dessa etapa) ou o voo normal.
     */
    const moveNexo = (duration?: number): Promise<void> => {
      // Entrar e sair do vídeo levam sempre ~700 ms (VANISH), mesmo entre telas.
      const media = step.nexo.intoMedia ? mediaCenter(layout) : null;
      if (media) return nexo.vanishInto(media);
      if (nexo.isVanished) return nexo.emergeTo(center(layout), { facing: step.nexo.facing });
      return nexo.flyTo(center(layout), { facing: step.nexo.facing, duration });
    };

    const tl = gsap.timeline();
    transition = tl;
    const stale = () => closing || transition !== tl;
    if (!cross) {
      // O NexoGuide relaxa 100 ms (junto com a saída do tooltip) e então decola.
      const flight = moveNexo();
      tl.call(() => coach.highlight(TARGET_TRANSITION_MS), [], SAME_SCREEN.takeoff);
      await tl.then();
      await hidden;
      await flight; // 'arrived'
    } else {
      const c = CROSS_SCREEN;
      // O voo cobre overlay saindo + tela entrando + tela limpa; chega quando o overlay volta.
      const flight = moveNexo(
        c.tooltipOut - NEXO_RELAX + c.overlayOut + c.screenIn + CLEAN_SCREEN_HOLD_S,
      );
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

  // ---------- fim ("Finalizar" da última etapa, na Home: a única saída) ----------
  /**
   * Encerra o tour: o tooltip sai, o Nexo voa para fora e o overlay some. A Home fica
   * limpa, só com a mensagem do Waz (Figma 2631:3583): destaques e trava de rolagem saem
   * (coach.close), o Nexo é destruído (canvas, GPU, voz e listeners) e o foco vai para o
   * primeiro elemento interativo da tela.
   */
  async function finish(): Promise<void> {
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
    // Com o Nexo dentro do vídeo (última etapa), sem tchau nem voo de saída.
    if (!nexo.isVanished) await nexo.gesture('bye');
    const exited = nexo.exit();
    coach.unhighlight(TARGET_TRANSITION_MS);
    await Promise.all([hidden, coach.dim(0, 0.45, 'power2.inOut'), exited]);
    // Anel de foco só se a pessoa vinha usando o teclado (lido antes do close, que desliga o
    // rastreio): com o mouse, a Home fica limpa como no Figma 2631:3583.
    const keyboard = isKeyboardModality();
    coach.close();
    // A mensagem do Waz fica na Home depois do fim (já vista: sem animar de novo).
    if (appState.wazMessage) appState.setWazMessage('shown');
    nexo.destroy();
    debug.destroy();
    uninstallAudioUnlock();
    writeDone();
    setState('closed');
    delete document.documentElement.dataset.coachStep;
    // Foco no primeiro elemento interativo da tela (ou da sidebar, se a tela não tiver).
    const focusable = 'a[href], button:not([disabled]), input, select, textarea';
    (
      document.querySelector<HTMLElement>(`.screen :is(${focusable})`) ??
      document.querySelector<HTMLElement>(`.sidebar :is(${focusable})`)
    )?.focus({ focusVisible: keyboard });
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
      // Aberta direto numa etapa intoMedia (?step=9): o Nexo já começa dentro do vídeo.
      const media = first.nexo.intoMedia ? mediaCenter(layout) : null;
      const arrived = media
        ? nexo.vanishInto(media, { animate: false })
        : nexo.appearAt(center(layout));
      void arrived.then(async () => {
        if (closing) return;
        // O navegador deixa tocar som? (teste em silêncio). Se não, convite "Começar" antes
        // da primeira etapa: o clique libera o áudio e a etapa entra já falando.
        if (!textMode && !(await voice.canPlay(first.voice))) {
          if (closing) return;
          setState('invite', first.id);
          void coach.dim(1, OPENING.dimDuration, 'power2.inOut');
          nexo.lookAt({ x: layout.tooltip.x + 100, y: layout.tooltip.y + 50 });
          await coach.showInvite({ x: layout.tooltip.x, y: layout.tooltip.y });
          await voice.unlock();
          if (closing) return;
          setState('opening', first.id);
          coach.highlight(OPENING.dimDuration * 1000);
          opening = null;
          await present(first, coach.layout ?? layout);
          return;
        }
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
