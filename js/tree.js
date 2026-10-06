// Dibujo del árbol: cálculo de posiciones, líneas de parentesco y zoom/arrastre
// (ratón, rueda y gestos táctiles con dos dedos).
import { esc, fullName, initials, lifeShort } from './utils.js';

const W = 184;          // ancho de tarjeta
const H = 74;           // alto de tarjeta
const COUPLE_GAP = 22;  // separación entre esposos
const H_GAP = 34;       // separación entre familias
const ROW_H = H + 96;   // distancia entre generaciones
const PAD = 60;

/** Calcula la posición (x, y) de cada persona. */
function computeLayout(index, persons) {
  const ids = persons.map((p) => p.id);
  const gen = new Map(ids.map((id) => [id, 0]));

  // Generación = una más que sus padres; los esposos comparten generación.
  for (let i = 0; i < ids.length * 2 + 4; i++) {
    let changed = false;
    for (const id of ids) {
      let g = gen.get(id);
      for (const p of index.parentsOf(id)) g = Math.max(g, gen.get(p) + 1);
      for (const s of index.spousesOf(id)) g = Math.max(g, gen.get(s));
      if (g !== gen.get(id)) { gen.set(id, g); changed = true; }
    }
    if (!changed) break;
  }

  const pos = new Map();       // id -> {x, y} | null (reservado)
  const nextFree = new Map();  // generación -> primera x libre

  function placeUnit(id) {
    if (pos.has(id)) return null;
    const g = gen.get(id);
    const members = [id];
    for (const s of index.spousesOf(id)) if (!pos.has(s) && !members.includes(s)) members.push(s);
    // Con un solo esposo/a: hombre a la izquierda por convención.
    if (members.length === 2 && index.byId.get(members[1]).gender === 'M' && index.byId.get(members[0]).gender !== 'M') {
      members.reverse();
    }
    members.forEach((m) => pos.set(m, null));

    const kids = [];
    for (const m of members) for (const c of index.childrenOf(m)) if (!kids.includes(c)) kids.push(c);
    const centers = [];
    for (const c of kids) {
      const r = placeUnit(c);
      if (r) centers.push(r.center);
    }

    const width = members.length * W + (members.length - 1) * COUPLE_GAP;
    const free = nextFree.get(g) ?? 0;
    let start = centers.length ? (Math.min(...centers) + Math.max(...centers)) / 2 - width / 2 : free;
    start = Math.max(start, free);
    members.forEach((m, i) => pos.set(m, { x: start + i * (W + COUPLE_GAP), y: g * ROW_H }));
    nextFree.set(g, start + width + H_GAP);
    return { center: start + width / 2 };
  }

  const hasParents = (id) => index.parentsOf(id).length > 0;
  const birth = (id) => index.byId.get(id).birth_year ?? 9999;
  const roots = ids
    .filter((id) => !hasParents(id) && !index.spousesOf(id).some(hasParents))
    .sort((a, b) => gen.get(a) - gen.get(b) || birth(a) - birth(b));
  roots.forEach(placeUnit);
  ids.forEach(placeUnit); // personas restantes (datos incompletos o ciclos)

  return pos;
}

