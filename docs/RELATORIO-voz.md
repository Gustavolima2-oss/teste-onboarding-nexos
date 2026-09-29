# Relatório — Nexo falando, com grifo sincronizado e avanço automático

**Site publicado:** https://gustavolima2-oss.github.io/teste-onboarding-nexos/

O onboarding passou de 7 para **9 etapas** (Figma `HYM49734BUPEwZfnNLLDY4`, seção `2350:2826`), cada uma com uma fala gravada:

- **Grifo:** cada palavra acende no tooltip quando é dita.
- **Boca:** o Nexo mexe a boca pelo volume real do áudio.
- **Progresso:** um anel em gradiente em volta do "Próximo" mostra o andamento da fala; 400 ms depois do fim, o tour avança sozinho.

Build, lint e a suíte de **93 verificações** passam.

## 1. Áudios e marcações

Todas as etapas foram marcadas com o **faster-whisper** (modelo `small`). Nenhuma caiu no plano B (energia + sílabas). Em todas, os tempos são crescentes, sem sobreposição, e a última palavra termina antes do fim do áudio.

| #   | Etapa (voz)           | Duração | Palavras | Método         | Fim da última palavra |
| --- | --------------------- | ------- | -------- | -------------- | --------------------- |
| 1   | `step-01-ferramentas` | 2,16 s  | 5        | faster-whisper | 2,04 s                |
| 2   | `step-02-agentes`     | 4,72 s  | 14       | faster-whisper | 4,44 s                |
| 3   | `step-03-conversas`   | 6,80 s  | 15       | faster-whisper | 6,50 s                |
| 4   | `step-04-favoritas`   | 4,48 s  | 12       | faster-whisper | 3,98 s                |
| 5   | `step-05-seu-negocio` | 3,28 s  | 7        | faster-whisper | 2,80 s                |
| 6   | `step-06-base`        | 3,84 s  | 11       | faster-whisper | 3,77 s                |
| 7   | `step-07-produtos`    | 3,04 s  | 8        | faster-whisper | 2,94 s                |
| 8   | `step-08-integracoes` | 3,04 s  | 6        | faster-whisper | 2,78 s                |
| 9   | `step-09-waz`         | 4,48 s  | 15       | faster-whisper | 4,18 s                |

- **Etapa 6:** o emoji 🧠 é um item à parte no manifesto, com tempo interpolado depois de "negócio". Na tela, ele acende junto com "negócio" e não mexe a boca.
- **Onde ficam:** os MP3 finais (`public/audio/nexo/`, 588 KB no total) e o manifesto (`src/voice/voiceManifest.json`) estão versionados. O áudio limpo intermediário (`nexo-voice/.clean/`) fica fora do Git.
- **Links do Magnific:** os 8 áudios foram baixados antes de os links expirarem (~04/10/2026). Os links são assinados, então foram removidos do `voices.json` versionado; a cópia original fica só na máquina local.

## 2. Conferência do filtro

| Comparação                                                                  | Correlação   |
| --------------------------------------------------------------------------- | ------------ |
| `step-01-ferramentas.mp3` gerado × `reference/nexo-voz-aprovada.mp3`        | **0,999982** |
| Sinal do filtro (antes de virar MP3) × referência decodificada              | 0,999994     |
| Sinal do filtro × o próprio MP3 gerado, decodificado (ruído da codificação) | 0,999986     |

**O filtro é o aprovado**, sem nenhum parâmetro alterado:

- Mesmo número de amostras: 95.256, a 44,1 kHz.
- Diferença máxima de 263 em 32.767 (0,8%).
- A distância entre o sinal filtrado e a referência é do mesmo tamanho que o ruído que a codificação MP3 introduz no nosso próprio arquivo.

**Por que não dá exatamente 1,0:** a referência foi codificada com o ffmpeg 6.1 (`Lavf60.16.100`), e esta máquina, sem Homebrew, usou o ffmpeg 7.1 estático do `imageio-ffmpeg` (LAME 3.99.5). Também testei o ffmpeg 6.0 (`ffmpeg-static`), com o mesmo resultado (0,999982). Para reproduzir a referência amostra a amostra, rode o build com o ffmpeg 6.1 do Homebrew. A diferença é inaudível.

