// Gestos do Nexo: movimentos de CORPO INTEIRO (inclinação, giro, deslocamento e
// escala), animados com GSAP sobre `NexoStage.body`. Os braços não se mexem: o GLB
// é uma malha única e o rig procedural foi removido (ver README).
//
// Convenções: tiltZ positivo inclina o topo para a esquerda da tela; tiltX positivo
// inclina o topo para a frente (olha para baixo); yaw positivo gira para a direita.

import { gsap } from 'gsap';
import type { NexoBodyPose } from './NexoStage';
import type { Gesture } from '../coachmark/steps';

export type { Gesture } from '../coachmark/steps';

type PoseTarget = Partial<NexoBodyPose>;

export const REST_POSE: NexoBodyPose = { tiltX: 0, tiltZ: 0, yaw: 0, x: 0, y: 0, scale: 1 };

/** Amplitudes dos gestos (graus / px). */
export const GESTURES = {
  /** Aceno: um balanço leve em Z (±7° → −4° → 0) com pulinho de 4 px, ~500 ms. */
  wave: { tiltZ: 7, back: 4, bob: 4, up: 0.17, over: 0.18, settle: 0.15 },
  /** Apresentar: pequeno recuo (escala 0,95, sobe 4 px) e giro de 14° para o conteúdo. */
  present: { scale: 0.95, y: -4, yaw: 14, tiltX: -5 },
  /** Apontar: inclina ~10° na direção do alvo e avança 8 px para ele. */
  point: { tilt: 10, reach: 8 },
  /** Pensar: inclina 8° de lado e olha um pouco para baixo. */
  think: { tiltZ: 8, tiltX: 6, yaw: -8 },
  /** Tchau: dois balanços em Z, com pulos. */
  bye: { tiltZ: 9, bob: 6, swings: 2, swing: 0.22 },
};

export type GestureOptions = {
  /** Multiplica as amplitudes (movimento reduzido usa 0,5). */
  amplitude?: number;
  /** Para `point`: direção do alvo em px de tela a partir do centro do corpo. */
  toward?: { dx: number; dy: number };
};

function toPose(
  tl: gsap.core.Timeline,
  body: NexoBodyPose,
  target: PoseTarget,
  at: gsap.Position,
  dur: number,
  ease: string,
  amp: number,
) {
  const t = { ...REST_POSE, ...target };
  tl.to(
    body,
    {
      tiltX: t.tiltX * amp,
      tiltZ: t.tiltZ * amp,
      yaw: t.yaw * amp,
      x: t.x * amp,
      y: t.y * amp,
      scale: 1 + (t.scale - 1) * amp,
      duration: dur,
      ease,
    },
    at,
  );
}

/**
 * Timeline de um gesto. Os gestos "de estado" (present, point, think) terminam
 * segurando a pose; wave e bye voltam ao repouso. O rótulo 'done' marca o momento
 * em que o gesto já foi feito (o tooltip pode entrar a partir dali).
 */
export function gestureTimeline(
  body: NexoBodyPose,
  name: Gesture,
  opts: GestureOptions = {},
): gsap.core.Timeline {
  const amp = opts.amplitude ?? 1;
  // Nunca passa do ponto: nada de back/elastic, o corpo só desacelera até a pose.
  const ease = 'power2.out';
  const tl = gsap.timeline();
  switch (name) {
    case 'idle':
      toPose(tl, body, REST_POSE, 0, 0.4, 'power2.inOut', amp);
      break;
    case 'present': {
      const g = GESTURES.present;
      toPose(tl, body, { scale: g.scale, y: g.y, yaw: g.yaw, tiltX: g.tiltX }, 0, 0.45, ease, amp);
      break;
    }
    case 'think': {
      const g = GESTURES.think;
      toPose(tl, body, { tiltZ: g.tiltZ, tiltX: g.tiltX, yaw: g.yaw }, 0, 0.5, ease, amp);
      break;
    }
    case 'point': {
      // Inclina o topo na direção do alvo (alvo à esquerda → tiltZ positivo) e avança um pouco.
      const d = opts.toward ?? { dx: -1, dy: 0 };
      const len = Math.hypot(d.dx, d.dy) || 1;
      const ux = d.dx / len;
      const uy = d.dy / len;
      const g = GESTURES.point;
      toPose(
        tl,
        body,
        {
          tiltZ: -ux * g.tilt,
          tiltX: uy * g.tilt * 0.6,
          yaw: ux * 6,
          x: ux * g.reach,
          y: uy * g.reach,
        },
        0,
        0.45,
        ease,
        amp,
      );
      break;
    }
    case 'wave': {
      const g = GESTURES.wave;
      tl.to(body, { tiltZ: g.tiltZ * amp, y: -g.bob * amp, duration: g.up, ease: 'sine.inOut' });
      tl.to(body, { tiltZ: -g.back * amp, y: 0, duration: g.over, ease: 'sine.inOut' });
      tl.addLabel('done');
      toPose(tl, body, REST_POSE, 'done', g.settle, 'sine.inOut', amp);
      break;
    }
    case 'bye': {
      const g = GESTURES.bye;
      for (let i = 0; i < g.swings; i++) {
        tl.to(body, {
          tiltZ: g.tiltZ * amp,
          y: -g.bob * amp,
          duration: g.swing,
          ease: 'sine.inOut',
        });
        tl.to(body, { tiltZ: -g.tiltZ * amp, y: 0, duration: g.swing, ease: 'sine.inOut' });
      }
      tl.addLabel('done');
      toPose(tl, body, REST_POSE, 'done', 0.25, 'sine.inOut', amp);
      break;
    }
  }
  return tl;
}
