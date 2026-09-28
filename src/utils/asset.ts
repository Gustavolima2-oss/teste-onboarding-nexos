// Caminho de um arquivo de public/ respeitando o `base` do Vite (o GitHub Pages serve
// o site em /teste-onboarding-nexos/). Nunca use caminhos absolutos começando com /.
export const asset = (path: string): string =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
