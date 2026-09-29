# Nexo · detalhes técnicos

Complemento do [README](../README.md) para quem vai manter ou integrar o código. Decisões, medições e histórico das fases estão no [RELATÓRIO](RELATORIO.md).

## URLs de desenvolvimento

| URL                          | Para quê                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/?onboarding=reset`         | Reinicia o tour (dev). No site publicado o tour sempre começa do início.                                   |
| `/?step=N`                   | Abre direto na etapa N (1–7), sem a abertura.                                                              |
| `/?nowebgl`                  | Força o fallback em PNG.                                                                                   |
| `/?debug`                    | Liga o painel da tecla **D** (PNG do Figma a 40% sobre o Nexo, valores de render e a posição usada a/b/c). |
| `/?model=<url>`              | Troca o GLB (dev).                                                                                         |
| `/preview.html#/ferramentas` | As telas sem o onboarding (`?fav=conversas` marca o favorito).                                             |
| `/lab.html`                  | Laboratório do Nexo: `__lab.gesture('wave')`, `__lab.face('talk')`, `__lab.look(0.5, 0)` no console.       |

## Scripts

| Comando                                                       | O que faz                                                                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `preview`                           | Vite. O build separa o three.js num chunk carregado depois da home.                                               |
| `npm run lint`                                                | ESLint (TypeScript `strict`, sem `!`).                                                                            |
| `npm test`                                                    | Suíte do onboarding, com 93 verificações (ver abaixo). Precisa do dev server em `:5199` (`npx vite --port 5199`). |
| `npm run checkpoint`                                          | Prints das etapas em 1440×900 e 1920×1080 (DPR 2), mais `posicoes.json`.                                          |
| `npm run record -- <flow\|talk\|look\|gestures> <saida.webm>` | Vídeos de verificação a 60 fps.                                                                                   |
| `npm run optimize:glb`                                        | Gera `public/models/nexo.glb` a partir de `assets-src/nexo-3d.glb` (fora do repositório).                         |
| `npm run measure:png`                                         | Mede a caixa visível e o corpo do PNG do Nexo no Figma e grava `scripts/png-bbox.json`.                           |

O `npm test` abre o Chrome instalado via `playwright-core`. Ele cobre:

- as 9 etapas, com rota, bolinhas, foco e o mesmo canvas do Nexo;
- ida e volta 1→7→1 (Próximo, →, Voltar e ←): em cada etapa, rota, bolinhas, alvo sem resto de destaque, favorito "Conversas" na sidebar só da 4 em diante, botões, foco, Nexo no ponto certo, sem sonda nem tela duplicada; botões desabilitados durante o voo; rodapé igual em todas as etapas;
- alvo navegável (cursor, hover, clique avança nas etapas 1, 4 e 5; na 7 o clique não navega) e a tela limpa nas trocas entre telas (overlay a 0, ~600 ms de tela nítida, overlay só volta depois do voo; na mesma tela o overlay não pisca);
- o tooltip nunca aparecendo durante o voo, e o FPS no voo;
- fim do tour, persistência, Tab preso no tooltip, `:focus-visible` e Esc em cada uma das 9 etapas;
- movimento reduzido e fallback sem WebGL;
- prévia animada e vídeo;
- voz gravada: áudio e spans por etapa, avanço automático em duração + 400 ms, pausa e retomada no início da palavra, "Próximo" interrompendo a fala, modo silencioso (autoplay bloqueado) e boca sincronizada com a palavra ativa;
- memória liberada no `destroy()`.

## Estrutura

