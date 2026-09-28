// Tecla D: sobrepõe o PNG do Figma a 40% na posição da etapa atual e mostra um
// painel com os valores de render e a posição usada (a/b/c). Só para calibração.

import type { NexoGuide } from '../nexo/NexoGuide';
import { PLACEMENT_LETTER } from '../coachmark/placement';
import { resolvedPlacements } from '../coachmark/steps';
import { asset } from '../utils/asset';

/**
 * Caixa do node do PNG no Figma (fase 2: 385×214,87) em relação ao centro do CORPO do
 * robô (a âncora): o corpo fica em (195,3; 84,3) dentro do node. Ver scripts/png-bbox.json.
 */
const FIGMA_NODE = { w: 385, h: 214.87, centerX: 195.3, centerY: 84.33 };
const REFERENCE_OPACITY = 0.4;

export class NexoDebug {
  private readonly img: HTMLImageElement;
  private readonly panel: HTMLPreElement;
  private enabled = false;
  private stepId = '';
  private timer = 0;

  constructor(private readonly nexo: NexoGuide) {
    this.img = document.createElement('img');
    this.img.src = asset('reference/nexo-figma.png');
    this.img.alt = '';
    this.img.className = 'nexo-debug-ref';
    this.img.style.opacity = String(REFERENCE_OPACITY);
    this.panel = document.createElement('pre');
    this.panel.className = 'nexo-debug-panel';
    document.addEventListener('keydown', this.handleKey);
  }

  setStep(id: string): void {
    this.stepId = id;
    this.update();
  }

  toggle(force?: boolean): void {
    this.enabled = force ?? !this.enabled;
    if (this.enabled) {
      document.body.append(this.img, this.panel);
      this.timer = window.setInterval(() => this.update(), 250);
      this.update();
    } else {
      this.img.remove();
      this.panel.remove();
      window.clearInterval(this.timer);
    }
  }

  update(): void {
    if (!this.enabled) return;
    const stage = this.nexo.debugStage;
    if (!stage) return;
    const a = stage.getAnchor();
    this.img.style.left = `${a.x - FIGMA_NODE.centerX}px`;
    this.img.style.top = `${a.y - FIGMA_NODE.centerY}px`;
    const t = stage.tuning;
    const p = resolvedPlacements[this.stepId] ?? {};
    const letter = (v?: keyof typeof PLACEMENT_LETTER) =>
      v ? `${PLACEMENT_LETTER[v]} (${v})` : '—';
    const info = stage.info;
    this.panel.textContent = [
      `etapa        ${this.stepId}`,
      `nexo         ${letter(p.nexo)}`,
      `tooltip      ${letter(p.tooltip)}`,
      `centro       ${a.x.toFixed(1)}, ${a.y.toFixed(1)}`,
      ``,
      `yaw          ${t.yawDeg.toFixed(1)}°`,
      `pitch        ${t.pitchDeg.toFixed(1)}°`,
      `tone mapping ${t.toneMapping}`,
      `exposição    ${t.exposure.toFixed(2)}`,
      `ambiente     ${t.environmentIntensity.toFixed(2)}`,
      `luz princ.   ${t.keyIntensity.toFixed(2)}`,
      `rim light    ${t.rimIntensity.toFixed(2)}`,
      `rugosidade   ${t.roughness.toFixed(2)}`,
      `emissivo     ${t.emissiveIntensity.toFixed(2)}`,
      ``,
      `último quadro ${stage.stats.lastRenderMs.toFixed(2)} ms (CPU)`,
      `draw calls   ${info.calls}  tri ${info.triangles}  tex ${info.textures}`,
    ].join('\n');
  }

  destroy(): void {
    this.toggle(false);
    document.removeEventListener('keydown', this.handleKey);
  }

  private handleKey = (e: KeyboardEvent): void => {
    if (e.key.toLowerCase() !== 'd' || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    this.toggle();
  };
}
