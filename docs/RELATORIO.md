# Relatório — fase 2: onboarding completo com o Nexo 3D

**Resumo:** o fluxo de 7 coach marks em 3 telas roda de ponta a ponta, fiel ao Figma e sem erros no console. O Nexo voa a 60 fps em 1440×900 com DPR 2 e overlay desfocado, gesticula sem rasgar o casco, fala com a boca em barras de robô (sincronizada com a narração quando ligada) e segue o mouse. Build, lint e a suíte de 41 verificações passam.

> **No repositório público:** os prints e vídeos citados aqui (`docs/checkpoints/`, ~40 MB) ficam fora do Git. Para refazê-los: `npm run checkpoint` e `npm run record`. A suíte de testes cresceu depois deste relatório: hoje são 67 verificações (ver o README).

Figma: `HYM49734BUPEwZfnNLLDY4`, seção `2350:2826`. Ambiente de medição: Chrome 153 com a GPU real (Apple M4, ANGLE/Metal), via `playwright-core`.

## 1. Estado de cada item da seção 11

| #   | Item                                                                       | Estado                                                                                                                                             |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Inventário das pendências da fase anterior                                 | **Feito**. Rosto animado, fallback, movimento reduzido, 30 fps em repouso, `destroy()` e README estavam pendentes e entraram no escopo.            |
| 2   | Telas Home, Ferramentas e Seu negócio, roteador e troca de tela            | **Feito**. Roteador por hash, sidebar persistente, troca com fade de 200/250 ms. As telas batem com o Figma em ±1 px (tabela na seção 4).          |
| 3   | Coach mark das 7 etapas (estático)                                         | **Feito**. Overlay com blur, destaques (inclusive em grupo), 3 tipos de tooltip, 7 bolinhas e botão de áudio.                                      |
| 4   | Rosto novo com fala robótica e narração                                    | **Feito**. Decal em canvas 1024×768 sobre a tela (refeito a partir do PNG de referência), com barras em degraus e Web Speech API em pt-BR.         |
| 5   | Olhar pelo mouse                                                           | **Feito**. Limites de ±28° e ±16° relativos ao tooltip, com τ = 120 ms e volta ao tooltip depois de 2 s.                                           |
| 6   | Gestos                                                                     | **Refeito como movimento de corpo** (ver a seção 6). O rig procedural foi removido depois da revisão; os 6 gestos são movimentos do corpo inteiro. |
| 7   | Sequência completa (abertura, voos, demonstração, vídeo, saída)            | **Feito**. O voo entre telas cobre a troca, graças à medição prévia numa sonda invisível.                                                          |
| 8   | Acabamento: movimento reduzido, fallback, performance, `destroy()`, testes | **Feito**. O plano B do overlay (snapshot desfocado) **não foi necessário**: o voo roda a 60 fps com `backdrop-filter`.                            |
| 9   | README e relatório                                                         | **Feito**: [README.md](../README.md) e este documento.                                                                                             |

## 2. Critérios de aceite

- [x] **As três telas batem com o Figma (±4 px em 1920) e o fluxo roda sem erros no console.** Home, Ferramentas e Seu negócio ficam dentro de ±1 px. Os tooltips das 7 etapas ficam dentro de ±1 px, e o Nexo fica no centro do corpo medido. O console fica limpo nas duas resoluções.
- [x] **O Nexo nunca some nem recarrega ao trocar de tela, e o voo cobre a troca.** O teste confirma que é o mesmo elemento `<canvas>` nas 7 etapas. A troca de tela acontece por baixo do voo de 1,2 s.
- [x] **Todo tooltip só aparece depois que o Nexo chega e faz o gesto.** Em 512 quadros de voo gravados, o tooltip nunca apareceu com o Nexo voando. O código só mostra o tooltip depois de `arrived` → gesto → 80 ms.
- [x] **A fala é de robô, sincronizada com a narração quando ligada.** São 5 barras em degraus, trocando a cada 70–120 ms, com pulsos nos olhos. Com narração, as barras pulsam por palavra (`onboundary`) e param no `onend`. O áudio em si não aparece nos vídeos, porque o screencast não grava som.
- [x] **O Nexo segue o mouse com suavidade, dentro dos limites, e volta ao tooltip quando o mouse para.** Ver `videos/look.webm`.
- [x] **Cada etapa tem um gesto sem rasgos.** Os gestos por etapa são wave / present / point / point / point / think / wave, com `bye` na saída, todos de corpo inteiro: a malha não se deforma (seção 6).
- [x] **A demonstração do cursor (etapa 3) e o vídeo (etapa 6) funcionam.** Os dois estão cobertos por testes.
- [x] **7 bolinhas corretas, Esc encerra e o estado concluído persiste.** O Esc foi testado em cada uma das 7 etapas, e `onboarding:done` fica no `localStorage`.
- [x] **60 fps no voo em 1440×900, DPR 2, com overlay desfocado.** Média de 16,67 ms por quadro, p95 de 17,6 ms e 0 quadros acima de 25 ms nos 6 voos.
- [x] **Teclado completo, `prefers-reduced-motion` e fallback sem WebGL funcionando.** Tudo coberto pelos testes.
- [x] **Build, lint e testes passando; README atualizado.**

