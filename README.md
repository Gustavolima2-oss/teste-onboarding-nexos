# Nexo · onboarding 3D

**Demonstração ao vivo: https://gustavolima2-oss.github.io/teste-onboarding-nexos/**

Protótipo do onboarding do produto. O mascote 3D **Nexo** guia o usuário por **9 dicas (coach marks) em 3 telas**: Home, Ferramentas e Seu negócio. Ele voa entre os pontos da interface, gesticula, pode **falar com voz gravada** (a boca segue o volume do áudio e cada palavra acende no tooltip no momento em que é dita) e acompanha o mouse com o olhar. O tour avança sozinho no fim de cada etapa.

É uma demonstração: o tour **sempre começa do início** quando a página abre. Funciona melhor no Chrome ou no Edge de desktop, com a janela em 1440×900 ou maior.

## Como usar

| Ação                      | Como                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avançar                   | Botão **Próximo**, **→** ou **Enter**                                                                                                                                                                               |
| Voltar                    | Botão **Voltar**, ou **←** (a partir da etapa 2)                                                                                                                                                                    |
| Avançar pelo item marcado | Nas etapas 1, 4 e 5 o item destacado é clicável: clicar nele avança, como no produto real. Na etapa 3 não há "Próximo": avance **favoritando** pelo pin do card Conversas (clique, ou Enter/Espaço com o foco nele) |
| Sair do tour              | **Esc**                                                                                                                                                                                                             |
| Reiniciar do começo       | **R**                                                                                                                                                                                                               |
| Ir direto a uma etapa     | **1** a **9**                                                                                                                                                                                                       |
| Ouvir / pausar a voz      | Ícone no tooltip, ou **Espaço**: liga a voz, pausa e retoma (do início da palavra em que parou)                                                                                                                     |
| Vídeo (etapas 6 e 7)      | Botão **Play** no tooltip (pausa a fala)                                                                                                                                                                            |

O **Tab** circula dentro do tooltip ("Voltar", áudio e "Próximo"). Com `prefers-reduced-motion`, o Nexo não voa: ele troca de lugar com um fade.

**Sem voz (padrão) e com voz.** O tour começa **sem voz**: o texto aparece inteiro e o anel em gradiente em volta do "Próximo" funciona como um timer de leitura (duração da fala × 2,5, no mínimo 6 s); no fim, o tour avança sozinho. Clicar no alto-falante **liga a voz**: a etapa fala do início, as palavras acendem uma a uma e o anel passa a acompanhar o áudio; 400 ms depois do fim, o tour avança, e as etapas seguintes já começam falando. Com a voz tocando, o ícone vira pausa. Pausar e avançar leva a etapa seguinte de volta ao modo sem voz. "Próximo" e "Voltar" interrompem tudo na hora. Com a aba em segundo plano, a fala e o timer pausam.

Também dá para abrir numa etapa pelo link: `…/teste-onboarding-nexos/?step=4`.

## Rodar localmente

Requer Node 20.19 ou mais novo.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # gera dist/ com base /teste-onboarding-nexos/
npm run preview      # serve o build em http://localhost:4173/teste-onboarding-nexos/
```

- **No dev**, o tour abre só na primeira visita (`onboarding:done` no `localStorage`). Use `?onboarding=reset` ou a tecla **R** para reiniciar.
- **No build**, `.env.production` liga `VITE_DEMO_MODE=true`: o tour sempre começa do início e os atalhos R / 1–9 ficam ativos. Para o comportamento de produto (tour só na primeira visita), rode o build com `VITE_DEMO_MODE=false`.
- **Testes:** `npm test` roda a suíte do onboarding (~90 verificações, no Chrome instalado, via `playwright-core`). Ela precisa do dev server em `:5199`: `npx vite --port 5199`.
- **URLs de desenvolvimento, scripts, estrutura de pastas e detalhes de render e animação:** [docs/TECNICO.md](docs/TECNICO.md).

## Publicação

Cada push na `main` dispara o workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml). Ele instala as dependências com Node 20, roda `npm run build` e publica o `dist/` no GitHub Pages.

- O `base` do Vite é `/teste-onboarding-nexos/` no build e no preview, e `/` no dev server ([vite.config.ts](vite.config.ts)).
- Todos os arquivos de `public/` passam por `asset()` ([src/utils/asset.ts](src/utils/asset.ts)), que usa `import.meta.env.BASE_URL`. O `index.html` usa `%BASE_URL%`. Nunca use caminhos absolutos começando com `/`.
- As rotas são por hash (`#/ferramentas`), então o Pages não precisa de `404.html`.

