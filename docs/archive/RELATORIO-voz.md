# Relatório — voz final do Nexo

**Site publicado:** https://gustavolima2-oss.github.io/teste-onboarding-nexos/

A voz do Nexo foi trocada pela **voz final**: nove MP3 prontos (gravação única com as nove falas, timbre igualado à voz aprovada, 1,2x, pausas internas encurtadas), em `nexo-voice/sources/`. Eles entram no app **sem nenhum efeito, filtro ou mudança de velocidade**: o build só copia os arquivos (cópia idêntica) e gera as marcações de palavra. O filtro antigo (`robotize.py`) e a pasta `reference/` saíram do projeto.

Comportamento: voz desde o início (com o convite "Começar" quando o navegador bloqueia o som), grifo palavra por palavra, borda de progresso no "Próximo" nos dois modos, avanço automático só no modo com voz, pausa levando ao modo texto (borda no tempo do áudio) — ver o README, seção "Voz desde o início, os dois modos e o botão Próximo".

## 1. Áudios e marcações

Todas as etapas foram marcadas com o **faster-whisper** (modelo `small`). **Nenhuma caiu no plano B** (energia + sílabas). Em todas, os tempos são crescentes, sem sobreposição, e a última palavra termina antes do fim do áudio.

| #   | Etapa                 | Duração | Palavras | Método         | Fim da última palavra |
| --- | --------------------- | ------- | -------- | -------------- | --------------------- |
| 1   | `step-01-ferramentas` | 2,29 s  | 5        | faster-whisper | 2,02 s                |
| 2   | `step-02-agentes`     | 4,99 s  | 14       | faster-whisper | 4,58 s                |
| 3   | `step-03-conversas`   | 6,08 s  | 15       | faster-whisper | 5,84 s                |
| 4   | `step-04-favoritas`   | 4,34 s  | 12       | faster-whisper | 3,78 s                |
| 5   | `step-05-seu-negocio` | 2,9 s   | 7        | faster-whisper | 2,52 s                |
| 6   | `step-06-base`        | 3,42 s  | 11       | faster-whisper | 3,27 s                |
| 7   | `step-07-produtos`    | 3,33 s  | 8        | faster-whisper | 3,1 s                 |
| 8   | `step-08-integracoes` | 2,87 s  | 6        | faster-whisper | 2,5 s                 |
| 9   | `step-09-waz`         | 4,265 s | 14       | faster-whisper | 3,96 s                |

- **Etapa 9 (texto genérico):** a fala passou a ser "O Waz vai te ajudar a seguir daqui em diante! Nos vemos em breve.", sem o nome do usuário, com áudio novo. O reconhecimento ouviu "O OIS vai te ajudar…" e acertou sozinho, sem `initial_prompt` (que a versão com "Kauê" precisava): "Waz" em 0,16–0,50 s, batendo com a energia do áudio (fala em 0,04–0,48 s, pausa, "vai" em ~0,64 s).
- **Waz ("Uóis"):** na etapa 2, o reconhecimento ouviu "OIS" e o grifo acende "Waz" em 0,92 s, no início da palavra falada; na etapa 9, em 0,16 s.
- **Etapa 4:** o reconhecimento ouviu "home page" (duas palavras); o grifo acende "homepage" no início de "home".
- **Etapa 6:** o emoji 🧠 é um item à parte no manifesto. Na tela, ele acende junto com "negócio" e não mexe a boca.
- **ffmpeg:** o `align.py` usa o ffmpeg só para ler o áudio. Esta máquina não tem ffmpeg do sistema; o build rodou com o binário estático do pacote `imageio-ffmpeg` no PATH.

## 2. Boca

A boca usa o RMS do `AnalyserNode` em janelas de 1024 amostras: nível = `min(1, RMS × ganho)`, em 5 degraus. Medido nas palavras das nove falas:

| Áudio                     | RMS mediano | Ganho  | Uso dos degraus 1–5      | Janelas saturadas |
| ------------------------- | ----------- | ------ | ------------------------ | ----------------- |
| Voz anterior              | 0,12        | 4      | 21 / 22 / 21 / 19 / 17 % | 5%                |
| Voz final, ganho antigo   | 0,03        | 4      | 66 / 28 / 6 / 0 / 0 %    | 0%                |
| **Voz final, ganho novo** | 0,03        | **10** | 40 / 19 / 14 / 13 / 14 % | 6%                |

O áudio final é percebido como mais "cheio", mas tem RMS menor nessas janelas. Com o ganho antigo, a boca ficaria quase parada nos dois primeiros degraus; com `MOUTH_GAIN = 10` (`src/voice/voice.ts`), ela volta a usar os cinco, sem ficar presa no máximo.
