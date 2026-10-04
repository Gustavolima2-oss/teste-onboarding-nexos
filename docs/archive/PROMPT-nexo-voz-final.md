# Trocar a voz do Nexo pela voz final

Execute de ponta a ponta e publique no final. Só interrompa por bloqueio real.

## 1. Contexto
A voz do Nexo mudou. Os nove áudios novos já estão **prontos e finais** em `nexo-voice/sources/` (gerados no Magnific com a voz aprovada, timbre igualado, 1,2x e pausas ajustadas). **Não aplique nenhum efeito, filtro ou mudança de velocidade** sobre eles. O `robotize.py` e o filtro antigo deixam de existir.

## 2. Substituir o pacote antigo
- A pasta `nexo-voice/` deste pacote substitui a anterior por completo. Remova do projeto o `robotize.py`, a pasta `reference/` e qualquer referência ao filtro antigo (rubberband, vocoder, links do Magnific).
- Apague `public/audio/nexo/`, `src/voice/voiceManifest.json` e `nexo-voice/.clean/`.
- Instale o necessário: `pip install numpy scipy faster-whisper` (o ffmpeg já está instalado).
- Rode `python3 nexo-voice/build_voices.py` na raiz do app. Ele copia os nove MP3 para `public/audio/nexo/` e gera o `voiceManifest.json` com os tempos de cada palavra.

## 3. Conferir as marcações de palavra
- Abra o `voiceManifest.json` e confira, para cada etapa: tempos crescentes, sem sobreposição e terminando antes da duração do áudio.
- A voz tem um efeito forte de vocoder, então o reconhecimento pode errar algumas palavras. Confira o campo `method` de cada etapa. Se alguma cair no plano B (`energia+silabas`) ou se o grifo ficar visivelmente fora de sincronia ao ouvir, rode o `align.py` dessa etapa de novo passando `initial_prompt` com o texto da fala para o faster-whisper (ajuste o script para isso) e registre no README quais etapas precisaram.
- O Waz é pronunciado "Uóis" no áudio, mas na tela continua "Waz". O `align.py` já casa as palavras faladas com o texto da tela; confira que o grifo passa pelo "Waz" no momento certo nas etapas 2 e 9.

## 4. O que não muda
Todo o comportamento atual continua igual: voz como padrão, grifo palavra por palavra, borda de progresso no "Próximo" no modo com voz, avanço automático ao fim da fala, pausa levando ao modo texto, boca do Nexo sincronizada com o volume do áudio. Só os arquivos de áudio e o manifesto mudam.

Confira que a boca do Nexo continua reagindo bem ao novo áudio (ele é mais alto e mais "cheio" que o anterior). Se as barras da boca ficarem sempre no máximo, recalibre o mapeamento do RMS para os degraus.

## 5. Testes e publicação
- Rode build, lint e testes. Atualize os testes que dependiam das durações antigas dos áudios.
- Ouça as nove etapas no navegador com a voz ligada e confira o grifo e a boca.
- Faça commit ("Voz final do Nexo"), dê push na `main`, acompanhe o workflow até terminar e confira no site publicado que os nove áudios respondem sem 404.
- Me mande o hash do commit, o status do workflow e o `method` de cada etapa no manifesto.
