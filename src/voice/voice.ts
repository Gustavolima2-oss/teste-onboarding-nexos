// Voz gravada do Nexo: MP3 por etapa (public/audio/nexo/) + tempos de cada palavra
// (voiceManifest.json, gerado por nexo-voice/build_voices.py).
//
// O VoicePlayer é o relógio de cada etapa, em dois modos:
// - VOZ (padrão): o relógio é `audio.currentTime`, lido a cada quadro (gsap.ticker =
//   requestAnimationFrame), nunca por timers próprios. Publica as palavras já ditas
//   (grifo), a palavra ativa e o volume (boca).
// - TEXTO (pausa do usuário, ou autoplay bloqueado): um relógio interno de
//   max(duração × SILENT_TIMER_FACTOR, SILENT_TIMER_MIN_MS) enche o anel do "Próximo".
//   Texto inteiro em branco, boca parada.
// Em qualquer modo, o fim do relógio chega em `onEnd(id, voice)`; quem decide se avança
// sozinho (só com voz) é o orquestrador.

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

/** Modo texto: o timer dura a fala × este fator (bem mais lento que a fala, para ler)… */
export const SILENT_TIMER_FACTOR = 2.5;
/** …com este mínimo (ms). */
export const SILENT_TIMER_MIN_MS = 6000;

/** Duração do timer de leitura de uma etapa (s). */
export const silentDuration = (clip: VoiceClip): number =>
  Math.max(clip.duration * SILENT_TIMER_FACTOR, SILENT_TIMER_MIN_MS / 1000);

/** Emoji ou pontuação solta: acompanha a palavra anterior e não mexe a boca. */
export const isSymbolToken = (t: string): boolean => !/[\p{L}\p{N}]/u.test(t);

export type VoiceMode = 'idle' | 'playing' | 'paused' | 'ended';

export type VoiceFrame = {
  id: string | null;
  mode: VoiceMode;
  /** true: fala com áudio (grifo e boca); false: timer de leitura (texto todo branco). */
  voice: boolean;
  /** Tempo no relógio da etapa (s). */
  t: number;
  /** 0..1 do anel; só cresce dentro de um modo (congela na pausa, volta a 0 ao ligar a voz). */
  progress: number;
  /** Palavras já acesas (no timer, todas). */
  spoken: number;
  /** Palavra sendo dita agora (currentTime entre start e end), ou −1. */
  active: number;
  /** Há som de fala neste quadro (voz tocando, palavra ativa, não é emoji). */
  speaking: boolean;
  /** Volume 0..1 (AnalyserNode) ou null sem analisador. */
  level: number | null;
};

