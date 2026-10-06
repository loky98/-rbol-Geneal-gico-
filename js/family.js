// Índices para consultar rápidamente parientes y archivos de cada persona,
// y cálculo de parentescos (tío, primo, cuñado…) respecto a una persona.

export function buildIndex({ persons, relationships, media }) {
  const byId = new Map(persons.map((p) => [p.id, p]));
  const parents = new Map();
  const children = new Map();
  const spouses = new Map();
  const relOf = new Map(); // "a|b|type" -> relationship id
  const push = (map, key, val) => {
    if (!map.has(key)) map.set(key, []);
    if (!map.get(key).includes(val)) map.get(key).push(val);
  };

  for (const r of relationships) {
    if (!byId.has(r.person_id) || !byId.has(r.related_id)) continue;
    if (r.type === 'parent') {
      push(parents, r.person_id, r.related_id);
      push(children, r.related_id, r.person_id);
      relOf.set(`${r.person_id}|${r.related_id}|parent`, r.id);
    } else if (r.type === 'spouse') {
      push(spouses, r.person_id, r.related_id);
      push(spouses, r.related_id, r.person_id);
      relOf.set(`${r.person_id}|${r.related_id}|spouse`, r.id);
      relOf.set(`${r.related_id}|${r.person_id}|spouse`, r.id);
    }
  }

  const mediaOf = new Map();
  for (const m of media) push(mediaOf, m.person_id, m);

  const byBirth = (ids) => ids.slice().sort((a, b) =>
    (byId.get(a)?.birth_year ?? 9999) - (byId.get(b)?.birth_year ?? 9999));

  const parentsOf = (id) => byBirth(parents.get(id) || []);
  const childrenOf = (id) => byBirth(children.get(id) || []);
  const spousesOf = (id) => spouses.get(id) || [];

  /** Parejas registradas + copadres (el otro padre/madre de algún hijo). */
  function partnersOf(id) {
    const list = spousesOf(id).map((s) => ({ id: s, kind: 'spouse' }));
    for (const c of children.get(id) || []) {
      for (const q of parents.get(c) || []) {
        if (q !== id && !list.some((x) => x.id === q)) list.push({ id: q, kind: 'coparent' });
      }
    }
    return list;
  }

  function siblingsOf(id) {
    const set = new Set();
    for (const p of parents.get(id) || []) for (const c of children.get(p) || []) if (c !== id) set.add(c);
    return byBirth([...set]);
  }

  /** Parentesco de cada persona relacionada con `id`: Map(otroId -> {label, group}). */
  function kinship(id) {
    const res = new Map();
    const g = (pid, m, f, n) => {
      const gender = byId.get(pid)?.gender;
      return gender === 'M' ? m : gender === 'F' ? f : n;
    };
    const add = (pid, label, group) => {
      if (pid !== id && !res.has(pid) && byId.has(pid)) res.set(pid, { label, group });
    };
    const myParents = parents.get(id) || [];
    const myPartners = partnersOf(id).map((x) => x.id);
    const myChildren = children.get(id) || [];
    const mySiblings = siblingsOf(id);

    myParents.forEach((p) => add(p, g(p, 'Padre', 'Madre', 'Padre/Madre'), 'Padres'));
    myPartners.forEach((p) => add(p, 'Pareja', 'Pareja'));
    myChildren.forEach((c) => add(c, g(c, 'Hijo', 'Hija', 'Hijo/a'), 'Hijos'));

    for (const s of mySiblings) {
      const sp = parents.get(s) || [];
      const shared = sp.filter((p) => myParents.includes(p)).length;
      const half = shared < Math.max(sp.length, myParents.length);
      add(s, half ? g(s, 'Medio hermano', 'Media hermana', 'Medio hermano/a') : g(s, 'Hermano', 'Hermana', 'Hermano/a'), 'Hermanos');
    }

    const grandparents = myParents.flatMap((p) => parents.get(p) || []);
    grandparents.forEach((p) => add(p, g(p, 'Abuelo', 'Abuela', 'Abuelo/a'), 'Abuelos'));
    const grandchildren = myChildren.flatMap((c) => children.get(c) || []);
    grandchildren.forEach((c) => add(c, g(c, 'Nieto', 'Nieta', 'Nieto/a'), 'Nietos'));

    // Tíos (hermanos de mis padres) y primos (hijos de mis tíos), anotando por qué lado vienen
    const uncles = [];
    const cousinSides = new Map(); // primo -> Set(de qué padre mío viene)
    for (const p of myParents) {
      for (const u of siblingsOf(p)) {
        if (myParents.includes(u)) continue;
        uncles.push(u);
        add(u, g(u, 'Tío', 'Tía', 'Tío/a'), 'Tíos');
        for (const c of children.get(u) || []) {
          if (!cousinSides.has(c)) cousinSides.set(c, new Set());
          cousinSides.get(c).add(p);
        }
      }
    }
    mySiblings.flatMap((s) => children.get(s) || []).forEach((c) => add(c, g(c, 'Sobrino', 'Sobrina', 'Sobrino/a'), 'Sobrinos'));
    for (const [c, sides] of cousinSides) {
      if (mySiblings.includes(c)) continue;
      const base = g(c, 'Primo hermano', 'Prima hermana', 'Primo/a hermano/a');
      add(c, sides.size > 1 ? `${base} (doble)` : base, 'Primos');
    }

    grandparents.flatMap((p) => parents.get(p) || []).forEach((p) => add(p, g(p, 'Bisabuelo', 'Bisabuela', 'Bisabuelo/a'), 'Bisabuelos'));
    grandchildren.flatMap((c) => children.get(c) || []).forEach((c) => add(c, g(c, 'Bisnieto', 'Bisnieta', 'Bisnieto/a'), 'Bisnietos'));

    // Familia política
    myPartners.flatMap((p) => parents.get(p) || []).forEach((p) => add(p, g(p, 'Suegro', 'Suegra', 'Suegro/a'), 'Familia política'));
    myChildren.flatMap((c) => partnersOf(c).map((x) => x.id)).forEach((p) => add(p, g(p, 'Yerno', 'Nuera', 'Yerno/Nuera'), 'Familia política'));
    myPartners.flatMap(siblingsOf).forEach((s) => add(s, g(s, 'Cuñado', 'Cuñada', 'Cuñado/a'), 'Familia política'));
    mySiblings.flatMap((s) => partnersOf(s).map((x) => x.id)).forEach((s) => add(s, g(s, 'Cuñado', 'Cuñada', 'Cuñado/a'), 'Familia política'));
    uncles.flatMap((u) => partnersOf(u).map((x) => x.id)).forEach((u) => add(u, g(u, 'Tío político', 'Tía política', 'Tío/a político/a'), 'Tíos'));

    // Otros lazos
    myPartners.flatMap((p) => children.get(p) || []).forEach((c) => add(c, g(c, 'Hijastro', 'Hijastra', 'Hijastro/a'), 'Otros'));
    for (const p of myParents) {
      const of = g(p, 'del padre', 'de la madre', 'del padre/madre');
      partnersOf(p).forEach((x) => add(x.id, `Pareja ${of}`, 'Otros'));
    }
    return res;
  }

  return {
    byId,
    parentsOf,
    childrenOf,
    spousesOf,
    partnersOf,
    siblingsOf,
    kinship,
    mediaOf: (id) => mediaOf.get(id) || [],
    relationId: (a, b, type) => relOf.get(`${a}|${b}|${type}`),
  };
}
