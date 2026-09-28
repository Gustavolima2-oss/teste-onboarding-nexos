// Estado mínimo compartilhado entre telas: ferramentas favoritadas.
// (No produto isto vem da API; aqui fica em memória.)

type Listener = () => void;

const favorites = new Set<string>();
const listeners = new Set<Listener>();

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
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  reset(): void {
    favorites.clear();
    listeners.forEach((l) => l());
  },
};
