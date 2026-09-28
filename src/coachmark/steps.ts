// Configuração das etapas do onboarding (fase 2). Medidas do Figma
// HYM49734BUPEwZfnNLLDY4, seção 2350:2826, sempre relativas: tooltip → alvo,
// Nexo → tooltip. Os textos são os do Figma (negritos em <strong>).
//
// Navegação nos dois sentidos: "Próximo" (→, Enter, ou clique no alvo quando ele é
// um item de navegação: targetClickAdvances) e "Voltar" (←, a partir da etapa 2).
// Quando a etapa muda de tela, a tela nova entra limpa, sem overlay, e fica assim por
// CLEAN_SCREEN_HOLD_S antes do overlay voltar (ver main.ts). O estado do fluxo não é acumulado: é DERIVADO da etapa (flowStateAt),
// a partir dos efeitos declarados em `completes`. Assim, voltar desfaz exatamente o
// que o avanço fez (ex.: voltar da 4 para a 3 tira "Conversas" dos favoritos).

import type { Placement } from './placement';
import type { Route } from '../app/router';
import { asset } from '../utils/asset';

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
   * O alvo é um item de navegação: clicar nele avança o fluxo, como o "Próximo"
   * (cursor pointer e hover no alvo). Nos outros alvos, o clique não navega.
   */
  targetClickAdvances: boolean;
  tooltip: {
    kind: 'text' | 'preview' | 'video';
    title: string;
    /** Parágrafos (HTML simples: <strong>). */
    paragraphs: string[];
    placement: 'right' | 'left' | 'top' | 'bottom';
    /**
     * Posição do tooltip medida no Figma, relativa ao alvo:
     * right → a partir do canto superior DIREITO do alvo;
     * bottom → a partir do canto inferior ESQUERDO do alvo.
     */
    offset: { x: number; y: number };
    media?: { poster: string; caption?: string; src?: string };
  };
  nexo: {
    /**
     * Centro do CORPO do Nexo relativo ao tooltip: x a partir da borda direita,
     * y a partir do centro vertical (scripts/png-bbox.json).
     */
    offset: { x: number; y: number };
    facing: 'left' | 'right';
    gesture: Gesture;
    /** Texto falado (narração e duração da fala). */
    speech: string;
  };
  /**
   * Efeitos de ter passado por esta etapa, valendo da etapa seguinte em diante.
   * Voltar para esta etapa (ou antes) desfaz o efeito.
   */
  completes?: { favorite?: string };
};

const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

const step = (s: Omit<Step, 'nexo'> & { nexo: Omit<Step['nexo'], 'speech'> }): Step => ({
  ...s,
  nexo: { ...s.nexo, speech: `${s.tooltip.title}. ${s.tooltip.paragraphs.map(plain).join(' ')}` },
});