## 3. Prints e vídeos

Tudo está em [`docs/checkpoints/fase2/`](checkpoints/fase2/):

| Arquivo                                                 | Conteúdo                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| `etapa{1..7}-1440x900.png`, `etapa{1..7}-1920x1080.png` | As 7 etapas, em DPR 2                                                 |
| `etapas-1440x900-resumo.png`                            | As 7 etapas em 1440 numa folha só                                     |
| `overlay-etapa{1..7}-1920.png`                          | Sobreposição 50/50 com o render do Figma                              |
| `lado-a-lado-etapa{1..7}-1920.png`                      | Figma × implementação, lado a lado                                    |
| `figma/figma-etapa{1..7}.png`                           | Renders do Figma usados na comparação                                 |
| `nexo-tamanho-etapa1.png`                               | O Nexo do PNG do Figma e o render 3D, na mesma escala                 |
| `fim-*.png`                                             | Estado depois do "Próximo" da etapa 7                                 |
| `posicoes.json`                                         | Alvo, tooltip, Nexo e posição usada (a/b/c) em cada etapa e resolução |
| `videos/flow.webm`                                      | Fluxo completo em 1440×900 (34 s, 60 fps)                             |
| `videos/talk.webm`                                      | Fala sem narração e com narração                                      |
| `videos/look.webm`                                      | Olhar seguindo o mouse e voltando ao tooltip                          |
| `videos/gestures.webm`                                  | wave, present, point, think, bye e idle                               |

Os vídeos são regeneráveis com `npm run record -- <flow|talk|look|gestures> <saida.webm>`.

## 4. Posicionamento (1920×1080; Figma → implementação)

| Etapa         | Alvo    | Tooltip (Figma) | Tooltip (impl.) | Nexo, centro do corpo (Figma → impl.) | Posição em 1440 |
| ------------- | ------- | --------------- | --------------- | ------------------------------------- | --------------- |
| 1 Ferramentas | 16,124  | 80,77           | 80,77           | 585,3; 149,4 → 585,3; 149,9           | a               |
| 2 Chips       | 556,136 | 1040,203        | 1040,203        | 1577,3; 272,4 → 1577,3; 272,9         | **c** (clamp)   |
| 3 Conversas   | 556,266 | 1004,264        | 1005,265        | 1545,3; 418,4 → 1546,3; 419,9         | a               |
| 4 Favoritas   | 13,283  | 100,227         | 100,227         | 641,3; 280,4 → 641,3; 280,9           | a               |
| 5 Seu Negócio | 16,160  | 93,96           | 93,94           | 601,3; 159,4 → 601,3; 157,9           | a               |
| 6 Cards       | 700,485 | 1242,367        | 1242,367        | 1753,3; 535,4 → 1753,3; 535,9         | **b** (acima)   |
| 7 Waz         | 16,222  | 70,160          | 70,160          | 611,3; 226,4 → 611,3; 226,9           | a               |

Todas as 7 etapas usam (a) em 1920. Os offsets relativos estão em [steps.ts](../src/coachmark/steps.ts): o tooltip é relativo ao alvo, e o Nexo, relativo ao tooltip.

**Telas** (medidas pelos subagentes em 1920, todas dentro de ±1 px): cabeçalhos, linha de chips (556,136, 859×34), card Conversas (556,266, 417×341), busca, grupo de cards de Seu negócio (700,485, 520×200), perfil, métricas, saudação e "Seu time" da Home.

## 5. Valores finais de render

Constantes comentadas em [nexoMaterial.ts](../src/nexo/nexoMaterial.ts).