## Otimizar o GLB

O modelo original (`nexo-3d.glb`, ~23 MB) **não está no repositório**. Só a versão otimizada, `public/models/nexo.glb` (1,47 MB, 86.762 triângulos), é versionada.

Para gerar de novo:

1. Coloque o original em `assets-src/nexo-3d.glb`. Ele está na pasta do projeto que acompanha o Figma, ou peça ao time de design.
2. Rode `npm run optimize:glb`. Para usar outro caminho: `npm run optimize:glb -- caminho/do/modelo.glb`.

O pipeline ([scripts/optimize-glb.sh](scripts/optimize-glb.sh)) faz `weld` → dilatação das ilhas de UV → `simplify` (ratio 0,12) → normais suavizadas até 60° → `resize` 2048 → WebP q85 → `meshopt` com normais de 12 bits. As variáveis `RATIO`, `ANGLE`, `QUALITY` e outras estão documentadas no cabeçalho do script.

## Voz do Nexo

As falas (voz do Tiago Lima) são MP3 gravados, um por etapa, em `public/audio/nexo/`, com o tempo de cada palavra em [src/voice/voiceManifest.json](src/voice/voiceManifest.json). Os dois são gerados pelo pipeline em [nexo-voice/](nexo-voice/) e versionados.

```bash
brew install ffmpeg                      # precisa do filtro rubberband: ffmpeg -filters | grep rubberband
pip install numpy scipy faster-whisper
python3 nexo-voice/build_voices.py       # a partir da raiz do app
```

- `robotize.py` aplica o filtro aprovado (+3 semitons com o timbre preservado, via rubberband, e 5% de vocoder; parâmetros intocados, duração preservada). `align.py` marca cada palavra com o faster-whisper (modelo `small`), alinhando ao texto exibido.
- O player ([src/voice/voice.ts](src/voice/voice.ts)) é o relógio de cada etapa, em dois modos: **timer** (sem voz, `SILENT_TIMER_FACTOR` = 2,5 e `SILENT_TIMER_MIN_MS` = 6000) e **voz** (lê `audio.currentTime` a cada quadro e publica palavras já ditas, progresso do anel, palavra ativa e volume do `AnalyserNode`, em 5 degraus; 3 com movimento reduzido). Sem palavra ativa, e durante todo o modo sem voz, a boca fica no sorriso, trocando no mesmo quadro.
- Se o `play()` for rejeitado, a etapa segue no modo sem voz (aviso no console) e o fluxo continua.
- Para trocar um texto: gere a voz no Magnific com a mesma configuração (`note` em `nexo-voice/voices.json`), atualize o item e rode o build de novo. O texto do tooltip vem do manifesto.

**Decisões**

