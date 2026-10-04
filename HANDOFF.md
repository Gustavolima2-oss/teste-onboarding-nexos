# Handoff — onboarding com o Nexo

Protótipo funcional do onboarding guiado pelo mascote 3D **Nexo**, para ser reimplementado na plataforma. Este documento descreve **como funciona e quais são as regras**, sempre apontando o arquivo onde cada comportamento está implementado. O código é a fonte da verdade; os valores citados aqui foram tirados dele.

## Vídeos

Gravados com o Playwright em 1440×900, a partir do dev server. **Não têm som**: a gravação do Playwright não captura áudio. Para ouvir a voz, use o protótipo publicado.

| Vídeo                                        | O que mostra                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [demo-modo-voz.webm](demo-modo-voz.webm)     | Fluxo completo no modo com voz, da Home ao "Finalizar": avanço automático no fim de cada fala, o pin da etapa 3 e a última etapa com o vídeo (o Nexo entra nele). |
| [demo-modo-texto.webm](demo-modo-texto.webm) | Fluxo completo depois de pausar a voz na etapa 1: a borda de progresso enchendo, o "Próximo" desativado até completar e os cliques em "Próximo".                  |
| [demo-voltar.webm](demo-voltar.webm)         | "Voltar" da etapa 6 até a 3: a troca de tela (Seu negócio → Ferramentas) e o favorito desfeito (o item sai da sidebar).                                           |

