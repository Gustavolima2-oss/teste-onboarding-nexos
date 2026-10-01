// Voz gravada do Nexo: MP3 por etapa (public/audio/nexo/) + tempos de cada palavra
// (voiceManifest.json, gerado por nexo-voice/build_voices.py).
//
// O VoicePlayer conduz a fala de cada etapa, em três modos (VoiceKind):
// - 'voice' (padrão): o relógio é `audio.currentTime`, lido a cada quadro (gsap.ticker =
//   requestAnimationFrame), nunca por timers próprios. Publica as palavras já ditas
//   (grifo), a palavra ativa, o volume (boca) e o progresso (borda do "Próximo").
// - 'text' (o usuário pausou a voz): sem áudio e sem relógio nenhum; texto todo branco.
// - 'armed' (o navegador bloqueou o autoplay): como 'text', mas esperando a primeira
//   interação na página (pointerdown ou keydown) para começar a fala da etapa atual.
// O fim da fala chega em `onEnd(id)`; quem decide se avança é o orquestrador.

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

/** Modo da etapa: fala com áudio, texto (voz pausada pelo usuário) ou voz armada (autoplay bloqueado). */
export type VoiceKind = 'voice' | 'text' | 'armed';
/** Andamento da fala (só no modo 'voice'; nos outros, 'idle'). */
export type VoiceMode = 'idle' | 'playing' | 'paused' | 'ended';

export type VoiceFrame = {
  id: string | null;
  kind: VoiceKind;
  mode: VoiceMode;
  /** true só no modo 'voice' (grifo e boca). */
  voice: boolean;
  /** Tempo da fala (s). */
  t: number;
  /** 0..1 da borda de progresso (só cresce); 0 nos modos 'text' e 'armed'. */
  progress: number;
  /** Palavras já acesas (fora do modo 'voice', todas). */
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
  /** A fala da etapa chegou ao fim (só no modo 'voice'). */
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
  private shown = 0;
  private hiddenPause = false;
  private token = 0;
  private running = false;
  /** Escutando a primeira interação da página (modo 'armed'). */
  private listening = false;
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
   * Começa a etapa: no modo 'voice', toca o áudio do início (se o navegador bloquear,
   * passa a 'armed'); no modo 'text', só publica o texto inteiro.
   */
  async start(id: string, kind: 'voice' | 'text'): Promise<void> {
    this.stop();
    const clip = VOICES[id];
    if (!clip) return;
    this.id = id;
    this.clip = clip;
    this.el = this.audioFor(id);
    if (kind === 'voice') {
      await this.begin();
      return;
    }
    this.kind = 'text';
    this.emit();
  }

  /** Liga a voz na etapa atual (clique no ícone): fala do início, borda do zero. */
  async enableVoice(): Promise<void> {
    if (!this.clip) return;
    unlocked = true;
    const c = ensureContext();
    if (c && c.state === 'suspended') await c.resume().catch(() => undefined);
    await this.begin();
  }

  /**
   * Pausa do usuário na fala: passa ao modo 'text' na hora. O áudio para, o texto inteiro
   * acende, a boca volta ao padrão e a borda some. Religar (enableVoice) recomeça do zero.
   */
  toText(): void {
    if (!this.clip || this.kind !== 'voice') return;
    this.token++; // cancela um play() pendente
    this.el?.pause();
    this.kind = 'text';
    this.mode = 'idle';
    this.hiddenPause = false;
    this.shown = 0;
    this.stopLoop();
    this.emit();
  }

  /** Testes e depuração: leva a fala ao fim agora (só no modo 'voice'). */
  skip(): void {
    const clip = this.clip;
    if (!clip || this.kind !== 'voice' || this.mode === 'ended' || !this.el) return;
    try {
      this.el.currentTime = clip.duration;
    } catch {
      /* sem metadados ainda */
    }
  }

  /** Congela a fala (aba em segundo plano); `resume()` continua de onde parou. */
  pause(): void {
    if (this.kind !== 'voice' || this.mode !== 'playing') return;
    this.mode = 'paused';
    this.el?.pause();
    this.emit();
  }

  /** Retoma de onde parou (volta da aba em segundo plano). */
  async resume(): Promise<void> {
    if (this.kind !== 'voice' || this.mode !== 'paused' || !this.el) return;
    this.hiddenPause = false;
    this.mode = 'playing';
    const token = this.token;
    try {
      await this.el.play();
    } catch (err) {
      if (token === this.token) this.arm(err);
    }
  }

  /** Para tudo na hora e zera borda, grifo e boca (troca de etapa, fim). */
  stop(): void {
    this.token++;
    this.unlisten();
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
    this.unlisten();
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
      if (token === this.token) this.arm(err);
    }
  }

  /**
   * `play()` rejeitado (autoplay bloqueado antes da primeira interação): voz ARMADA. O
   * texto fica inteiro e a etapa espera a primeira interação na página para falar.
   */
  private arm(err: unknown): void {
    console.info('[Nexo] o navegador bloqueou o áudio; a voz começa na primeira interação', err);
    this.el?.pause();
    this.kind = 'armed';
    this.mode = 'idle';
    this.shown = 0;
    this.stopLoop();
    this.emit();
    this.listen();
  }

  /** Escuta a primeira interação (pointerdown e keydown no document; removidos no 1º disparo). */
  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    document.addEventListener('pointerdown', this.onFirstPointer, true);
    document.addEventListener('keydown', this.onFirstKey, true);
  }

  private unlisten(): void {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener('pointerdown', this.onFirstPointer, true);
    document.removeEventListener('keydown', this.onFirstKey, true);
  }

  /**
   * Primeiro clique: a fala começa depois do clique (pointerup + o próprio click), para o
   * clique valer pelo que ele é — no "Próximo" avança (e a etapa seguinte já fala), no
   * ícone liga a voz. Se nada disso aconteceu, a etapa atual fala do início.
   */
  private onFirstPointer = (): void => {
    this.unlisten();
    unlocked = true;
    document.addEventListener('pointerup', this.afterGesture, { capture: true, once: true });
  };

  private onFirstKey = (): void => {
    this.unlisten();
    unlocked = true;
    this.afterGesture();
  };

  private afterGesture = (): void => {
    const id = this.id;
    window.setTimeout(() => {
      if (this.kind === 'armed' && this.id === id && this.clip) void this.begin();
    }, 0);
  };

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
    const base = { id: this.id, kind: this.kind, mode: this.mode };
    if (!clip || this.kind !== 'voice') {
      // Modo texto ou armado: texto inteiro aceso, boca parada, sem borda.
      return {
        ...base,
        voice: false,
        t: 0,
        progress: 0,
        spoken: clip?.words.length ?? 0,
        active: -1,
        speaking: false,
        level: null,
      };
    }
    const t = Math.min(this.el?.currentTime ?? 0, clip.duration);
    this.shown = this.mode === 'ended' ? 1 : Math.max(this.shown, Math.min(1, t / clip.duration));
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
    if (!this.clip || this.kind !== 'voice' || this.mode !== 'playing') {
      this.emit();
      return;
    }
    const el = this.el;
    if (el && (el.ended || el.currentTime >= this.clip.duration - 0.005)) {
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

  /** Aba em segundo plano: pausa a fala; ao voltar, retoma de onde parou. */
  private handleVisibility = (): void => {
    if (document.hidden) {
      if (this.kind === 'voice' && this.mode === 'playing') {
        this.pause();
        this.hiddenPause = true;
      }
    } else if (this.hiddenPause) {
      this.hiddenPause = false;
      void this.resume();
    }
  };
}
