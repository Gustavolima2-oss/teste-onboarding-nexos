// Voz gravada do Nexo: MP3 por etapa (public/audio/nexo/) + tempos de cada palavra
// (voiceManifest.json, gerado por nexo-voice/build_voices.py).
//
// O VoicePlayer conduz cada etapa em dois modos (VoiceKind):
// - 'voice' (padrão): o relógio é `audio.currentTime`, lido a cada quadro (gsap.ticker =
//   requestAnimationFrame), nunca por timers próprios. Publica as palavras já ditas
//   (grifo), a palavra ativa, o volume (boca) e o progresso (borda do "Próximo").
// - 'text' (voz pausada pelo usuário, ou play() recusado): texto todo branco e um relógio
//   interno de duração do áudio × TEXT_MODE_TIMER_FACTOR enchendo a mesma borda.
// O fim do relógio chega em `onEnd(id, voice)`; quem decide se avança é o orquestrador
// (só no modo com voz). Antes do tour, `canPlay` testa em silêncio se o navegador deixa
// tocar som (autoplay); se não deixar, o orquestrador mostra o convite "Começar".

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

/**
 * Boca: nível = min(1, RMS × MOUTH_GAIN), em janelas de 1024 amostras do AnalyserNode.
 * Calibrado para a voz final (RMS mediano das palavras ≈ 0,03, p90 ≈ 0,09): com 10, os
 * cinco degraus da boca são usados de forma quase uniforme e só ~6% das janelas saturam.
 */
export const MOUTH_GAIN = 10;

/** Emoji ou pontuação solta: acompanha a palavra anterior e não mexe a boca. */
export const isSymbolToken = (t: string): boolean => !/[\p{L}\p{N}]/u.test(t);

/**
 * Modo texto: a borda do "Próximo" enche em duração do áudio × este fator (1,0 = no tempo
 * da fala). Ajuste aqui.
 */
export const TEXT_MODE_TIMER_FACTOR = 1.0;

/** Duração do relógio do modo texto de uma etapa (s). */
export const textDuration = (clip: VoiceClip): number => clip.duration * TEXT_MODE_TIMER_FACTOR;

/** Modo da etapa: fala com áudio ou texto (voz pausada pelo usuário ou play() recusado). */
export type VoiceKind = 'voice' | 'text';
/** Andamento do relógio da etapa (fala ou timer do modo texto). */
export type VoiceMode = 'idle' | 'playing' | 'paused' | 'ended';

