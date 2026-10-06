// Dibujo del árbol: cálculo de posiciones, líneas de parentesco, resaltado
// y zoom/arrastre (ratón, rueda y gestos táctiles con dos dedos).
import { esc, fullName, initials, lifeShort } from './utils.js';

const W = 200;          // ancho de tarjeta
const H = 88;           // alto de tarjeta
const COUPLE_GAP = 26;  // separación entre parejas
const H_GAP = 40;       // separación entre familias
const ROW_H = H + 110;  // distancia entre generaciones
const PAD = 60;

/* ------------------------------------------------------------------ */
/* Distribución                                                        */
/* ------------------------------------------------------------------ */

function computeLayout(index, persons) {
  const ids = persons.map((p) => p.id);
  const partners = new Map(ids.map((id) => [id, index.partnersOf(id)]));
  const partnerIds = (id) => partners.get(id).map((x) => x.id);
  const gen = new Map(ids.map((id) => [id, 0]));

  // Generación: una más que los padres; parejas y copadres en la misma fila;
  // quien no tiene padres baja hasta quedar justo encima de sus hijos.
  for (let i = 0; i < ids.length * 3 + 5; i++) {
    let changed = false;
    for (const id of ids) {
      let g = gen.get(id);
      const ps = index.parentsOf(id);
      for (const p of ps) g = Math.max(g, gen.get(p) + 1);
      for (const q of partnerIds(id)) g = Math.max(g, gen.get(q));
      if (!ps.length) {
        const kids = index.childrenOf(id);
        if (kids.length) g = Math.max(g, Math.min(...kids.map((c) => gen.get(c))) - 1);
      }
      if (g !== gen.get(id)) { gen.set(id, g); changed = true; }
    }
    if (!changed) break;
  }

  const hasParents = (id) => index.parentsOf(id).length > 0;
  const birth = (id) => index.byId.get(id).birth_year ?? 9999;
  const order = new Map(ids.map((id, i) => [id, i]));
  // ¿Alguna pareja de esta persona viene de otra familia del árbol?
  const marriesOut = (id) => partnerIds(id).some(hasParents);

  const pos = new Map();
  const reserved = new Set();
  const nextFree = new Map(); // generación -> primera x libre

  function arrangeUnit(id) {
    const g = gen.get(id);
    const free = (q) => !reserved.has(q) && gen.get(q) === g;
    // El centro es quien tiene más parejas (p. ej. Dora con dos parejas)
    const candidates = [id, ...partnerIds(id).filter(free)];
    let center = id;
    for (const c of candidates) {
      if (partnerIds(c).filter((q) => q === id || free(q)).length > partnerIds(center).filter((q) => q === id || free(q)).length) center = c;
    }
    const others = partners.get(center)
      .filter((x) => x.id === id || free(x.id))
      .map((x) => x.id)
      .filter((q) => q !== center);
    if (center !== id && !others.includes(id)) others.unshift(id);

    if (others.length === 0) return { members: [center], center };
    if (others.length === 1) {
      const [q] = others;
      let pair = [center, q];
      // Si la pareja tiene su familia en el árbol, va a la derecha (donde se ubicará esa familia).
      if (hasParents(q) && hasParents(center)) pair = [center, q];
      else if (index.byId.get(q).gender === 'M' && index.byId.get(center).gender !== 'M') pair = [q, center];
      return { members: pair, center };
    }
    // Varias parejas: la persona en el medio y las parejas alternadas a cada lado.
    const left = []; const right = [];
    others.forEach((q, i) => (i % 2 === 0 ? left.unshift(q) : right.push(q)));
    return { members: [...left, center, ...right], center };
  }

  function placeUnit(id) {
    if (reserved.has(id)) return null;
    const g = gen.get(id);
    const { members, center } = arrangeUnit(id);
    members.forEach((m) => reserved.add(m));

    // Hijos agrupados bajo la pareja con la que los tuvo
    const groups = members.map(() => []);
    const ci = members.indexOf(center);
    const seen = new Set();
    for (const m of members) {
      for (const c of index.childrenOf(m)) {
        if (seen.has(c)) continue;
        seen.add(c);
        const inUnit = index.parentsOf(c).filter((p) => members.includes(p));
        const other = inUnit.find((p) => p !== center);
        groups[other ? members.indexOf(other) : ci].push(c);
      }
    }
    // Dentro de cada grupo: por nacimiento, y los que se casaron con otra familia hacia el borde exterior
    groups.forEach((grp, gi) => {
      grp.sort((a, b) => birth(a) - birth(b) || order.get(a) - order.get(b));
      const out = grp.filter(marriesOut);
      const rest = grp.filter((c) => !marriesOut(c));
      grp.splice(0, grp.length, ...(gi < ci ? [...out, ...rest] : [...rest, ...out]));
    });

    const placed = [];
    const centers = [];
    for (const c of groups.flat()) {
      const r = placeUnit(c);
      if (r) { placed.push(...r.placed); centers.push(r.center); }
    }

    const width = members.length * W + (members.length - 1) * COUPLE_GAP;
    const free = nextFree.get(g) ?? 0;
    // Hijos que ya estaban ubicados en otra rama (p. ej. una hija casada en otra familia)
    const known = members.flatMap((m) => index.childrenOf(m))
      .filter((c) => pos.get(c) && !placed.includes(c))
      .map((c) => pos.get(c).x + W / 2);
    const all = [...centers, ...known];
    let start = free;
    if (all.length) start = Math.max(free, (Math.min(...all) + Math.max(...all)) / 2 - width / 2);
    if (centers.length) {
      const desired = (Math.min(...centers) + Math.max(...centers)) / 2 - width / 2;
      // Si la unidad tuvo que correrse a la derecha de sus hijos nuevos, se corre también su subárbol
      const shift = start - desired;
      if (shift > 0.5) {
        const rightEdge = new Map();
        for (const pid of placed) {
          const p = pos.get(pid);
          p.x += shift;
          const pg = Math.round(p.y / ROW_H);
          rightEdge.set(pg, Math.max(rightEdge.get(pg) ?? -Infinity, p.x + W));
        }
        for (const [pg, edge] of rightEdge) nextFree.set(pg, Math.max(nextFree.get(pg) ?? 0, edge + H_GAP));
      }
    }

    members.forEach((m, i) => pos.set(m, { x: start + i * (W + COUPLE_GAP), y: g * ROW_H }));
    nextFree.set(g, start + width + H_GAP);
    return { center: start + width / 2, placed: [...placed, ...members] };
  }

  const isRoot = (id) => !hasParents(id)
    && !partnerIds(id).some((q) => hasParents(q) || partnerIds(q).some(hasParents));
  ids.filter(isRoot)
    .sort((a, b) => gen.get(a) - gen.get(b) || birth(a) - birth(b) || order.get(a) - order.get(b))
    .forEach(placeUnit);
  ids.forEach(placeUnit); // personas restantes (datos incompletos o ciclos)

  return pos;
}

