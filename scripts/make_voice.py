"""Records every line Pip says, acted sentence by sentence to suit its mood.

Needs Python with `kokoro-onnx`, `praat-parselmouth` and `soundfile`, plus ffmpeg, and the
Kokoro-82M model files (Apache-2.0) from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0

    python scripts/make_voice.py kokoro-v1.0.onnx voices-v1.0.bin ffmpeg web/public/voice [line ids]
"""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import parselmouth
import soundfile as sf
from kokoro_onnx import Kokoro
from parselmouth.praat import call

LINES = Path(__file__).parent.parent / "web" / "src" / "pipLines.json"

# For each mood: pace, pitch in semitones, how far the speech melody swings (1 is as spoken),
# loudness, and how the voices are mixed.
MOODS = {
    "cheer": {"speed": 0.94, "pitch": 1.0, "swing": 1.45, "lufs": -15, "blend": {"af_heart": 0.7, "af_sarah": 0.3}},
    "warm": {"speed": 0.89, "pitch": 0.5, "swing": 1.3, "lufs": -16, "blend": {"af_heart": 0.85, "af_sarah": 0.15}},
    "worried": {"speed": 0.9, "pitch": 0.0, "swing": 1.25, "lufs": -16, "blend": {"af_heart": 0.8, "af_nicole": 0.2}},
    "sad": {"speed": 0.8, "pitch": -0.8, "swing": 0.85, "lufs": -18, "blend": {"af_heart": 0.7, "af_nicole": 0.3}},
}

# Punctuation is the script's stage direction: how each sentence changes the delivery.
BEATS = {
    "!": {"speed": 1.05, "pitch": 0.9, "swing": 1.15, "pause": 0.2},
    "?": {"speed": 1.0, "pitch": 0.4, "swing": 1.05, "pause": 0.26},
    ".": {"speed": 1.0, "pitch": 0.0, "swing": 1.0, "pause": 0.26},
    "...": {"speed": 0.86, "pitch": -0.6, "swing": 0.9, "pause": 0.5},
}


def style(tts, blend):
    return sum(tts.get_voice_style(name) * share for name, share in blend.items())


def sentences(text):
    return [part.strip() for part in re.findall(r".+?(?:\.\.\.|[.!?]+)(?:\s+|$)", text)]


def retune(audio, semitones):
    """Lifts or lowers a sentence the way a voice does: a little higher is a little quicker."""
    ratio = 2 ** (semitones / 12)
    positions = np.arange(0, len(audio) - 1, ratio)
    return np.interp(positions, np.arange(len(audio)), audio)


def swing(audio, rate, amount):
    """Widens or narrows the melody of a sentence, keeping the voice's own sound."""
    sound = parselmouth.Sound(audio.astype(np.float64), sampling_frequency=rate)
    median = call(sound.to_pitch(), "Get quantile", 0, 0, 0.5, "Hertz")
    if not median > 0:
        return audio
    manipulation = call(sound, "To Manipulation", 0.01, 110, 520)
    tier = call(manipulation, "Extract pitch tier")
    call(tier, "Formula", f"{median} * (self / {median}) ^ {amount}")
    call([tier, manipulation], "Replace pitch tier")
    return call(manipulation, "Get resynthesis (overlap-add)").values[0]


def perform(tts, text, setting):
    voice = style(tts, setting["blend"])
    takes = []
    rate = 24000
    for sentence in sentences(text):
        ending = "..." if sentence.endswith("...") else sentence[-1]
        beat = BEATS.get(ending, BEATS["."])
        audio, rate = tts.create(sentence, voice=voice, speed=setting["speed"] * beat["speed"], lang="en-us")
        audio = swing(audio, rate, setting["swing"] * beat["swing"])
        takes.append(retune(audio, setting["pitch"] + beat["pitch"]))
        takes.append(np.zeros(int(rate * beat["pause"])))
    takes[-1] = np.zeros(int(rate * 0.2))
    return np.concatenate([np.zeros(int(rate * 0.06)), *takes]), rate


def record(tts, ffmpeg, text, mood, out):
    setting = MOODS[mood]
    audio, rate = perform(tts, text, setting)
    with tempfile.TemporaryDirectory() as work:
        wav = Path(work) / "line.wav"
        sf.write(wav, audio, rate)
        chain = f"highpass=f=90,equalizer=f=3200:t=q:w=1.2:g=2,loudnorm=I={setting['lufs']}:TP=-1.5:LRA=11"
        subprocess.run(
            [ffmpeg, "-y", "-v", "error", "-i", str(wav), "-af", chain, "-ar", "24000", "-ac", "1",
             "-codec:a", "libmp3lame", "-b:a", "56k", str(out)],
            check=True,
        )


def main():
    model, voices, ffmpeg, out_dir = sys.argv[1:5]
    only = set(sys.argv[5:])
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    lines = json.loads(LINES.read_text(encoding="utf-8"))
    tts = Kokoro(model, voices)
    for key, line in lines.items():
        if only and key not in only:
            continue
        record(tts, ffmpeg, line["text"], line["mood"], out / f"{key}.mp3")
    print("done")


if __name__ == "__main__":
    main()