- **Progresso:** o Figma não preenche o botão; ele desenha um anel em gradiente (`#E49876` → `#FFC846` 44% → `#FFD8C7`, da esquerda para a direita) colado à pílula do "Próximo". O anel começa no meio da lateral esquerda e cresce em sentido horário, de 0 a 100% ao longo do timer ou do áudio. Ligar a voz reinicia o anel do zero.
- **Bolinhas:** 9, acumulativas (o Figma ainda mostra 7, e nenhuma na última etapa).
- **Ícone:** mostra a ação do clique. Alto-falante do Figma com a voz desligada ("Ouvir o Nexo") ou pausada ("Continuar ouvindo"); `Pause` do Phosphor, no mesmo tamanho e cor, enquanto a voz toca ("Pausar", `aria-pressed="true"`). Troca por crossfade de 120 ms.
- **Espaço** com o foco no tooltip liga, pausa e retoma a voz.
- **Etapa 1** não tem "Voltar" (fica invisível, ocupando o lugar); a **etapa 9** usa "Finalizar" (89×40), como no Figma.
- **Emoji** solto (🧠, etapa 6) acende junto com a palavra anterior e não mexe a boca.
- **Vídeo** (etapas 6 e 7): o Play pausa a fala ou o timer; sem voz, o timer volta a correr quando o vídeo para.
- **Web Speech:** a narração sintetizada saiu do fluxo; `NexoGuide.talk()` continua na API por compatibilidade.
- **Etapa 3 (Conversas) avança favoritando** (`advanceOn: 'action'`): sem "Próximo" (o rodapé mantém a altura), sem timer e sem avanço automático; a voz funciona normalmente. O pin do card é o gatilho: cursor pointer, hover, "Fixar no menu" no hover e pulso (anel a cada 1,5 s) depois que o tooltip entra ou que a fala termina. O clique favorita (pin azul, escala 0,85 → 1,1 → 1), o ícone do Conversas voa em arco até a sidebar (500 ms) e o fluxo avança. Voltar da 4 para a 3 desfaz o favorito.
- **Vídeo da etapa 9** (`kind: 'loop'`): `<video autoplay muted loop playsinline preload="metadata">` no topo do tooltip, WebM primeiro e MP4 de alternativa, com `object-fit: cover` no mesmo espaço da imagem (378×210). Começa quando o tooltip termina de entrar; pausa ao sair da etapa, ao fechar o tooltip e com a aba em segundo plano. Com `prefers-reduced-motion`, ou se o vídeo falhar, fica a capa. Não mexe no timer, na voz nem no avanço.
- **Destaques sólidos:** os cards de "Seu negócio" são brancos e opacos, como no Figma (antes: branco a 35% com `backdrop-filter`, que ficava cinza sobre o overlay). Um teste compara o pixel central de cada alvo com e sem o onboarding.
- **AudioContext** só é criado quando a voz é ligada: criá-lo no primeiro clique da página travava a thread por ~400 ms.

## API do `NexoGuide`

O núcleo não depende de framework (TypeScript, three.js e GSAP). Para integrar, consuma só o `NexoGuide` e o `steps.ts`.

```ts
interface NexoGuide {
  mount(): Promise<void>; // cria o canvas e carrega o modelo (ou o PNG)
  appearAt(anchor: DOMRect | Point): Promise<void>;
  flyTo(anchor: DOMRect | Point, opts?: { facing?: 'left' | 'right' }): Promise<void>;
  gesture(name: Gesture): Promise<void>; // 'wave' | 'present' | 'point' | 'think' | 'bye' | 'idle'
  talk(opts: { text: string; narrate: boolean }): Promise<void>;
  lookAt(point: Point | null): void; // ponto de descanso do olhar (o tooltip)
  setExpression(e: 'smile' | 'blink' | 'wink' | 'listen' | 'talk'): void;
  exit(): Promise<void>; // voa para fora pelo canto superior direito
  on(event: 'ready' | 'arrived' | 'error', cb: () => void): void;
  destroy(): void; // canvas, GPU, listeners, fala e áudio
}
```

- **Âncora:** é o **centro do corpo** do robô, em px da viewport. Um `DOMRect` vale pelo centro dele.
- **Extras opcionais**, fora do contrato:
  - `placeAt(anchor)`: reposiciona sem animar (resize);
  - `hide()`: fade curto (Esc);
  - `useFallback()`, `stopTalking()`;
  - `gesture('point', { target })`: inclina na direção do alvo.
- **Fallback automático:** sem WebGL, ou se o GLB falhar ou levar mais de 3 s, o Nexo vira um PNG posicionado pela mesma API, com fade entre as etapas.
- **Ciclo de vida:** monte o `NexoGuide` **uma vez**, fora da árvore de rotas (portal ou elemento no `body`). O canvas nunca é desmontado ao trocar de tela.

## Formato do `steps.ts`

Cada etapa do tour é um objeto em [src/coachmark/steps.ts](src/coachmark/steps.ts). As medidas vêm do Figma e são sempre relativas: o tooltip em relação ao alvo e o Nexo em relação ao tooltip.

