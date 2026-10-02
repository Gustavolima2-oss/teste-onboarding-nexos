# Nexo · onboarding 3D

**Demonstração ao vivo: https://gustavolima2-oss.github.io/teste-onboarding-nexos/**

Protótipo do onboarding do produto. O mascote 3D **Nexo** guia o usuário por **9 dicas (coach marks) em 3 telas**: Home, Ferramentas e Seu negócio, terminando de volta na Home com a mensagem do Waz. Ele voa entre os pontos da interface, gesticula, **fala com voz gravada** (a boca segue o volume do áudio e cada palavra acende no tooltip no momento em que é dita) e acompanha o mouse com o olhar. Com a voz, o tour avança sozinho no fim de cada fala.

É uma demonstração: o tour **sempre começa do início** quando a página abre. Funciona melhor no Chrome ou no Edge de desktop, com a janela em 1440×900 ou maior.

## Como usar

| Ação                      | Como                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avançar                   | Botão **Próximo**, **→** ou **Enter**, depois que a borda de progresso do botão completa (nos dois modos)                                                                                                           |
| Voltar                    | Botão **Voltar**, ou **←** (a partir da etapa 2)                                                                                                                                                                    |
| Avançar pelo item marcado | Nas etapas 1, 4 e 5 o item destacado é clicável: clicar nele avança, como no produto real. Na etapa 3 não há "Próximo": avance **favoritando** pelo pin do card Conversas (clique, ou Enter/Espaço com o foco nele) |
| Reiniciar do começo       | **R**                                                                                                                                                                                                               |
| Ir direto a uma etapa     | **1** a **9**                                                                                                                                                                                                       |
| Pausar / religar a voz    | Ícone no tooltip, ou **Espaço**: pausar leva ao modo texto; clicar de novo religa a voz e recomeça a fala do início da etapa                                                                                        |

O **Tab** circula dentro do tooltip ("Voltar", áudio e "Próximo"). Com `prefers-reduced-motion`, o Nexo não voa: ele troca de lugar com um fade.

### Voz desde o início, os dois modos e o botão "Próximo"

O tour começa no **modo com voz**, falando na etapa 1 assim que o tooltip entra.

**Bloqueio de autoplay dos navegadores:** Chrome, Safari e Firefox não deixam uma página tocar som antes de alguma interação do usuário com ela, e isso não tem como ser contornado por código. Por isso, antes da etapa 1, o tour testa em silêncio se pode tocar som (o áudio da etapa em volume 0, parado na hora). Se puder (o usuário já interagiu com o site, ou o navegador libera), a etapa 1 já começa falando. Se não puder, aparece um **convite de início**: o Nexo já em cena e um card no visual dos tooltips (fundo escuro, botão branco) com "Ative o som para ouvir o Nexo" e o botão **"Começar"**. O clique libera o áudio e a etapa 1 entra já falando, com o grifo e a borda. O convite não é uma etapa (as bolinhas continuam em 9). Se mesmo depois do clique o `play()` falhar, a etapa segue no modo texto, sem quebrar o fluxo.

| Modo                 | Quando                                                      | Texto                              | Ícone de som           | "Próximo"                                                                                                                          | Avanço automático                                                                                    |
| -------------------- | ----------------------------------------------------------- | ---------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Com voz** (padrão) | O tour começa assim; cada etapa fala quando o tooltip entra | Cinza, acendendo palavra a palavra | Pausa (dois tracinhos) | Desativado enquanto a borda de progresso acompanha o áudio; ativo no fim da fala                                                   | Sim, 400 ms depois do fim da fala; nunca na etapa 3 (pin) nem na última (o "Finalizar" só é ativado) |
| **Texto**            | O usuário pausou a voz (clique no ícone durante a fala)     | Todo branco, na hora               | Alto-falante           | Desativado enquanto a mesma borda enche no tempo do áudio da etapa (× `TEXT_MODE_TIMER_FACTOR`, padrão 1,0); ativo quando completa | Nunca: o usuário clica para seguir                                                                   |

