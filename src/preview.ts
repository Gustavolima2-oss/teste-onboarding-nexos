// Preview das telas sem o onboarding: /preview.html#/ferramentas
// ?fav=conversas marca a ferramenta como favoritada; ?waz=message mostra a mensagem do Waz
// na Home (estado depois do onboarding).
import './styles/tokens.css';
import './styles/app.css';
import './styles/screens/home.css';
import './styles/screens/ferramentas.css';
import './styles/screens/seu-negocio.css';
import { Router } from './app/router';
import { Sidebar } from './app/sidebar';
import { appState } from './app/state';
import { SCREENS } from './screens';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  const params = new URLSearchParams(location.search);
  for (const id of params.getAll('fav')) appState.setFavorite(id, true);
  if (params.get('waz') === 'message') appState.setWazMessage('shown');
  const sidebar = new Sidebar();
  const outlet = document.createElement('div');
  outlet.className = 'screen';
  app.append(sidebar.el, outlet);
  const router = new Router(outlet, SCREENS);
  router.onChange((r) => sidebar.setRoute(r));
  router.start();
}
