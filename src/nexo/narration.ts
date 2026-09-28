// Narração: Web Speech API (voz pt-BR quando houver) e bipes curtos de robô
// (WebAudio, ondas quadradas), só com a narração ligada. Preferência em localStorage.

const PREF_KEY = 'onboarding:narration';
/** Bipes: 2–3 tons, 30–50 ms, volume baixo (ver README: reduzidos para não irritar). */
export const BEEP = {
  tones: [520, 660, 780],
  ms: [30, 50] as [number, number],
  gain: 0.025,
  every: 3,
};

export type SpeakHandlers = { onStart?: () => void; onWord?: () => void; onEnd?: () => void };

export class Narrator {
  private ctx: AudioContext | null = null;
  private wordCount = 0;
  private current: SpeechSynthesisUtterance | null = null;

  static get supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /** Há alguma voz? (algumas plataformas não têm vozes instaladas) */
  static hasVoice(): boolean {
    return Narrator.supported && window.speechSynthesis.getVoices().length > 0;
  }

  /** Espera as vozes carregarem (Chrome carrega assíncrono). */
  static async ready(timeoutMs = 1500): Promise<boolean> {
    if (!Narrator.supported) return false;
    if (Narrator.hasVoice()) return true;
    return new Promise((resolve) => {
      const done = () => resolve(Narrator.hasVoice());
      window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      window.setTimeout(done, timeoutMs);
    });
  }

  static get enabled(): boolean {
    try {
      return localStorage.getItem(PREF_KEY) === 'on';
    } catch {
      return false;
    }
  }

  static set enabled(on: boolean) {
    try {
      localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
    } catch {
      /* sem storage: vale só nesta sessão */
    }
  }

  speak(text: string, h: SpeakHandlers = {}, rate = 1.05): Promise<void> {
    this.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((v) => v.lang === 'pt-BR') ?? voices.find((v) => v.lang.startsWith('pt'));
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? 'pt-BR';
      u.rate = rate;
      u.pitch = 1.15;
      this.wordCount = 0;
      u.onstart = () => h.onStart?.();
      u.onboundary = (e) => {
        if (e.name !== 'word') return;
        h.onWord?.();
        if (this.wordCount++ % BEEP.every === 0) this.beep();
      };
      const end = () => {
        if (this.current !== u) return;
        this.current = null;
        h.onEnd?.();
        resolve();
      };
      u.onend = end;
      u.onerror = end;
      this.current = u;
      window.speechSynthesis.speak(u);
    });
  }

  cancel(): void {
    if (!Narrator.supported) return;
    const u = this.current;
    this.current = null;
    window.speechSynthesis.cancel();
    u?.onend?.call(u, new Event('end') as SpeechSynthesisEvent);
  }

  dispose(): void {
    this.cancel();
    void this.ctx?.close();
    this.ctx = null;
  }

  private beep(): void {
    try {
      this.ctx ??= new AudioContext();
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = BEEP.tones[Math.floor(Math.random() * BEEP.tones.length)] ?? 600;
      const dur = (BEEP.ms[0] + Math.random() * (BEEP.ms[1] - BEEP.ms[0])) / 1000;
      g.gain.setValueAtTime(BEEP.gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      /* sem áudio: segue sem bipes */
    }
  }
}
