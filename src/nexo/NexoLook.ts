// Olhar do Nexo seguindo o mouse: o corpo gira em yaw/pitch (limitado a ±28° e
// ±16° a partir da pose da etapa) e os olhos se deslocam antes, na mesma direção.
// A pose base da etapa já está virada para o tooltip; por isso o ângulo é medido
// RELATIVO à direção do ponto de descanso (tooltip): olhar para ele = pose base.
// Suavização exponencial por dt (constante de tempo ~120 ms). Mouse parado por
// 2 s ou fora da janela: volta a olhar para o ponto de descanso (o tooltip) em ~600 ms.

import type { NexoStage, Point } from './NexoStage';

export const LOOK = {
  maxYawDeg: 28,
  maxPitchDeg: 16,
  /** Distância "de profundidade" (px) usada para converter deslocamento em ângulo. */
  depthPx: 520,
  tauMs: 120,
  /** Os olhos chegam antes do corpo. */
  eyesTauMs: 60,
  /** Volta ao ponto de descanso (~600 ms para assentar ≈ 3 τ). */
  returnTauMs: 200,
  idleMs: 2000,
};

export class NexoLook {
  enabled = false;
  /** Congelado: não mexe no olhar (outra animação é dona do yaw/pitch). */
  frozen = false;
  /** 0,5 enquanto fala. */
  amplitude = 1;
  private mouse: Point | null = null;
  private lastMove = 0;
  private rest: Point | null = null;
  private eyes = { x: 0, y: 0 };
  private readonly remove: () => void;

  constructor(private readonly stage: NexoStage) {
    this.remove = stage.addTicker((dt, now) => this.tick(dt, now));
    window.addEventListener('pointermove', this.onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('blur', this.onLeave);
  }

  /** Ponto para onde olhar quando o mouse está parado (tooltip). null = frente. */
  setRest(p: Point | null): void {
    this.rest = p;
  }

  /** Zera o olhar na hora (voo, saída). */
  reset(): void {
    this.stage.look.yaw = 0;
    this.stage.look.pitch = 0;
    this.eyes = { x: 0, y: 0 };
    this.stage.face.setLook(0, 0);
  }

  dispose(): void {
    this.remove();
    window.removeEventListener('pointermove', this.onMove);
    document.documentElement.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('blur', this.onLeave);
  }

  private onMove = (e: PointerEvent): void => {
    this.mouse = { x: e.clientX, y: e.clientY };
    this.lastMove = performance.now();
  };

  private onLeave = (): void => {
    this.mouse = null;
  };

  private tick(dt: number, now: number): void {
    if (this.frozen) return;
    const look = this.stage.look;
    if (!this.enabled) {
      // Solta suavemente para a frente.
      if (Math.abs(look.yaw) + Math.abs(look.pitch) > 0.01)
        this.approach(0, 0, 0, 0, dt, LOOK.returnTauMs);
      return;
    }
    const moving = this.mouse && now - this.lastMove < LOOK.idleMs;
    const target = moving ? this.mouse : this.rest;
    const tau = moving ? LOOK.tauMs : LOOK.returnTauMs;
    const a = this.stage.getAnchor();
    const angles = (p: Point | null) => {
      if (!p) return { yaw: 0, pitch: 0 };
      return {
        yaw: (Math.atan2(p.x - a.x, LOOK.depthPx) * 180) / Math.PI,
        pitch: (Math.atan2(p.y - a.y, LOOK.depthPx) * 180) / Math.PI,
      };
    };
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    const base = angles(this.rest);
    const want = angles(target);
    const yaw = clamp(want.yaw - base.yaw, LOOK.maxYawDeg) * this.amplitude;
    const pitch = clamp(want.pitch - base.pitch, LOOK.maxPitchDeg) * this.amplitude;
    const ex = yaw / LOOK.maxYawDeg;
    const ey = pitch / LOOK.maxPitchDeg;
    // O corpo gira na direção do alvo; yaw é multiplicado pelo lado (facing) no palco.
    this.approach(yaw * this.stage.facing, pitch, ex, ey, dt, tau);
  }

  private approach(
    yaw: number,
    pitch: number,
    ex: number,
    ey: number,
    dt: number,
    tau: number,
  ): void {
    const look = this.stage.look;
    const k = 1 - Math.exp(-dt / tau);
    const ke = 1 - Math.exp(-dt / Math.min(tau, LOOK.eyesTauMs));
    look.yaw += (yaw - look.yaw) * k;
    look.pitch += (pitch - look.pitch) * k;
    if (Math.abs(yaw - look.yaw) < 0.005) look.yaw = yaw;
    if (Math.abs(pitch - look.pitch) < 0.005) look.pitch = pitch;
    this.eyes.x += (ex - this.eyes.x) * ke;
    this.eyes.y += (ey - this.eyes.y) * ke;
    this.stage.face.setLook(this.eyes.x, this.eyes.y);
  }
}
