// Configuração das 9 etapas do onboarding. Figma HYM49734BUPEwZfnNLLDY4, seção
// 2350:2826 (frames 2350:2871 … 2483:6244) e a última etapa na Home (2631:3475). Medidas
// sempre relativas: tooltip → alvo, Nexo → tooltip.
//
// O texto de cada tooltip vem do manifesto da voz gravada (src/voice/voiceManifest.json,
// gerado por nexo-voice/build_voices.py): tela e marcações de tempo usam a MESMA divisão
// por espaços, uma palavra por <span>, para o grifo casar com a fala.
//
// Navegação nos dois sentidos: "Próximo" (→, Enter, clique no alvo quando ele é um item
// de navegação: advanceOn 'target', ou o fim da fala no modo com voz) e "Voltar" (←). A etapa 3
// avança só pela ação do usuário (advanceOn 'action': favoritar pelo pin do card). O
// estado do fluxo é DERIVADO da etapa (flowStateAt), a partir dos efeitos em
// `completes`: voltar desfaz exatamente o que o avanço fez.

import type { Placement } from './placement';
import type { Route } from '../app/router';
import { VOICES } from '../voice/voice';
import { appState } from '../app/state';

export type { Route } from '../app/router';

export type Gesture = 'wave' | 'present' | 'point' | 'think' | 'bye' | 'idle';

export type Step = {
  id: string;
  route: Route;
  /** Seletor do alvo, ou vários (grupo que sobe junto acima do overlay). */
  target: string | string[];
  /**
   * Visual do destaque: 'circle' (fundo branco circular, itens da sidebar),
   * 'card' (card elevado), 'row' (linha elevada) ou 'none' (só fica nítido,
   * acima do overlay, sem mudar o visual).
   */
  highlight: 'circle' | 'card' | 'row' | 'none';
  /**
   * Como a etapa avança:
   * - 'next': "Próximo", →/Enter ou o fim da fala (modo com voz);
   * - 'target': também pelo clique no alvo (item de navegação: cursor pointer e hover);
   * - 'action': SÓ por uma ação do usuário (`action`): sem "Próximo" e sem
   *   avanço automático. Nos outros alvos, o clique não navega.
   */
  advanceOn: 'next' | 'target' | 'action';
  /** Com advanceOn 'action': o elemento que dispara a ação e o efeito dela. */
  action?: {
    selector: string;
    /** Rótulo acessível (e do mini tooltip no hover). */
    label: string;
    hint: string;
    run: () => void;
    /** Para onde o ícone voa depois da ação (o item recém-criado na sidebar). */
    flyTo?: string;
  };
  /** Fala gravada da etapa (chave do voiceManifest.json): áudio, texto e tempos. */
  voice: string;
  /** Texto do tooltip (= texto do manifesto, sem título; uma frase na maioria). */
  text: string;
  tooltip: {
    /** 'text' | 'preview' (demo do cursor) | 'image'. */
    kind: 'text' | 'preview' | 'image';
    placement: 'right' | 'left' | 'top' | 'bottom';
    /**
     * Posição do tooltip medida no Figma, relativa ao alvo:
     * right → a partir do canto superior DIREITO do alvo;
     * bottom → a partir do canto inferior ESQUERDO do alvo.
     */
    offset: { x: number; y: number };
    /** Mídia 378×210 no topo do tooltip. */
    media?: {
      poster: string;
      alt: string;
    };
  };
  nexo: {
    /**
     * Centro do CORPO do Nexo relativo ao tooltip: x a partir da borda direita,
     * y a partir do centro vertical. No Figma o corpo fica a (195,3; 84,33) do canto
     * do PNG de 385×214,87.
     */
    offset: { x: number; y: number };
    facing: 'left' | 'right';
    gesture: Gesture;
  };
  /**
   * Efeitos de ter passado por esta etapa, valendo da etapa seguinte em diante.
   * Voltar para esta etapa (ou antes) desfaz o efeito.
   */
  completes?: { favorite?: string };
  /**
   * Efeitos que valem a partir desta etapa (inclusive). Voltar para antes dela desfaz.
   * `wazMessage`: a mensagem do Waz (e a bolinha de não lida) na linha dele na Home.
   */
  shows?: { wazMessage?: boolean };
};

