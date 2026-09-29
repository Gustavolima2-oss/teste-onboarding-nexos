"""Aplica o filtro de voz aprovado do Nexo (voz Tiago Lima, "pitch +3 com toque de robô").
Uso: python3 robotize.py entrada.mp3 saida.mp3
Requer: ffmpeg COM o filtro rubberband (o ffmpeg do Homebrew já vem com ele;
confira com `ffmpeg -filters | grep rubberband`), numpy e scipy.
NÃO altere os parâmetros: são exatamente os aprovados pelo design.
A duração de saída é igual à de entrada, então as marcações de palavra
calculadas no áudio limpo valem para o processado.
"""
import sys, subprocess, tempfile, os
import numpy as np, scipy.io.wavfile as w, scipy.signal as sg

SEMITONES = 3          # tom mais alto, com o timbre (formantes) preservado
ROBOT_MIX = 0.05       # 5% de vocoder: toque eletrônico bem leve
HIGHPASS_HZ = 80
PEAK = 0.89

def run(args): subprocess.run(args, check=True)

def pitch_shift(src, dst):
    r = 2 ** (SEMITONES / 12)
    run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af",
         f"rubberband=pitch={r}:formant=preserved:transients=smooth:detector=soft:pitchq=quality",
         "-ar", "44100", "-ac", "1", dst])

def blsaw(n, sr, f0):
    t = np.arange(n) / sr; y = np.zeros(n); k = 1
    while k * f0 < sr * 0.45:
        y += np.sin(2 * np.pi * k * f0 * t) / k * (1 / (1 + (k * f0 / 3500) ** 2)); k += 1
    return y / np.abs(y).max()

def vocoder(x, sr, f0, nfft=1024, hop=256, lifter=44, noise=0.03):
    n = len(x); c = blsaw(n, sr, f0) + noise * np.random.default_rng(1).standard_normal(n)
    _, _, M = sg.stft(x, sr, nperseg=nfft, noverlap=nfft - hop)
    _, _, C = sg.stft(c, sr, nperseg=nfft, noverlap=nfft - hop)
    def env(S):
        mag = np.log(np.abs(S) + 1e-7); cep = np.fft.irfft(mag, axis=0); cep[lifter:-lifter] = 0
        return np.exp(np.fft.rfft(cep, axis=0).real)
    _, y = sg.istft(C / (env(C) + 1e-7) * env(M), sr, nperseg=nfft, noverlap=nfft - hop)
    return y[:n]

def f0est(x, sr):
    fr = []; hop = int(sr * 0.02); win = int(sr * 0.04)
    for i in range(0, len(x) - win, hop):
        s = x[i:i + win]
        if np.sqrt((s ** 2).mean()) < 0.02: continue
        ac = np.correlate(s, s, "full")[win - 1:]; lo, hi = int(sr / 400), int(sr / 80)
        fr.append(sr / (lo + np.argmax(ac[lo:hi])))
    return float(np.median(fr)) if fr else 150.0

def process(src, dst):
    tmp = tempfile.mktemp(suffix=".wav"); pitch_shift(src, tmp)
    sr, x = w.read(tmp); os.remove(tmp); x = x.astype(np.float32) / 32768
    nrm = lambda v: v / np.abs(v).max()
    y = ROBOT_MIX * nrm(vocoder(x, sr, f0est(x, sr))) + (1 - ROBOT_MIX) * nrm(x)
    b, a = sg.butter(2, HIGHPASS_HZ / (sr / 2), btype="high"); y = sg.lfilter(b, a, y)
    y = y * PEAK / np.abs(y).max()
    out = tempfile.mktemp(suffix=".wav"); w.write(out, sr, (np.clip(y, -1, 1) * 32767).astype(np.int16))
    run(["ffmpeg", "-v", "error", "-y", "-i", out, "-codec:a", "libmp3lame", "-b:a", "160k", dst]); os.remove(out)

if __name__ == "__main__":
    process(sys.argv[1], sys.argv[2])
