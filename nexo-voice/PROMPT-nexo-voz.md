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
- `robotize.py`: o filtro de voz aprovado (voz do **Tiago Lima**, tom 3 semitons acima com o timbre preservado e 5% de vocoder, um toque de robô bem leve). **Não altere nenhum parâmetro.** Ele preserva a duração do áudio.
- `align.py`: gera o tempo de início e fim de cada palavra. Usa faster-whisper e, sem ele, cai num plano B por energia e sílabas.
- `build_voices.py`: roda tudo e grava `public/audio/nexo/<id>.mp3` e `src/voice/voiceManifest.json`.
- `reference/nexo-voz-aprovada.mp3`: o som exato aprovado, para conferência.

Passos:
1. Instale as dependências: `ffmpeg` (brew) e `pip install numpy scipy faster-whisper`. O filtro depende do **rubberband** dentro do ffmpeg: confira com `ffmpeg -filters | grep rubberband`. O ffmpeg do Homebrew já traz; se não aparecer, rode `brew reinstall ffmpeg`. O `build_voices.py` para com uma mensagem clara se faltar.
2. Rode `python3 nexo-voice/build_voices.py` na raiz do app.
3. **Confira o filtro:** o `public/audio/nexo/step-01-ferramentas.mp3` gerado deve ser idêntico ao `reference/nexo-voz-aprovada.mp3` (compare as amostras; a correlação tem que dar 1,0).
4. **Confira as marcações:** abra o `voiceManifest.json` e verifique se todas as etapas saíram com `"method": "faster-whisper"`. Para cada etapa, os tempos devem ser crescentes, sem sobreposição, e a última palavra deve terminar antes da duração do áudio. Se alguma etapa cair no plano B, registre qual.
5. **Versione** os MP3 finais e o manifesto no repositório. A pasta `nexo-voice/.clean/` (áudio limpo intermediário) vai para o `.gitignore`.
6. Os caminhos de áudio devem passar por `import.meta.env.BASE_URL`, para funcionar no GitHub Pages.

**Se você já rodou o build com a voz anterior (Preston):** apague `public/audio/nexo/`, `src/voice/voiceManifest.json` e `nexo-voice/.clean/`, e rode o build de novo. A voz mudou para o Tiago Lima e todos os áudios e tempos precisam ser regerados.

## 2. Dois modos: sem voz (padrão) e com voz

O onboarding **começa sempre sem voz**. A voz só entra quando o usuário clica no ícone de alto-falante.

### Modo sem voz (padrão)
- O texto do tooltip aparece **inteiro em branco** desde o início. Sem grifo, sem palavras em cinza.
- O gradiente do botão "Próximo" funciona como **timer** e, ao chegar a 100%, o fluxo **avança sozinho**, igual ao modo com voz.
- Duração do timer: `duração do áudio da etapa × 1,25`, com mínimo de 3 s. Deixe o fator e o mínimo como constantes nomeadas (`SILENT_TIMER_FACTOR`, `SILENT_TIMER_MIN_MS`), para ajustar fácil. É um pouco mais lento que a fala, para dar tempo de leitura.
- A boca do Nexo fica no estado padrão (sorriso, como no print 3), com as piscadas normais. Ele não "fala" sem som.

### Modo com voz
- Clicar no alto-falante **liga a voz**: o áudio da etapa atual começa do início, o texto volta a ficar todo cinza e as palavras **acendem em branco uma a uma**, sincronizadas com a fala, e ficam brancas (grifo progressivo, como no Figma).
- O gradiente do "Próximo" **reinicia do zero** e passa a acompanhar o áudio (`currentTime / duration`). Ao terminar o áudio, espere ~400 ms e avance sozinho.
- A voz **continua ligada nas etapas seguintes**: cada nova etapa começa a falar quando o tooltip termina de entrar.
- A sincronia é lida do `audio.currentTime` a cada `requestAnimationFrame`, nunca de timers próprios, para não derivar.
- Emoji e pontuação acompanham a palavra a que estão colados.

### Pausar
- Com a voz tocando, clicar no alto-falante de novo **pausa**: o áudio para, o gradiente congela no ponto atual e o grifo **mantém a palavra que estava sendo dita** acesa. O avanço automático fica suspenso.
- Clicar outra vez **retoma** do **início da palavra em que parou** (`currentTime = word.start`), com o gradiente continuando dali.
- Se o usuário avançar (Próximo, Voltar ou clique no alvo) com a voz pausada, a próxima etapa entra no **modo sem voz** (texto branco, timer). Ou seja: pausar vale como "desligar" para as etapas seguintes, até ele clicar no alto-falante de novo.

### Estados do ícone
O ícone tem **dois visuais**, e mostra sempre a ação que o clique vai fazer:
- **Alto-falante** (o ícone atual do Figma): aparece quando a voz está **desligada** (modo padrão) ou **pausada**. Clicar liga ou retoma a voz.
- **Pausa** (dois tracinhos verticais, ⏸): aparece **enquanto a voz está tocando**. Clicar pausa, e o ícone volta a ser o alto-falante.