```
src/
  main.ts                 orquestra o onboarding (abertura, trocas de etapa, fim)
  app/                    router.ts (hash + sonda de medição), sidebar.ts (persistente), state.ts (favoritos)
  screens/                home.ts, ferramentas.ts, seuNegocio.ts (mount/unmount), types.ts, index.ts
  coachmark/
    steps.ts              configuração das 9 etapas (voz, alvos, offsets do Figma, gestos)
    Coachmark.ts          overlay com blur, destaque, tooltip (text/preview/video), bolinhas, áudio, teclado
    previewDemo.ts        demonstração animada do cursor (etapa 3)
    placement.ts          posicionamento com prioridade (lado do Figma → acima → clamp)
  nexo/
    NexoGuide.ts          API pública do mascote (+ fallback PNG)
    NexoStage.ts          renderer, câmera (lens shift), luzes, loop, calibração pelo corpo
    nexoGeometry.ts       leitura da geometria do GLB (transform assado, sem ossos)
    gestures.ts           gestos de corpo inteiro (inclinação, giro, recuo)
    NexoFace.ts           rosto em canvas (decal): expressões e fala de robô
    NexoLook.ts           olhar seguindo o mouse
    narration.ts          Web Speech API (legado: só NexoGuide.talk)
  voice/
    voice.ts              VoicePlayer: relógio da fala (currentTime), grifo, anel, pausa, modo silencioso, AnalyserNode
    voiceManifest.json    texto, duração e tempo de cada palavra (gerado por nexo-voice/)
    flight.ts             trajetória em arco, banking e envelope do voo
    nexoMaterial.ts       material, máscaras e TODOS os valores de render (constantes nomeadas)
    nexoModels.ts         limites de busca da tela do rosto
  debug/NexoDebug.ts      tecla D
  styles/                 tokens.css, app.css, coachmark.css, nexo.css, screens/*.css
public/
  models/nexo.glb         1,47 MB, 86.762 triângulos, textura WebP 2048² q85
  fallback/nexo.png       PNG para quando não há WebGL
  images/…                assets do Figma (≤ 1024 px)
  video/seu-negocio.webm  vídeo de placeholder (etapa 6)
scripts/                  pipeline do GLB, medições, testes, prints e gravação
docs/checkpoints/         prints e vídeos de conferência (gerados; fora do repositório)
assets-src/               originais: nexo-3d.glb (fora do repositório) e o PNG de referência do rosto
```

## Navegação e estado do fluxo

**Navegação nos dois sentidos e estado do fluxo:**

- **Alvo clicável:** com `targetClickAdvances: true` (etapas 1, 4 e 5, cujos alvos são itens de navegação), clicar no alvo destacado avança exatamente como o "Próximo". O alvo ganha `cursor: pointer` e hover (fundo `#EBEDED` e anel branco); durante a transição, o clique é ignorado. Nos outros alvos, um link não navega durante o tour (a rota é sempre do fluxo).
- "Próximo" (→ ou Enter) avança e "Voltar" (←) retorna, com a mesma coreografia invertida: o tooltip sai, o Nexo voa de volta, o destaque migra e o tooltip anterior entra junto com o gesto. Voltar entre telas (6 → 5, 2 → 1) refaz a troca de tela no sentido inverso, com a mesma tela limpa.
- O estado do fluxo não é acumulado: `flowStateAt(i)` o **deriva** dos `completes` das etapas anteriores, e `applyFlowState(i)` o aplica a cada troca (e no `?step=N`). Por isso todo estado é reversível: ao voltar da 4 para a 3, "Conversas" sai dos favoritos (com fade na sidebar).
- Hoje o único efeito é `completes: { favorite: 'conversas' }` na etapa 3. A prévia (etapa 3) e o vídeo (etapa 6) vivem dentro do tooltip e são refeitos a cada exibição.
- **Limite conhecido:** o fluxo só controla os favoritos declarados em `completes`. Se o usuário fixar ou desafixar "Conversas" à mão durante o tour, voltar ou avançar sobrescreve essa escolha com o estado da etapa.

## Sequência

- **Abertura** (primeiro tooltip visível em ~1,6 s desde o carregamento; medido com `node scripts/measure-timing.mjs`):
  - a home entra em cascata;
  - em ~600 ms o Nexo aparece (escala 0,6 → 1 e yaw +40° → pose, 500 ms, `power2.out`) e pisca;
  - na chegada, começam juntos: escurecimento e desfoque (450 ms), destaque do alvo, tooltip, aceno curto (~500 ms) e fala.
- **Troca de etapa na mesma tela** (clique → tooltip visível: ~1,15 s; o overlay não pisca):
  - t0: o tooltip sai (100 ms) enquanto o Nexo relaxa: corpo ao neutro, flutuação a zero e olhar à frente;
  - +100 ms: voo de 850 ms (arco com os pontos de controle 18% acima, `power2.inOut`, banking de até 8° pela velocidade analítica, yaw e profundidade de 0,9), sem antecipação;
  - o destaque migra em 520 ms junto com o voo;
  - chegada sem overshoot (a escala volta a 1 pelo próprio arco), piscadela, `arrived`;
  - o tooltip novo entra (250 ms), o gesto da etapa e a fala começam juntos.
