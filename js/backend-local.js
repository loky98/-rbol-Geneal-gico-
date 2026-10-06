// Backend de prueba: guarda todo en IndexedDB de este navegador.
// Se usa automáticamente cuando js/config.js no tiene datos de Supabase.

const PASSWORD_SHA256 = '8596ccb6f252f7db708e462a77d89aadee79fdc6a17fcff820cc22e1ef070594';
const SESSION_KEY = 'fv-local-session';
const STORES = ['persons', 'relationships', 'media', 'files'];

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('arbol-valenverguer', 1);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name, { keyPath: name === 'files' ? 'path' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const t = database.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

const getAll = (store) => tx(store, 'readonly', (s) => new Promise((res) => {
  const r = s.getAll();
  r.onsuccess = () => res(r.result);
}));
const put = (store, value) => tx(store, 'readwrite', (s) => { s.put(value); return value; });
const del = (store, key) => tx(store, 'readwrite', (s) => { s.delete(key); });
const getOne = (store, key) => tx(store, 'readonly', (s) => new Promise((res) => {
  const r = s.get(key);
  r.onsuccess = () => res(r.result);
}));

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const urlCache = new Map();
const now = () => new Date().toISOString();

export default {
  mode: 'local',

  async hasSession() {
    try { return localStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
  },

  async login(password) {
    const ok = (await sha256(password)) === PASSWORD_SHA256;
    if (ok) { try { localStorage.setItem(SESSION_KEY, '1'); } catch { /* sin almacenamiento */ } }
    return ok;
  },

  async logout() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* nada */ }
  },

  async loadAll() {
    const [persons, relationships, media] = await Promise.all([
      getAll('persons'), getAll('relationships'), getAll('media'),
    ]);
    media.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { persons, relationships, media };
  },

  async savePerson(person) {
    const existing = person.id ? await getOne('persons', person.id) : null;
    const row = {
      ...existing,
      ...person,
      id: person.id || crypto.randomUUID(),
      created_at: existing?.created_at || now(),
      updated_at: now(),
    };
    return put('persons', row);
  },

  async deletePerson(id) {
    const [rels, media] = await Promise.all([getAll('relationships'), getAll('media')]);
    for (const r of rels) if (r.person_id === id || r.related_id === id) await del('relationships', r.id);
    for (const m of media) if (m.person_id === id) await this.deleteMedia(m);
    await del('persons', id);
  },

  async addRelation(person_id, related_id, type) {
    const rels = await getAll('relationships');
    if (rels.some((r) => r.person_id === person_id && r.related_id === related_id && r.type === type)) return;
    await put('relationships', { id: crypto.randomUUID(), person_id, related_id, type, created_at: now() });
  },

  async removeRelation(id) {
    await del('relationships', id);
  },

  async addMedia({ person_id, kind, title = null, text_content = null, transcript = null, file = null, ext = 'bin' }) {
    let storage_path = null;
    if (file) {
      storage_path = `persons/${person_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await put('files', { path: storage_path, blob: file });
    }
    return put('media', {
      id: crypto.randomUUID(), person_id, kind, title, text_content, transcript, storage_path, created_at: now(),
    });
  },

  async updateMedia(id, patch) {
    const row = { ...(await getOne('media', id)), ...patch };
    return put('media', row);
  },

  async deleteMedia(media) {
    if (media.storage_path) {
      await del('files', media.storage_path);
      const url = urlCache.get(media.storage_path);
      if (url) URL.revokeObjectURL(url);
      urlCache.delete(media.storage_path);
    }
    await del('media', media.id);
  },

  async fileUrl(path) {
    if (!path) return null;
    if (urlCache.has(path)) return urlCache.get(path);
    const rec = await getOne('files', path);
    if (!rec) return null;
    const url = URL.createObjectURL(rec.blob);
    urlCache.set(path, url);
    return url;
  },
};