A troca entre os dois é imediata, com um crossfade curto (~120 ms) e sem mudar o tamanho nem a posição do botão. O ícone de pausa deve seguir o mesmo tamanho, traço e cor do alto-falante do Figma (18×18 px); use o mesmo estilo de ícone (Phosphor, como o `SpeakerHigh`), por exemplo o `Pause`. Quando o áudio da etapa termina sozinho, o ícone volta a mostrar o de pausa na etapa seguinte assim que ela começar a falar.

Acessibilidade: `aria-label` muda junto ("Ouvir o Nexo", "Pausar", "Continuar ouvindo"), com `aria-pressed="true"` enquanto a voz toca. Atalho: barra de espaço alterna, quando o foco estiver dentro do tooltip.

### Acessibilidade
O texto completo fica disponível para leitores de tela desde o início nos dois modos (o grifo é só visual; o texto inteiro vai no `aria-describedby`).

## 3. Botão "Próximo" com gradiente

- Siga o Figma para o gradiente (cores, direção e raio). Ele preenche o botão de 0% a 100% ao longo da duração do timer (modo sem voz) ou do áudio (modo com voz).
- Clicar em "Próximo" antes do fim interrompe tudo e avança imediatamente. O mesmo vale para "Voltar".
- Na última etapa, o preenchimento completo encerra o onboarding, como o clique no último "Próximo".
- Trocar de modo no meio da etapa (ligar a voz) reinicia o gradiente do zero, porque a duração muda.

## 4. Boca sincronizada com a fala

O rosto já existe (`NexoFace`). Ajuste a lógica:
- **Só no modo com voz**, e só enquanto há uma palavra ativa (`currentTime` entre o `start` e o `end` de alguma palavra): estado de fala, como no print de referência 4 (olhos + barras da boca subindo e descendo).
- **Entre palavras, em pausas da frase, ao pausar, ao terminar a fala e no modo sem voz:** a boca fica no padrão, como no print 3 (sorriso).
- A altura das barras segue o volume real do áudio: `AnalyserNode` do WebAudio conectado ao elemento de áudio, lendo o RMS a cada frame, mapeado em 3 a 5 degraus.
- Os olhos não mudam durante a fala, só dão os micro-pulsos de brilho.
- A troca para o sorriso acontece no mesmo frame em que a palavra termina ou o áudio pausa. Nada de a boca continuar mexendo depois que o som parou.

## 5. Autoplay

Como a voz só começa depois de um clique no alto-falante, o bloqueio de autoplay dos navegadores deixa de ser problema: o clique libera o áudio. Nas etapas seguintes, o áudio pode tocar sozinho porque já houve interação. Mesmo assim, trate a rejeição do `audio.play()`: se falhar, volte ao modo sem voz naquela etapa, sem quebrar o fluxo, e registre no console.

## 6. Pré-carga

Pré-carregue o áudio da próxima etapa enquanto a atual é exibida, mesmo no modo sem voz (o timer depende da duração do áudio, que vem do manifesto, então não precisa esperar o download para começar).

## 7. Integração com o fluxo existente

- O timer e, no modo com voz, a fala da etapa começam **quando o tooltip termina de entrar** (depois que o Nexo pousou), nunca durante o voo.
- Trocar de etapa (Próximo, Voltar, clique no alvo, avanço automático ou Esc) sempre para o áudio atual, reseta o grifo e o gradiente e devolve a boca ao padrão antes de qualquer outra animação.
- Aba em segundo plano: pause o áudio, o timer e o avanço automático; ao voltar, retome de onde parou (no modo com voz, do início da palavra).
- `prefers-reduced-motion`: a fala e o grifo continuam; o gradiente vira uma barra sem animação suave, e a boca anima em menos degraus.
- `destroy()` também para e descarrega os áudios e fecha o AudioContext.

## 8. Testes

Adicione ao teste automatizado:
- o onboarding começa no modo sem voz: texto todo branco, nenhum áudio tocando, gradiente avançando;
- no modo sem voz, o avanço automático acontece em `max(duração × 1,25, 3 s)` (com tolerância);
- clicar no alto-falante liga a voz: o áudio correto toca, o texto volta a cinza, o número de spans bate com o manifesto e o gradiente reinicia;
- no modo com voz, o avanço automático acontece em `duração + ~400 ms`, e a etapa seguinte também começa falando;
- pausar congela o gradiente e o grifo na palavra atual; retomar volta ao `start` dessa palavra;
- avançar com a voz pausada leva a próxima etapa ao modo sem voz;
- clicar em "Próximo" no meio da fala interrompe o áudio e avança;
- rejeição do `play()` cai no modo sem voz sem quebrar o fluxo;
- a boca fica no padrão sempre que não há palavra ativa e durante todo o modo sem voz.

## 9. Entrega

Ao final: rode `npm run build`, `npm run lint` e os testes; faça commit e push para a `main` (o GitHub Pages publica sozinho) e gere `docs/RELATORIO-voz.md` com:
- duração de cada áudio e o método de marcação usado em cada etapa;
- a confirmação da correlação 1,0 do filtro;
- as pendências: qualquer etapa que tenha caído no plano B de marcação;
- o link publicado.