export type VoicePlayerOptions = {
  onFrame: (f: VoiceFrame) => void;
  /** O relógio da etapa chegou ao fim (fala ou timer). */
  onEnd: (id: string, voice: boolean) => void;
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

/**
 * Qualquer clique ou tecla libera o áudio (política de autoplay), guardado globalmente.
 * O AudioContext NÃO é criado aqui: criá-lo trava a thread principal por centenas de ms
 * (inicialização do áudio) e isso engasgaria o primeiro clique da página. Ele nasce só
 * quando a voz é ligada (enableVoice).
 */
export function installAudioUnlock(): () => void {
  const unlock = () => {
    unlocked = true;
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  // Devolve a remoção (fim do tour).
  return () => {
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
}

export class VoicePlayer {
  private readonly els = new Map<string, HTMLAudioElement>();
  private readonly analysers = new Map<HTMLAudioElement, AnalyserNode>();
  private readonly buf = new Float32Array(1024);
  private clip: VoiceClip | null = null;
  private id: string | null = null;
  private el: HTMLAudioElement | null = null;
  private mode: VoiceMode = 'idle';
  private voice = false;
  /** Relógio do timer: tempo acumulado + início do trecho corrente (ms; 0 = parado). */
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

  /** Fala com áudio (true) ou timer de leitura (false). */
  get isVoice(): boolean {
    return this.voice;
  }

  get state(): VoiceMode {
    return this.mode;
  }

  get element(): HTMLAudioElement | null {
    return this.el;
  }

  /** Último quadro publicado (testes e debug). */
  get lastFrame(): VoiceFrame | null {
    return this.last;
  }

  /** Pré-carrega o áudio de uma etapa (a próxima), mesmo no modo sem voz. */
  preload(id: string): void {
    if (VOICES[id]) this.audioFor(id);
  }

  /**
   * Começa a etapa do zero: com `voice`, toca o áudio; sem, roda o timer de leitura.
   * Se o `play()` for rejeitado, a etapa cai no timer sem quebrar o fluxo.
   */
  async start(id: string, voice: boolean): Promise<void> {
    this.stop();
    const clip = VOICES[id];
    if (!clip) return;
    this.id = id;
    this.clip = clip;
    this.el = this.audioFor(id);
    await this.begin(voice);
  }

  /** Liga a voz na etapa atual (clique no alto-falante): áudio do início, anel do zero. */
  async enableVoice(): Promise<void> {
    if (!this.clip) return;
    unlocked = true;
    const c = ensureContext();
    if (c && c.state === 'suspended') await c.resume().catch(() => undefined);
    this.el?.pause();
    await this.begin(true);
  }

  /**
   * Pausa do usuário na fala: passa ao modo TEXTO. O áudio para, o texto inteiro acende
   * e a boca volta ao padrão; o anel continua de onde estava, no ritmo do modo texto
   * (proporcional ao que falta). Ligar de novo (enableVoice) recomeça a fala do zero.
   */
  toText(): void {
    const clip = this.clip;
    if (!clip || !this.voice) return;
    const p = this.mode === 'ended' ? 1 : this.shown;
    this.token++; // cancela um play() pendente
    this.el?.pause();
    this.voice = false;
    if (this.mode === 'ended') {
      this.emit();
      return;
    }
    const t = p * silentDuration(clip);
    if (this.mode === 'paused') {
      // Aba em segundo plano: continua pausado, já no relógio do modo texto.
      this.pausedAt = t;
      this.clock = { t, since: 0 };
    } else {
      this.mode = 'playing';
      this.clock = { t, since: performance.now() };
      this.startLoop();
    }
    this.emit();
  }

  /** Testes e depuração: leva o relógio da etapa ao fim agora (fala ou timer). */
  skip(): void {
    const clip = this.clip;
    if (!clip || this.mode === 'ended') return;
    if (this.voice && this.el) {
      try {
        this.el.currentTime = clip.duration;
      } catch {
        /* sem metadados ainda */
      }
    } else if (this.mode === 'paused') {
      this.pausedAt = this.span();
    } else {
      this.clock = { t: this.span(), since: performance.now() };
    }
  }

  /** Congela o relógio (aba em segundo plano); `resume()` continua de onde parou. */
  pause(): void {
    if (this.mode !== 'playing') return;
    this.pausedAt = this.time();
    this.mode = 'paused';
    if (this.voice) this.el?.pause();
    else this.clock = { t: this.pausedAt, since: 0 };
    this.emit();
  }

  /** Retoma de onde parou (volta da aba em segundo plano). */
  async resume(): Promise<void> {
    if (this.mode !== 'paused' || !this.clip) return;
    this.hiddenPause = false;
    this.mode = 'playing';
    if (!this.voice) {
      this.clock = { t: this.pausedAt, since: performance.now() };
      return;
    }
    if (!this.el) return;
    const token = this.token;
    try {
      await this.el.play();
    } catch (err) {
      if (token === this.token) this.fallBack(err);
    }
  }

  /** Para tudo na hora e zera anel, grifo e boca (troca de etapa, fim). */
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
    this.voice = false;
    this.hiddenPause = false;
    this.shown = 0;
    this.clock = { t: 0, since: 0 };
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

  private async begin(voice: boolean): Promise<void> {
    const token = ++this.token;
    this.shown = 0;
    this.mode = 'playing';
    this.voice = voice;
    this.clock = { t: 0, since: performance.now() };
    this.startLoop();
    if (!voice || !this.el) {
      this.emit();
      return;
    }
    const el = this.el;
    el.currentTime = 0;
    this.emit();
    try {
      await el.play();
      if (token !== this.token) {
        el.pause();
        return;
      }
      this.connectAnalyser(el);
    } catch (err) {
      if (token === this.token) this.fallBack(err);
    }
  }

  /**
   * `play()` rejeitado (autoplay bloqueado antes da primeira interação): a etapa segue no
   * modo texto, do começo do timer. Não é erro: o primeiro clique libera o áudio.
   */
  private fallBack(err: unknown): void {
    console.info('[Nexo] a voz não pôde tocar; esta etapa segue no modo texto', err);
    this.el?.pause();
    this.voice = false;
    this.shown = 0;
    this.mode = 'playing';
    this.clock = { t: 0, since: performance.now() };
    this.emit();
  }

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

  /** Duração do relógio corrente (fala ou timer). */
  private span(): number {
    if (!this.clip) return 1;
    return this.voice ? this.clip.duration : silentDuration(this.clip);
  }

  private time(): number {
    if (this.mode === 'paused') return this.pausedAt;
    if (!this.voice) {
      return this.clock.since
        ? this.clock.t + (performance.now() - this.clock.since) / 1000
        : this.clock.t;
    }
    return this.el?.currentTime ?? 0;
  }

  private level(): number | null {
    const an = this.el ? this.analysers.get(this.el) : undefined;
    if (!an) return null;
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
        voice: false,
        t: 0,
        progress: 0,
        spoken: 0,
        active: -1,
        speaking: false,
        level: null,
      };
    }
    const span = this.span();
    const t = Math.min(this.time(), span);
    const ended = this.mode === 'ended';
    this.shown = ended ? 1 : Math.max(this.shown, Math.min(1, t / span));
    const base = { id: this.id, mode: this.mode, t, progress: this.shown };
    if (!this.voice || this.mode === 'paused') {
      // Sem voz, ou voz pausada: texto inteiro aceso, boca parada, anel congelado.
      const all = clip.words.length;
      return { ...base, voice: false, spoken: all, active: -1, speaking: false, level: null };
    }
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
      ...base,
      voice: true,
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
    const done = this.voice
      ? !!this.el && (this.el.ended || this.el.currentTime >= this.clip.duration - 0.005)
      : this.time() >= this.span();
    if (done) {
      this.mode = 'ended';
      this.emit();
      this.stopLoop();
      const id = this.id;
      if (id) this.opts.onEnd(id, this.voice);
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

  /** Aba em segundo plano: pausa fala ou timer; ao voltar, retoma (voz: do início da palavra). */
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