/* ------------------------------------------------------------------ */
/* Líneas                                                              */
/* ------------------------------------------------------------------ */

function relGroup(cls, ids, label, d) {
  return `<g class="rel ${cls}" data-ids="${ids.map(esc).join(' ')}" data-label="${esc(label)}">
    <path class="hit" d="${d}"/><path class="vis" d="${d}"/></g>`;
}

function linesSvg(index, pos) {
  const out = [];
  const name = (id) => fullName(index.byId.get(id));
  const isAdjacent = (a, b) => Math.abs(a.y - b.y) < 1 && Math.abs(Math.abs(a.x - b.x) - (W + COUPLE_GAP)) < 1;

  // Parejas (continuas) y copadres sin pareja registrada (punteadas)
  const done = new Set();
  for (const [id, p] of pos) {
    for (const { id: q, kind } of index.partnersOf(id)) {
      const key = [id, q].sort().join('|');
      if (done.has(key) || !pos.has(q)) continue;
      done.add(key);
      const r = pos.get(q);
      const [a, b] = p.x <= r.x ? [p, r] : [r, p];
      let d;
      if (isAdjacent(a, b)) {
        d = `M${a.x + W} ${a.y + H / 2} L${b.x} ${b.y + H / 2}`;
      } else if (Math.abs(a.y - b.y) < 1) {
        const ax = a.x + W / 2; const bx = b.x + W / 2; const top = a.y - 34;
        d = `M${ax} ${a.y} C${ax} ${top} ${bx} ${top} ${bx} ${b.y}`;
      } else {
        const [u, l] = a.y < b.y ? [a, b] : [b, a];
        d = `M${u.x + W / 2} ${u.y + H} C${u.x + W / 2} ${l.y - 30} ${l.x + W / 2} ${u.y + H + 30} ${l.x + W / 2} ${l.y}`;
      }
      const label = kind === 'spouse' ? `Pareja: ${name(id)} y ${name(q)}` : `Hijos en común: ${name(id)} y ${name(q)}`;
      out.push(relGroup(kind === 'spouse' ? 'rel-spouse' : 'rel-coparent', [id, q], label, d));
    }
  }

  // Padres → hijos, agrupados por la pareja de padres
  const groups = new Map();
  for (const [id] of pos) {
    const parents = index.parentsOf(id).filter((p) => pos.has(p));
    if (!parents.length) continue;
    const key = parents.slice().sort().join('|');
    if (!groups.has(key)) groups.set(key, { parents, kids: [] });
    groups.get(key).kids.push(id);
  }
  const perRow = new Map(); // escalona las barras horizontales de familias distintas en la misma fila
  for (const { parents, kids } of groups.values()) {
    const pp = parents.map((p) => pos.get(p));
    let anchors;
    if (pp.length === 2 && isAdjacent(pp[0], pp[1])) {
      anchors = [{ x: (Math.min(pp[0].x, pp[1].x) + Math.max(pp[0].x, pp[1].x) + W) / 2, y: pp[0].y + H / 2 }];
    } else {
      anchors = pp.map((p) => ({ x: p.x + W / 2, y: p.y + H }));
    }
    const kp = kids.map((k) => pos.get(k));
    const top = Math.min(...kp.map((k) => k.y));
    const n = perRow.get(top) ?? 0;
    perRow.set(top, n + 1);
    const busY = top - (ROW_H - H) / 2 + ((n % 7) - 3) * 8;
    const parentNames = parents.map(name).join(' y ');
    kids.forEach((kid, i) => {
      const k = kp[i];
      const kx = k.x + W / 2;
      const d = anchors.filter((a) => a.y < busY)
        .map((a) => `M${a.x} ${a.y} V${busY} H${kx} V${k.y}`).join(' ');
      if (!d) return;
      out.push(relGroup('rel-child', [...parents, kid], `${parentNames} → ${name(kid)}`, d));
    });
  }
  return out.join('');
}

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

