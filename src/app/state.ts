// Estado mínimo compartilhado entre telas: ferramentas favoritadas e a mensagem do Waz
// na Home. (No produto isto vem da API; aqui fica em memória.)

/**
 * Mensagem do Waz na linha dele em "Seu time": null (sem mensagem), 'new' (acabou de
 * chegar: a Home anima a entrada dela) ou 'shown' (já vista: fica, sem animar).
 */
export type WazMessage = null | 'new' | 'shown';

type Listener = () => void;

const favorites = new Set<string>();
const listeners = new Set<Listener>();
let wazMessage: WazMessage = null;

export const appState = {
  isFavorite(id: string): boolean {
    return favorites.has(id);
  },
  favorites(): string[] {
    return [...favorites];
  },
  setFavorite(id: string, on: boolean): void {
    const had = favorites.has(id);
    if (on) favorites.add(id);
    else favorites.delete(id);
    if (had !== on) listeners.forEach((l) => l());
  },
  get wazMessage(): WazMessage {
    return wazMessage;
  },
  setWazMessage(state: WazMessage): void {
    if (state === wazMessage) return;
    wazMessage = state;
    listeners.forEach((l) => l());
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  reset(): void {
    favorites.clear();
    wazMessage = null;
    listeners.forEach((l) => l());
  },
};