|               | Valor                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tone mapping  | ACES com exposição 1,1. O AgX deixou o casco cinza e o Neutral puxou para o rosa.                                                                                                                        |
| Pose e câmera | yaw −38°, pitch 12°, FOV 22°, distância 10, com lens shift centrado no robô                                                                                                                              |
| Luz           | ambiente 0,7 (RoomEnvironment via PMREM), luz principal 1,5, rim light `#FFD2B0` 5                                                                                                                       |
| Material      | `MeshPhysicalMaterial`: rugosidade 0,35 (tela 0,08), clearcoat 1 / 0,15, sheen 0,3 `#FFD9EE`, iridescência 0,4 (IOR 1,3), tinta `#FFF0F3`                                                                |
| Laranja       | albedo `#FF6A1F` pela máscara (ganho 1,6) e emissivo `#FF5A14` × 1,6                                                                                                                                     |
| Textura       | WebP 2048² q85, mipmaps, anisotropia 16x, face única, ilhas de UV dilatadas                                                                                                                              |
| Rosto         | decal de 0,815×0,65 (unidades do modelo) sobre 750 vértices da tela; canvas 1024×768; bezel roxo `#452650`, fundo marrom translúcido, scanlines, reflexo no topo; pixels `#FF9A4D` arredondados com glow |
| Tamanho       | corpo com 96,5 px de altura (do PNG do Figma a 385×215); colisão com a silhueta real mais 24 px para os gestos                                                                                           |

## 6. Gestos de corpo (rig removido)

A primeira versão tinha um rig procedural (`SkinnedMesh` com 5 ossos gerado em runtime), mas as amplitudes precisaram ser tão limitadas que o ganho não compensava o estiramento no tubo do ombro. Na revisão, o rig foi removido: a malha voltou ao estado original, sem ossos, e a expressividade vem só do corpo (inclinação, giro, flutuação e olhar).

- **wave / bye:** balanço em Z (±7° / ±11°, 3 vezes) com pulinho de 5 / 8 px, e volta ao repouso.
- **present:** pequeno recuo (escala 0,95, sobe 4 px), giro de 14° e leve inclinação para trás.
- **point:** inclina ~10° na direção do alvo, gira 6° e avança 8 px para ele.
- **think:** inclina 8° de lado, olha 6° para baixo e gira −8°.
- Antes de cada voo o corpo volta à pose neutra em 100 ms, junto com a saída do tooltip. O gesto roda em paralelo com a entrada do tooltip. Todos usam `power2.out`/`sine.inOut`, sem overshoot. Com movimento reduzido, metade da amplitude.

## 7. Medições

|                            | Valor                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GLB                        | **1,47 MB**, **86.762 triângulos**, textura WebP 228 KB (q85), normais de 12 bits suavizadas a 60° (o original tinha 22,96 MB e 723 mil triângulos) |
| Bundle                     | 118 KB de JS inicial (44 KB gzip) + 675 KB de three.js/Nexo carregados depois da home (174 KB gzip)                                                 |
| FPS no voo                 | 60 (16,67 ms de média, p95 17,6 ms, 0 quadros lentos em 512), em 1440×900, DPR 2, com overlay desfocado                                             |
| Em repouso                 | 60 fps enquanto há atividade; 30 fps depois de 5 s só com a flutuação; 0 fps com movimento reduzido (render só quando algo muda)                    |
| `renderer.info` em repouso | 2 draw calls (corpo e rosto), ~89,7 mil triângulos (86.762 do corpo + o decal; estimado, não remedido), 14 geometrias, 8 texturas, 5 programas      |
| Depois do `destroy()`      | 0 geometrias, 0 programas, 1 textura; o canvas é removido e a fala é cancelada                                                                      |

**Sobre a textura que sobra no `destroy()`:** ela pertence ao three.js, não ao projeto. Descartando os recursos um a um, todas as texturas do projeto liberam; sobra um contador interno do renderer (pela hipótese mais provável, a tabela de iluminação do material físico). Como o `destroy()` chama `forceContextLoss()`, o contexto WebGL inteiro é destruído e a GPU libera tudo.

**Limites da medição:** a GPU usada foi a de um Apple M4, via Chrome headless, com o FPS medido pelo rAF e não pelo Performance panel. Vale repetir num notebook comum e no Performance panel antes de ir para produção.

## 8. Decisões onde o Figma era ambíguo