- **Pausar** no meio da fala passa ao modo texto no mesmo instante: o áudio para, o texto fica todo branco e a boca do Nexo volta ao padrão; a borda **continua de onde estava**, no ritmo do modo texto (proporcional ao que falta), até completar e ativar o botão. As etapas seguintes continuam no modo texto até o usuário clicar no ícone de novo, o que religa a voz e recomeça a fala da etapa atual (texto cinza, borda do zero, botão desativado).
- **Cliques no alvo** (ícones das etapas 1, 4 e 5), **Enter** e **→** seguem o botão: só depois que a borda completa, nos dois modos. O **pin da etapa 3** funciona a qualquer momento, em qualquer modo. **"Voltar"** e o **ícone de som** ficam sempre ativos.
- Com a aba em segundo plano, a fala (ou a borda do modo texto) pausa; ao voltar, continua.

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
- **Testes:** `npm test` roda a suíte do onboarding (~150 verificações, no Chrome instalado, via `playwright-core`). Ela precisa do dev server em `:5199`: `npx vite --port 5199`.
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

As falas são a **voz final do Nexo**: nove MP3 prontos em [nexo-voice/sources/](nexo-voice/sources/), sem nenhum efeito, filtro ou mudança de velocidade aplicados no projeto. O build os copia como estão para `public/audio/nexo/` e gera o tempo de cada palavra em [src/voice/voiceManifest.json](src/voice/voiceManifest.json). Os dois são versionados.

```bash
pip install numpy scipy faster-whisper   # e o ffmpeg no PATH (só para ler o áudio)
python3 nexo-voice/build_voices.py       # a partir da raiz do app
```

- `align.py` marca cada palavra com o faster-whisper (modelo `small`) e casa as palavras ouvidas com o texto da tela, então o grifo segue o que está escrito: o Waz é falado "Uóis" e o grifo passa pelo "Waz" no momento certo (etapa 2: 0,92 s; etapa 9: 0,82 s).
- **Etapas que precisaram de `initial_prompt`:** só a **9**. Sem ele, o reconhecimento ouviu "K .O .E. O OIS" e espremeu "Kauê, o Waz" em 0,34 s; com o texto da fala como `initial_prompt` (`"prompt": true` no `voices.json`, `--prompt` no `align.py`), os tempos batem com a energia do áudio. O `method` dela no manifesto é `faster-whisper+prompt`; as outras oito são `faster-whisper`.
- O player ([src/voice/voice.ts](src/voice/voice.ts)) conduz cada etapa em dois modos (`voice`, `text`). No modo com voz, ele lê `audio.currentTime` a cada quadro e publica palavras já ditas, progresso da borda, palavra ativa e volume do `AnalyserNode`. No modo texto, um relógio interno enche a mesma borda em duração do áudio × `TEXT_MODE_TIMER_FACTOR` (1,0), com o texto inteiro aceso. Sem palavra ativa, e em todo o modo texto, a boca fica no sorriso, trocando no mesmo quadro.
- **Boca:** nível = `min(1, RMS × MOUTH_GAIN)`, em 5 degraus (3 com movimento reduzido). A voz final tem RMS bem menor nas janelas de 1024 amostras que a anterior (mediana 0,03), então o ganho foi de 4 para **10**: os cinco degraus são usados quase por igual e só ~6% das janelas saturam.
- `canPlay()` testa o autoplay em silêncio (toca o áudio da etapa em volume 0 e para na hora) antes da primeira etapa. Se o `play()` for recusado depois do convite, a etapa segue no modo texto (nota informativa no console, sem erro).
- Dev: `?voice=off` abre o tour no modo texto; `window.__nexo.voice.skip()` leva a fala da etapa ao fim (testes).
- Para trocar uma fala: gere de novo a gravação única com todas as falas (mesmo prompt e a voz aprovada como referência, para a voz continuar igual entre elas), corte por fala em `nexo-voice/sources/`, atualize o texto em `voices.json` e rode o build. O texto do tooltip vem do manifesto.

**Decisões**

