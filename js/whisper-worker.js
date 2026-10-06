// Web Worker: ejecuta Whisper en el navegador con transformers.js.
// El modelo se descarga una sola vez y queda en la caché del navegador.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

env.allowLocalModels = false;

const MODEL = 'Xenova/whisper-base';
let asrPromise = null;

function getAsr(onProgress) {
  asrPromise ??= pipeline('automatic-speech-recognition', MODEL, {
    progress_callback: onProgress,
  }).catch((err) => { asrPromise = null; throw err; });
  return asrPromise;
}

self.onmessage = async (event) => {
  const { id, audio } = event.data;
  const post = (msg) => self.postMessage({ id, ...msg });
  try {
    const asr = await getAsr((p) => post({ type: 'progress', data: p }));
    post({ type: 'status', status: 'transcribing' });
    const out = await asr(audio, {
      language: 'spanish',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    post({ type: 'done', text: (out.text || '').trim() });
  } catch (err) {
    post({ type: 'error', message: String(err?.message || err) });
  }
};
