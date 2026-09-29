# nexo-voice

Pipeline da voz do Nexo. Copie esta pasta para a raiz do app e rode:

    brew install ffmpeg
    pip install numpy scipy faster-whisper
    python3 nexo-voice/build_voices.py

Gera `public/audio/nexo/*.mp3` (com o filtro aprovado) e `src/voice/voiceManifest.json` (tempos de cada palavra).
Os links do Magnific em `voices.json` expiram por volta de 04/10/2026: rode o build antes e versione os MP3 gerados.
Para trocar um texto: gere a nova voz no Magnific com a mesma configuração (ver `note` em voices.json), atualize o item e rode o build de novo.

## Como foi gerado (29/09/2026, voz Tiago Lima)

- Sem Homebrew na máquina, e nenhum ffmpeg pronto com o filtro `rubberband` (nem o do pip, nem o `ffmpeg-static`, nem o do conda-forge). Por isso foi compilado localmente um **ffmpeg 6.1.1** com `--enable-librubberband` (rubberband 3.3.0) e `--enable-libmp3lame` (LAME 3.100), a mesma combinação de versões do Ubuntu 24.04. Dependências Python num venv.
- As 9 etapas saíram com `"method": "faster-whisper"`. Tempos crescentes, sem sobreposição, e a última palavra termina antes do fim do áudio em todas.
- Filtro: o `step-01-ferramentas.mp3` gerado tem correlação **0,99994** com `reference/nexo-voz-aprovada.mp3` (mesmo número de amostras, 84.672). O resultado é o mesmo com o rubberband compilado com FFT interna ou com FFTW + libsamplerate, então a diferença não vem da FFT. Ela deve vir do ambiente da referência (numpy/scipy do vocoder, build do rubberband), que não dá para reproduzir sem saber como ela foi gerada. Com o ffmpeg do Homebrew, confira de novo.
- Os MP3 do Magnific foram baixados para `.clean/` (fora do Git) antes de os links expirarem. Os links assinados foram removidos do `voices.json` versionado.