const step = (s: Omit<Step, 'text'>): Step => {
  const clip = VOICES[s.voice];
  if (!clip) throw new Error(`steps.ts: voz ${s.voice} fora do voiceManifest.json`);
  return { ...s, text: clip.text };
};

export const STEPS: Step[] = [
  step({
    // 2350:2871 — alvo 2350:2998 (16,124 32×32); tooltip 2483:5619 (67,90 378×143); Nexo 2350:2993 (380,65).
    id: 'ferramentas',
    route: '/home',
    target: '[data-coach="nav-ferramentas"]',
    highlight: 'circle',
    advanceOn: 'target',
    voice: 'step-01-ferramentas',
    tooltip: { kind: 'text', placement: 'right', offset: { x: 19, y: -34 } },
    nexo: { offset: { x: 130.3, y: -12.1 }, facing: 'left', gesture: 'wave' },
  }),
  step({
    // 2350:45423 — chips 2350:46065 (556,136 859×34); tooltip 2483:5683 (1061,208 378×181); Nexo (1382,188).
    id: 'agentes',
    route: '/ferramentas',
    target: '[data-coach="ferramentas-chips"]',
    highlight: 'none',
    advanceOn: 'next',
    voice: 'step-02-agentes',
    tooltip: { kind: 'text', placement: 'bottom', offset: { x: 505, y: 38 } },
    nexo: { offset: { x: 138.3, y: -26.2 }, facing: 'left', gesture: 'present' },
  }),
  step({
    // 2350:46104 — card 2350:46746 (555,265 417×341); tooltip com prévia 2483:5708 (1009,265 378×417); Nexo (1330,244).
    id: 'conversas',
    route: '/ferramentas',
    target: '[data-coach="card-conversas"]',
    highlight: 'card',
    // Avança favoritando: o pin do card é o gatilho (sem "Próximo"), em qualquer modo.
    advanceOn: 'action',
    action: {
      selector: '[data-coach="fav-conversas"]',
      label: 'Fixar Conversas no menu',
      hint: 'Fixar no menu',
      run: () => appState.setFavorite('conversas', true),
      flyTo: '[data-coach="nav-fav-conversas"]',
    },
    voice: 'step-03-conversas',
    tooltip: { kind: 'preview', placement: 'right', offset: { x: 37, y: 0 } },
    nexo: { offset: { x: 138.3, y: -145.2 }, facing: 'left', gesture: 'point' },
    // Ao sair de "Conversas", a ferramenta fica favoritada (aparece na sidebar, alvo da 4).
    completes: { favorite: 'conversas' },
  }),
  step({
    // 2350:50099 — favorito 2350:50482 (13,283 36×36); tooltip 2350:50511 (100,227 378×138); Nexo (446,196).
    id: 'favoritas',
    route: '/ferramentas',
    target: '[data-coach="nav-fav-conversas"]',
    highlight: 'circle',
    advanceOn: 'target',
    voice: 'step-04-favoritas',
    tooltip: { kind: 'text', placement: 'right', offset: { x: 51, y: -56 } },
    nexo: { offset: { x: 163.3, y: -15.7 }, facing: 'left', gesture: 'point' },
  }),
  step({
    // 2350:50882 — alvo 2350:51244 (16,162 32×32); tooltip 2483:5733 (71,108 378×162); Nexo (406,75).
    id: 'seu-negocio',
    route: '/ferramentas',
    target: '[data-coach="nav-seu-negocio"]',
    highlight: 'circle',
    advanceOn: 'target',
    voice: 'step-05-seu-negocio',
    tooltip: { kind: 'text', placement: 'right', offset: { x: 23, y: -54 } },
    nexo: { offset: { x: 152.3, y: -29.7 }, facing: 'left', gesture: 'point' },
  }),
  step({
    // 2350:51269 — card 2350:51461 (700,485 168×200). Tooltip só de texto (o vídeo saiu),
    // no mesmo formato da etapa 8: 15 px abaixo do topo do card; Nexo como na 8.
    id: 'base',
    route: '/seu-negocio',
    target: '[data-coach="card-base"]',
    highlight: 'none',
    advanceOn: 'next',
    voice: 'step-06-base',
    tooltip: { kind: 'text', placement: 'right', offset: { x: 22, y: 15 } },
    nexo: { offset: { x: 133.3, y: -36.7 }, facing: 'left', gesture: 'think' },
  }),
  step({
    // 2483:6066 — card 2483:6146 (876,485 168×200). Tooltip só de texto, como na etapa 6.
    // O Figma traz "Seus catálogo … ficam aqui"; o texto correto (e gravado) é o do manifesto.
    id: 'produtos',
    route: '/seu-negocio',
    target: '[data-coach="card-produtos"]',
    highlight: 'none',
    advanceOn: 'next',
    voice: 'step-07-produtos',
    tooltip: { kind: 'text', placement: 'right', offset: { x: 16, y: 15 } },
    nexo: { offset: { x: 138.3, y: -36.7 }, facing: 'left', gesture: 'point' },
  }),
  step({
    // 2483:6244 — card 2483:6324 (1052,485 168×200); tooltip 2483:6342 (1240,500 378×162); Nexo (1551,460).
    id: 'integracoes',
    route: '/seu-negocio',
    target: '[data-coach="card-integracoes"]',
    highlight: 'none',
    advanceOn: 'next',
    voice: 'step-08-integracoes',
    tooltip: { kind: 'text', placement: 'right', offset: { x: 20, y: 15 } },
    nexo: { offset: { x: 128.3, y: -36.7 }, facing: 'left', gesture: 'point' },
  }),
  step({
    // Figma 2631:3475 (1920×1080) — alvo: linha do Waz em "Seu time" 2631:3541 (508,325 832×96,
    // card branco com a mensagem); tooltip 2631:3557 (962,444 378×~201, texto em 4 linhas):
    // abaixo do card, alinhado à direita (454 = 962 − 508; 23 = 444 − 421); Nexo 2631:3555:
    // corpo em (1500,3; 521,3), 160,3 px à direita do tooltip e 23,4 px acima do centro dele.
    id: 'waz',
    route: '/home',
    target: '[data-coach="member-waz"]',
    highlight: 'none',
    advanceOn: 'next',
    voice: 'step-09-waz',
    tooltip: { kind: 'text', placement: 'bottom', offset: { x: 454, y: 23 } },
    nexo: { offset: { x: 160.3, y: -23.4 }, facing: 'left', gesture: 'wave' },
    // A Home mostra a mensagem do Waz a partir desta etapa (e ela fica depois do fim).
    shows: { wazMessage: true },
  }),
];