## 3. Figma × implementação

O que foi seguido do Figma:

- **Tooltips:** sem título, frase em Inter SemiBold 16. Palavras já ditas em branco, as seguintes em branco a 30%.
- **Rodapé:** 64 px de altura.
- **Etapa 9:** mostra "Finalizar" (89×40).
- **Mídias:**
  - etapa 3: prévia do card;
  - etapas 6 e 7: vídeo, com os pôsteres exportados do Figma;
  - etapa 9: ilustração do Kauê com o Waz (exportada em 1x; o subagente não tinha conseguido exportá-la).
- **Posições e alvos:**
  - alvos individuais dos cards "Base de conhecimento", "Produtos e Serviços" e "Integrações";
  - posições do tooltip e do Nexo medidas em cada frame.

Divergências e decisões (também no README):

- **Progresso:** o prompt pede um gradiente preenchendo o botão; o Figma desenha um **anel** em gradiente em volta dele (`#E49876` → `#FFC846` 44% → `#FFD8C7`). Segui o Figma: o anel cresce de 0 a 100% em sentido horário, a partir do meio da lateral esquerda. O Figma só mostra o estado "meio cheio", e não o mostra nas etapas 1 e 4; aqui ele aparece em todas.
- **Bolinhas:** o Figma ainda mostra 7 (e nenhuma na etapa 9). Aqui são 9, acumulativas, como o prompt pede.
- **Pausa:** o Figma não tem ícone de pausa. Desenhei um no mesmo estilo do SpeakerHigh.
- **Etapa 7:** o Figma diz "Seus catálogo … ficam aqui"; usei o texto gravado, "Seu catálogo de produtos e serviços fica aqui."
- **Etapa 4:** no Figma, o tooltip ainda está na versão antiga (rodapé de 40 px, 5 bolinhas); aqui ela usa o visual novo, como as outras.
- **Espaço:** com o foco no tooltip, agora pausa e retoma a fala; antes, avançava.

## 4. Testes

A seção nova da suíte (`npm test`) cobre:

- as 9 etapas carregando o áudio certo, com um `<span>` por palavra do manifesto;
- o avanço automático em duração + 400 ms. Medido: +20 a +40 ms além do previsto nas 8 trocas (ex.: etapa 3, 7.210 ms para 7.200 previstos);
- pausa: áudio parado, anel e grifo congelados, boca no sorriso, ícone em pausa com `aria-pressed="true"`;
- retomada no início da palavra ativa (1,440 s para o `start` 1,44);
- "Próximo" no meio da fala interrompendo o áudio e avançando;
- modo silencioso com o `play()` rejeitado: ícone "sem som", grifo e anel avançando pelo relógio interno;
- boca: em 2.733 quadros medidos, nenhum com a boca falando sem palavra ativa (ou parada com palavra ativa). A checagem roda no mesmo quadro do player.

## 5. Pendências

- **Plano B de marcação:** nenhuma etapa caiu nele.
- **Filtro:** correlação de 0,99998, não 1,0, por causa do encoder de MP3 (ver a seção 2). Se for obrigatório bater amostra a amostra, gere de novo com o ffmpeg 6.1.
- **Vídeos das etapas 6 e 7:** os pôsteres são do Figma, mas os dois tocam o mesmo vídeo de placeholder.
- **Imagem da etapa 9:** só existe em 1x (378×210). Em telas de DPR 2 ela fica levemente suave; vale exportar em 2x pelo Figma.
- **Figma desatualizado em alguns frames:** 7 bolinhas, etapa 4 no visual antigo, sem ícone de pausa e com o erro de texto da etapa 7.
- **Navegadores:** testado no Chrome. Safari e Firefox seguem pendentes, incluindo a política de autoplay, que no Safari é mais restritiva e deve cair no modo silencioso na etapa 1.