export type VoiceFrame = {
  id: string | null;
  kind: VoiceKind;
  mode: VoiceMode;
  /** true só no modo 'voice' (grifo e boca). */
  voice: boolean;
  /** Tempo no relógio da etapa (s). */
  t: number;
  /** 0..1 da borda de progresso; só cresce (pausar continua de onde estava). */
  progress: number;
  /** Palavras já acesas (no modo texto, todas). */
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
  /** O relógio da etapa chegou ao fim (fala ou timer do modo texto). */
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
  private kind: VoiceKind = 'text';
  private mode: VoiceMode = 'idle';
  /** Relógio do modo texto: tempo acumulado + início do trecho corrente (ms; 0 = parado). */
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

  /** Modo da etapa atual. */
  get currentKind(): VoiceKind {
    return this.kind;
  }

  get isPaused(): boolean {
    return this.mode === 'paused';
  }

  /** Fala com áudio (modo 'voice'). */
  get isVoice(): boolean {
    return this.kind === 'voice';
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

  /** Pré-carrega o áudio de uma etapa (a próxima), em qualquer modo. */
  preload(id: string): void {
    if (VOICES[id]) this.audioFor(id);
  }

  /**
   * O navegador deixa tocar som agora? Toca o áudio da etapa em volume 0 e para na hora
   * (nada se ouve). false = autoplay bloqueado: o orquestrador mostra o convite "Começar".
   */
  async canPlay(id: string): Promise<boolean> {
    if (!VOICES[id]) return false;
    const el = this.audioFor(id);
    const volume = el.volume;
    el.volume = 0;
    try {
      await el.play();
      el.pause();
      el.currentTime = 0;
      return true;
    } catch {
      return false;
    } finally {
      el.volume = volume;
    }
  }

  /** Libera o áudio a partir de um gesto do usuário (clique em "Começar"). */
  async unlock(): Promise<void> {
    unlocked = true;
    const c = ensureContext();
    if (c && c.state === 'suspended') await c.resume().catch(() => undefined);
  }

  /** Começa a etapa do zero: com voz, toca o áudio; no modo texto, roda o relógio. */
  async start(id: string, kind: VoiceKind): Promise<void> {
    this.stop();
    const clip = VOICES[id];
    if (!clip) return;
    this.id = id;
    this.clip = clip;
    this.el = this.audioFor(id);
    if (kind === 'voice') await this.begin();
    else this.beginText(0);
  }

  /** Liga a voz na etapa atual (clique no ícone): fala do início, borda do zero. */
  async enableVoice(): Promise<void> {
    if (!this.clip) return;
    await this.unlock();
    await this.begin();
  }

  /**
   * Pausa do usuário na fala: passa ao modo texto na hora. O áudio para, o texto inteiro
   * acende e a boca volta ao padrão; a borda continua de onde estava, no ritmo do modo
   * texto (proporcional ao que falta). Religar (enableVoice) recomeça a fala do zero.
   */
  toText(): void {
    const clip = this.clip;
    if (!clip || this.kind !== 'voice') return;
    this.token++; // cancela um play() pendente
    this.el?.pause();
    if (this.mode === 'ended') {
      this.kind = 'text';
      this.emit();
      return;
    }
    const wasPaused = this.mode === 'paused';
    this.beginText(this.shown * textDuration(clip), wasPaused);
  }

  /** Testes e depuração: leva o relógio da etapa ao fim agora (fala ou timer). */
  skip(): void {
    const clip = this.clip;
    if (!clip || this.mode === 'ended') return;
    if (this.kind === 'voice') {
      if (!this.el) return;
      try {
        this.el.currentTime = clip.duration;
      } catch {
        /* sem metadados ainda */
      }
    } else if (this.mode === 'paused') {
      this.pausedAt = textDuration(clip);
    } else {
      this.clock = { t: textDuration(clip), since: performance.now() };
    }
  }

  /** Congela o relógio (aba em segundo plano); `resume()` continua de onde parou. */
  pause(): void {
    if (this.mode !== 'playing') return;
    this.pausedAt = this.time();
    this.mode = 'paused';
    if (this.kind === 'voice') this.el?.pause();
    else this.clock = { t: this.pausedAt, since: 0 };
    this.emit();
  }

  /** Retoma de onde parou (volta da aba em segundo plano). */
  async resume(): Promise<void> {
    if (this.mode !== 'paused' || !this.clip) return;
    this.hiddenPause = false;
    this.mode = 'playing';
    if (this.kind === 'text') {
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

  /** Para tudo na hora e zera borda, grifo e boca (troca de etapa, fim). */
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
    this.kind = 'text';
    this.mode = 'idle';
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

  /** Fala da etapa atual do início (modo 'voice'). */
  private async begin(): Promise<void> {
    const token = ++this.token;
    this.shown = 0;
    this.kind = 'voice';
    this.mode = 'playing';
    this.hiddenPause = false;
    const el = this.el;
    if (!el) return;
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      /* sem metadados ainda */
    }
    this.startLoop();
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

  /** Modo texto a partir de `t` segundos do relógio (0 = do começo). */
  private beginText(t: number, paused = false): void {
    this.kind = 'text';
    this.hiddenPause = false;
    if (paused) {
      this.mode = 'paused';
      this.pausedAt = t;
      this.clock = { t, since: 0 };
    } else {
      this.mode = 'playing';
      this.clock = { t, since: performance.now() };
      this.startLoop();
    }
    this.emit();
  }

  /** `play()` recusado mesmo assim: a etapa segue no modo texto, do começo do relógio. */
  private fallBack(err: unknown): void {
    console.info('[Nexo] a voz não pôde tocar; esta etapa segue no modo texto', err);
    this.el?.pause();
    this.shown = 0;
    this.beginText(0);
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

  /** Duração do relógio corrente (fala ou timer do modo texto). */
  private span(): number {
    if (!this.clip) return 1;
    return this.kind === 'voice' ? this.clip.duration : textDuration(this.clip);
  }

  private time(): number {
    if (this.mode === 'paused') return this.pausedAt;
    if (this.kind === 'text') {
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
    return Math.min(1, Math.sqrt(sum / this.buf.length) * MOUTH_GAIN);
  }

  private frame(): VoiceFrame {
    const clip = this.clip;
    const base = { id: this.id, kind: this.kind, mode: this.mode };
    if (!clip) {
      return {
        ...base,
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
    this.shown = this.mode === 'ended' ? 1 : Math.max(this.shown, Math.min(1, t / span));
    if (this.kind === 'text') {
      // Modo texto: texto inteiro aceso, boca parada; a borda segue o relógio.
      const all = clip.words.length;
      return {
        ...base,
        voice: false,
        t,
        progress: this.shown,
        spoken: all,
        active: -1,
        speaking: false,
        level: null,
      };
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
    const el = this.el;
    const done =
      this.kind === 'voice'
        ? !!el && (el.ended || el.currentTime >= this.clip.duration - 0.005)
        : this.time() >= this.span();
    if (done) {
      this.mode = 'ended';
      this.emit();
      this.stopLoop();
      const id = this.id;
      if (id) this.opts.onEnd(id, this.kind === 'voice');
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

  /** Aba em segundo plano: pausa a fala ou o relógio; ao voltar, retoma de onde parou. */
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
