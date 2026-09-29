# nexo-voice

Pipeline da voz do Nexo. Copie esta pasta para a raiz do app e rode:

    brew install ffmpeg
    pip install numpy scipy faster-whisper
    python3 nexo-voice/build_voices.py

Gera `public/audio/nexo/*.mp3` (com o filtro aprovado) e `src/voice/voiceManifest.json` (tempos de cada palavra).
Os links do Magnific em `voices.json` expiram por volta de 04/10/2026: rode o build antes e versione os MP3 gerados.
Para trocar um texto: gere a nova voz no Magnific com a mesma configuração (ver `note` em voices.json), atualize o item e rode o build de novo.

## Como foi gerado (29/09/2026)

- Sem Homebrew na máquina: dependências num venv (`python3 -m venv`, `pip install numpy scipy faster-whisper imageio-ffmpeg`) e o ffmpeg 7.1 estático do `imageio-ffmpeg` no PATH.
- As 9 etapas saíram com `"method": "faster-whisper"` (modelo `small`). Tempos crescentes, sem sobreposição, e a última palavra termina antes do fim do áudio em todas.
- Filtro: o `step-01-ferramentas.mp3` gerado tem correlação **0,99998** com `reference/nexo-voz-aprovada.mp3` (mesmo número de amostras). O sinal do filtro, antes da codificação, tem 0,99999 com a referência decodificada: a diferença restante é da codificação MP3 (a referência foi codificada com o ffmpeg 6.1, `Lavf60.16.100`; aqui, ffmpeg 7.1 / LAME 3.99.5). Para bater amostra a amostra, rode o build com o ffmpeg 6.1 do Homebrew.
- Os MP3 do Magnific foram baixados para `.clean/` (fora do Git) antes de os links expirarem. Os links assinados foram removidos do `voices.json` versionado; para regenerar em outra máquina, peça o áudio limpo ou gere a voz de novo no Magnific.