```ts
type Step = {
  id: string;
  route: '/home' | '/ferramentas' | '/seu-negocio';
  target: string | string[]; // seletor(es) do alvo; grupos sobem juntos
  highlight: 'circle' | 'card' | 'row' | 'none';
  advanceOn: 'next' | 'target' | 'action'; // Próximo/timer | + clique no alvo | só a ação
  action?: { selector: string; label: string; hint: string; run: () => void; flyTo?: string };
  voice: string; // fala gravada (chave do src/voice/voiceManifest.json)
  text: string; // preenchido a partir do manifesto (mesma divisão de palavras do grifo)
  tooltip: {
    kind: 'text' | 'preview' | 'video' | 'image';
    placement: 'right' | 'left' | 'top' | 'bottom';
    offset: { x: number; y: number }; // medido no Figma, relativo ao alvo
    media?: { poster: string; alt: string; src?: string }; // 378×210 no topo
  };
  nexo: {
    offset: { x: number; y: number }; // centro do corpo, relativo ao tooltip
    facing: 'left' | 'right';
    gesture: Gesture; // movimento de corpo inteiro ao chegar
  };
  completes?: { favorite?: string }; // efeito de ter passado por esta etapa
};
```

- **Offsets:** com `placement: 'right'`, o tooltip é medido a partir do canto superior **direito** do alvo; com `'bottom'`, a partir do canto inferior **esquerdo**. O Nexo é medido a partir da borda direita e do centro vertical do tooltip.
- **Colisão:** se não couber, a prioridade é (a) o lado do Figma, (b) acima, (c) clamp na viewport. O Nexo nunca cobre o tooltip nem o alvo.
- **Navegação nos dois sentidos:** "Voltar" usa a mesma coreografia do avanço, invertida. O estado do fluxo não é acumulado: ele é **derivado** dos `completes` das etapas anteriores (`flowStateAt`). Por isso todo estado é reversível: voltar da etapa 4 para a 3 tira "Conversas" dos favoritos.
- **Troca de tela** (etapas 1 ↔ 2 e 5 ↔ 6): o overlay sai, a tela nova entra limpa e fica nítida por `CLEAN_SCREEN_HOLD_S` (0,6 s, em [src/main.ts](src/main.ts)) antes do overlay voltar.
- **Para adicionar uma etapa:** marque o alvo com `data-coach="…"`, meça no Figma o tooltip e o Nexo (`npm run measure:png`) e acrescente o item em `STEPS`.

## Pendências conhecidas

- **Navegadores:** testado só no Chrome (desktop, macOS). Faltam Safari e Firefox.
- **Vídeos das etapas 6 e 7:** os pôsteres vêm do Figma, mas os dois tocam o mesmo placeholder (`public/video/seu-negocio.webm`). Os vídeos finais devem ter também uma versão MP4 (H.264) para o Safari.
- **Voz:** ver [docs/RELATORIO-voz.md](docs/RELATORIO-voz.md) (durações, método de marcação por etapa e conferência do filtro).
- **Braços do Nexo:** o GLB é uma malha única, sem esqueleto, então os braços não se mexem e os gestos são do corpo inteiro. Para gestos de braço, é preciso um GLB com esqueleto real.
- **Render:** aparecem pontos de brilho serrilhado na silhueta do casco. A tela do modelo é mais larga que a do PNG de referência (limite da geometria).
- **Tempo entre telas:** do clique ao tooltip, a troca entre telas leva ~1,7 s (tela limpa de 0,6 s + volta do overlay), acima da meta de 1,2 s das trocas na mesma tela. Ajuste em `CLEAN_SCREEN_HOLD_S`.
- **Favoritos:** o fluxo controla só "Conversas". Se o usuário fixar ou desafixar esse item à mão durante o tour, voltar ou avançar sobrescreve a escolha.
- **Badge do Waz:** no Figma, o badge de não lidas só aparece na última etapa. Aqui ele fica sempre visível na sidebar.
- **Enter no "Voltar":** com o foco em "Voltar" ou no áudio, Enter ativa o botão focado, em vez de avançar (padrão de acessibilidade).
- **Fora do repositório:** o GLB original (~23 MB) e os prints e vídeos de conferência (`docs/checkpoints/`, ~40 MB, refeitos com `npm run checkpoint` e `npm run record`).

Decisões, medições e histórico: [docs/RELATORIO.md](docs/RELATORIO.md).
