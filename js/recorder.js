// Grabar audio con el micrófono (o subir un archivo) y guardarlo.
import { api } from './api.js';
import { openModal } from './modal.js';
import { extFromType, toast } from './utils.js';

function pickMimeType() {
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** ctx: {refresh, transcribeMedia} */
export function openAudioForm(ctx, personId) {
  const canRecord = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  let blob = null;
  let recorder = null;
  let stream = null;
  let timer = null;

  const body = `
    <label class="field"><span>Título</span>
      <input name="title" placeholder="Ej.: La abuela cuenta su infancia"></label>
    <div class="recorder">
      ${canRecord ? `
        <button type="button" class="rec-btn" data-rec aria-label="Grabar">
          <span class="rec-dot"></span><span class="rec-label">Grabar</span>
        </button>
        <span class="rec-time" aria-live="polite">0:00</span>` : '<p class="muted">Este navegador no permite grabar; sube un archivo de audio.</p>'}
      <label class="btn btn-ghost file-btn">📁 Subir archivo
        <input type="file" name="file" accept="audio/*" hidden></label>
    </div>
    <audio class="rec-preview" controls hidden></audio>
    <label class="check"><input type="checkbox" name="transcribe" checked> Transcribir con Whisper al guardar</label>`;

  const stopAll = () => {
    clearInterval(timer);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
  };

  const { form } = openModal({
    title: 'Agregar audio',
    body,
    submitLabel: 'Guardar audio',
    onClose: stopAll,
    onSubmit: async (f) => {
      if (recorder && recorder.state === 'recording') throw new Error('Detén la grabación primero');
      if (!blob) throw new Error('Graba o sube un audio');
      const fd = new FormData(f);
      const media = await api.addMedia({
        person_id: personId,
        kind: 'audio',
        title: String(fd.get('title') || '').trim() || 'Audio',
        file: blob,
        ext: extFromType(blob.type, 'webm'),
      });
      toast('Audio guardado', 'success');
      await ctx.refresh(personId);
      if (fd.get('transcribe')) ctx.transcribeMedia(media);
    },
  });

  const preview = form.querySelector('.rec-preview');
  const setBlob = (b) => {
    blob = b;
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(b);
    preview.hidden = false;
  };

  form.querySelector('input[name="file"]').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) setBlob(file);
  });

  const recBtn = form.querySelector('[data-rec]');
  if (!recBtn) return;
  const label = recBtn.querySelector('.rec-label');
  const time = form.querySelector('.rec-time');

  recBtn.addEventListener('click', async () => {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast('No se pudo acceder al micrófono. Revisa los permisos.', 'error');
      return;
    }
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      recBtn.classList.remove('recording');
      label.textContent = 'Grabar de nuevo';
      if (chunks.length) setBlob(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
    };
    const started = Date.now();
    time.textContent = '0:00';
    timer = setInterval(() => { time.textContent = fmt((Date.now() - started) / 1000); }, 250);
    recorder.start();
    recBtn.classList.add('recording');
    label.textContent = 'Detener';
    preview.hidden = true;
  });
}
