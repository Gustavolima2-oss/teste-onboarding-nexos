// Última forma de interação (teclado × ponteiro). Usado para decidir se o foco
// programático deve mostrar o anel (:focus-visible): só quando a pessoa usa teclado.
// Fica também em <html data-input="keyboard|pointer">: com o ponteiro, o CSS esconde
// o anel mesmo nos navegadores que acendem :focus-visible depois de um clique.

let lastWasKeyboard = false;
let installed = false;

export function trackInputModality(): void {
  if (installed) return;
  installed = true;
  const set = (keyboard: boolean) => {
    lastWasKeyboard = keyboard;
    document.documentElement.dataset.input = keyboard ? 'keyboard' : 'pointer';
  };
  document.addEventListener('keydown', () => set(true), true);
  document.addEventListener('pointerdown', () => set(false), true);
}

export function focusWithModality(el: HTMLElement): void {
  // focus() num elemento que já tem foco não atualiza o :focus-visible (ex.: o tooltip
  // foi ocultado e reexibido na mesma tarefa, antes de o navegador tirar o foco).
  if (document.activeElement === el) el.blur();
  el.focus({ preventScroll: true, focusVisible: lastWasKeyboard });
}