function cardHtml(p, at) {
  const name = fullName(p);
  const life = lifeShort(p);
  const long = name.length > 26 ? ' long' : '';
  return `<button class="person-card g-${esc(p.gender || 'O')}${p.death_year ? ' deceased' : ''}" data-id="${esc(p.id)}"
    style="left:${at.x}px;top:${at.y}px;width:${W}px;height:${H}px"
    title="${esc(life ? `${name} · ${life}` : name)}" aria-label="${esc(name)}">
    <span class="avatar" data-photo="${esc(p.photo_path || '')}">${esc(initials(p))}</span>
    <span class="card-text">
      <span class="card-name${long}">${esc(name)}</span>
      ${life ? `<span class="card-years">${life.split(' · ').map((part, i) =>
        `<span>${i === 0 && p.death_year ? '<span class="cross">†</span> ' : ''}${esc(part)}</span>`).join('')}</span>` : ''}
    </span>
  </button>`;
}

export class FamilyTree {
  constructor(viewport, { onSelect, photoUrl }) {
    this.viewport = viewport;
    this.onSelect = onSelect;
    this.photoUrl = photoUrl;
    this.stage = document.createElement('div');
    this.stage.className = 'tree-stage';
    this.tip = document.createElement('div');
    this.tip.className = 'line-tip';
    this.tip.hidden = true;
    viewport.append(this.stage, this.tip);
    this.k = 1; this.tx = 0; this.ty = 0;
    this.pos = new Map();
    this.index = null;
    this.selectedId = null;
    this.bounds = { w: 0, h: 0 };
    this.#bindGestures();
    this.#bindLineHover();
  }

