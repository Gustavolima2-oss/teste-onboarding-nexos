// Contrato das telas: cada tela monta o próprio markup dentro de `root` e
// desfaz tudo (listeners, timers) no unmount. A sidebar e a camada do
// onboarding (overlay, tooltip, canvas do Nexo) ficam fora delas.

export interface Screen {
  /** Título da tela (document.title e aria-label do main). */
  readonly title: string;
  mount(root: HTMLElement): void;
  unmount(): void;
}
