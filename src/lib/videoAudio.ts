// Pull the spoken audio out of a local video as small 16 kHz mono WAV chunks (never uploaded as a video).
export type AudioChunk = { blob: Blob; start: number; end: number };

function toWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export async function extractSpeechChunks(file: File, chunkSeconds = 15, maxSeconds = 600): Promise<AudioChunk[]> {
  const rate = 16000;
  let decoded: AudioBuffer;
  try {
    const ctx = new AudioContext();
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    ctx.close();
  } catch {
    return []; // video has no readable sound
  }
  const duration = Math.min(decoded.duration, maxSeconds);
  const off = new OfflineAudioContext(1, Math.ceil(duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const mono = (await off.startRendering()).getChannelData(0);

  const chunks: AudioChunk[] = [];
  const step = chunkSeconds * rate;
  for (let i = 0; i < mono.length; i += step) {
    const part = mono.subarray(i, Math.min(mono.length, i + step));
    let peak = 0;
    for (let j = 0; j < part.length; j += 16) peak = Math.max(peak, Math.abs(part[j]));
    if (part.length < rate * 0.5 || peak < 0.02) continue; // skip silence
    chunks.push({ blob: toWav(part, rate), start: i / rate, end: (i + part.length) / rate });
  }
  return chunks;
}