- **Troca de etapa entre telas** (1 ↔ 2 e 5 ↔ 6, pelo "Próximo", pelo clique no alvo ou pelo "Voltar"; clique → tooltip visível: ~1,7 s). A tela nova entra limpa e só depois o overlay volta (`CROSS_SCREEN` e `CLEAN_SCREEN_HOLD_S` em [main.ts](../src/main.ts)):
  - t0: o tooltip sai (120 ms) e o destaque apaga (120 ms);
  - o overlay some por completo (200 ms: sem escurecimento nem blur) enquanto a tela antiga sai;
  - a tela nova monta e entra limpa, com fade e subida de 12 px (250 ms);
  - **`CLEAN_SCREEN_HOLD_S` = 0,6 s** com a tela inteira nítida;
  - o overlay volta (300 ms) junto com o destaque da etapa nova, e o tooltip entra ao fim dele, junto com o gesto.
  - O Nexo voa durante esse intervalo, sobre a tela limpa: a duração do voo é calculada para ele chegar quando o overlay vai voltar (muda junto com `CLEAN_SCREEN_HOLD_S`).
- **Um dono por eixo:** durante o voo, posição, escala, banking (Z) e yaw pertencem ao arco; durante o gesto, o olhar fica congelado e a flutuação desligada. A flutuação (±3 px em 3 s, sem rotação) e o olhar voltam quando o gesto termina. Nenhum movimento usa `back`/`elastic`.
- **Entre telas:** a tela seguinte é montada numa sonda invisível para medir o destino antes da decolagem. A troca real (fade out 200 ms, montagem, fade in 250 ms) acontece por baixo do voo.
- **Voltar:** a mesma troca, no sentido inverso (ver "Navegação nos dois sentidos").
- **Fala:** começa quando o tooltip termina de entrar. 400 ms depois do fim do áudio, o fluxo avança com a mesma transição do clique (na última etapa, encerra). Toda troca (Próximo, Voltar, alvo, avanço automático, Esc) para o áudio e zera grifo, anel e boca antes de qualquer animação. O áudio da etapa seguinte é pré-carregado.
- **Etapas especiais:** na 3, a demonstração do cursor começa depois do tooltip. Nas 6 e 7, o Play do vídeo pausa a fala e o Nexo passa a `listen`.
- **Fim:** no "Próximo" da etapa 7, o tooltip sai, o Nexo faz `bye` e voa para fora (900 ms), o overlay some e o foco vai para a página. O Esc encerra a qualquer momento, pela mesma saída sem o gesto.

## Render e modelo

Os valores finais são constantes comentadas em [nexoMaterial.ts](../src/nexo/nexoMaterial.ts).

|          | Valor                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Renderer | `antialias` (MSAA 4x), `pixelRatio = min(DPR, 2)`, sRGB, **ACES com exposição 1,1**                                             |
| Pose     | yaw −38°, pitch 12°, FOV 22°, câmera com lens shift centrado no robô                                                            |
| Luz      | RoomEnvironment 0,7, luz principal 1,5, rim light quente 5                                                                      |
| Material | `MeshPhysicalMaterial`: rugosidade 0,35 (tela 0,08), clearcoat 1 / 0,15, sheen 0,3 `#FFD9EE`, iridescência 0,4, tinta `#FFF0F3` |
| Laranja  | Máscara de matiz gerada em runtime: albedo `#FF6A1F` e emissivo `#FF5A14` × 1,6                                                 |
| Textura  | Mipmaps, anisotropia máxima e face única                                                                                        |
| Tamanho  | Corpo com **96,5 px** de altura, igual ao PNG do Figma. Os braços do GLB são mais longos.                                       |

**Pipeline do GLB** ([optimize-glb.sh](../scripts/optimize-glb.sh)): `weld` → `dilate` (ilhas de UV) → `simplify` (ratio 0,12) → `smooth --angle 60` (normais suavizadas até 60°, quinas mais vivas preservadas) → `weld` → `resize` 2048 → `webp` q85 → `meshopt --level medium --quantize-normal 12`. Resultado: **1,47 MB e 86.762 triângulos**. O nível `medium` é necessário porque o `high` força normais de 8 bits, que voltam a facetar o casco. O `webp` roda antes do `meshopt` porque, na ordem inversa, ele descomprime a malha.

