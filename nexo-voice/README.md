# nexo-voice (voz final)

Os nove áudios em `sources/` são a voz final do Nexo, já tratados (timbre igualado à voz aprovada, 1,2x, pausas internas encurtadas). Não aplique nenhum efeito sobre eles.

    pip install numpy scipy faster-whisper
    python3 nexo-voice/build_voices.py

Gera `public/audio/nexo/*.mp3` e `src/voice/voiceManifest.json` (tempos de cada palavra para o grifo e a boca).
Para trocar uma fala no futuro, gere de novo a gravação única com todas as falas (mesmo prompt + voz aprovada como referência), para a voz continuar igual entre elas.
