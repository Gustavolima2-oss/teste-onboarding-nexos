# Prompt: Nexo falando, com grifo sincronizado e avanço automático

Execute de ponta a ponta, sem parar para aprovação. Registre decisões no README e só interrompa por bloqueio real (dependência que não instala, link de áudio expirado). No fim, entregue o relatório da seção 9.

## 0. Contexto

O projeto é o app de onboarding do Nexo que já existe neste repositório (Vite + TypeScript + three.js + GSAP, com `NexoGuide`, `Coachmark`, `steps.ts`, rosto animado em `NexoFace`, publicado no GitHub Pages). Não recrie nada; evolua.

**Figma atualizado (fonte da verdade):** `https://www.figma.com/design/HYM49734BUPEwZfnNLLDY4/2.0-Drafts?node-id=2350-2826`, `fileKey` `HYM49734BUPEwZfnNLLDY4`. Rode `get_design_context` nos tooltips de cada frame para pegar o novo visual: texto em uma frase sem título na maioria das etapas, palavra falada em branco e o resto em cinza, botão "Próximo" com gradiente de progresso.

**O fluxo agora tem 9 etapas.** Ordem dos frames no canvas (da esquerda para a direita):

| # | Frame | Tela | Texto do tooltip |
|---|---|---|---|
| 1 | `2350:2871` | Home | Aqui você acessa suas ferramentas |
| 2 | `2350:45423` | Ferramentas | Vamos focar no Waz por hora, mas você pode contratar mais agentes futuramente depois. |
| 3 | `2350:46104` | Ferramentas | Conversas é por onde você consegue visualizar seus leads e atendimentos. Vamos deixar ela favoritada? |
| 4 | `2350:50099` | Ferramentas | Assim ela fica disponível aqui na barra lateral e na sua homepage |
| 5 | `2350:50882` | Ferramentas | Aqui ficam as informações do seu negócio |
| 6 | `2350:51269` | Seu negócio | Base de conhecimento é o cérebro digital do seu negócio 🧠 |
| 7 | `2483:6066` | Seu negócio | Seu catálogo de produtos e serviços fica aqui. |
| 8 | `2483:6244` | Seu negócio | Por aqui você administra suas integrações |
| 9 | `2350:51560` | Seu negócio | Kauê, o Waz vai te ajudar a seguir daqui em diante! Nos vemos em breve. |

Atualize `steps.ts` para as 9 etapas, com alvos, posições e destaques extraídos do Figma, e as bolinhas de progresso para 9. Na etapa 7, o Figma tem o erro "Seus catálogo … ficam aqui"; use a forma corrigida da tabela, que é a que foi gravada.

## 1. Pipeline das vozes (gerar, filtrar, marcar e embutir)

A pasta `nexo-voice/` que acompanha este prompt deve ser copiada para a raiz do app. Ela contém:

- `voices.json`: texto e origem do áudio de cada etapa. A etapa 1 já vem como arquivo em `sources/`; as outras vêm por link do Magnific, que **expira por volta de 04/10/2026**.
- `robotize.py`: o filtro de voz aprovado ("B, grave médio"). **Não altere nenhum parâmetro.** Ele preserva a duração do áudio.
- `align.py`: gera o tempo de início e fim de cada palavra. Usa faster-whisper e, sem ele, cai num plano B por energia e sílabas.
- `build_voices.py`: roda tudo e grava `public/audio/nexo/<id>.mp3` e `src/voice/voiceManifest.json`.
- `reference/nexo-voz-aprovada.mp3`: o som exato aprovado, para conferência.

Passos:
1. Instale as dependências: `ffmpeg` (brew), e `pip install numpy scipy faster-whisper`.
2. Rode `python3 nexo-voice/build_voices.py` na raiz do app.
3. **Confira o filtro:** o `public/audio/nexo/step-01-ferramentas.mp3` gerado deve ser idêntico ao `reference/nexo-voz-aprovada.mp3` (compare as amostras; a correlação tem que dar 1,0).
4. **Confira as marcações:** abra o `voiceManifest.json` e verifique se todas as etapas saíram com `"method": "faster-whisper"`. Para cada etapa, os tempos devem ser crescentes, sem sobreposição, e a última palavra deve terminar antes da duração do áudio. Se alguma etapa cair no plano B, registre qual.
5. **Versione** os MP3 finais e o manifesto no repositório. A pasta `nexo-voice/.clean/` (áudio limpo intermediário) vai para o `.gitignore`.
6. Os caminhos de áudio devem passar por `import.meta.env.BASE_URL`, para funcionar no GitHub Pages.

## 2. Grifo palavra por palavra

- O texto do tooltip é renderizado como uma sequência de `<span>` por palavra, na ordem do manifesto (o texto exibido e o manifesto usam a mesma divisão por espaços).
- Estado inicial: todas as palavras em cinza (cor do Figma).
- Quando `currentTime` atinge o `start` de uma palavra, ela fica branca com uma transição curta (~80 ms) e **permanece branca**: o grifo é progressivo, acumulando as palavras já faladas, como no Figma.
- A sincronia é lida do `audio.currentTime` a cada `requestAnimationFrame`, nunca de timers próprios, para não derivar.
- Emoji e pontuação acompanham a palavra a que estão colados.
- Acessibilidade: o texto completo continua disponível para leitores de tela desde o início (o grifo é só visual, com `aria-hidden` nos estados intermediários e o texto inteiro em `aria-describedby`).