export type FlowState = { favorites: Set<string>; wazMessage: boolean };

/** Todos os favoritos que o fluxo controla (os demais são do usuário e não mudam). */
export const FLOW_FAVORITES: string[] = STEPS.flatMap((s) =>
  s.completes?.favorite ? [s.completes.favorite] : [],
);

/**
 * Estado do fluxo ao ESTAR na etapa `index`: efeitos (`completes`) de todas as etapas
 * anteriores e o que as etapas até ela mostram (`shows`).
 */
export function flowStateAt(index: number): FlowState {
  const favorites = new Set<string>();
  STEPS.slice(0, Math.max(index, 0)).forEach((s) => {
    if (s.completes?.favorite) favorites.add(s.completes.favorite);
  });
  const wazMessage = STEPS.slice(0, Math.max(index, 0) + 1).some((s) => s.shows?.wazMessage);
  return { favorites, wazMessage };
}

/** Distância entre a base do Nexo e o topo do tooltip na posição de fallback "top". */
export const NEXO_TOP_GAP = 8;
/**
 * Caixa visível do Nexo (com braços) relativa ao centro do corpo, no PNG do Figma
 * (385×215). Vale até o modelo carregar; depois vale a silhueta real do render.
 */
export const NEXO_FIGMA_EXTENTS = { left: -101.9, right: 80.4, top: -48.6, bottom: 100.4 };
/** Folga horizontal da silhueta do Nexo para os gestos de corpo (inclinação e avanço em "point"). */
export const NEXO_GESTURE_MARGIN = 24;
/** Folga em volta do alvo destacado ao testar colisões do Nexo. */
export const TARGET_AVOID_PADDING = 12;
/** Distância entre o tooltip e o alvo na posição de fallback "top". */
export const TOOLTIP_TOP_GAP = 12;

/** Posição usada em cada etapa (right/bottom → top → clamped). A tecla D mostra estes valores. */
export const resolvedPlacements: Record<string, { tooltip?: Placement; nexo?: Placement }> = {};
