"""Aplica o filtro de voz aprovado do Nexo ("B - grave médio").
Uso: python3 robotize.py entrada.mp3 saida.mp3
Requer: ffmpeg no PATH, numpy, scipy.
NÃO altere os parâmetros: são exatamente os aprovados pelo design.
A duração de saída é igual à de entrada (a queda de tom preserva o tempo),
então as marcações de palavra calculadas no áudio limpo valem para o processado.
"""
import sys, subprocess, tempfile, os
import numpy as np, scipy.io.wavfile as w, scipy.signal as sg

SEMITONES = 3      # tom mais grave
BASS_DB = 4.5      # reforço de graves abaixo de 220 Hz
RING_HZ, RING_MIX = 55, 0.30
DETUNE_CENTS, DETUNE_MIX = [-14, 14], 0.42
BAND = (200, 4000)
DRIVE = 2.4
COMBS = [(2.1, 0.30), (11, 0.18)]
PEAK = 0.89

def load(path):
    tmp = tempfile.mktemp(suffix=".wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ar", "44100", "-ac", "1", tmp], check=True)
    sr, x = w.read(tmp); os.remove(tmp)
    return sr, x.astype(np.float32) / 32768.0

def pitch_down(y, semitones):
    r = 2 ** (-semitones / 12); n = len(y)
    slow = np.interp(np.arange(0, n, r), np.arange(n), y)
    win = 1024; hop = win // 4; ratio = len(slow) / n
    out = np.zeros(n + win); wnd = np.hanning(win); po = 0; pi = 0.0
    while po + win < len(out) and int(pi) + win < len(slow):
        out[po:po + win] += slow[int(pi):int(pi) + win] * wnd
        po += hop; pi += hop * ratio
    return out[:n]

def process(sr, x):
    t = lambda y: np.arange(len(y)) / sr
    y = pitch_down(x, SEMITONES)
    y = (1 - RING_MIX) * y + RING_MIX * (y * np.sin(2 * np.pi * RING_HZ * t(y)))
    n = len(y); out = y * (1 - DETUNE_MIX)
    for c in DETUNE_CENTS:
        idx = np.clip(np.arange(n) * 2 ** (c / 1200), 0, n - 1)
        out += (DETUNE_MIX / len(DETUNE_CENTS)) * np.interp(idx, np.arange(n), y)
    y = out
    b, a = sg.butter(4, [BAND[0] / (sr / 2), BAND[1] / (sr / 2)], btype="band"); y = sg.lfilter(b, a, y)
    b, a = sg.butter(2, 220 / (sr / 2), btype="low"); y = y + sg.lfilter(b, a, y) * (10 ** (BASS_DB / 20) - 1)
    y = np.tanh(y * DRIVE) / np.tanh(DRIVE)
    for ms, g in COMBS:
        d = int(sr * ms / 1000); o = y.copy(); o[d:] += g * y[:-d]; y = o
    m = np.max(np.abs(y)); y = y * (PEAK / m) if m > 0 else y
    return y

def save(sr, y, path):
    tmp = tempfile.mktemp(suffix=".wav")
    w.write(tmp, sr, (np.clip(y, -1, 1) * 32767).astype(np.int16))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-codec:a", "libmp3lame", "-b:a", "128k", path], check=True)
    os.remove(tmp)

if __name__ == "__main__":
    sr, x = load(sys.argv[1]); save(sr, process(sr, x), sys.argv[2])