## 3. Botão "Próximo" com gradiente de progresso e avanço automático

- Siga o Figma para o gradiente (cores, direção e raio). Ele preenche o botão de 0% a 100% ao longo da duração do áudio da etapa, proporcional ao `currentTime / duration`.
- Ao chegar a 100%, espere ~400 ms e **avance sozinho** para a próxima etapa, com a mesma transição do clique.
- Clicar em "Próximo" antes do fim interrompe a fala e avança imediatamente. O mesmo vale para "Voltar".
- Na última etapa, o preenchimento completo encerra o onboarding, como o clique no último "Próximo".

## 4. Pausa (ícone de alto-falante)

- O ícone de alto-falante vira **pausar/retomar**.
- Ao pausar: o áudio para, o gradiente congela no ponto atual, o grifo **mantém a palavra que estava sendo dita** grifada, e o avanço automático fica suspenso.
- Ao retomar: o áudio volta do **início da palavra em que parou** (`currentTime = word.start`), para a frase não voltar picotada. O gradiente continua dali.
- O ícone muda de estado (alto-falante ou pausa) conforme o Figma, com `aria-pressed` e `aria-label` corretos.
- Atalho: barra de espaço pausa e retoma, quando o foco estiver dentro do tooltip.

## 5. Política de autoplay do navegador

Navegadores bloqueiam áudio antes de uma interação do usuário, o que afeta a etapa 1 no primeiro acesso.
- Tente `audio.play()`. Se for bloqueado, rode a etapa em **modo silencioso**: o grifo e o gradiente avançam por um relógio interno usando os mesmos tempos do manifesto, a boca anima igual, e o ícone de alto-falante aparece como "sem som", com um pulso discreto.
- Clicar no ícone nesse estado liga o som e continua a partir da palavra atual, sincronizado.
- Qualquer clique do usuário (inclusive em "Próximo" ou no alvo destacado) já libera o áudio para as etapas seguintes; guarde isso num estado global.

## 6. Boca sincronizada com a fala

O rosto já existe (`NexoFace`). Ajuste a lógica:
- **Falando** (uma palavra ativa, ou seja, `currentTime` entre o `start` e o `end` de alguma palavra): estado de fala, como no print de referência 4 (olhos + barras da boca subindo e descendo).
- **Entre palavras, em pausas da frase, ao pausar ou ao terminar a fala:** a boca para na hora e volta ao padrão, como no print 3 (sorriso).
- A altura das barras segue o volume real do áudio: `AnalyserNode` do WebAudio conectado ao elemento de áudio, lendo o RMS a cada frame, mapeado em 3 a 5 degraus. No modo silencioso (seção 5), use o padrão pseudoaleatório de antes.
- Os olhos não mudam durante a fala, só dão os micro-pulsos de brilho.
- Nada de a boca continuar mexendo depois que o som parou: a troca para o sorriso tem que acontecer no mesmo frame em que a palavra termina ou o áudio pausa.

## 7. Integração com o fluxo existente

- A fala da etapa começa **quando o tooltip termina de entrar** (depois que o Nexo pousou), nunca durante o voo.
- Trocar de etapa (Próximo, Voltar, clique no alvo, avanço automático ou Esc) sempre para o áudio atual, reseta o grifo e o gradiente e devolve a boca ao padrão antes de qualquer outra animação.
- Pré-carregue o áudio da próxima etapa enquanto a atual é exibida, para não haver atraso no início da fala.
- Aba em segundo plano: pause o áudio e o avanço automático; ao voltar, retome do início da palavra, como na pausa manual.
- `prefers-reduced-motion`: a fala e o grifo continuam; o gradiente vira uma barra sem animação suave, e a boca anima em menos degraus.
- `destroy()` também para e descarrega os áudios e fecha o AudioContext.

## 8. Testes

Adicione ao teste automatizado:
- cada uma das 9 etapas carrega o áudio correto e tem o número de spans igual ao de palavras do manifesto;
- o avanço automático acontece em `duration + ~400 ms` (com tolerância);
- pausar congela o gradiente e o grifo; retomar volta ao `start` da palavra ativa;
- clicar em "Próximo" no meio da fala interrompe o áudio e avança;
- modo silencioso quando o autoplay é bloqueado (simule a rejeição do `play()`);
- a boca fica no padrão sempre que não há palavra ativa.

## 9. Entrega

Ao final: rode `npm run build`, `npm run lint` e os testes; faça commit e push para a `main` (o GitHub Pages publica sozinho) e gere `docs/RELATORIO-voz.md` com:
- duração de cada áudio e o método de marcação usado em cada etapa;
- a confirmação da correlação 1,0 do filtro;
- as pendências: qualquer etapa que tenha caído no plano B de marcação;
- o link publicado.
