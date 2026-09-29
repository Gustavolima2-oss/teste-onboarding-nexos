# Relatório — Nexo falando: modo sem voz, voz do Tiago Lima, grifo e avanço automático

**Site publicado:** https://gustavolima2-oss.github.io/teste-onboarding-nexos/

O onboarding tem **9 etapas** (Figma `HYM49734BUPEwZfnNLLDY4`, seção `2350:2826`) e dois modos:

- **Sem voz (padrão):** o texto aparece inteiro em branco, e o anel em gradiente do "Próximo" funciona como um timer de leitura de `max(duração × 1,25; 3 s)`. No fim, o tour avança sozinho.
- **Com voz** (clique no alto-falante): a fala gravada toca, as palavras acendem uma a uma e a boca do Nexo segue o volume. O anel acompanha o áudio, e o tour avança 400 ms depois do fim. As etapas seguintes já começam falando; pausar e avançar volta ao modo sem voz.

Build, lint e a suíte de **90 verificações** passam.

## 1. Áudios e marcações (voz Tiago Lima)

Todas as etapas foram marcadas com o **faster-whisper** (modelo `small`). **Nenhuma caiu no plano B** (energia + sílabas). Em todas, os tempos são crescentes, sem sobreposição, e a última palavra termina antes do fim do áudio.

| #   | Etapa (voz)           | Duração | Palavras | Método         | Fim da última palavra | Timer sem voz |
| --- | --------------------- | ------- | -------- | -------------- | --------------------- | ------------- |
| 1   | `step-01-ferramentas` | 1,92 s  | 5        | faster-whisper | 1,76 s                | 3,00 s        |
| 2   | `step-02-agentes`     | 4,56 s  | 14       | faster-whisper | 4,30 s                | 5,70 s        |
| 3   | `step-03-conversas`   | 5,20 s  | 15       | faster-whisper | 5,08 s                | 6,50 s        |
| 4   | `step-04-favoritas`   | 3,44 s  | 12       | faster-whisper | 2,98 s                | 4,30 s        |
| 5   | `step-05-seu-negocio` | 2,24 s  | 7        | faster-whisper | 1,92 s                | 3,00 s        |
| 6   | `step-06-base`        | 3,36 s  | 11       | faster-whisper | 3,25 s                | 4,20 s        |
| 7   | `step-07-produtos`    | 2,56 s  | 8        | faster-whisper | 2,46 s                | 3,20 s        |
| 8   | `step-08-integracoes` | 2,40 s  | 6        | faster-whisper | 2,14 s                | 3,00 s        |
| 9   | `step-09-waz`         | 3,92 s  | 15       | faster-whisper | 3,68 s                | 4,90 s        |

- **Etapa 6:** o emoji 🧠 é um item à parte no manifesto. Na tela, ele acende junto com "negócio" e não mexe a boca.
- **Voz anterior:** os áudios e tempos da voz Preston foram apagados e todos regerados, como o prompt pede.
- **Onde ficam:** os MP3 finais (`public/audio/nexo/`, 608 KB) e o manifesto (`src/voice/voiceManifest.json`) estão versionados. O áudio limpo intermediário (`nexo-voice/.clean/`) fica fora do Git.
- **Links do Magnific:** os 8 áudios novos foram baixados antes de os links expirarem (~04/10/2026). Os links são assinados, então foram removidos do `voices.json` versionado.

## 2. Conferência do filtro

O filtro novo depende do `rubberband` dentro do ffmpeg. Esta máquina não tem Homebrew, e nenhum ffmpeg pronto (pip, `ffmpeg-static`, conda-forge) tem esse filtro. Por isso compilei um **ffmpeg 6.1.1** com rubberband 3.3.0 e LAME 3.100. É a combinação de versões do Ubuntu 24.04, e a referência foi codificada com `Lavf60.16.100` / LAME 3.100.

| Comparação                                                                  | Correlação  |
| --------------------------------------------------------------------------- | ----------- |
| `step-01-ferramentas.mp3` gerado × `reference/nexo-voz-aprovada.mp3`        | **0,99994** |
| Mesma comparação, rubberband com FFTW + libsamplerate em vez da FFT interna | 0,99994     |

**Não deu 1,0.** Os arquivos têm o mesmo número de amostras (84.672, a 44,1 kHz), e a diferença máxima é de 655 em 32.767 (2%). O filtro não foi alterado. Como o resultado é o mesmo com duas FFTs diferentes, a diferença não vem da FFT. Ela deve vir do ambiente em que a referência foi gerada: versões de numpy/scipy (vocoder) e o build do rubberband, que não dá para reproduzir sem saber como a referência foi feita. A diferença é inaudível, mas **não é a igualdade exata pedida**. Com o ffmpeg do Homebrew (`brew install ffmpeg`), vale rodar o build de novo e conferir.