function linesSvg(index, pos) {
  const paths = [];
  const done = new Set();

  // Líneas de pareja
  for (const [id, p] of pos) {
    for (const s of index.spousesOf(id)) {
      const key = [id, s].sort().join('|');
      if (done.has(key) || !pos.get(s)) continue;
      done.add(key);
      const q = pos.get(s);
      const [a, b] = p.x < q.x ? [p, q] : [q, p];
      const y1 = a.y + H / 2;
      const y2 = b.y + H / 2;
      paths.push(`<path class="line-spouse" d="M${a.x + W} ${y1} L${b.x} ${y2}"/>`);
    }
  }

  // Líneas padres → hijos, agrupadas por pareja de padres
  const groups = new Map();
  for (const [id] of pos) {
    const parents = index.parentsOf(id).filter((p) => pos.get(p));
    if (!parents.length) continue;
    const key = parents.slice().sort().join('|');
    if (!groups.has(key)) groups.set(key, { parents, kids: [] });
    groups.get(key).kids.push(id);
  }
  const perRow = new Map(); // escalona las líneas horizontales de familias distintas en la misma fila
  for (const { parents, kids } of groups.values()) {
    const pp = parents.map((p) => pos.get(p));
    let ax; let ay;
    if (pp.length >= 2 && Math.abs(pp[0].y - pp[1].y) < 1) {
      ax = (pp[0].x + pp[1].x + W) / 2;
      ay = pp[0].y + H / 2;
    } else {
      ax = pp[0].x + W / 2;
      ay = pp[0].y + H;
    }
    const kp = kids.map((k) => pos.get(k));
    const top = Math.min(...kp.map((k) => k.y));
    const n = perRow.get(top) ?? 0;
    perRow.set(top, n + 1);
    const busY = top - (ROW_H - H) / 2 + ((n % 5) - 2) * 9;
    const xs = kp.map((k) => k.x + W / 2);
    const minX = Math.min(ax, ...xs);
    const maxX = Math.max(ax, ...xs);
    let d = `M${ax} ${ay} L${ax} ${busY} M${minX} ${busY} L${maxX} ${busY}`;
    for (const k of kp) d += ` M${k.x + W / 2} ${busY} L${k.x + W / 2} ${k.y}`;
    paths.push(`<path class="line-child" d="${d}"/>`);
  }
  return paths.join('');
}

export class FamilyTree {
  constructor(viewport, { onSelect, photoUrl }) {
    this.viewport = viewport;
    this.onSelect = onSelect;
    this.photoUrl = photoUrl;
    this.stage = document.createElement('div');
    this.stage.className = 'tree-stage';
    viewport.append(this.stage);
    this.k = 1; this.tx = 0; this.ty = 0;
    this.pos = new Map();
    this.bounds = { w: 0, h: 0 };
    this.#bindGestures();
  }