export const STEPS: Step[] = [
  step({
    // 2350:2871 — alvo 2350:2998 (16,124 32×32); tooltip 2350:2975 (80,77 378×163); Nexo 2350:2993.
    id: 'ferramentas',
    route: '/home',
    target: '[data-coach="nav-ferramentas"]',
    highlight: 'circle',
    targetClickAdvances: true,
    tooltip: {
      kind: 'text',
      title: 'Ferramentas',
      paragraphs: ['É aqui que ficam os módulos e ferramentas disponíveis.'],
      placement: 'right',
      offset: { x: 32, y: -47 },
    },
    nexo: { offset: { x: 127.3, y: -9.1 }, facing: 'left', gesture: 'wave' },
  }),
  step({
    // 2350:45423 — chips 2350:46065 (556,136 859×34); tooltip 2350:46084 (1040,203 378×243).
    id: 'chips',
    route: '/ferramentas',
    target: '[data-coach="ferramentas-chips"]',
    highlight: 'none',
    targetClickAdvances: false,
    tooltip: {
      kind: 'text',
      title: 'Ferramentas',
      paragraphs: [
        'Cada uma é um módulo que cuida de uma parte do seu negócio. Conforme você expande seu time, dá pra contratar outros agentes (jurídico, financeiro, RH…).',
        'Vamos focar no <strong>Waz</strong> por hora, seu agente de <strong>Vendas &amp; Atendimento</strong>.',
      ],
      placement: 'bottom',
      offset: { x: 484, y: 33 },
    },
    nexo: { offset: { x: 159.3, y: -52.1 }, facing: 'left', gesture: 'present' },
  }),
  step({
    // 2350:46104 — card 2350:46746 (555,265 417×341); tooltip rico 2350:46910 (1004,264 378×425).
    id: 'conversas',
    route: '/ferramentas',
    target: '[data-coach="card-conversas"]',
    highlight: 'card',
    targetClickAdvances: false,
    tooltip: {
      kind: 'preview',
      title: 'Conversas',
      paragraphs: [
        'A ferramenta de conversas é por onde você consegue visualizar os leads que chegam e o Waz realiza os atendimentos.',
        'Vamos deixar ela favoritada? Assim ela fica de fácil acesso para quando você precisar.',
      ],
      placement: 'right',
      offset: { x: 32, y: -0.84 },
    },
    nexo: { offset: { x: 163.3, y: -58.3 }, facing: 'left', gesture: 'point' },
    // Ao sair de "Conversas", a ferramenta fica favoritada (aparece na sidebar, alvo da 4).
    completes: { favorite: 'conversas' },
  }),
  step({
    // 2350:50099 — favorito 2350:50482 (13,283 36×36); tooltip 2350:50511 (100,227 378×163).
    id: 'favoritas',
    route: '/ferramentas',
    target: '[data-coach="nav-fav-conversas"]',
    highlight: 'circle',
    targetClickAdvances: true,
    tooltip: {
      kind: 'text',
      title: 'Ferramentas Favoritas',
      paragraphs: [
        'Quando você favorita uma ferramenta, ela fica disponível aqui na barra lateral e na sua homepage.',
      ],
      placement: 'right',
      offset: { x: 51, y: -56 },
    },
    nexo: { offset: { x: 163.3, y: -28.1 }, facing: 'left', gesture: 'point' },
  }),
  step({
    // 2350:50882 — alvo 2350:51244 (16,162 32×32); tooltip 2350:51247 (93,96 378×163).
    id: 'seu-negocio',
    route: '/ferramentas',
    target: '[data-coach="nav-seu-negocio"]',
    highlight: 'circle',
    targetClickAdvances: true,
    tooltip: {
      kind: 'text',
      title: 'Seu Negócio',
      paragraphs: ['As informações do seu negócio ficam todas separadas aqui neste item.'],
      placement: 'right',
      offset: { x: 45, y: -66 },
    },
    nexo: { offset: { x: 130.3, y: -18.1 }, facing: 'left', gesture: 'point' },
  }),
  step({
    // 2350:51269 — cards 2350:51273 (700,485 520×200); tooltip com vídeo 2350:51480 (1242,367 378×441).
    id: 'negocio-cards',
    route: '/seu-negocio',
    target: '[data-coach="negocio-cards"]',
    highlight: 'card',
    targetClickAdvances: false,
    tooltip: {
      kind: 'video',
      title: 'Seu Negócio',
      paragraphs: [
        'Em Seu Negócio fica tudo que seu time atender bem: a <strong>Base de conhecimento</strong> (de onde saem as respostas), seus <strong>Produtos e Serviços</strong> e as <strong>Integrações.</strong>',
        'Tudo que montamos juntos tá aqui, e é só editar quando precisar.',
      ],
      placement: 'right',
      offset: { x: 22, y: -118 },
      media: {
        poster: asset('images/onboarding/video-poster.jpg'),
        caption: 'Você terminou o treinamento inicial do seu time!',
        src: asset('video/seu-negocio.webm'),
      },
    },
    nexo: { offset: { x: 133.3, y: -52.1 }, facing: 'left', gesture: 'think' },
  }),
  step({
    // 2350:51560 — avatar do Waz 2350:51731 (16,222 32×32); tooltip 2350:51760 (70,160 378×179).
    id: 'waz',
    route: '/seu-negocio',
    target: '[data-coach="nav-waz"]',
    highlight: 'none',
    targetClickAdvances: false,
    tooltip: {
      kind: 'text',
      title: 'Agora é com o Waz!',
      paragraphs: ['Kauê, o Waz vai te ajudar a seguir daqui em diante!', 'Nos vemos em breve.'],
      placement: 'right',
      offset: { x: 22, y: -62 },
    },
    nexo: { offset: { x: 163.3, y: -23.1 }, facing: 'left', gesture: 'wave' },
  }),
];

export type FlowState = { favorites: Set<string> };

/** Todos os favoritos que o fluxo controla (os demais são do usuário e não mudam). */
export const FLOW_FAVORITES: string[] = STEPS.flatMap((s) =>
  s.completes?.favorite ? [s.completes.favorite] : [],
);

/** Estado do fluxo ao ESTAR na etapa `index`: efeitos de todas as etapas anteriores. */
export function flowStateAt(index: number): FlowState {
  const favorites = new Set<string>();
  STEPS.slice(0, Math.max(index, 0)).forEach((s) => {
    if (s.completes?.favorite) favorites.add(s.completes.favorite);
  });
  return { favorites };
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
