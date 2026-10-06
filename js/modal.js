// Ventana modal genérica basada en <dialog>.
import { $, esc, toast } from './utils.js';

/**
 * Abre un formulario modal.
 * onSubmit(form) puede ser async; si lanza un error el modal sigue abierto.
 */
export function openModal({ title, body, submitLabel = 'Guardar', onSubmit, onClose }) {
  const dialog = $('#modal');
  dialog.innerHTML = `
    <form class="modal-form" method="dialog" novalidate>
      <header class="modal-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar">✕</button>
      </header>
      <div class="modal-body"></div>
      ${onSubmit ? `<footer class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
      </footer>` : ''}
    </form>`;
  const form = dialog.querySelector('form');
  const bodyHost = dialog.querySelector('.modal-body');
  if (typeof body === 'string') bodyHost.innerHTML = body; else bodyHost.append(body);

  const close = () => {
    if (dialog.open) dialog.close();
  };
  dialog.onclose = () => { onClose?.(); dialog.innerHTML = ''; };
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    if (!form.reportValidity()) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.classList.add('loading');
    try {
      const keepOpen = await onSubmit(form);
      if (keepOpen !== true) close();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Ocurrió un error', 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  });

  dialog.showModal();
  return { dialog, form, close };
}
