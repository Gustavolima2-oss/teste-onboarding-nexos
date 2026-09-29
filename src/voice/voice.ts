// Voz gravada do Nexo: MP3 por etapa (public/audio/nexo/) + tempos de cada palavra
// (voiceManifest.json, gerado por nexo-voice/build_voices.py).
//
// O VoicePlayer é o relógio da fala. A cada quadro (gsap.ticker = requestAnimationFrame)
// ele lê `audio.currentTime` — nunca timers próprios — e publica um VoiceFrame:
// progresso (gradiente do "Próximo"), palavras já faladas (grifo), palavra ativa e
// nível de volume (boca). Sem permissão de autoplay, roda em MODO SILENCIOSO: um relógio
// interno com os mesmos tempos do manifesto, até o usuário ligar o som.

import { gsap } from 'gsap';
import manifest from './voiceManifest.json';
import { asset } from '../utils/asset';

export type VoiceWord = { text: string; start: number; end: number };
export type VoiceClip = {
  audio: string;
  text: string;
  duration: number;
  method: string;
  words: VoiceWord[];
};
export const VOICES: Record<string, VoiceClip> = manifest;

/** Emoji ou pontuação solta: acompanha a palavra anterior e não mexe a boca. */
export const isSymbolToken = (t: string): boolean => !/[\p{L}\p{N}]/u.test(t);

export type VoiceMode = 'idle' | 'playing' | 'paused' | 'ended';

export type VoiceFrame = {
  id: string | null;
  mode: VoiceMode;
  /** Sem permissão de áudio: relógio interno, sem som. */
  silent: boolean;
  /** Tempo da fala (s). */
  t: number;
  /** 0..1, só cresce dentro de uma fala (retomar volta ao início da palavra, o botão não). */
  progress: number;
  /** Quantas palavras já começaram (grifo progressivo). */
  spoken: number;
  /** Palavra sendo dita agora (currentTime entre start e end), ou −1. */
  active: number;
  /** Há som de fala neste quadro (palavra ativa, tocando, não é emoji). */
  speaking: boolean;
  /** Volume 0..1 (AnalyserNode) ou null sem analisador (modo silencioso / sem WebAudio). */
  level: number | null;
};

export type VoicePlayerOptions = {
  onFrame: (f: VoiceFrame) => void;
  /** A fala chegou ao fim (100%). */
  onEnd: (id: string) => void;
};

