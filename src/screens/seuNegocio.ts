// Tela Seu negócio (Figma 2350:51269 / 2350:51560): perfil da empresa, atalhos
// (Base de conhecimento, Produtos e Serviços, Integrações) e Métricas.

import type { Screen } from './types';
import { asset } from '../utils/asset';

const img = (name: string) => asset(`images/seu-negocio/${name}`);

interface Shortcut {
  coach: string;
  icon: string;
  /** Linhas do rótulo como no Figma (quebra manual). */
  lines: string[];
}

const SHORTCUTS: Shortcut[] = [
  { coach: 'card-base', icon: 'icon-brain.svg', lines: ['Base de', 'conhecimento'] },
  { coach: 'card-produtos', icon: 'icon-shopping-cart.svg', lines: ['Produtos', 'e Serviços'] },
  { coach: 'card-integracoes', icon: 'icon-puzzle.svg', lines: ['Integrações'] },
];

type Trend = 'up' | 'down';

interface Metric {
  kind: 'leads' | 'vendas' | 'funil' | 'lojas';
  value: string;
  label: string;
  trend?: Trend;
}

const METRICS: Metric[] = [
  { kind: 'leads', value: '78', label: 'Leads atendidos', trend: 'up' },
  { kind: 'vendas', value: 'R$ 1.400,80', label: 'Vendas Geradas' },
  { kind: 'funil', value: '78', label: 'Leads atendidos' },
  { kind: 'lojas', value: 'R$ 1.400,80', label: 'Vendas Geradas', trend: 'down' },
];

const TREND_LABEL: Record<Trend, string> = { up: 'Em alta', down: 'Em queda' };

const metricIcon = (kind: Metric['kind']) => {
  switch (kind) {
    case 'leads':
      return `
        <span class="metric-icon metric-icon--leads" aria-hidden="true">
          <img class="metric-user-head" src="${img('metric-user-head.svg')}" alt="" />
          <img class="metric-user-body" src="${img('metric-user-body.svg')}" alt="" />
        </span>`;
    case 'vendas':
      return `<img class="metric-icon metric-icon--vendas" src="${img('metric-money.svg')}" alt="" />`;
    case 'funil':
      return `<img class="metric-icon metric-icon--funil" src="${img('metric-funnel.svg')}" alt="" />`;
    case 'lojas':
      return `<img class="metric-icon metric-icon--lojas" src="${img('metric-buildings.svg')}" alt="" />`;
  }
};

const trendBadge = (trend: Trend) => `
  <span class="metric-trend metric-trend--${trend}" role="img" aria-label="${TREND_LABEL[trend]}">
    <img class="metric-trend-bg" src="${img(`badge-${trend}-bg.svg`)}" alt="" />
    <img class="metric-trend-arrow" src="${img(`badge-${trend}-path.svg`)}" alt="" />
  </span>`;

export function createSeuNegocio(): Screen {
  return {
    title: 'Seu negócio',
    mount(root) {
      root.innerHTML = `
        <main class="seu-negocio">
          <span class="negocio-arc" aria-hidden="true"><img src="${img('arc-bg.svg')}" alt="" /></span>
          <header class="negocio-header">
            <h1 class="negocio-title">Seu negócio</h1>
          </header>
          <div class="negocio-body">
            <section class="negocio-profile" aria-label="Perfil do negócio" data-enter>
              <span class="profile-avatar">
                <img class="profile-avatar-img" src="${img('avatar-donut.png')}" alt="" />
              </span>
              <div class="profile-text">
                <h2 class="profile-name">Donuts do K</h2>
                <p class="profile-address">R. Porto Martins, 427</p>
              </div>
            </section>
            <ul class="negocio-cards" aria-label="Configurações do negócio" data-coach="negocio-cards" data-enter>
              ${SHORTCUTS.map(
                (s) => `
                <li>
                  <button type="button" class="negocio-card" data-coach="${s.coach}">
                    <span class="negocio-card-icon"><img src="${img(s.icon)}" alt="" /></span>
                    <span class="negocio-card-label">${s.lines.map((l) => `<span>${l}</span>`).join('')}</span>
                  </button>
                </li>`,
              ).join('')}
            </ul>
            <section class="metrics" aria-labelledby="metrics-title" data-enter>
              <h2 id="metrics-title" class="metrics-title">Métricas</h2>
              <ul class="metric-list">
                ${METRICS.map(
                  (m) => `
                  <li class="metric metric--${m.kind}">
                    ${metricIcon(m.kind)}
                    ${m.trend ? trendBadge(m.trend) : ''}
                    <p class="metric-value">${m.value}</p>
                    <p class="metric-label">${m.label}</p>
                  </li>`,
                ).join('')}
              </ul>
            </section>
          </div>
        </main>`;
    },
    unmount() {},
  };
}
