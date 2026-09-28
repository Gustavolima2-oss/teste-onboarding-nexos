// Última forma de interação (teclado × ponteiro). Usado para decidir se o foco
// programático deve mostrar o anel (:focus-visible): só quando a pessoa usa teclado.

let lastWasKeyboard = false;
let installed = false;

export function trackInputModality(): void {
  if (installed) return;
  installed = true;
  document.addEventListener('keydown', () => (lastWasKeyboard = true), true);
  document.addEventListener('pointerdown', () => (lastWasKeyboard = false), true);
}

export function focusWithModality(el: HTMLElement): void {
  // focus() num elemento que já tem foco não atualiza o :focus-visible (ex.: o tooltip
  // foi ocultado e reexibido na mesma tarefa, antes de o navegador tirar o foco).
  if (document.activeElement === el) el.blur();
  el.focus({ preventScroll: true, focusVisible: lastWasKeyboard });
}
