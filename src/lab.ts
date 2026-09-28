// Laboratório do Nexo (dev): só o robô, centralizado, para validar gestos,
// rosto e olhar. Controle pelo console: __lab.gesture('wave'), __lab.face('talk'),
// __lab.look(0.5, -0.2). Usado pelos scripts de captura dos gestos.
import './styles/tokens.css';
import './styles/nexo.css';
import { gsap } from 'gsap';
import { NexoGuide } from './nexo/NexoGuide';
import { gestureTimeline, type Gesture } from './nexo/gestures';
import type { FaceExpression } from './nexo/NexoFace';

const model = new URLSearchParams(location.search).get('model') ?? undefined;
const nexo = new NexoGuide({ modelUrl: model });
void nexo.mount().then(async () => {
  await nexo.appearAt({ x: innerWidth / 2, y: innerHeight / 2 });
  const stage = nexo.debugStage;
  if (!stage) return;
  Object.assign(window, {
    __lab: {
      nexo,
      stage,
      gsap,
      ready: true,
      gesture: (g: Gesture, toward?: { dx: number; dy: number }) =>
        gestureTimeline(stage.body, g, { toward }).then(),
      face: (e: FaceExpression) => stage.face.setExpression(e),
      look: (x: number, y: number) => stage.face.setLook(x, y),
    },
  });
});
