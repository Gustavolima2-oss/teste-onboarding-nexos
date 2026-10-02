"""Gera as marcações de tempo de cada palavra (para o grifo e a boca).
Uso: python3 align.py audio.mp3 "texto exibido no tooltip" saida.json [--prompt]
Roda direto no áudio final (sem processamento). Com --prompt, o texto da fala vai como
initial_prompt para o faster-whisper: ajuda quando o reconhecimento erra palavras.

Estratégia:
 1. faster-whisper (modelo small, pt, word_timestamps) transcreve com tempos;
 2. as palavras reconhecidas são alinhadas às palavras do texto exibido
    (difflib), para o grifo sempre casar com o que está escrito na tela;
 3. palavras sem par recebem tempo interpolado entre as vizinhas;
 4. se o faster-whisper não estiver disponível, cai no plano B: detecta o
    trecho com fala pela energia e distribui as palavras por nº de sílabas.
Saída: {"duration": s, "words": [{"text","start","end"}], "method": "..."}
"""
import sys, json, re, unicodedata, subprocess, tempfile, os, difflib
import numpy as np, scipy.io.wavfile as w

def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))

def syllables(word):
    v = re.findall(r"[aeiouáéíóúâêôãõà]+", word.lower())
    return max(1, len(v))

def load(path):
    tmp = tempfile.mktemp(suffix=".wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ar", "16000", "-ac", "1", tmp], check=True)
    sr, x = w.read(tmp); os.remove(tmp)
    return sr, x.astype(np.float32) / 32768.0

def speech_span(sr, x, thr_db=-38):
    hop = int(sr * 0.01); frames = [x[i:i + hop] for i in range(0, len(x) - hop, hop)]
    db = np.array([20 * np.log10(np.sqrt((f ** 2).mean()) + 1e-9) for f in frames])
    on = np.where(db > thr_db)[0]
    if len(on) == 0: return 0.0, len(x) / sr
    return on[0] * 0.01, (on[-1] + 1) * 0.01

def fallback(sr, x, display):
    a, b = speech_span(sr, x)
    wts = [syllables(t) for t in display]; tot = sum(wts); cur = a; out = []
    for t, k in zip(display, wts):
        d = (b - a) * k / tot; out.append({"text": t, "start": round(cur, 3), "end": round(cur + d, 3)}); cur += d
    return out

def whisper(path, display, prompt=None):
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(path, language="pt", word_timestamps=True, vad_filter=False,
                               initial_prompt=prompt)
    rec = [(wd.word.strip(), wd.start, wd.end) for s in segs for wd in s.words]
    A = [norm(t) for t in display]; B = [norm(r[0]) for r in rec]
    times = [None] * len(display)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, A, B, autojunk=False).get_opcodes():
        if tag in ("equal", "replace"):
            for k in range(i2 - i1):
                j = j1 + min(k, j2 - j1 - 1)
                if j < len(rec) and j2 > j1: times[i1 + k] = (rec[j][1], rec[j][2])
    # interpolação para palavras sem par
    known = [i for i, t in enumerate(times) if t]
    if not known: raise RuntimeError("sem alinhamento")
    for i in range(len(times)):
        if times[i] is None:
            prev = max([k for k in known if k < i], default=None); nxt = min([k for k in known if k > i], default=None)
            s = times[prev][1] if prev is not None else times[nxt][0] - 0.25
            e = times[nxt][0] if nxt is not None else times[prev][1] + 0.25
            gap = [k for k in range(len(times)) if (prev is None or k > prev) and (nxt is None or k < nxt)]
            step = (e - s) / max(1, len(gap)); pos = gap.index(i)
            times[i] = (s + step * pos, s + step * (pos + 1))
    # garante ordem crescente e sem sobreposição
    out = []; last = 0.0
    for t, (s, e) in zip(display, times):
        s = max(s, last); e = max(e, s + 0.05); out.append({"text": t, "start": round(s, 3), "end": round(e, 3)}); last = e
    return out

if __name__ == "__main__":
    path, text, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    use_prompt = "--prompt" in sys.argv[4:]
    display = text.split()
    sr, x = load(path); dur = len(x) / sr
    try:
        words = whisper(path, display, text if use_prompt else None)
        method = "faster-whisper+prompt" if use_prompt else "faster-whisper"
    except Exception as e:
        print("aviso: usando plano B (", e, ")", file=sys.stderr)
        words = fallback(sr, x, display); method = "energia+silabas"
    json.dump({"duration": round(dur, 3), "method": method, "words": words}, open(dst, "w"), ensure_ascii=False, indent=2)
    print(dst, method, len(words), "palavras")
