// Backend real: Supabase (base de datos + Storage). Los datos se comparten
// entre todos los dispositivos que entren con la contraseña familiar.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, FAMILY_EMAIL, BUCKET } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const URL_TTL = 60 * 60 * 6; // 6 h
const urlCache = new Map(); // path -> { url, expires } | Promise

function check({ data, error }) {
  if (error) throw error;
  return data;
}

function randomName(ext) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

async function uploadFile(personId, blob, ext) {
  const path = `persons/${personId}/${randomName(ext)}`;
  check(await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || undefined,
    upsert: false,
  }));
  return path;
}

async function removeFiles(paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  await sb.storage.from(BUCKET).remove(list);
  list.forEach((p) => urlCache.delete(p));
}

export default {
  mode: 'supabase',

  async hasSession() {
    const { data } = await sb.auth.getSession();
    return !!data.session;
  },

  async login(password) {
    const { error } = await sb.auth.signInWithPassword({ email: FAMILY_EMAIL, password });
    return !error;
  },

  async logout() {
    await sb.auth.signOut();
  },

  async loadAll() {
    const [p, r, m] = await Promise.all([
      sb.from('persons').select('*'),
      sb.from('relationships').select('*'),
      sb.from('media').select('*').order('created_at'),
    ]);
    return { persons: check(p), relationships: check(r), media: check(m) };
  },

  async savePerson(person) {
    const row = { ...person, updated_at: new Date().toISOString() };
    delete row.created_at;
    if (row.id) {
      return check(await sb.from('persons').update(row).eq('id', row.id).select().single());
    }
    delete row.id;
    return check(await sb.from('persons').insert(row).select().single());
  },

  async deletePerson(id) {
    const media = check(await sb.from('media').select('storage_path').eq('person_id', id));
    await removeFiles(media.map((m) => m.storage_path));
    // relationships y media se borran en cascada
    check(await sb.from('persons').delete().eq('id', id));
  },

  async addRelation(person_id, related_id, type) {
    const { error } = await sb.from('relationships').insert({ person_id, related_id, type });
    if (error && error.code !== '23505') throw error; // 23505 = ya existía
  },

  async removeRelation(id) {
    check(await sb.from('relationships').delete().eq('id', id));
  },

  async addMedia({ person_id, kind, title = null, text_content = null, transcript = null, file = null, ext = 'bin' }) {
    const storage_path = file ? await uploadFile(person_id, file, ext) : null;
    return check(await sb.from('media')
      .insert({ person_id, kind, title, text_content, transcript, storage_path })
      .select().single());
  },

  async updateMedia(id, patch) {
    return check(await sb.from('media').update(patch).eq('id', id).select().single());
  },

  async deleteMedia(media) {
    await removeFiles([media.storage_path]);
    check(await sb.from('media').delete().eq('id', media.id));
  },

  async fileUrl(path) {
    if (!path) return null;
    const cached = urlCache.get(path);
    if (cached instanceof Promise) return cached;
    if (cached && cached.expires > Date.now()) return cached.url;
    const promise = sb.storage.from(BUCKET).createSignedUrl(path, URL_TTL).then(({ data, error }) => {
      if (error) { urlCache.delete(path); return null; }
      urlCache.set(path, { url: data.signedUrl, expires: Date.now() + (URL_TTL - 300) * 1000 });
      return data.signedUrl;
    });
    urlCache.set(path, promise);
    return promise;
  },
};