## Gestos, rosto, olhar

- **Gestos só de corpo** ([gestures.ts](../src/nexo/gestures.ts)): o GLB é uma malha única, sem esqueleto, e os braços não se mexem. O campo `gesture` do `steps.ts` vira movimento do corpo inteiro (`NexoStage.body`: inclinação X/Z, giro, deslocamento, escala), somado à flutuação e ao olhar:
  - `wave`: um balanço leve em Z (+7° → −4° → 0, ~500 ms) com pulinho de 4 px; `bye`: dois balanços maiores (±9°);
  - `present`: pequeno recuo (escala 0,95, sobe 4 px) com giro de 14°;
  - `point`: inclina ~10° na direção do alvo e avança 8 px;
  - `think`: inclina 8° de lado e olha para baixo.
- **Rosto** ([NexoFace.ts](../src/nexo/NexoFace.ts)): um canvas de 1024×768 vira um `DecalGeometry` sobre a tela, detectada pelos texels escuros da textura, e cobre o rosto pintado. O visual segue o PNG de referência: bezel roxo com cantos bem arredondados, fundo marrom-escuro translúcido, scanlines finas, reflexo especular no topo e pixels laranja de cantos arredondados com glow. Os olhos são retângulos verticais e a boca é estreita. As células saem quadradas porque a altura em px é corrigida pelo aspecto da caixa do decal (`setBoxAspect`).
  - A fala são 5 barras em degraus que trocam a cada 70–120 ms, com pulsos nos olhos.
  - Com a voz gravada, as barras seguem o volume (RMS do `AnalyserNode`, 5 degraus; 3 com movimento reduzido) e só aparecem com uma palavra ativa: entre palavras, na pausa e no fim, a boca volta ao sorriso no mesmo quadro. No modo silencioso, usa o padrão pseudoaleatório.
- **Olhar** ([NexoLook.ts](../src/nexo/NexoLook.ts)): o yaw e o pitch são calculados **relativos à direção do tooltip**, limitados a ±28° e ±16°, com constante de tempo de 120 ms. Os olhos chegam antes do corpo. Com o mouse parado por 2 s, o olhar volta ao tooltip em ~600 ms.
- **Voz:** MP3 gravados por etapa (ver o README, seção "Voz do Nexo"). O alto-falante pausa e retoma (Espaço também); no modo silencioso, liga o som a partir da palavra atual. Aba em segundo plano pausa e, ao voltar, retoma do início da palavra.

## Acessibilidade, movimento reduzido e performance

- **Tooltip:** `role="dialog"`, `aria-modal`, `aria-labelledby`/`aria-describedby` e `aria-live="polite"` no título. O foco vai para o "Próximo" ao abrir (o botão é liberado antes) e o Tab circula dentro do tooltip ("Voltar", áudio e "Próximo"). O anel de foco só aparece em `:focus-visible`. O canvas tem `aria-hidden`.
  - → e Enter avançam; ← volta (não faz nada na etapa 1). Com o foco em "Voltar" ou no áudio, Enter e Espaço ativam o botão focado. Dentro do vídeo, as setas ficam com o player.
  - Durante o voo, "Voltar" e "Próximo" ficam desabilitados.
  - Rodapé (2414:5158): "Voltar" 73×40 sem fundo, bolinhas centralizadas e "Próximo". Na etapa 1 o "Voltar" fica invisível e desabilitado, mas ocupa o lugar: o rodapé não muda de altura e as bolinhas não andam.
- **`prefers-reduced-motion`:**
  - sem voo (fade de 150/200 ms), sem olhar pelo mouse e sem flutuação;
  - gestos com metade da amplitude;
  - home só com fade e fala 40% mais lenta.
- **Performance:** o render só acontece quando algo muda.
  - Com só a flutuação por mais de 5 s, cai para 30 fps; o loop pausa com `document.hidden`.
  - `getBoundingClientRect` é lido uma vez por transição.
  - **60 fps no voo** em 1440×900 com DPR 2 e o overlay desfocado, sem precisar do plano B (snapshot).
