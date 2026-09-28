// Trajetória e física do voo do Nexo. Funções puras (sem DOM nem three.js).

import type { Point } from './NexoStage';

/** Parâmetros do voo. Sem antecipação nem overshoot: o movimento é contínuo. */
export const FLIGHT = {
  /** Duração do voo na mesma tela (s). Entre telas, o orquestrador passa uma mais longa. */
  duration: 0.85,
  /** Pontos de controle levantados em fração da distância (arco, nunca linha reta). */
  arcLift: 0.18,
  /** Banking máximo (graus), proporcional à velocidade horizontal. */
  maxBankDeg: 8,
  /** Giro extra de yaw na direção do movimento (graus), no meio do voo. */
  yawTurnDeg: 40,
  /** Escala no meio do voo (sensação de distância); volta a 1 na chegada, sem passar. */
  depthScale: 0.9,
};

/** power2.inOut e a sua derivada (progresso do voo a partir do tempo linear 0..1). */
export function easeInOut2(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}
export function easeInOut2Rate(t: number): number {
  return t < 0.5 ? 4 * t : 4 * (1 - t);
}

export type Arc = {
  from: Point;
  to: Point;
  c1: Point;
  c2: Point;
  /** Distância em linha reta (px). */
  distance: number;
  /** Sinal do deslocamento horizontal: −1 para a esquerda, 1 para a direita. */
  dirX: -1 | 1;
};

/** Bézier cúbica entre origem e destino, com os pontos de controle levantados (y para cima). */
export function makeArc(from: Point, to: Point, lift = FLIGHT.arcLift): Arc {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const up = lift * distance;
  return {
    from,
    to,
    c1: { x: from.x + dx / 3, y: from.y + dy / 3 - up },
    c2: { x: from.x + (2 * dx) / 3, y: from.y + (2 * dy) / 3 - up },
    distance,
    dirX: dx < 0 ? -1 : 1,
  };
}

export function arcPoint(a: Arc, t: number): Point {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * a.from.x + b1 * a.c1.x + b2 * a.c2.x + b3 * a.to.x,
    y: b0 * a.from.y + b1 * a.c1.y + b2 * a.c2.y + b3 * a.to.y,
  };
}

/** Derivada da curva em relação a t (px por unidade de t). */
export function arcTangent(a: Arc, t: number): Point {
  const u = 1 - t;
  return {
    x:
      3 * u * u * (a.c1.x - a.from.x) +
      6 * u * t * (a.c2.x - a.c1.x) +
      3 * t * t * (a.to.x - a.c2.x),
    y:
      3 * u * u * (a.c1.y - a.from.y) +
      6 * u * t * (a.c2.y - a.c1.y) +
      3 * t * t * (a.to.y - a.c2.y),
  };
}

/**
 * Banking (graus, rotação em Z) a partir da velocidade horizontal (px/s), calculada
 * analiticamente (tangente × derivada do easing), sem ruído de tempo de quadro. Normaliza pela velocidade de pico de um voo com
 * power2.inOut (≈ 2× a média) e limita a ±maxBank. Indo para a direita, o topo
 * inclina para a direita (rotação negativa em Z no three.js).
 */
export function bankFromVelocity(vx: number, distance: number, duration: number): number {
  const peak = (2 * Math.max(distance, 1)) / duration;
  const n = Math.max(-1, Math.min(1, vx / peak));
  return -n * FLIGHT.maxBankDeg;
}

/** Envelope 0 → 1 → 0 ao longo do voo (pico no meio). */
export function midFlight(p: number): number {
  return Math.sin(Math.PI * Math.min(Math.max(p, 0), 1));
}