Para regravar: `npx vite --port 5199` e `npm run demos` ([scripts/record-demos.mjs](scripts/record-demos.mjs)).

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Como rodar](#2-como-rodar)
3. [Arquitetura](#3-arquitetura)
4. [API do NexoGuide](#4-api-do-nexoguide)
5. [Configuração das etapas](#5-configuração-das-etapas-stepsts)
6. [Coach mark](#6-coach-mark)
7. [Modos de voz e texto](#7-modos-de-voz-e-texto)
8. [Nexo 3D](#8-nexo-3d)
9. [Voz e áudios](#9-voz-e-áudios)
10. [Acessibilidade e performance](#10-acessibilidade-e-performance)
11. [Integração na plataforma](#11-integração-na-plataforma)
12. [Testes como critérios de aceite](#12-testes-como-critérios-de-aceite)
13. [Decisões, limitações e pendências](#13-decisões-limitações-e-pendências)

---

## 1. Visão geral

- **Protótipo publicado:** https://gustavolima2-oss.github.io/teste-onboarding-nexos/ (modo demonstração: o tour sempre começa do início).
- **O que é:** 9 dicas (coach marks) em 3 telas — Home, Ferramentas e Seu negócio, terminando de volta na Home. O Nexo voa entre os pontos da interface, gesticula, fala com voz gravada (grifo palavra a palavra e boca pelo volume do áudio) e segue o mouse com o olhar.
- **Stack:** TypeScript + Vite, sem framework de UI. Three.js para o 3D e GSAP para as animações. Testes com `playwright-core` no Chrome instalado.

**Figma** — arquivo `HYM49734BUPEwZfnNLLDY4` (2.0-Drafts), seção `2350:2826`. Os node IDs também estão nos comentários de [src/coachmark/steps.ts](src/coachmark/steps.ts).

| Etapa                    | Frame                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| 1 · Ferramentas          | [2350:2871](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2350-2871)   |
| 2 · Agentes (chips)      | [2350:45423](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2350-45423) |
| 3 · Conversas (pin)      | [2350:46104](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2350-46104) |
| 4 · Favoritas            | [2350:50099](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2350-50099) |
| 5 · Seu negócio          | [2350:50882](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2350-50882) |
| 6 · Base de conhecimento | [2350:51269](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2350-51269) |
| 7 · Produtos e Serviços  | [2483:6066](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2483-6066)   |
| 8 · Integrações          | [2483:6244](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2483-6244)   |
| 9 · Waz (Home)           | [2631:3475](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2631-3475)   |
| Home depois do Finalizar | [2631:3583](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2631-3583)   |
| Tooltip com vídeo (ref.) | [2483:6455](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2483-6455)   |
| Home (tela base)         | [2350:3004](https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2350-3004)   |

**O que é só do protótipo** (não levar):

| Item                                                                                                | Onde                                                                                                             |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Roteador por hash e sonda de medição                                                                | [src/app/router.ts](src/app/router.ts)                                                                           |
| Telas e sidebar mockadas                                                                            | [src/screens/](src/screens/), [src/app/sidebar.ts](src/app/sidebar.ts)                                           |
| Estado em memória (favoritos, mensagem do Waz)                                                      | [src/app/state.ts](src/app/state.ts)                                                                             |
| "Onboarding concluído" no `localStorage` (`onboarding:done`) e modo demonstração (`VITE_DEMO_MODE`) | [src/main.ts](src/main.ts), [.env.production](.env.production)                                                   |
| Atalhos R, 1–9 e D; parâmetros `?step`, `?onboarding=reset`, `?voice=off`, `?model`, `?debug`       | [src/main.ts](src/main.ts), [src/debug/NexoDebug.ts](src/debug/NexoDebug.ts)                                     |
| Páginas de laboratório e preview                                                                    | [lab.html](lab.html) + [src/lab.ts](src/lab.ts), [preview.html](preview.html) + [src/preview.ts](src/preview.ts) |
| Scripts de calibração, captura e medição                                                            | [scripts/](scripts/) (exceto `optimize-glb.sh` e `test-onboarding.mjs`, que continuam úteis)                     |

**O que é para levar:** o Nexo 3D ([src/nexo/](src/nexo/)), o player de voz ([src/voice/](src/voice/)), o coach mark ([src/coachmark/](src/coachmark/)), a orquestração das etapas (a lógica de [src/main.ts](src/main.ts), adaptada) e os assets (`public/models/nexo.glb`, `public/fallback/nexo.png`, `public/audio/nexo/*.mp3`, `public/video/waz-nexo.*`, ícones de `public/images/onboarding/`).

---

## 2. Como rodar

Requer **Node 20.19+** (o CI usa Node 20) e, para os testes, o **Google Chrome** instalado.

```bash
npm ci
npm run dev            # http://localhost:5173 (dev; base '/')
npm run build          # tsc --noEmit + vite build → dist/ (base '/teste-onboarding-nexos/')
npm run preview        # serve o dist/
npm run lint           # eslint src
npx vite --port 5199   # os testes e scripts de captura usam esta porta
npm test               # 170 verificações (scripts/test-onboarding.mjs), ~3 min
npm run demos          # regrava os vídeos da raiz
```

**Parâmetros de URL e atalhos**

| Parâmetro / tecla      | Efeito                                                                                   | Onde vale               |
| ---------------------- | ---------------------------------------------------------------------------------------- | ----------------------- |
| `?step=N`              | Abre direto na etapa N (1–9), com o estado do fluxo daquela etapa (favoritos, mensagem). | Sempre                  |
| `?onboarding=reset`    | Apaga `onboarding:done` antes de começar.                                                | Só dev                  |
| `?voice=off`           | Começa no modo texto.                                                                    | Só dev                  |
| `?model=<url>`         | Troca o GLB.                                                                             | Só dev                  |
| `?nowebgl`             | Força o fallback em PNG.                                                                 | Sempre                  |
| `?debug` / tecla **D** | Painel de debug (FPS, draw calls, posições) e PNG do Figma sobreposto.                   | Sempre (ver pendências) |
| **R** / **1**–**9**    | Reinicia o tour / recarrega numa etapa.                                                  | Dev e modo demonstração |
| `window.__nexo`        | `{ nexo, coach, voice, appState, router, gsap, debug }` para depuração e testes.         | Só dev                  |

**Deploy:** cada push na `main` dispara [.github/workflows/deploy.yml](.github/workflows/deploy.yml) (build com `VITE_DEMO_MODE=true` e publicação no GitHub Pages). O CI não roda os testes.

---

## 3. Arquitetura

```
 telas (mock)        coach mark                 Nexo 3D                 voz
 src/screens/   ←→   src/coachmark/        ←→   src/nexo/          ←→   src/voice/
 src/app/            Coachmark.ts               NexoGuide.ts            voice.ts
   router.ts         placement.ts               NexoStage.ts            voiceManifest.json
   sidebar.ts        steps.ts                   NexoFace.ts
   state.ts          previewDemo.ts             NexoLook.ts, flight.ts, gestures.ts
                 ↖                ↑                    ↑                  ↗
                   └──────── src/main.ts (orquestrador) ────────────────┘
```

- **Orquestrador** ([src/main.ts](src/main.ts)): única peça que conhece todas as outras. Abre o tour, faz as trocas de etapa (`go`), a ação da etapa 3 (`runAction`), a apresentação de cada etapa (`present`), o convite de início e o fim (`finish`). Recebe callbacks do Coachmark (`onNext`, `onBack`, `onAction`, `onVoiceToggle`, `onLayout`) e do VoicePlayer (`onFrame`, `onEnd`).
- **Coach mark** ([src/coachmark/Coachmark.ts](src/coachmark/Coachmark.ts)): overlay, destaque dos alvos, tooltip, convite, teclado, trava de rolagem e cálculo de layout (devolve `StepLayout` com os retângulos do alvo, do tooltip, da mídia e a âncora do Nexo). Não conhece o Nexo nem o áudio.
- **Nexo 3D** ([src/nexo/NexoGuide.ts](src/nexo/NexoGuide.ts)): API pública do mascote; por baixo, [NexoStage.ts](src/nexo/NexoStage.ts) (renderer, câmera, luzes, loop), [NexoFace.ts](src/nexo/NexoFace.ts) (rosto em canvas), [NexoLook.ts](src/nexo/NexoLook.ts) (olhar), [flight.ts](src/nexo/flight.ts) (trajetória) e [gestures.ts](src/nexo/gestures.ts).
- **Voz** ([src/voice/voice.ts](src/voice/voice.ts)): `VoicePlayer`, o relógio de cada etapa (áudio ou timer do modo texto). Publica um `VoiceFrame` a cada quadro (`gsap.ticker`), que o orquestrador repassa ao coach mark (grifo, borda, ícone, botão) e ao Nexo (boca).
- **Estado do fluxo** ([src/coachmark/steps.ts](src/coachmark/steps.ts) `flowStateAt`, aplicado por `applyFlowState` em [src/main.ts](src/main.ts)): derivado da etapa atual (favoritos de `completes`, mensagem do Waz de `shows`), por isso o "Voltar" desfaz exatamente o que o avanço fez.

| Pasta / arquivo                                              | Papel                                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [src/main.ts](src/main.ts)                                   | Orquestração, tempos das transições, abertura, convite, fim                                          |
| [src/coachmark/steps.ts](src/coachmark/steps.ts)             | As 9 etapas, tipos `Step`/`FlowState`, constantes de layout                                          |
| [src/coachmark/Coachmark.ts](src/coachmark/Coachmark.ts)     | Overlay, destaque, tooltip, convite, teclado, layout                                                 |
| [src/coachmark/placement.ts](src/coachmark/placement.ts)     | Candidatos de posição e colisão (compartilhado por tooltip e Nexo)                                   |
| [src/coachmark/previewDemo.ts](src/coachmark/previewDemo.ts) | Animação do cursor na prévia da etapa 3                                                              |
| [src/nexo/](src/nexo/)                                       | Nexo 3D (ver seção 8)                                                                                |
| [src/voice/](src/voice/)                                     | Player e manifesto da voz                                                                            |
| [src/styles/](src/styles/)                                   | `tokens.css`, `app.css`, `coachmark.css`, `nexo.css`, `screens/*.css`                                |
| [src/utils/](src/utils/)                                     | `asset()` (prefixo `BASE_URL`), `prefersReducedMotion()`, modalidade de entrada (teclado × ponteiro) |
| [public/](public/)                                           | GLB, PNG de fallback, áudios, vídeos, imagens                                                        |
| [nexo-voice/](nexo-voice/)                                   | Pipeline que gera os áudios do app e o manifesto (ver seção 9)                                       |
| [scripts/](scripts/)                                         | Testes, otimização do GLB, captura e calibração                                                      |

---

## 4. API do NexoGuide

[src/nexo/NexoGuide.ts](src/nexo/NexoGuide.ts). Uma instância por tour.

```ts
new NexoGuide({ modelUrl?, fallbackUrl?, container? })   // padrão: models/nexo.glb, fallback/nexo.png, document.body
```

| Método                                              | O que faz                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mount(): Promise<void>`                            | Cria o canvas (tela inteira, `aria-hidden`), carrega o GLB, compila os shaders (`compileAsync`) e liga o loop. Sem WebGL ou com erro no GLB, troca sozinho para o PNG. |
| `appearAt(anchor)`                                  | Aparição: escala 0,6 → 1, opacidade 0 → 1, yaw +40° → pose, 500 ms `power2.out`, e piscada.                                                                            |
| `flyTo(anchor, { facing?, duration? })`             | Voo em arco (ver seção 8). Emite `arrived`.                                                                                                                            |
| `gesture(name, { target? })`                        | `wave`, `present`, `point` (inclina para `target`), `think`, `bye`, `idle`. Resolve quando o gesto "acontece".                                                         |
| `talk({ text, narrate })`                           | Legado (Web Speech). O fluxo atual usa `speakLevel`.                                                                                                                   |
| `speakLevel(level \| 'auto' \| null)`               | Boca pelo volume (0..1), padrão pseudoaleatório (`'auto'`) ou sorriso (`null`). Chamado a cada quadro pelo orquestrador.                                               |
| `lookAt(point \| null)`                             | Ponto de descanso do olhar (o centro do tooltip). O mouse tem prioridade.                                                                                              |
| `setExpression(e)`                                  | `smile`, `blink`, `wink`, `listen`, `talk`.                                                                                                                            |
| `vanishInto(anchor, { duration?, animate? })`       | Voa para dentro de uma mídia e sai de cena (última etapa). `animate: false` já começa fora de cena.                                                                    |
| `emergeTo(anchor, { facing?, duration? })`          | Caminho inverso: sai da mídia até `anchor`. Emite `arrived`.                                                                                                           |
| `placeAt(anchor)`                                   | Reposiciona sem animar (resize).                                                                                                                                       |
| `exit()`                                            | Voa para fora pelo canto superior direito (900 ms) e some. Não faz nada se o Nexo está fora de cena.                                                                   |
| `hide()`                                            | Fade de 200 ms, sem voo.                                                                                                                                               |
| `useFallback()`, `useVoice(voice)`, `stopTalking()` | Troca para o PNG; liga o VoicePlayer ao ciclo de vida (`destroy` também o destrói); para a fala.                                                                       |
| `on(event, cb)`                                     | Eventos: `ready` (montado), `error` (GLB falhou → PNG), `arrived` (fim de um voo).                                                                                     |
| `destroy()`                                         | Ver abaixo.                                                                                                                                                            |

Getters: `mode` (`webgl` / `png` / `none`), `position` (centro do corpo, px da viewport), `isFlying`, `isVanished`, `currentExpression`, `debugStage`.

**Âncora:** sempre o centro do **corpo** do robô em px da viewport (`DOMRect` vira o centro do retângulo).

**`destroy()` libera** ([NexoGuide.ts](src/nexo/NexoGuide.ts) e [NexoStage.ts](src/nexo/NexoStage.ts) `dispose`): a voz (pausa, descarrega os `<audio>` e fecha o `AudioContext`), o listener de resize, timers e tweens, os listeners de ponteiro do olhar, geometrias, materiais, texturas (mapas, rosto e ambiente PMREM), o renderer (`dispose` + `forceContextLoss`), o canvas e o PNG. Medido nos testes: de 14 geometrias, 7 texturas e 5 programas para 0 / 1 / 0 (a textura restante é uma LUT interna do three, liberada com o contexto).

---

## 5. Configuração das etapas (`steps.ts`)

[src/coachmark/steps.ts](src/coachmark/steps.ts). O texto de cada tooltip **não** fica em `steps.ts`: vem do `voiceManifest.json` (campo `voice`), para a tela e o grifo usarem a mesma divisão de palavras.

| Campo                | Valores                                                 | Significado                                                                                                                                     |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | string                                                  | Identificador (vai para `data-coach-step` no `<html>`).                                                                                         |
| `route`              | `/home`, `/ferramentas`, `/seu-negocio`                 | Tela da etapa. Rota diferente da anterior = troca de tela.                                                                                      |
| `target`             | seletor CSS ou lista                                    | Alvo destacado (`[data-coach="..."]`). Uma lista sobe junta (união dos retângulos).                                                             |
| `highlight`          | `circle` · `card` · `row` · `none`                      | Visual do destaque. `circle`: fundo branco circular (itens da sidebar). Os outros só sobem o alvo acima do overlay, nítido, sem mudar o visual. |
| `advanceOn`          | `next` · `target` · `action`                            | `next`: "Próximo", → e Enter. `target`: também o clique no alvo. `action`: só a ação (`action`), sem "Próximo".                                 |
| `action`             | `{ selector, label, hint, run, flyTo? }`                | Só com `action`: elemento gatilho, rótulo acessível, texto do balão, efeito e para onde o ícone voa.                                            |
| `voice`              | chave do manifesto                                      | Áudio, texto e tempos das palavras.                                                                                                             |
| `tooltip.kind`       | `text` · `preview` · `image` · `loop`                   | `preview`: demo do cursor (etapa 3). `loop`: vídeo mudo em loop no topo.                                                                        |
| `tooltip.placement`  | `right` · `bottom`                                      | Lado preferido. O fallback é `top` e, por último, `clamped` (seção 6).                                                                          |
| `tooltip.offset`     | `{ x, y }` (px)                                         | Do Figma. `right`: a partir do canto superior **direito** do alvo. `bottom`: do canto inferior **esquerdo**.                                    |
| `tooltip.media`      | `{ poster, alt, sources? }`                             | Mídia 378×210. `sources`: WebM primeiro, MP4 de alternativa.                                                                                    |
| `nexo.offset`        | `{ x, y }` (px)                                         | Centro do corpo do Nexo: `x` a partir da borda direita do tooltip, `y` a partir do centro vertical dele.                                        |
| `nexo.facing`        | `left` · `right`                                        | Para onde o Nexo se vira (espelha o yaw de repouso).                                                                                            |
| `nexo.gesture`       | `wave` · `present` · `point` · `think` · `bye` · `idle` | Gesto ao chegar (`point` inclina para o alvo).                                                                                                  |
| `nexo.intoMedia`     | boolean                                                 | O Nexo entra na mídia do tooltip e fica fora de cena (última etapa).                                                                            |
| `completes.favorite` | id                                                      | Efeito que vale **depois** desta etapa (a 3 favorita "Conversas"). Voltar desfaz.                                                               |
| `shows.wazMessage`   | boolean                                                 | Efeito que vale **a partir** desta etapa (a 9 mostra a mensagem do Waz na Home).                                                                |

**As 9 etapas**

| #   | Tela        | Alvo (`data-coach`) | Destaque | Avanço                           | Tooltip                            | Texto (áudio, duração)                                                                                           |
| --- | ----------- | ------------------- | -------- | -------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | Home        | `nav-ferramentas`   | circle   | target                           | texto, à direita                   | "Aqui você acessa suas ferramentas" (`step-01-ferramentas`, 2,29 s)                                              |
| 2   | Ferramentas | `ferramentas-chips` | none     | next                             | texto, abaixo                      | "Vamos focar no Waz por hora, mas você pode contratar mais agentes futuramente depois." (4,99 s)                 |
| 3   | Ferramentas | `card-conversas`    | card     | **action** (pin `fav-conversas`) | prévia animada, à direita          | "Conversas é por onde você consegue visualizar seus leads e atendimentos. Vamos deixar ela favoritada?" (6,08 s) |
| 4   | Ferramentas | `nav-fav-conversas` | circle   | target                           | texto, à direita                   | "Assim ela fica disponível aqui na barra lateral e na sua homepage" (4,34 s)                                     |
| 5   | Ferramentas | `nav-seu-negocio`   | circle   | target                           | texto, à direita                   | "Aqui ficam as informações do seu negócio" (2,90 s)                                                              |
| 6   | Seu negócio | `card-base`         | none     | next                             | texto, à direita                   | "Base de conhecimento é o cérebro digital do seu negócio 🧠" (3,42 s)                                            |
| 7   | Seu negócio | `card-produtos`     | none     | next                             | texto, à direita                   | "Seu catálogo de produtos e serviços fica aqui." (3,33 s)                                                        |
| 8   | Seu negócio | `card-integracoes`  | none     | next                             | texto, à direita                   | "Por aqui você administra suas integrações" (2,87 s)                                                             |
| 9   | Home        | `member-waz`        | none     | next ("Finalizar")               | vídeo em loop, abaixo; `intoMedia` | "O Waz vai te ajudar a seguir daqui em diante! Nos vemos em breve." (4,27 s)                                     |

**Próximo, Voltar e troca de tela** ([src/main.ts](src/main.ts) `go`):

| Passagem                          | Tipo        | Detalhe                                                                                                                                                                                                                                                              |
| --------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 → 2, 5 → 6, 8 → 9 (e o inverso) | Entre telas | Tooltip e destaque saem (120 ms), overlay some (200 ms), tela nova entra limpa (fade + subida de 12 px, 250 ms), 600 ms de tela limpa, overlay volta (300 ms) com o destaque, tooltip entra. O Nexo voa durante o intervalo (1,07 s) e chega quando o overlay volta. |
| 2 → 3, 3 → 4, 4 → 5, 6 → 7, 7 → 8 | Mesma tela  | Tooltip sai (100 ms) enquanto o Nexo relaxa; voo de 850 ms com o destaque migrando em 520 ms; o overlay não pisca.                                                                                                                                                   |
| 3 → 4                             | Ação        | Clique no pin: favorita, feedback de escala (0,85 → 1,1 → 1), o ícone voa em arco até a sidebar (500 ms) e o fluxo avança.                                                                                                                                           |
| 4 → 3 (Voltar)                    | Desfaz      | "Conversas" sai dos favoritos (o item sai da sidebar) e o destaque do pin recomeça.                                                                                                                                                                                  |
| 8 → 9                             | Entre telas | A Home monta já com a mensagem do Waz (fade + deslize de 6 px antes do overlay voltar); o Nexo entra no vídeo (700 ms).                                                                                                                                              |
| 9 → 8 (Voltar)                    | Entre telas | O Nexo sai do vídeo (700 ms) até a posição da etapa 8; a mensagem sai do estado.                                                                                                                                                                                     |
| 9 → fim                           | Finalizar   | Sem gesto nem voo de saída (o Nexo já está no vídeo): tooltip e overlay somem.                                                                                                                                                                                       |

Antes de uma troca de tela, a tela seguinte é montada numa **sonda invisível** (`router.probe`) só para medir o destino do voo.

---

## 6. Coach mark

[src/coachmark/Coachmark.ts](src/coachmark/Coachmark.ts), estilos em [src/styles/coachmark.css](src/styles/coachmark.css).

- **Overlay:** `rgba(0, 0, 0, 0.45)` + `backdrop-filter: blur(4.45px)` (`--coach-overlay`, `--coach-blur`), opacidade controlada por `--coach-dim` (0–1) e animada em `dim()`. z-index: overlay 100, alvo 110, tooltip e Nexo 120 ([tokens.css](src/styles/tokens.css)).
- **Destaque:** uma classe no próprio elemento (`is-coach-target`), nada é clonado; o alvo sobe acima do overlay e fica nítido. O alvo que perde o destaque mantém `is-coach-leaving` durante a transição (520 ms). Um teste compara o pixel central de cada alvo com e sem o tour.
- **Véu da sidebar:** quando o alvo está numa camada fixa (`[data-coach-layer]`, a sidebar), a camada inteira sobe (`is-coach-layer`) e ganha um véu próprio (`::after`, mesma cor e blur); só o alvo fica acima do véu.
- **Posição do tooltip** ([placement.ts](src/coachmark/placement.ts), `candidates` e `positionTooltip`): (1) o lado do Figma (`right`/`bottom` com o `offset`), (2) `top` (alinhado à direita do alvo, 12 px acima), (3) `clamped` (o primeiro, restrito à viewport). Um candidato serve se cabe na viewport menos 16 px de margem.
- **Posição do Nexo** (`placeNexo`): (a) `right` com `nexo.offset`; (b) `top`, alinhado à borda direita do tooltip, base 8 px acima dele; (c) `clamped`. Evita o tooltip e o alvo (com 12 px de folga) e reserva 24 px dos lados para os gestos. Usa a silhueta real do modelo (`visibleExtents`) ou, antes de carregar, a caixa do PNG do Figma (`NEXO_FIGMA_EXTENTS`).
- **Rolagem:** se o alvo ou o tooltip não cabem na vertical, rola até o alvo e espera parar. Durante o tour a página fica travada (`overflow: hidden` no `<html>`, compensando a barra de rolagem).
- **Tooltip:** 378 px, fundo `#0f0f0f`, raio 8, padding 24 (0 no topo quando há mídia). Texto Inter Semibold 16 px, uma `<span>` por palavra. Rodapé de 64 px: "Voltar" (oculto, ocupando o lugar, na etapa 1), **9 bolinhas** cumulativas e "Próximo" (87×40) ou "Finalizar" (89×40) na última etapa, com a borda de progresso (anel de 3,5 px, gradiente `#E49876` → `#FFC846` → `#FFD8C7`). Entrada: fade + translateX −8 → 0 + escala 0,96 → 1 (250 ms); saída: fade + escala 0,98 (100 ms).
- **Mídia:** `preview` (etapa 3, [previewDemo.ts](src/coachmark/previewDemo.ts): cursor de seta entra, para no pin, clica com onda e o pin fica fixado; repete a cada ~4 s) e `loop` (última etapa: `<video autoplay muted loop playsinline>`, WebM e MP4, capa enquanto carrega e se falhar; pausa com a aba em segundo plano).
- **Etapa 3 (ação):** sem "Próximo" (fica invisível ocupando o lugar). Da entrada do tooltip até o clique, o pin fica 1,8× maior, laranja `#FF6A1F` sobre disco branco, com dois anéis em sequência a cada 0,9 s (até ~2,2×) e um salto por ciclo; o card ganha um halo pulsando (1,8 s) e o balão "Fixar no menu" fica visível acima do pin, com seta e balanço a cada 2 s (`setActionPulse`).
- **Convite "Começar"** (`showInvite`): card no visual do tooltip (280 px, fundo escuro, botão branco) no lugar onde o tooltip da etapa vai entrar, com "Ative o som para ouvir o Nexo". Não é etapa: sem bolinhas. Resolve no clique (seção 7).
- **Fim** (`close` + `finish` em [main.ts](src/main.ts)): remove overlay, tooltip, convite, balão, classes e atributos dos alvos, `--coach-dim`, trava de rolagem, listeners (inclusive os de modalidade e de áudio), destrói o Nexo e foca o primeiro elemento interativo da tela (anel de foco só se o usuário vinha usando o teclado). **Estado final da Home** (Figma 2631:3583): limpa, com a mensagem do Waz e a bolinha de não lida na linha dele ([src/screens/home.ts](src/screens/home.ts)).
- **Saídas:** a única forma de encerrar é o "Finalizar". O **Esc é ignorado** (barrado na captura da `window`, com `preventDefault`) e não há botão de fechar.

---

## 7. Modos de voz e texto

[src/voice/voice.ts](src/voice/voice.ts) (`VoicePlayer`) e [src/main.ts](src/main.ts) (`onFrame`, `onEnd`, `onVoiceToggle`, abertura).

| Modo             | Quando                                             | Texto                              | Ícone        | Borda de progresso                                             | "Próximo"                      | Avanço automático                                     |
| ---------------- | -------------------------------------------------- | ---------------------------------- | ------------ | -------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| **Voz** (padrão) | Sempre que possível                                | Cinza, acendendo palavra a palavra | Pausa        | Segue `audio.currentTime`                                      | Desativado até a fala terminar | Sim, `AUTO_ADVANCE_DELAY_S` = **0,4 s** depois do fim |
| **Texto**        | O usuário pausou a voz, ou o `play()` foi recusado | Todo branco                        | Alto-falante | Timer de duração do áudio × `TEXT_MODE_TIMER_FACTOR` (**1,0**) | Desativado até completar       | **Nunca**                                             |

Regras:

- **Início com voz e autoplay:** antes da etapa inicial, `canPlay()` toca o áudio dela em volume 0 e para na hora (nada se ouve). Se o navegador deixar, a etapa já começa falando. Se bloquear, aparece o **convite "Começar"**: o clique (um gesto do usuário) libera o áudio (`unlock()`, cria o `AudioContext`) e a etapa entra já falando. Se mesmo assim o `play()` for recusado, a etapa segue no modo texto (nota `console.info`, sem erro).
- **A fala começa quando o tooltip termina de entrar** (`present`). O áudio da etapa seguinte é pré-carregado.
- **"Próximo" desativado** (`disabled`, `aria-disabled="true"`, opacidade 0,5) enquanto a borda enche, nos dois modos; ativa com transição de 200 ms. O foco fica no tooltip e passa ao botão quando ele ativa. **Enter**, **→** e o **clique no alvo** (etapas 1, 4 e 5) seguem a mesma regra. **"Voltar"** e o **ícone de som** ficam sempre ativos.
- **Pausar** (clique no ícone ou Espaço com o foco no tooltip, durante a fala): passa ao modo texto **na hora** — áudio para, texto todo branco, boca no padrão — e a borda **continua de onde estava**, no ritmo do modo texto (proporcional ao que falta). As etapas seguintes ficam no modo texto até o usuário clicar no ícone de novo.
- **Religar** (ícone no modo texto): volta ao modo com voz e recomeça a fala do início da etapa (texto cinza, borda do zero, botão desativado de novo).
- **Exceções do avanço automático:** a **etapa 3** nunca avança sozinha (só pelo pin, que funciona a qualquer momento e em qualquer modo); na **última etapa**, o fim da fala só ativa o "Finalizar".
- **Aba em segundo plano:** pausa a fala (ou o timer) e retoma ao voltar.
- **Troca de etapa** (Próximo, Voltar, alvo, avanço automático, Finalizar): para o áudio e zera grifo, borda e boca antes de qualquer animação (`silence`).
- **Emoji** solto (🧠, etapa 6) acende junto com a palavra anterior e não mexe a boca (`isSymbolToken`).

---

## 8. Nexo 3D

**Modelo** ([public/models/nexo.glb](public/models/nexo.glb)): **1,47 MB, 86.762 triângulos**, textura WebP 2048² q85, malha com `EXT_meshopt_compression`. Gerado do original (~23 MB, fora do repositório: `assets-src/nexo-3d.glb`) por [scripts/optimize-glb.sh](scripts/optimize-glb.sh) (`npm run optimize:glb`): `weld` → `dilate` das ilhas de UV → `simplify` (ratio 0,12) → `smooth` (normais, crease 60°) → `weld` → `resize` 2048 → `webp` q85 → `meshopt --level medium --quantize-normal 12`. O nível `medium` é necessário: o `high` força normais de 8 bits e o casco faceta. É uma **malha única, sem esqueleto**: os gestos são de corpo inteiro.

**Render** ([NexoStage.ts](src/nexo/NexoStage.ts), [nexoMaterial.ts](src/nexo/nexoMaterial.ts)):

| Item         | Valor                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Canvas       | Tela inteira, fixo, transparente, `antialias`; DPR = `min(devicePixelRatio, 2)`                                                                                                |
| Câmera       | Perspectiva, FOV 22°, distância 10, pitch 12°; _lens shift_ (`setViewOffset`) centrado no robô (sem distorção fora do eixo)                                                    |
| Tamanho      | Corpo calibrado para **96,5 px** de altura na tela                                                                                                                             |
| Pose         | Yaw −38° (3/4 para o tooltip), espelhado com `facing`                                                                                                                          |
| Tone mapping | ACES Filmic, exposição 1,1                                                                                                                                                     |
| Luzes        | Ambiente `RoomEnvironment` (PMREM) 0,7; key branca 1,5 em (−3, 4, 3); rim quente `#ffd2b0` 5 em (2,5, 1,5, −3)                                                                 |
| Material     | `MeshPhysicalMaterial`: rugosidade 0,35 (tela 0,08), clearcoat 1 (0,15), sheen 0,3 rosado, iridescência 0,4; laranja `#ff6a1f` com emissivo `#ff5a14` 1,6 por máscara de matiz |
| Loop         | No `gsap.ticker`; só renderiza se algo mudou; depois de 5 s só flutuando cai para ~30 fps; pausa com `document.hidden`                                                         |

**Animações e tempos** ([NexoGuide.ts](src/nexo/NexoGuide.ts), [flight.ts](src/nexo/flight.ts), [gestures.ts](src/nexo/gestures.ts), [main.ts](src/main.ts)):

| Momento                  | Tempo / regra                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrada                  | Aos 600 ms da abertura: escala 0,6 → 1, opacidade 0 → 1, yaw +40° → pose, 500 ms `power2.out`. Se o GLB não carregou em 3 s, segue com o PNG.                                       |
| Relaxar antes do voo     | 100 ms: corpo ao neutro, flutuação a zero, olhar à frente                                                                                                                           |
| Voo (mesma tela)         | 850 ms, Bézier com os controles 18% acima (arco), `power2.inOut`, banking até 8° pela velocidade, giro de 40° e escala 0,9 no meio; sem antecipação nem overshoot                   |
| Voo (entre telas)        | 1,07 s (tooltipOut − relax + overlayOut + screenIn + 600 ms de tela limpa)                                                                                                          |
| Chegada                  | Piscadela (450 ms), gesto da etapa junto com o tooltip, e volta a flutuar                                                                                                           |
| Idle                     | Flutuação ±3 px em 3 s, entra em 600 ms                                                                                                                                             |
| Gestos                   | `wave` (±7° em Z, ~500 ms), `present`, `point` (10° e 8 px para o alvo), `think`, `bye`                                                                                             |
| Entrar no vídeo (última) | `vanishInto`: 100 ms de relaxamento + arco de 700 ms até o centro da mídia, escala 1 → 0,3 e opacidade 1 → 0. Depois: loop de render **parado**, sem olhar, sem flutuação, sem boca |
| Sair do vídeo (Voltar)   | `emergeTo`: 700 ms, escala 0,3 → 1 e opacidade 0 → 1                                                                                                                                |
| Saída                    | `exit`: voo de 900 ms pelo canto superior direito (não usado no fluxo atual, porque o Nexo termina dentro do vídeo)                                                                 |

**Rosto e boca** ([NexoFace.ts](src/nexo/NexoFace.ts)): a tela do rosto é um _decal_ com textura de canvas (1024×768), pixel art laranja com scanlines. Expressões `smile`, `blink` (automática a cada 3–5 s), `wink`, `listen`, `talk`. A boca são 5 barras em degraus: com a voz e uma palavra ativa, seguem o volume do `AnalyserNode` (`min(1, RMS × MOUTH_GAIN)`, `MOUTH_GAIN` = **10**, janelas de 1024 amostras, 5 degraus); entre palavras, na pausa, no fim e no modo texto, sorriso no mesmo quadro. Sem analisador (antes de uma interação), padrão pseudoaleatório.

**Olhar** ([NexoLook.ts](src/nexo/NexoLook.ts)): yaw/pitch relativos à direção do tooltip, limitados a ±28° / ±16°, constante de tempo 120 ms (olhos 60 ms, chegam antes do corpo). Mouse parado por 2 s ou fora da janela: volta ao tooltip em ~600 ms. Durante voos e gestos o olhar congela.

**Movimento reduzido** (`prefers-reduced-motion`, [utils/reducedMotion.ts](src/utils/reducedMotion.ts)): sem voo (fade de 150 ms para fora e 200 ms para dentro), sem flutuação, sem olhar pelo mouse, gestos com metade da amplitude, rosto mais lento e boca em 3 degraus; entrar e sair do vídeo viram fade de 200 ms.

**Fallback sem WebGL** (`?nowebgl`, sem WebGL, GLB com erro ou mais de 3 s carregando): [public/fallback/nexo.png](public/fallback/nexo.png) (117 KB) posicionado pela mesma API, com fade entre as etapas; sem gestos nem boca. O tour nunca quebra por causa do Nexo.

---

## 9. Voz e áudios

- **Origem:** Seed Audio 1.0 (Magnific). As nove falas saíram de **uma única gravação**, com a voz aprovada como referência, timbre igualado, acelerada 1,2x, pausas internas encurtadas e cortada por fala ([nexo-voice/voices.json](nexo-voice/voices.json), campo `note`). Os MP3 em [nexo-voice/sources/](nexo-voice/sources/) já são finais: **nenhum efeito, filtro ou mudança de velocidade** é aplicado no projeto. No app: [public/audio/nexo/](public/audio/nexo/) (9 arquivos, 568 KB no total).
- **Manifesto** ([src/voice/voiceManifest.json](src/voice/voiceManifest.json)): por etapa, `audio`, `text` (o texto exibido no tooltip), `duration`, `method` e `words` (`text`, `start`, `end` de cada palavra). Gerado por:

  ```bash
  pip install numpy scipy faster-whisper     # e ffmpeg no PATH (só para ler o áudio)
  python3 nexo-voice/build_voices.py         # na raiz do app
  ```

  [build_voices.py](nexo-voice/build_voices.py) copia cada fonte como está e roda [align.py](nexo-voice/align.py): o faster-whisper (modelo `small`, pt, `word_timestamps`) transcreve, as palavras ouvidas são casadas com o texto da tela (`difflib`), as sem par são interpoladas e os tempos ficam crescentes e sem sobreposição. Sem o faster-whisper, cai num plano B (energia + sílabas, `method: "energia+silabas"`). `"prompt": true` numa etapa do `voices.json` passa o texto como `initial_prompt`, para quando o reconhecimento erra palavras. Hoje as nove etapas são `faster-whisper`, sem prompt. O "Waz" é falado "Uóis"; o casamento com o texto garante o grifo no "Waz".

- **Gerar falas novas sem a voz mudar:** grave **de novo todas as falas numa só geração**, com o mesmo prompt e a voz aprovada como referência, corte por fala e substitua as nove fontes. **Nunca gere uma fala isolada**: uma geração separada sai com timbre, ritmo e volume diferentes. Depois: atualize os textos no `voices.json`, rode o `build_voices.py`, confira o `method` e os tempos de cada etapa e recalibre o `MOUTH_GAIN` se o volume mudar (a voz atual tem RMS mediano ≈ 0,03 nas palavras). O áudio de referência da voz aprovada **não está no repositório**: peça ao time que cuida da voz.

---

## 10. Acessibilidade e performance

**Acessibilidade**

| Item               | Implementação                                                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Semântica          | Tooltip e convite com `role="dialog"` e `aria-modal`; texto completo para leitores de tela num `aria-live="polite"` (o grifo em spans é `aria-hidden`); canvas `aria-hidden` ([Coachmark.ts](src/coachmark/Coachmark.ts))                                                                       |
| Botões             | Ícone de som com `aria-label` ("Ouvir o Nexo" / "Pausar") e `aria-pressed`; "Próximo" com `aria-disabled`; o pin da etapa 3 recebe o rótulo "Fixar Conversas no menu" e o devolve no fim                                                                                                        |
| Teclado            | → e Enter avançam (se o "Próximo" estiver ativo); ← volta; Espaço com o foco no tooltip pausa/religa a voz; Enter/Espaço no pin favoritam; **Tab preso** no tooltip (e no pin, na etapa 3); Esc ignorado                                                                                        |
| Foco               | Tooltip (enquanto o botão está desativado) → "Próximo"; pin na etapa 3; botão "Começar" no convite; primeiro elemento interativo da tela no fim. Anel de foco só com teclado: `:focus-visible` + `<html data-input="keyboard\|pointer">` ([utils/inputModality.ts](src/utils/inputModality.ts)) |
| Movimento reduzido | Ver seção 8; também a cascata da Home só com fade, o pin parado (mantendo tamanho, cor e anel), a prévia parada e o vídeo trocado pela capa                                                                                                                                                     |

**Performance** (medido pelos testes em 1440×900, DPR 2, com o overlay desfocado, Chrome no macOS):

| Métrica                                      | Meta          | Medido                                                       |
| -------------------------------------------- | ------------- | ------------------------------------------------------------ |
| FPS nos voos                                 | ≥ 55          | **60,1 fps** (média 16,65 ms, p95 17,5 ms, 0 quadros lentos) |
| GLB                                          | ≤ 1,5 MB      | 1,47 MB, 86.762 triângulos                                   |
| JS do Nexo (chunk separado, three.js + Nexo) | —             | 678 KB (174 KB gzip), carregado em paralelo depois da Home   |
| JS principal / CSS                           | —             | 140 KB (51 KB gzip) / 32 KB (8 KB gzip)                      |
| Áudios / vídeo                               | —             | 568 KB (9 MP3) / WebM 211 KB, MP4 311 KB, capa 44 KB         |
| Memória após `destroy()`                     | tudo liberado | 0 geometrias, 0 programas, 1 textura interna do three        |

Outras decisões de performance: shaders compilados no carregamento (`compileAsync`), o 3D só renderiza quando algo muda (e cai para 30 fps parado), o render para por completo enquanto o Nexo está dentro do vídeo, e o `AudioContext` só nasce depois de uma interação.

---

## 11. Integração na plataforma

**Reaproveitar como está** (TypeScript sem framework, depende só de `three` e `gsap`): [src/nexo/](src/nexo/) inteiro (`NexoGuide` é a fachada), [src/voice/voice.ts](src/voice/voice.ts), [src/coachmark/placement.ts](src/coachmark/placement.ts), [src/coachmark/steps.ts](src/coachmark/steps.ts) (o formato) e os estilos de [coachmark.css](src/styles/coachmark.css) e [nexo.css](src/styles/nexo.css) com os tokens.

**Adaptar por stack**

- **Orquestração** ([main.ts](src/main.ts)): vira um serviço/hook do onboarding. Em React, crie o `NexoGuide` e o `VoicePlayer` num `useEffect` e chame `destroy()` no cleanup (o `StrictMode` monta duas vezes: o `destroy` precisa rodar entre as montagens). Em Vue, `onMounted`/`onUnmounted`.
- **Coach mark:** hoje manipula o DOM direto (classes nos alvos, overlay e tooltip no `body`). Dá para manter como está montado num portal, ou reescrever o tooltip como componente, mantendo `placement.ts` e as regras da seção 6. Cuidado: o destaque é uma **classe** no elemento do alvo; se o framework reescrever o `className` desse elemento num re-render, o destaque some. Prefira alvos com `className` estável ou passe o destaque para um atributo.
- **Roteamento:** troque o roteador por hash pelo da plataforma. A troca de tela precisa de duas coisas que o protótipo faz com `router.probe` e `router.go`: medir o destino **antes** do voo (montar a tela seguinte fora da vista, ou navegar e só então medir e voar) e saber quando a tela nova terminou de entrar.
- **Estado:** `appState` (favoritos e mensagem do Waz) vira o estado real. O favorito da etapa 3 deve chamar a API de favoritos de verdade, e o "Voltar" da 4 para a 3 precisa desfazer (ou a plataforma decide não desfazer; ver perguntas abertas).

**Assets e hospedagem**

- GLB, áudios, vídeo, capa e PNG em CDN, **com versão no nome** (ex.: `nexo.v3.glb`, `step-01-ferramentas.v2.mp3`); o Vite só põe hash no JS e no CSS. Os caminhos passam por [`asset()`](src/utils/asset.ts) (`BASE_URL`).
- O `<audio>` usa `crossOrigin="anonymous"` (o `AnalyserNode` da boca precisa ler o áudio): a CDN tem que responder com `Access-Control-Allow-Origin`. Sem isso, o áudio toca, mas a boca fica no padrão pseudoaleatório.
- O GLB usa `EXT_meshopt_compression`: o `GLTFLoader` precisa do `MeshoptDecoder` (já configurado em [NexoStage.ts](src/nexo/NexoStage.ts)).
- O chunk do Nexo (~174 KB gzip) deve continuar com `import()` dinâmico, só para quem vai ver o onboarding.

**Backend**

- Trocar `localStorage['onboarding:done']` por uma flag por usuário (ex.: `onboarding_completed_at`), gravada no "Finalizar" ([main.ts](src/main.ts) `finish` → `writeDone`).
- Disparar o tour só para usuários novos (flag ausente). Em produção, `VITE_DEMO_MODE=false` (o modo demonstração ignora a flag).
- A mensagem do Waz na Home ("Oi aqui o Waz! Estou animado em me juntar ao seu time!") hoje é fixa e em memória ([home.ts](src/screens/home.ts)); na plataforma deve ser uma mensagem real do agente, que persiste.

**Se os seletores dos alvos mudarem:** os alvos são atributos `data-coach="..."` ([sidebar.ts](src/app/sidebar.ts), [screens/](src/screens/)), não classes. Na plataforma, adicione os mesmos `data-coach` aos componentes reais (ou atualize os `target` em `steps.ts`) e marque a sidebar com `data-coach-layer`. Hoje um alvo ausente faz `Coachmark.goTo` lançar erro: na plataforma, decida um comportamento seguro (pular a etapa ou encerrar o tour) e registre o evento. Os testes de layout (seção 12) pegam alvos fora do lugar.

---

## 12. Testes como critérios de aceite

[scripts/test-onboarding.mjs](scripts/test-onboarding.mjs) (`npm test`, 170 verificações, Chrome 1440×900 DPR 2, mais 1920×1080 onde indicado). Use como checklist da implementação real.

**Fluxo e transições**

- As 9 etapas na rota certa, com 1/9…9/9 bolinhas, o alvo destacado e o foco certo; o mesmo canvas do Nexo do início ao fim (não remonta).
- O tooltip novo nunca aparece durante o voo; 8 voos (3 entre telas); ≥ 55 fps no voo.
- Ida e volta 1 → 9 → 1 sem estado inconsistente: rota, bolinhas, alvo, favorito, botões e posição do Nexo em cada etapa; "Voltar" e "Próximo" desabilitados durante o voo; ← não faz nada na etapa 1; rodapé idêntico em todas as etapas.
- Troca de tela (1→2, 5→6, 6→5, 8→9, 9→8): overlay some, ~600 ms de tela limpa e o overlay só volta depois do voo; na mesma tela o overlay não pisca.
- Alvos navegáveis (1, 4, 5) com cursor pointer e hover; o alvo da última etapa não navega.
- Pixel central de cada alvo idêntico com e sem o onboarding (destaque sem alterar o visual).
- Etapas 6–8: tooltip só de texto; tooltip e Nexo não cobrem o alvo nem um ao outro, dentro da tela, em 1440×900 e 1920×1080.

**Voz e texto**

- Autoplay liberado: a etapa 1 já fala, sem convite. Autoplay bloqueado: convite antes da etapa 1 (sem tooltip, sem bolinhas, sem som), e o "Começar" faz a etapa 1 entrar falando. `play()` recusado depois do clique: modo texto, sem erro.
- Modo com voz: grifo, borda, ícone de pausa e "Próximo" desativado durante a fala; ativa no fim e avança ~400 ms depois; a etapa 3 não avança; a última só ativa o "Finalizar".
- Modo texto: texto branco, borda no tempo do áudio e botão desativado até completar; nenhum avanço automático; a etapa seguinte também no modo texto.
- Pausar no meio: no mesmo instante texto branco, áudio parado, borda no mesmo ponto; depois, a borda continua no ritmo do modo texto. Religar: fala do início, borda do zero, botão desativado, e o avanço automático volta.
- Boca só com palavra ativa (no mesmo quadro) e no padrão em todo o modo texto.
- Durante a fala, alvo, Enter e → não avançam.

**Etapa 3**

- Pin 1,8× laranja com disco branco, dois anéis (0,9 s), salto, halo no card e balão com seta e balanço; o destaque só para no clique.
- Prévia com cursor de seta que clica e fixa o pin, repetindo a cada ~4 s.
- Clique no pin (ou Enter/Espaço com o foco nele) favorita, cria o item na sidebar e avança; funciona em qualquer modo e a qualquer momento. Voltar da 4 para a 3 desfaz o favorito.
- Sem "Próximo", sem avanço automático, → não avança.

**Última etapa e fim**

- Home com a mensagem do Waz entrando antes do destaque; linha do Waz em (508, 325) 832×96 destacada; tooltip com o vídeo abaixo dela, alinhado à direita.
- Vídeo mudo em loop, WebM antes do MP4, 378×210; pausa com a aba oculta; sai ao sair da etapa; capa com movimento reduzido ou se falhar.
- O Nexo entra no vídeo (~700 ms, sem overshoot, tooltip só depois), fica invisível e com o render parado (mesmo mexendo o mouse); a voz fala sem boca; voltar o traz de volta à etapa 8.
- Finalizar sem voo de saída; Home limpa com a mensagem e a bolinha; nada destacado; nenhuma outra tela; `onboarding:done` salvo; recarregar não reabre o tour.
- Sem resíduos: overlay, tooltip, classes, `z-index`, trava de rolagem, `data-*` no `<html>`, canvas e listeners de teclado do tour removidos; `destroy()` libera a GPU.

**Teclado, acessibilidade e robustez**

- Tab preso no tooltip; anel de foco só com teclado, arredondado.
- Esc em cada etapa não muda nada (nem a fala); nenhuma etapa tem botão de fechar.
- Movimento reduzido: sem voo nem flutuação; Nexo some e reaparece com fade de 200 ms na última etapa.
- Sem WebGL: PNG posicionado e o fluxo segue.
- Sem erros no console em cada cenário.

---

## 13. Decisões, limitações e pendências

**Decisões**

| Decisão                                                    | Por quê                                                                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convite "Começar" quando o autoplay é bloqueado            | Navegadores não tocam som antes de uma interação, e isso não se contorna por código. O teste em volume 0 (`canPlay`) evita o convite quando o som já é permitido. |
| Voz em gravação única, sem efeitos no projeto              | Falas geradas separadamente saem com timbre e ritmo diferentes; os arquivos chegam finais e são copiados sem processamento.                                       |
| "Próximo" desativado até a borda completar, nos dois modos | Garante que a pessoa ouça ou leia a dica antes de seguir; no modo texto não há avanço automático para não tirar o controle.                                       |
| Texto do tooltip vindo do manifesto da voz                 | A tela e o grifo usam a mesma divisão de palavras; trocar uma fala troca o texto junto.                                                                           |
| Nexo entra no vídeo na última etapa                        | O vídeo já mostra o Nexo; dois Nexos na tela confundiriam.                                                                                                        |
| Estado do fluxo derivado da etapa (`flowStateAt`)          | "Voltar" desfaz exatamente o que o avanço fez, e `?step=N` reconstrói o estado.                                                                                   |
| Esc ignorado e sem botão de fechar                         | Pedido de produto: a única saída é o "Finalizar".                                                                                                                 |
| "Próximo" desativado a 50% de opacidade                    | O Figma só mostra a pílula com a borda enchendo; não há variante "disabled" no arquivo.                                                                           |

**Bugs conhecidos e limitações**

- **Desfoque do overlay ausente no build de produção.** O minificador de CSS do Vite mantém só o `-webkit-backdrop-filter` e descarta o `backdrop-filter` (no `dist/assets/main-*.css` gerado: `.coach-overlay{…-webkit-backdrop-filter:blur(…)}`); o Chrome fica sem blur. No dev funciona. Correção sugerida: tirar a linha `-webkit-backdrop-filter` de [coachmark.css](src/styles/coachmark.css) (o minificador gera o prefixo pelos `targets`) ou trocar o minificador (`build.cssMinify: 'esbuild'`).
- Os anéis maiores do pin (etapa 3) são cortados na borda de cima do card do Conversas (`overflow: hidden` no card).
- O badge "1" do Waz na sidebar fica sempre visível; no Figma final ele não aparece.
- A tecla **D** abre o painel de debug também no site publicado.
- Testado só no Chrome de desktop (macOS), em 1440×900 e 1920×1080. Faltam Safari, Firefox e telas menores; abaixo de ~1280 px as regras de colisão caem em `clamped` e o tooltip pode encostar no alvo.
- O braço do Nexo não mexe (malha sem esqueleto); para gestos de braço é preciso um GLB com esqueleto.
- A mensagem do Waz e os favoritos ficam só em memória.

**Perguntas abertas para o time**

1. **Saída do tour:** hoje só o "Finalizar" encerra (sem Esc nem fechar). Isso atende às diretrizes de acessibilidade da plataforma, ou precisamos de um "pular" discreto?
2. **Mobile e telas pequenas:** o onboarding vai rodar abaixo de 1280 px? Se sim, falta definir o layout (tooltip e Nexo).
3. **Favorito da etapa 3:** deve gravar de verdade na API? E o "Voltar" da 4 para a 3 deve desfazer o favorito real?
4. **Mensagem do Waz:** de onde vem na plataforma (mensagem real do agente?) e quando é marcada como lida?
5. **Retomar no meio:** se a pessoa recarregar no meio do tour, ele recomeça do início ou da etapa em que parou?
6. **Alvo ausente:** se um alvo não existir para aquele usuário (permissão, plano), pula a etapa ou encerra o tour?
7. **Analytics:** quais eventos registrar (início, cada etapa, pausa da voz, convite, conclusão, tempo por etapa)?
8. **Idiomas:** haverá outras línguas? Cada idioma precisa da sua gravação única e do seu manifesto.
9. **Assets:** qual CDN e qual política de versão de nome?

---

Histórico do desenvolvimento do protótipo (relatórios, prompts e prints antigos): [docs/archive/](docs/archive/). Não é necessário para a implementação.