1. **O tooltip novo não tem seta**, então não há seta, mesmo com a regra anterior de "seta centralizada no alvo".
2. **Bolinhas padronizadas em 7:** o Figma varia entre 5 e 7. A atual e as anteriores ficam preenchidas.
3. **Item ativo da sidebar segue a rota.** No Figma, a tela Ferramentas continua com a Home ativa; tratei como descuido.
4. **Etapa 5:** o alvo fica em y=160, a posição do item na sidebar; o Figma desenha o destaque em 162.
5. **Etapa 2:** o tooltip fica **abaixo** dos chips, com o offset do Figma a partir do canto inferior esquerdo. O Nexo fica à direita do tooltip.
6. **Alfinete "favoritado":** o Figma só tem o estado normal. O favoritado usa o azul de destaque do próprio arquivo (`#0091FF`), tanto no card quanto na prévia.
7. **Cards de Seu negócio em destaque:** ficam brancos sólidos, como na cópia destacada 2350:51460. Fora do destaque são translúcidos, como no frame base.
8. **Favorito na sidebar:** a ferramenta é favoritada **ao sair da etapa 3**. A demonstração só simula o clique, e a etapa 4 precisa do item na sidebar.
9. **Botão X nas mídias** (etapas 3 e 6): encerra o tour, igual ao Esc.
10. **Vídeo de placeholder:** WebM VP8 de 4 s gerado a partir do poster, com zoom lento. O ambiente não tinha codificador MP4. A legenda já vem desenhada no poster do Figma.
11. **Tamanho do Nexo pelo corpo:** 96,5 px. Os braços do GLB são mais longos que no PNG, pose aceita.
12. **Olhar relativo ao tooltip:** como a pose base já está virada para ele, olhar para o tooltip corresponde a 0°. Medido em absoluto, o Nexo ficava de perfil.
13. **Fontes:** Inter carregado. O peso Medium da SF usa 500, porque o Chrome/macOS arredonda 510 para 600. Não apliquei o letter-spacing do Figma em textos SF de até 20 px, porque o sistema já aplica o tracking da fonte.
14. **Seção "EM BREVE" da tela Ferramentas** (abaixo de y=1080 no Figma): não implementada, porque fica fora do frame.
15. **Narração:** desligada por padrão. Os bipes são curtos e baixos (volume 0,025, um a cada 3 palavras, só com a narração ligada), para não irritar.
16. **Voo entre telas:** a próxima tela é montada numa sonda invisível para medir o destino antes da decolagem, e a troca visual acontece por baixo do voo.

## 9. Pendências e recomendações para integrar no produto

**Pendências**

- **Vídeo real:** falta o vídeo definitivo da etapa 6. O placeholder está em `public/video/`. Se for MP4 (H.264), vale para todos os navegadores.
- **Outros navegadores:** só testei no Chrome. Falta Safari (WebM VP8 exige 14.1+; `backdrop-filter` com prefixo, já incluído) e Firefox.
- **Vozes da narração:** variam por sistema. Sem voz pt-BR, a narração usa a primeira voz em português ou fica desabilitada.
- **Geometria dos braços:** difere do PNG (pose aceita), e os braços não se mexem. Gestos de braço exigem um GLB com esqueleto real.
- **Brilhos na silhueta:** pontos de especular serrilhado aparecem no contorno do casco. Ainda não foram tratados.
- **Assets sem uso:** sobraram em `public/images/` alguns assets da fase 1 (ícones de ferramentas e avatares Pipo/Maky).

**Recomendações para o time de tecnologia**

- **API:** consuma só o `NexoGuide` e o `steps.ts`. O `Coachmark` e o `main.ts` são uma implementação de referência do orquestrador.
- **Montagem:** monte o `NexoGuide` **uma vez**, fora da árvore das rotas, com o canvas numa camada fixa: um portal em React/Vue ou um elemento no `body`. Nunca remonte ao trocar de rota.
- **`steps.ts`:** vira configuração, que pode vir de um CMS. A `route` é o caminho do seu roteador; o `target` usa `data-coach` nos componentes, e isso é o único acoplamento com as telas.
- **Por stack:**
  - **React:** um hook `useNexoGuide()` com `useEffect(() => { guide.mount(); return () => guide.destroy(); }, [])`. A troca de rota chama `navigate()` onde hoje está `router.go()`, e a sonda de medição vira uma renderização fora da tela, ou o layout vem de medidas fixas.
  - **SSR (Next/Nuxt):** carregue o `NexoGuide` só no cliente, com import dinâmico, como já faz o `main.ts`.
- **GLB:**
  - hospede o `nexo.glb` num CDN com `Content-Type: model/gltf-binary` e cache longo (arquivo versionado por hash);
  - o decoder meshopt já vai no bundle;
  - para trocar o modelo, rode `npm run optimize:glb` (ratio 0,12, suavização de 60°, normais de 12 bits).
- **Persistência:** `onboarding:done` está no `localStorage`; no produto, deve vir da API do usuário.
