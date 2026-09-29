"""Baixa as vozes, aplica o filtro do Nexo e gera as marcações de palavra.
Uso (a partir da raiz do app):  python3 nexo-voice/build_voices.py
Saídas:
  public/audio/nexo/<id>.mp3          áudio final (com filtro)
  src/voice/voiceManifest.json        texto, duração e tempos de cada palavra
"""
import json, os, sys, shutil, urllib.request, subprocess
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
OUT_AUDIO = os.path.join(ROOT, "public", "audio", "nexo"); OUT_JSON = os.path.join(ROOT, "src", "voice", "voiceManifest.json")
CLEAN = os.path.join(HERE, ".clean"); os.makedirs(OUT_AUDIO, exist_ok=True); os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True); os.makedirs(CLEAN, exist_ok=True)
cfg = json.load(open(os.path.join(HERE, "voices.json"), encoding="utf-8"))
manifest = {}
for s in cfg["steps"]:
    if s.get("reuse"): continue
    clean = os.path.join(CLEAN, s["id"] + ".mp3")
    if "source" in s: shutil.copy(os.path.join(HERE, s["source"]), clean)
    elif not os.path.exists(clean):
        print("baixando", s["id"]); urllib.request.urlretrieve(s["url"], clean)
    final = os.path.join(OUT_AUDIO, s["id"] + ".mp3")
    subprocess.run([sys.executable, os.path.join(HERE, "robotize.py"), clean, final], check=True)
    tj = os.path.join(CLEAN, s["id"] + ".json")
    subprocess.run([sys.executable, os.path.join(HERE, "align.py"), clean, s["text"], tj], check=True)
    t = json.load(open(tj, encoding="utf-8"))
    manifest[s["id"]] = {"audio": f"audio/nexo/{s['id']}.mp3", "text": s["text"], "duration": t["duration"], "method": t["method"], "words": t["words"]}
for s in cfg["steps"]:
    if s.get("reuse"):
        manifest[s["id"]] = dict(manifest[s["reuse"]], placeholder=bool(s.get("placeholder")))
json.dump(manifest, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("ok:", OUT_JSON, len(manifest), "etapas")