  render(index, persons, selectedId) {
    this.index = index;
    this.pos = computeLayout(index, persons);
    let minX = Infinity; let maxX = -Infinity; let maxY = 0;
    for (const p of this.pos.values()) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + W); maxY = Math.max(maxY, p.y + H);
    }
    if (!this.pos.size) { minX = 0; maxX = 0; }
    // Normaliza para que todo quede en coordenadas positivas (con espacio para arcos y etiquetas)
    const shiftX = PAD - minX;
    for (const p of this.pos.values()) { p.x += shiftX; p.y += PAD; }
    this.bounds = { w: maxX - minX + PAD * 2, h: maxY + PAD * 2 };

    const cards = persons.map((p) => cardHtml(p, this.pos.get(p.id))).join('');
    this.stage.style.width = `${this.bounds.w}px`;
    this.stage.style.height = `${this.bounds.h}px`;
    this.stage.innerHTML = `<svg class="tree-lines" width="${this.bounds.w}" height="${this.bounds.h}"
      viewBox="0 0 ${this.bounds.w} ${this.bounds.h}">${linesSvg(index, this.pos)}</svg>${cards}`;
    this.tip.hidden = true;

    this.stage.querySelectorAll('.avatar[data-photo]').forEach(async (el) => {
      const path = el.dataset.photo;
      if (!path) return;
      const url = await this.photoUrl(path);
      if (url) el.innerHTML = `<img src="${esc(url)}" alt="" loading="lazy" draggable="false">`;
    });
    this.setSelected(selectedId);
  }

  /** Marca la persona seleccionada, etiqueta a sus parientes y atenúa el resto. */
  setSelected(id) {
    this.selectedId = id || null;
    const stage = this.stage;
    stage.classList.toggle('has-selection', !!id);
    stage.querySelectorAll('.kin-badge').forEach((b) => b.remove());
    const kin = id && this.index ? this.index.kinship(id) : new Map();

    stage.querySelectorAll('.person-card').forEach((card) => {
      const cid = card.dataset.id;
      const k = kin.get(cid);
      card.classList.toggle('selected', cid === id);
      card.classList.toggle('kin', !!k);
      card.classList.toggle('dim', !!id && cid !== id && !k);
      if (k) card.insertAdjacentHTML('afterbegin', `<span class="kin-badge">${esc(k.label)}</span>`);
    });
    stage.querySelectorAll('.rel').forEach((g) => {
      const ids = g.dataset.ids.split(' ');
      const direct = !!id && ids.includes(id);
      g.classList.toggle('hl', direct);
      g.classList.toggle('dim', !!id && !direct && !ids.every((x) => x === id || kin.has(x)));
      if (direct) g.parentNode.appendChild(g); // al frente
    });
  }

  #focusLine(g, clientX, clientY) {
    this.#clearLine();
    if (!g) return;
    g.classList.add('hover');
    g.parentNode.appendChild(g);
    for (const pid of g.dataset.ids.split(' ')) {
      this.stage.querySelector(`.person-card[data-id="${CSS.escape(pid)}"]`)?.classList.add('line-hover');
    }
    const r = this.viewport.getBoundingClientRect();
    this.tip.textContent = g.dataset.label;
    this.tip.hidden = false;
    const x = Math.min(Math.max(clientX - r.left, 8), r.width - 8);
    this.tip.style.left = `${x}px`;
    this.tip.style.top = `${clientY - r.top - 14}px`;
    this.lineFocus = g;
  }

  #clearLine() {
    if (!this.lineFocus) return;
    this.lineFocus.classList.remove('hover');
    this.stage.querySelectorAll('.line-hover').forEach((c) => c.classList.remove('line-hover'));
    this.tip.hidden = true;
    this.lineFocus = null;
  }

  #bindLineHover() {
    this.stage.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const g = e.target.closest?.('.rel');
      if (g && g !== this.lineFocus) this.#focusLine(g, e.clientX, e.clientY);
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !this.lineFocus) return;
      const r = this.viewport.getBoundingClientRect();
      this.tip.style.left = `${Math.min(Math.max(e.clientX - r.left, 8), r.width - 8)}px`;
      this.tip.style.top = `${e.clientY - r.top - 14}px`;
    });
    this.stage.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse') return;
      const g = e.target.closest?.('.rel');
      if (g && g === this.lineFocus && !g.contains(e.relatedTarget)) this.#clearLine();
    });
  }

  #apply(animate = false) {
    this.stage.classList.toggle('animate', animate);
    this.stage.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.k})`;
    if (animate) setTimeout(() => this.stage.classList.remove('animate'), 400);
  }

  zoomAt(px, py, factor, animate = false) {
    const k = Math.min(2.5, Math.max(0.12, this.k * factor));
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
  fit(minScale = 0.12) {
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
    let downLine = null;
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
      pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY });
      if (pointers.size === 1) {
        downCard = e.target.closest('.person-card');
        downLine = downCard ? null : e.target.closest('.rel');
        moved = 0;
      } else { downCard = null; downLine = null; }
      last = snapshot();
      vp.setPointerCapture(e.pointerId);
      vp.classList.add('dragging');
    });

    vp.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const r = vp.getBoundingClientRect();
      pointers.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY });
      const now = snapshot();
      if (pointers.size >= 2 && last.dist) {
        this.zoomAt(now.x, now.y, now.dist / last.dist);
      }
      this.tx += now.x - last.x;
      this.ty += now.y - last.y;
      moved += Math.abs(now.x - last.x) + Math.abs(now.y - last.y);
      if (moved > 8) this.#clearLine();
      this.#apply();
      last = now;
    });

    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const pt = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (e.type === 'pointerup' && pointers.size === 0 && moved < 8) {
        if (downCard) this.onSelect(downCard.dataset.id);
        else if (downLine && e.pointerType !== 'mouse') this.#focusLine(downLine, pt.cx, pt.cy); // toque en celular
        else if (!downLine) this.#clearLine();
      }
      if (pointers.size === 0) { downCard = null; downLine = null; vp.classList.remove('dragging'); }
      last = pointers.size ? snapshot() : null;
    };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);

    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.#clearLine();
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
