export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Crea un elemento a partir de HTML (un solo nodo raíz). */
export function html(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

export function fullName(p) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

export function initials(p) {
  return [p.first_name, p.last_name].filter(Boolean).map((s) => s.trim()[0]).join('').slice(0, 2).toUpperCase();
}

const CURRENT_YEAR = new Date().getFullYear();

export function ageOf(p) {
  if (p.birth_year) return (p.death_year || CURRENT_YEAR) - p.birth_year;
  return p.age ?? null;
}

const yearsText = (n) => `${n} ${n === 1 ? 'año' : 'años'}`;

/**
 * Texto corto para la tarjeta del árbol:
 * vivos → edad calculada ("45 años"); fallecidos → "1950 – 2010".
 */
export function lifeShort(p) {
  if (p.death_year) return `${p.birth_year ?? '?'} – ${p.death_year}`;
  const age = ageOf(p);
  return age != null ? yearsText(age) : '';
}

/** Texto largo para la ficha. */
export function lifeLong(p) {
  const age = ageOf(p);
  if (p.death_year) {
    const range = `${p.birth_year ?? '?'} – ${p.death_year}`;
    return p.birth_year ? `${range} (vivió ${yearsText(age)})` : range;
  }
  if (age == null) return '';
  return p.birth_year ? `${yearsText(age)} · nació en ${p.birth_year}` : `Edad: ${yearsText(age)}`;
}

export function toast(message, type = 'info', ms = 3500) {
  const host = document.getElementById('toasts');
  const node = html(`<div class="toast toast-${type}" role="status">${esc(message)}</div>`);
  host.append(node);
  setTimeout(() => node.classList.add('hide'), ms);
  setTimeout(() => node.remove(), ms + 400);
}

/** Reduce una imagen a máx. `max` px y la devuelve como JPEG. */
export async function resizeImage(file, max = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // formato no soportado (p. ej. HEIC antiguo): se sube tal cual
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((res) => canvas.toBlob((b) => res(b || file), 'image/jpeg', quality));
}

export function extFromType(type, fallback = 'bin') {
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
    'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg',
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac',
  };
  return map[(type || '').split(';')[0]] || fallback;
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export function confirmDialog(message) {
  return Promise.resolve(window.confirm(message));
}
