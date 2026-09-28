// Registro das telas por rota.
import type { Route } from '../app/router';
import type { Screen } from './types';
import { createHome } from './home';
import { createFerramentas } from './ferramentas';
import { createSeuNegocio } from './seuNegocio';

export const SCREENS: Record<Route, () => Screen> = {
  '/home': createHome,
  '/ferramentas': createFerramentas,
  '/seu-negocio': createSeuNegocio,
};
