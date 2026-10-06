// Índices para consultar rápidamente parientes y archivos de cada persona.

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

  return {
    byId,
    parentsOf: (id) => byBirth(parents.get(id) || []),
    childrenOf: (id) => byBirth(children.get(id) || []),
    spousesOf: (id) => spouses.get(id) || [],
    siblingsOf(id) {
      const set = new Set();
      for (const p of parents.get(id) || []) for (const c of children.get(p) || []) if (c !== id) set.add(c);
      return byBirth([...set]);
    },
    mediaOf: (id) => mediaOf.get(id) || [],
    relationId: (a, b, type) => relOf.get(`${a}|${b}|${type}`),
  };
}
