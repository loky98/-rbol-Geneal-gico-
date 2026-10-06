// Lado principal de la transcripción: convierte el audio a 16 kHz mono
// y lo envía al worker de Whisper, informando el progreso.

let worker = null;
let seq = 0;
const jobs = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
  const files = new Map(); // archivo del modelo -> {loaded, total}
  worker.onmessage = ({ data }) => {
    const job = jobs.get(data.id);
    if (!job) return;
    if (data.type === 'progress') {
      const p = data.data;
      if (p.status === 'progress' && p.total) {
        files.set(p.file, { loaded: p.loaded, total: p.total });
        let loaded = 0; let total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        job.onProgress?.({ stage: 'download', percent: Math.round((loaded / total) * 100) });
      }
    } else if (data.type === 'status') {
      job.onProgress?.({ stage: 'transcribing' });
    } else if (data.type === 'done') {
      jobs.delete(data.id); job.resolve(data.text);
    } else if (data.type === 'error') {
      jobs.delete(data.id); job.reject(new Error(data.message));
    }
  };
  worker.onerror = (e) => {
    for (const [id, job] of jobs) { job.reject(new Error(e.message || 'Error en el transcriptor')); jobs.delete(id); }
    worker = null;
  };
  return worker;
}

async function toMono16k(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej));
  ctx.close?.();
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

/** Transcribe un audio (Blob o URL). onProgress recibe {stage, percent}. */
export async function transcribe(source, onProgress) {
  onProgress?.({ stage: 'decoding' });
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  const audio = await toMono16k(blob);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject, onProgress });
    getWorker().postMessage({ id, audio }, [audio.buffer]);
  });
}

export function progressLabel(p) {
  if (!p) return '';
  if (p.stage === 'decoding') return 'Preparando audio…';
  if (p.stage === 'download') return `Descargando Whisper (solo la primera vez)… ${p.percent}%`;
  if (p.stage === 'transcribing') return 'Transcribiendo con Whisper…';
  return '';
}
