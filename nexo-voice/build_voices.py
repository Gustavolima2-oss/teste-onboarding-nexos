"""Copia as vozes finais do Nexo para o app e gera as marcações de palavra.
Uso (na raiz do app):  python3 nexo-voice/build_voices.py
Saídas:
  public/audio/nexo/<id>.mp3          áudio final (cópia exata, sem processamento)
  src/voice/voiceManifest.json        texto, duração e tempos de cada palavra
"""
import json, os, sys, shutil, subprocess
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
OUT_AUDIO = os.path.join(ROOT, "public", "audio", "nexo"); OUT_JSON = os.path.join(ROOT, "src", "voice", "voiceManifest.json")
TMP = os.path.join(HERE, ".clean"); os.makedirs(OUT_AUDIO, exist_ok=True); os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True); os.makedirs(TMP, exist_ok=True)
cfg = json.load(open(os.path.join(HERE, "voices.json"), encoding="utf-8"))
manifest = {}
for s in cfg["steps"]:
    src = os.path.join(HERE, s["source"]); final = os.path.join(OUT_AUDIO, s["id"] + ".mp3")
    shutil.copyfile(src, final)                      # sem efeito e sem mudar a velocidade
    tj = os.path.join(TMP, s["id"] + ".json")
    # "prompt": true no voices.json: o texto vai como initial_prompt (etapas em que o
    # reconhecimento errou palavras).
    args = [sys.executable, os.path.join(HERE, "align.py"), final, s["text"], tj] + (["--prompt"] if s.get("prompt") else [])
    subprocess.run(args, check=True)
    t = json.load(open(tj, encoding="utf-8"))
    manifest[s["id"]] = {"audio": f"audio/nexo/{s['id']}.mp3", "text": s["text"], "duration": t["duration"], "method": t["method"], "words": t["words"]}
json.dump(manifest, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("ok:", OUT_JSON, len(manifest), "etapas")