- **Progresso:** o Figma não preenche o botão; ele desenha um anel em gradiente (`#E49876` → `#FFC846` 44% → `#FFD8C7`, da esquerda para a direita) colado à pílula do "Próximo". O anel começa no meio da lateral esquerda e cresce em sentido horário, de 0 a 100% ao longo do áudio. Só existe no modo com voz; religar a voz reinicia o anel do zero.
- **"Próximo" desativado (durante a fala):** o Figma (2631:3475) mostra a pílula branca normal com o anel enchendo; não há variante "disabled" no arquivo. Aqui a pílula fica a 50% de opacidade, sem hover, e acende em 200 ms no fim da fala. Enquanto ela está desativada, o foco fica no próprio tooltip e passa para o botão quando ele acende.
- **Bolinhas:** 9, acumulativas (o Figma ainda mostra 7, e nenhuma na última etapa).
- **Ícone:** mostra a ação do clique. Alto-falante do Figma no modo texto ("Ouvir o Nexo"); `Pause` do Phosphor, no mesmo tamanho e cor, enquanto a voz toca ("Pausar", `aria-pressed="true"`). Troca por crossfade de 120 ms.
- **Espaço** com o foco no tooltip pausa e religa a voz.
- **Etapas 6, 7 e 8** usam o tooltip só de texto (sem vídeo).
- **Última etapa na Home** (Figma 2631:3475): a linha do Waz em "Seu time" ganha a mensagem "Oi aqui o Waz! Estou animado em me juntar ao seu time!" e a bolinha de não lida, entrando com fade e deslize de 6 px assim que a Home aparece. A linha (card branco de 832×96) é o alvo destacado; o tooltip fica abaixo dela, alinhado à direita, com o **vídeo do Waz com o Nexo** no topo (`<video autoplay muted loop playsinline>`, WebM com MP4 de alternativa, capa enquanto carrega; só a capa com `prefers-reduced-motion`). Como o vídeo já mostra o Nexo, o **Nexo 3D voa para dentro do vídeo** (arco de ~700 ms, escala 1 → 0,3, opacidade 1 → 0) e fica fora de cena: sem render, sem olhar para o mouse, sem flutuação e sem boca (a voz, o grifo e a borda seguem normais). Voltar faz o caminho inverso, até a etapa 8 em Seu negócio. No "Finalizar", sem voo de saída: o tooltip e o overlay somem e a Home fica como o frame 2631:3583, com a mensagem. Com `prefers-reduced-motion`, o Nexo só some e reaparece com fade de 200 ms.
- **Anel de foco** só na navegação por teclado (`<html data-input>`, ver `src/utils/inputModality.ts`), com cantos acompanhando o botão.
- **Etapa 1** não tem "Voltar" (fica invisível, ocupando o lugar); a **última etapa** usa "Finalizar" (89×40).
- **Emoji** solto (🧠, etapa 6) acende junto com a palavra anterior e não mexe a boca.
- **Web Speech:** a narração sintetizada saiu do fluxo; `NexoGuide.talk()` continua na API por compatibilidade.
- **Etapa 3 (Conversas) avança favoritando** (`advanceOn: 'action'`): sem "Próximo" (o rodapé mantém a altura) e sem avanço automático; a voz funciona normalmente, e o pin pode ser clicado a qualquer momento, em qualquer modo. Do momento em que o tooltip entra até o clique, o pin fica **1,8× maior, laranja do Nexo (`#FF6A1F`) sobre um disco branco** que o separa do card, com **dois anéis luminosos** expandindo em sequência a cada 0,9 s até ~2,2× o pin e um salto curto a cada ciclo. O **card do Conversas** ganha um halo laranja suave pulsando (1,8 s), e o balão **"Fixar no menu"** fica sempre visível acima do pin, com seta e um leve balanço horizontal a cada 2 s. Com `prefers-reduced-motion`, nada anima, mas o tamanho, a cor, um anel parado e o halo continuam. O clique favorita (pin azul, escala 0,85 → 1,1 → 1), o ícone do Conversas voa em arco até a sidebar (500 ms) e o fluxo avança. Voltar da 4 para a 3 desfaz o favorito.
- **Prévia da etapa 3:** um cursor de seta em SVG (preto com contorno branco e sombra leve, 20×27) entra, para no pin, clica (0,9 → 1, com uma onda circular saindo do ponto) e o pin fica fixado; repete a cada ~4 s. Com `prefers-reduced-motion`, o anel do pin e o cursor ficam parados, mas visíveis.
- **Destaques sólidos:** os cards de "Seu negócio" são brancos e opacos, como no Figma (antes: branco a 35% com `backdrop-filter`, que ficava cinza sobre o overlay). Um teste compara o pixel central de cada alvo com e sem o onboarding.
- **AudioContext** não é criado no carregamento nem no primeiro clique (isso travava a thread por ~400 ms): ele nasce quando a fala toca depois de o áudio ter sido liberado por uma interação, ou quando o usuário religa a voz.

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
  - `hide()`: fade curto;
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
  advanceOn: 'next' | 'target' | 'action'; // Próximo/fim da fala | + clique no alvo | só a ação
  action?: { selector: string; label: string; hint: string; run: () => void; flyTo?: string };
  voice: string; // fala gravada (chave do src/voice/voiceManifest.json)
  text: string; // preenchido a partir do manifesto (mesma divisão de palavras do grifo)
  tooltip: {
    kind: 'text' | 'preview' | 'image';
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
  shows?: { wazMessage?: boolean }; // o que vale a partir desta etapa (mensagem do Waz na Home)
};
```

- **Offsets:** com `placement: 'right'`, o tooltip é medido a partir do canto superior **direito** do alvo; com `'bottom'`, a partir do canto inferior **esquerdo**. O Nexo é medido a partir da borda direita e do centro vertical do tooltip.
- **Colisão:** se não couber, a prioridade é (a) o lado do Figma, (b) acima, (c) clamp na viewport. O Nexo nunca cobre o tooltip nem o alvo.
- **Navegação nos dois sentidos:** "Voltar" usa a mesma coreografia do avanço, invertida. O estado do fluxo não é acumulado: ele é **derivado** dos `completes` das etapas anteriores e dos `shows` até a etapa atual (`flowStateAt`). Por isso todo estado é reversível: voltar da etapa 4 para a 3 tira "Conversas" dos favoritos.
- **Troca de tela** (etapas 1 ↔ 2 e 5 ↔ 6): o overlay sai, a tela nova entra limpa e fica nítida por `CLEAN_SCREEN_HOLD_S` (0,6 s, em [src/main.ts](src/main.ts)) antes do overlay voltar.
- **Para adicionar uma etapa:** marque o alvo com `data-coach="…"`, meça no Figma o tooltip e o Nexo (`npm run measure:png`) e acrescente o item em `STEPS`.

## Pendências conhecidas

- **Navegadores:** testado só no Chrome (desktop, macOS). Faltam Safari e Firefox.
- **Voz:** ver [docs/RELATORIO-voz.md](docs/RELATORIO-voz.md) (durações e método de marcação por etapa).
- **Braços do Nexo:** o GLB é uma malha única, sem esqueleto, então os braços não se mexem e os gestos são do corpo inteiro. Para gestos de braço, é preciso um GLB com esqueleto real.
- **Render:** aparecem pontos de brilho serrilhado na silhueta do casco. A tela do modelo é mais larga que a do PNG de referência (limite da geometria).
- **Tempo entre telas:** do clique ao tooltip, a troca entre telas leva ~1,7 s (tela limpa de 0,6 s + volta do overlay), acima da meta de 1,2 s das trocas na mesma tela. Ajuste em `CLEAN_SCREEN_HOLD_S`.
- **Favoritos:** o fluxo controla só "Conversas". Se o usuário fixar ou desafixar esse item à mão durante o tour, voltar ou avançar sobrescreve a escolha.
- **Badge do Waz:** no Figma, o badge de não lidas da sidebar não aparece na última etapa nem depois do fim. Aqui ele fica sempre visível na sidebar.
- **Enter no "Voltar":** com o foco em "Voltar" ou no áudio, Enter ativa o botão focado, em vez de avançar (padrão de acessibilidade).
- **Fora do repositório:** o GLB original (~23 MB) e os prints e vídeos de conferência (`docs/checkpoints/`, ~40 MB, refeitos com `npm run checkpoint` e `npm run record`).

Decisões, medições e histórico: [docs/RELATORIO.md](docs/RELATORIO.md).