## 3. Comportamento implementado

- **Início:** o onboarding começa sempre sem voz. O texto aparece inteiro, a boca fica no sorriso (com as piscadas) e o anel é o timer de leitura. As constantes `SILENT_TIMER_FACTOR` (1,25) e `SILENT_TIMER_MIN_MS` (3000) ficam em `src/voice/voice.ts`.
- **Ligar a voz:** o alto-falante (ou Espaço) toca o áudio da etapa do início, o texto volta ao cinza, o anel reinicia do zero e passa a seguir `currentTime / duration`. A voz continua ligada nas etapas seguintes.
- **Pausar:** o áudio para, o anel congela e a palavra que estava sendo dita fica acesa. Retomar volta ao `start` dessa palavra. Avançar com a voz pausada leva a etapa seguinte ao modo sem voz.
- **Ícone:** mostra a ação do clique.
  - Alto-falante do Figma com a voz desligada ("Ouvir o Nexo") ou pausada ("Continuar ouvindo").
  - `Pause` do Phosphor, com o mesmo tamanho (18×18), cor e opacidade, enquanto a voz toca ("Pausar", `aria-pressed="true"`).
  - A troca é por crossfade de 120 ms.
- **Boca:** só fala com a voz ligada e uma palavra ativa, com a altura das barras pelo volume real (`AnalyserNode`). Nos outros casos fica no sorriso, trocando no mesmo quadro.
- **Autoplay:** se o `play()` for rejeitado, a etapa segue no modo sem voz, com um aviso no console, e o fluxo continua.
- **Pré-carga:** o áudio da próxima etapa é pré-carregado nos dois modos.
- **Aba em segundo plano:** pausa a fala e o timer; ao voltar, retoma.
- **`destroy()`:** descarrega os áudios e fecha o `AudioContext`.

## 4. Figma × implementação

Divergências e decisões (também no README):

- **Progresso:** o Figma desenha um **anel** em gradiente em volta do "Próximo" (`#E49876` → `#FFC846` 44% → `#FFD8C7`), não um preenchimento do botão. Segui o Figma.
- **Bolinhas:** o Figma ainda mostra 7 (e nenhuma na última etapa). Aqui são 9, acumulativas.
- **Etapa 7:** o Figma diz "Seus catálogo … ficam aqui"; usei o texto gravado.
- **Etapa 4:** no Figma ainda está no visual antigo; aqui usa o novo, como as outras.
- **Ícone de pausa:** não existe no Figma. Usei o `Pause` do Phosphor, como o prompt sugere.

## 5. Testes (seção de voz da suíte)

| Verificação                                                                           | Resultado                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Começa sem voz: texto branco, nenhum áudio, anel avançando                            | ok                                                     |
| Sem voz, avanço em `max(duração × 1,25; 3 s)`                                         | etapas 1 a 3: 3.032/3.000, 5.729/5.700, 6.516/6.500 ms |
| Alto-falante liga a voz: áudio certo, texto cinza, spans = manifesto, anel reiniciado | ok                                                     |
| Com voz, avanço em duração + 400 ms                                                   | 4.942/4.960 ms; a etapa seguinte já começa falando     |
| Pausa congela anel e grifo; retomar volta ao `start` da palavra                       | retomou em 0,980 s para o `start` 0,98                 |
| Avançar com a voz pausada leva a seguinte ao modo sem voz                             | ok                                                     |
| "Próximo" no meio da fala interrompe o áudio e avança                                 | ok                                                     |
| `play()` rejeitado cai no modo sem voz sem quebrar o fluxo                            | ok, com o aviso no console                             |
| Boca só com palavra ativa e no padrão durante o modo sem voz                          | 806 quadros, 0 divergências, 0 quadros falando sem voz |

## 6. Pendências

- **Plano B de marcação:** nenhuma etapa caiu nele.
- **Filtro:** correlação de 0,99994, não 1,0 (ver a seção 2). Para confirmar a igualdade exata, gere de novo numa máquina com o ffmpeg do Homebrew.
- **Vídeos das etapas 6 e 7:** os pôsteres são do Figma, mas os dois tocam o mesmo vídeo de placeholder.
- **Imagem da etapa 9:** só existe em 1x; vale exportar em 2x pelo Figma.
- **Navegadores:** testado no Chrome. Safari e Firefox seguem pendentes.