/** Usuário já interagiu com a página: o áudio pode tocar nas etapas seguintes. */
let unlocked = false;
let ctx: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Qualquer clique ou tecla libera o áudio (política de autoplay), guardado globalmente. */
export function installAudioUnlock(): void {
  const unlock = () => {
    unlocked = true;
    const c = ensureContext();
    if (c && c.state === 'suspended') void c.resume();
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}

export const audioUnlocked = (): boolean => unlocked;

export class VoicePlayer {
  private readonly els = new Map<string, HTMLAudioElement>();
  private readonly analysers = new Map<HTMLAudioElement, AnalyserNode>();
  private readonly buf = new Float32Array(1024);
  private clip: VoiceClip | null = null;
  private id: string | null = null;
  private el: HTMLAudioElement | null = null;
  private mode: VoiceMode = 'idle';
  private silent = false;
  /** Relógio do modo silencioso: tempo acumulado + início do trecho corrente (ms). */
  private clock = { t: 0, since: 0 };
  private shown = 0;
  private pausedAt = 0;
  private hiddenPause = false;
  private token = 0;
  private running = false;
  private last: VoiceFrame | null = null;

  constructor(private readonly opts: VoicePlayerOptions) {
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  get currentId(): string | null {
    return this.id;
  }

  get isPaused(): boolean {
    return this.mode === 'paused';
  }

  get isSilent(): boolean {
    return this.silent;
  }

  get element(): HTMLAudioElement | null {
    return this.el;
  }

  /** Último quadro publicado (testes e debug). */
  get lastFrame(): VoiceFrame | null {
    return this.last;
  }

  /** Pré-carrega o áudio de uma etapa (a próxima), para a fala começar sem atraso. */
  preload(id: string): void {
    if (VOICES[id]) this.audioFor(id);
  }

  /** Começa a fala da etapa do início. Sem permissão de autoplay, entra no modo silencioso. */
  async play(id: string): Promise<void> {
    this.stop();
    const clip = VOICES[id];
    if (!clip) return;
    const token = ++this.token;
    this.id = id;
    this.clip = clip;
    this.shown = 0;
    this.mode = 'playing';
    const el = this.audioFor(id);
    this.el = el;
    el.currentTime = 0;
    this.silent = false;
    this.startLoop();
    try {
      await el.play();
      if (token !== this.token) {
        el.pause();
        return;
      }
      this.connectAnalyser(el);
    } catch {
      if (token !== this.token) return;
      // Autoplay bloqueado: grifo, gradiente e boca seguem por um relógio interno.
      this.silent = true;
      this.clock = { t: 0, since: performance.now() };
    }
  }

  /** Pausa: o áudio para, o gradiente congela e a palavra que estava sendo dita fica grifada. */
  pause(): void {
    if (this.mode !== 'playing') return;
    this.pausedAt = this.time();
    this.mode = 'paused';
    if (this.silent) this.clock = { t: this.pausedAt, since: 0 };
    else this.el?.pause();
    this.emit();
  }

  /** Retoma do INÍCIO da palavra em que parou (a frase não volta picotada). */
  async resume(): Promise<void> {
    if (this.mode !== 'paused' || !this.clip) return;
    const at = this.wordStartAt(this.pausedAt);
    this.mode = 'playing';
    this.hiddenPause = false;
    if (this.silent) {
      this.clock = { t: at, since: performance.now() };
      return;
    }
    if (this.el) {
      this.el.currentTime = at;
      try {
        await this.el.play();
      } catch {
        this.goSilent(at);
      }
    }
  }

  /** Modo silencioso → som (clique do usuário no alto-falante), a partir da palavra atual. */
  async enableSound(): Promise<void> {
    if (!this.silent || !this.el || !this.clip) return;
    unlocked = true;
    const c = ensureContext();
    if (c && c.state === 'suspended') await c.resume().catch(() => undefined);
    const at = this.wordStartAt(this.time());
    const wasPaused = this.mode === 'paused';
    this.el.currentTime = at;
    try {
      this.silent = false;
      if (!wasPaused) await this.el.play();
      else this.pausedAt = at;
      this.connectAnalyser(this.el);
    } catch {
      this.goSilent(at);
    }
  }

  /** Para a fala na hora e zera grifo, gradiente e boca (troca de etapa, Esc). */
  stop(): void {
    this.token++;
    if (this.el) {
      this.el.pause();
      try {
        this.el.currentTime = 0;
      } catch {
        /* sem metadados ainda */
      }
    }
    const had = this.id !== null;
    this.el = null;
    this.clip = null;
    this.id = null;
    this.mode = 'idle';
    this.silent = false;
    this.hiddenPause = false;
    this.shown = 0;
    this.stopLoop();
    if (had) this.emit();
  }

  /** Para e descarrega os áudios e fecha o AudioContext. */
  destroy(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    for (const el of this.els.values()) {
      el.removeAttribute('src');
      el.load();
    }
    this.els.clear();
    this.analysers.clear();
    if (ctx) {
      void ctx.close();
      ctx = null;
    }
  }

  // ---------- interno ----------

  private audioFor(id: string): HTMLAudioElement {
    let el = this.els.get(id);
    const clip = VOICES[id];
    if (!el && clip) {
      el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.src = asset(clip.audio);
      el.load();
      this.els.set(id, el);
    }
    return el ?? new Audio();
  }

  /**
   * Liga o elemento ao AnalyserNode. Só com o AudioContext rodando: um elemento ligado a
   * um contexto suspenso fica mudo (e a ligação não pode ser desfeita).
   */
  private connectAnalyser(el: HTMLAudioElement): void {
    if (this.analysers.has(el) || !unlocked) return;
    const c = ensureContext();
    if (!c || c.state !== 'running') return;
    try {
      const src = c.createMediaElementSource(el);
      const an = c.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      an.connect(c.destination);
      this.analysers.set(el, an);
    } catch {
      /* já ligado ou sem suporte: a boca usa o padrão pseudoaleatório */
    }
  }

  private goSilent(at: number): void {
    this.silent = true;
    this.clock = { t: at, since: this.mode === 'playing' ? performance.now() : 0 };
    if (this.mode === 'paused') this.pausedAt = at;
  }

  private time(): number {
    if (this.mode === 'paused') return this.pausedAt;
    if (this.silent) {
      return this.clock.since
        ? this.clock.t + (performance.now() - this.clock.since) / 1000
        : this.clock.t;
    }
    return this.el?.currentTime ?? 0;
  }

  /** Início da palavra em curso em `t` (a última que já começou). */
  private wordStartAt(t: number): number {
    const words = this.clip?.words ?? [];
    let at = 0;
    for (const w of words) {
      if (w.start <= t + 1e-3) at = w.start;
      else break;
    }
    return at;
  }

  private level(): number | null {
    const an = this.el ? this.analysers.get(this.el) : undefined;
    if (!an || this.silent) return null;
    an.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.buf.length) * 4);
  }

  private frame(): VoiceFrame {
    const clip = this.clip;
    if (!clip) {
      return {
        id: null,
        mode: 'idle',
        silent: false,
        t: 0,
        progress: 0,
        spoken: 0,
        active: -1,
        speaking: false,
        level: null,
      };
    }
    const t = Math.min(this.time(), clip.duration);
    const ended = this.mode === 'ended';
    this.shown = ended ? 1 : Math.max(this.shown, Math.min(1, t / clip.duration));
    let spoken = 0;
    let active = -1;
    clip.words.forEach((w, i) => {
      if (w.start <= t) spoken = i + 1;
      if (t >= w.start && t < w.end) active = i;
    });
    // Emoji e pontuação soltos acendem junto com a palavra anterior.
    while (spoken < clip.words.length && isSymbolToken(clip.words[spoken]?.text ?? '')) {
      if (spoken === 0 || (clip.words[spoken - 1]?.start ?? Infinity) > t) break;
      spoken++;
    }
    const playing = this.mode === 'playing';
    const word = active >= 0 ? clip.words[active] : undefined;
    const speaking = playing && !!word && !isSymbolToken(word.text);
    return {
      id: this.id,
      mode: this.mode,
      silent: this.silent,
      t,
      progress: this.shown,
      spoken,
      active: playing ? active : -1,
      speaking,
      level: speaking ? this.level() : null,
    };
  }

  private emit(): void {
    this.last = this.frame();
    this.opts.onFrame(this.last);
  }

  private tick = (): void => {
    if (!this.clip || this.mode !== 'playing') {
      this.emit();
      return;
    }
    const done = this.silent
      ? this.time() >= this.clip.duration
      : !!this.el && (this.el.ended || this.el.currentTime >= this.clip.duration - 0.005);
    if (done) {
      this.mode = 'ended';
      this.emit();
      this.stopLoop();
      const id = this.id;
      if (id) this.opts.onEnd(id);
      return;
    }
    this.emit();
  };

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    // Prioridade: roda antes do render do Nexo, no mesmo quadro (boca troca na hora).
    gsap.ticker.add(this.tick, false, true);
  }

  private stopLoop(): void {
    if (!this.running) return;
    this.running = false;
    gsap.ticker.remove(this.tick);
  }

  private handleVisibility = (): void => {
    if (document.hidden) {
      if (this.mode === 'playing') {
        this.pause();
        this.hiddenPause = true;
      }
    } else if (this.hiddenPause) {
      this.hiddenPause = false;
      void this.resume();
    }
  };
}