  render(index, persons, selectedId) {
    this.pos = computeLayout(index, persons);
    let minX = Infinity; let maxX = -Infinity; let maxY = 0;
    for (const p of this.pos.values()) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + W); maxY = Math.max(maxY, p.y + H);
    }
    if (!this.pos.size) { minX = 0; maxX = 0; }
    // Normaliza para que todo quede en coordenadas positivas
    const shiftX = PAD - minX;
    for (const p of this.pos.values()) { p.x += shiftX; p.y += PAD; }
    this.bounds = { w: maxX - minX + PAD * 2, h: maxY + PAD * 2 };

    const cards = persons.map((p) => {
      const at = this.pos.get(p.id);
      const deceased = p.death_year ? ' deceased' : '';
      const sel = p.id === selectedId ? ' selected' : '';
      return `<button class="person-card g-${esc(p.gender || 'O')}${deceased}${sel}" data-id="${esc(p.id)}"
        style="left:${at.x}px;top:${at.y}px;width:${W}px;height:${H}px" aria-label="${esc(fullName(p))}">
        <span class="avatar" data-photo="${esc(p.photo_path || '')}">${esc(initials(p))}</span>
        <span class="card-text">
          <span class="card-name">${esc(fullName(p))}</span>
          <span class="card-years">${p.death_year ? '<span class="cross">†</span> ' : ''}${esc(lifeShort(p))}</span>
        </span>
      </button>`;
    }).join('');

    this.stage.style.width = `${this.bounds.w}px`;
    this.stage.style.height = `${this.bounds.h}px`;
    this.stage.innerHTML = `<svg class="tree-lines" width="${this.bounds.w}" height="${this.bounds.h}"
      viewBox="0 0 ${this.bounds.w} ${this.bounds.h}">${linesSvg(index, this.pos)}</svg>${cards}`;

    this.stage.querySelectorAll('.avatar[data-photo]').forEach(async (el) => {
      const path = el.dataset.photo;
      if (!path) return;
      const url = await this.photoUrl(path);
      if (url) el.innerHTML = `<img src="${esc(url)}" alt="" loading="lazy" draggable="false">`;
    });
  }

  setSelected(id) {
    this.stage.querySelectorAll('.person-card.selected').forEach((c) => c.classList.remove('selected'));
    this.stage.querySelector(`.person-card[data-id="${CSS.escape(id || '')}"]`)?.classList.add('selected');
  }

  #apply(animate = false) {
    this.stage.classList.toggle('animate', animate);
    this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.k})`;
    if (animate) setTimeout(() => this.stage.classList.remove('animate'), 400);
  }

  zoomAt(px, py, factor, animate = false) {
    const k = Math.min(2.5, Math.max(0.15, this.k * factor));
    this.tx = px - (px - this.tx) * (k / this.k);
    this.ty = py - (py - this.ty) * (k / this.k);
    this.k = k;
    this.#apply(animate);
  }

  zoomBy(factor) {
    const r = this.viewport.getBoundingClientRect();
    this.zoomAt(r.width / 2, r.height / 2, factor, true);
  }

  /** Ajusta el árbol a la pantalla. `minScale` evita tarjetas ilegibles en celulares. */
  fit(minScale = 0.15) {
    const r = this.viewport.getBoundingClientRect();
    if (!this.bounds.w || !r.width) return;
    this.k = Math.min(1, r.width / this.bounds.w, r.height / this.bounds.h);
    this.k = Math.max(this.k, minScale);
    this.tx = (r.width - this.bounds.w * this.k) / 2;
    this.ty = Math.max(0, (r.height - this.bounds.h * this.k) / 2);
    this.#apply(true);
  }

  /** Centra una persona. `visibleHeight` permite dejar sitio al panel inferior en móvil. */
  centerOn(id, visibleHeight) {
    const p = this.pos.get(id);
    if (!p) return;
    const r = this.viewport.getBoundingClientRect();
    const h = visibleHeight ?? r.height;
    this.k = Math.max(this.k, 0.7);
    this.tx = r.width / 2 - (p.x + W / 2) * this.k;
    this.ty = h / 2 - (p.y + H / 2) * this.k;
    this.#apply(true);
  }

  #bindGestures() {
    const vp = this.viewport;
    const pointers = new Map();
    let downCard = null;
    let moved = 0;
    let last = null; // {x, y, dist}

    const snapshot = () => {
      const pts = [...pointers.values()];
      if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, dist: 0 };
      const [a, b] = pts;
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    };

    vp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('.empty')) return;
      const r = vp.getBoundingClientRect();
      pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      if (pointers.size === 1) { downCard = e.target.closest('.person-card'); moved = 0; }
      else downCard = null;
      last = snapshot();
      vp.setPointerCapture(e.pointerId);
      vp.classList.add('dragging');
    });

    vp.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const r = vp.getBoundingClientRect();
      pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
      const now = snapshot();
      if (pointers.size >= 2 && last.dist) {
        this.zoomAt(now.x, now.y, now.dist / last.dist);
      }
      this.tx += now.x - last.x;
      this.ty += now.y - last.y;
      moved += Math.abs(now.x - last.x) + Math.abs(now.y - last.y);
      this.#apply();
      last = now;
    });

    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (e.type === 'pointerup' && pointers.size === 0 && downCard && moved < 8) {
        this.onSelect(downCard.dataset.id);
      }
      if (pointers.size === 0) { downCard = null; vp.classList.remove('dragging'); }
      last = pointers.size ? snapshot() : null;
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);

    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });

    // Teclado: Enter/Espacio sobre una tarjeta la selecciona
    vp.addEventListener('keydown', (e) => {
      const card = e.target.closest?.('.person-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.onSelect(card.dataset.id);
      }
    });
  }
}
