// Ficha de la persona seleccionada: datos, familia, fotos, audios y textos.
import { api } from './api.js';
import { openPersonForm, openTextForm } from './forms.js';
import { openAudioForm } from './recorder.js';
import { openModal } from './modal.js';
import {
  esc, fullName, initials, lifeLong, formatDate, resizeImage, extFromType, toast, confirmDialog,
} from './utils.js';

function chip(ctx, id, relType, relOwner, relTarget) {
  const p = ctx.index.byId.get(id);
  const relId = relType ? ctx.index.relationId(relOwner, relTarget, relType) : null;
  return `<span class="chip g-${esc(p.gender || 'O')}">
    <button type="button" class="chip-name" data-go="${esc(id)}">${esc(fullName(p))}</button>
    ${relId ? `<button type="button" class="chip-x" data-unlink="${esc(relId)}" aria-label="Quitar vínculo con ${esc(fullName(p))}" title="Quitar vínculo">✕</button>` : ''}
  </span>`;
}

function kinChip(ctx, id, label) {
  const p = ctx.index.byId.get(id);
  return `<span class="chip g-${esc(p.gender || 'O')}">
    <button type="button" class="chip-name" data-go="${esc(id)}">${esc(fullName(p))}
      <small class="chip-kin">${esc(label)}</small></button>
  </span>`;
}

const EXTENDED_GROUPS = ['Abuelos', 'Bisabuelos', 'Nietos', 'Bisnietos', 'Tíos', 'Sobrinos', 'Primos', 'Familia política', 'Otros'];

function familySection(ctx, p) {
  const parents = ctx.index.parentsOf(p.id);
  const partners = ctx.index.partnersOf(p.id);
  const children = ctx.index.childrenOf(p.id);
  const kin = ctx.index.kinship(p.id);
  const row = (label, items) => (items.length ? `<div class="fam-row"><span class="fam-label">${label}</span><div class="chips">${items.join('')}</div></div>` : '');
  const byGroup = (group) => [...kin].filter(([, k]) => k.group === group);
  const rows = [
    row('Padres', parents.map((id) => chip(ctx, id, 'parent', p.id, id))),
    row(partners.length > 1 ? 'Parejas' : 'Pareja', partners.map(({ id, kind }) => (kind === 'spouse'
      ? chip(ctx, id, 'spouse', p.id, id)
      : kinChip(ctx, id, 'hijos en común')))),
    row('Hijos', children.map((id) => chip(ctx, id, 'parent', id, p.id))),
    row('Hermanos', byGroup('Hermanos').map(([id, k]) => (k.label.startsWith('Medi') ? kinChip(ctx, id, k.label.toLowerCase()) : chip(ctx, id)))),
    ...EXTENDED_GROUPS.map((group) => row(group, byGroup(group).map(([id, k]) => kinChip(ctx, id, k.label.toLowerCase())))),
  ].join('');
  return rows || '<p class="muted">Aún no tiene familiares vinculados.</p>';
}

function audioCard(ctx, m) {
  const busy = ctx.transcribing.get(m.id);
  let transcript;
  if (busy) {
    transcript = `<p class="transcribing"><span class="spinner"></span> ${esc(busy)}</p>`;
  } else if (m.transcript) {
    transcript = `<div class="transcript"><span class="t-label">Transcripción</span><p>${esc(m.transcript)}</p>
      <button type="button" class="link-btn" data-edit-transcript="${esc(m.id)}">Editar transcripción</button></div>`;
  } else {
    transcript = `<button type="button" class="btn btn-small" data-transcribe="${esc(m.id)}">✨ Transcribir con Whisper</button>`;
  }
  return `<article class="media-card">
    <header><strong>${esc(m.title || 'Audio')}</strong><span class="muted small">${esc(formatDate(m.created_at))}</span>
      <button type="button" class="icon-btn small" data-del-media="${esc(m.id)}" aria-label="Eliminar audio" title="Eliminar">🗑</button></header>
    <audio controls preload="none" data-src="${esc(m.storage_path)}"></audio>
    ${transcript}
  </article>`;
}

function textCard(m) {
  return `<article class="media-card">
    <header><strong>${esc(m.title || 'Texto')}</strong><span class="muted small">${esc(formatDate(m.created_at))}</span>
      <button type="button" class="icon-btn small" data-edit-text="${esc(m.id)}" aria-label="Editar texto" title="Editar">✎</button>
      <button type="button" class="icon-btn small" data-del-media="${esc(m.id)}" aria-label="Eliminar texto" title="Eliminar">🗑</button></header>
    <p class="text-content">${esc(m.text_content)}</p>
  </article>`;
}

export function renderPanel(ctx, host, personId) {
  const p = ctx.index.byId.get(personId);
  if (!p) { host.innerHTML = ''; return; }
  const media = ctx.index.mediaOf(p.id);
  const photos = media.filter((m) => m.kind === 'photo');
  const audios = media.filter((m) => m.kind === 'audio');
  const texts = media.filter((m) => m.kind === 'text');

  host.innerHTML = `
    <div class="panel-grip" aria-hidden="true"></div>
    <button type="button" class="icon-btn panel-close" data-close-panel aria-label="Cerrar ficha">✕</button>
    <section class="panel-head">
      <div class="big-avatar g-${esc(p.gender || 'O')}" data-photo="${esc(p.photo_path || '')}">${esc(initials(p))}</div>
      <div>
        <h2>${esc(fullName(p))}${p.death_year ? ' <span class="cross" title="Fallecido/a">†</span>' : ''}</h2>
        <p class="life">${esc(lifeLong(p))}</p>
      </div>
    </section>
    ${p.description ? `<p class="description">${esc(p.description)}</p>` : ''}

    <div class="actions">
      <button type="button" class="btn btn-small" data-act="edit">✎ Editar</button>
      <button type="button" class="btn btn-small" data-act="father">+ Padre</button>
      <button type="button" class="btn btn-small" data-act="mother">+ Madre</button>
      <button type="button" class="btn btn-small" data-act="spouse">+ Pareja</button>
      <button type="button" class="btn btn-small" data-act="child">+ Hijo/a</button>
    </div>

    <section class="panel-section">
      <h3>Familia</h3>
      ${familySection(ctx, p)}
    </section>

    <section class="panel-section">
      <div class="section-head"><h3>Fotos <span class="count">${photos.length}</span></h3>
        <label class="btn btn-small">+ Fotos<input type="file" accept="image/*" multiple hidden data-add-photos></label></div>
      ${photos.length ? `<div class="photo-grid">${photos.map((m) => `
        <button type="button" class="photo-thumb" data-open-photo="${esc(m.id)}" data-photo="${esc(m.storage_path)}" aria-label="${esc(m.title || 'Foto')}"></button>`).join('')}</div>`
        : '<p class="muted">Sin fotos todavía.</p>'}
    </section>

    <section class="panel-section">
      <div class="section-head"><h3>Audios <span class="count">${audios.length}</span></h3>
        <button type="button" class="btn btn-small" data-act="audio">🎙 Agregar audio</button></div>
      ${audios.length ? audios.map((m) => audioCard(ctx, m)).join('') : '<p class="muted">Graba la voz o los recuerdos de esta persona.</p>'}
    </section>

    <section class="panel-section">
      <div class="section-head"><h3>Textos <span class="count">${texts.length}</span></h3>
        <button type="button" class="btn btn-small" data-act="text">+ Texto</button></div>
      ${texts.length ? texts.map(textCard).join('') : '<p class="muted">Historias, anécdotas o datos.</p>'}
    </section>

    <div class="danger-zone">
      <button type="button" class="btn btn-danger btn-small" data-act="delete">Eliminar persona</button>
    </div>`;

  // Cargar imágenes y audios (URLs firmadas)
  host.querySelectorAll('[data-photo]').forEach(async (el) => {
    if (!el.dataset.photo) return;
    const url = await api.fileUrl(el.dataset.photo);
    if (url) el.innerHTML = `<img src="${esc(url)}" alt="" loading="lazy">`;
  });
  host.querySelectorAll('audio[data-src]').forEach(async (el) => {
    const url = await api.fileUrl(el.dataset.src);
    if (url) el.src = url;
  });

  const mediaById = (id) => media.find((m) => m.id === id);

  host.onclick = async (e) => {
    const t = e.target.closest('button, [data-open-photo]');
    if (!t) return;
    const d = t.dataset;

    if (d.closePanel !== undefined) return ctx.select(null);
    if (d.go) return ctx.select(d.go, true);

    if (d.unlink) {
      if (!(await confirmDialog('¿Quitar este vínculo familiar? (Las personas no se borran)'))) return;
      await api.removeRelation(d.unlink);
      return ctx.refresh(p.id);
    }

    if (d.act) {
      switch (d.act) {
        case 'edit': return openPersonForm(ctx, { person: p });
        case 'father': case 'mother': case 'spouse': case 'child':
          return openPersonForm(ctx, { relation: { type: d.act, of: p.id } });
        case 'audio': return openAudioForm(ctx, p.id);
        case 'text': return openTextForm(ctx, p.id);
        case 'delete':
          if (!(await confirmDialog(`¿Eliminar a ${fullName(p)} con todas sus fotos, audios y textos? Esta acción no se puede deshacer.`))) return;
          await api.deletePerson(p.id);
          toast('Persona eliminada', 'success');
          return ctx.refresh(null);
        default: return undefined;
      }
    }

    if (d.openPhoto) return openPhoto(ctx, p, mediaById(d.openPhoto));
    if (d.transcribe) return ctx.transcribeMedia(mediaById(d.transcribe));
    if (d.editText) return openTextForm(ctx, p.id, mediaById(d.editText));
    if (d.editTranscript) return editTranscript(ctx, p.id, mediaById(d.editTranscript));
    if (d.delMedia) {
      const m = mediaById(d.delMedia);
      if (!(await confirmDialog(`¿Eliminar "${m.title || 'este elemento'}"?`))) return;
      await api.deleteMedia(m);
      if (m.storage_path && m.storage_path === p.photo_path) await api.savePerson({ id: p.id, photo_path: null });
      return ctx.refresh(p.id);
    }
    return undefined;
  };

  host.querySelector('[data-add-photos]').onchange = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    toast(`Subiendo ${files.length} foto(s)…`);
    try {
      let first = null;
      for (const file of files) {
        const img = await resizeImage(file);
        const m = await api.addMedia({
          person_id: p.id, kind: 'photo', title: file.name.replace(/\.[^.]+$/, ''), file: img, ext: extFromType(img.type, 'jpg'),
        });
        first ??= m;
      }
      if (!p.photo_path && first) await api.savePerson({ id: p.id, photo_path: first.storage_path });
      toast('Fotos guardadas', 'success');
    } catch (err) {
      console.error(err);
      toast(err.message || 'No se pudieron subir las fotos', 'error');
    }
    await ctx.refresh(p.id);
  };
}

async function openPhoto(ctx, p, m) {
  const url = await api.fileUrl(m.storage_path);
  const isProfile = p.photo_path === m.storage_path;
  const { close, dialog } = openModal({
    title: m.title || 'Foto',
    body: `<figure class="lightbox"><img src="${esc(url)}" alt="${esc(m.title || '')}"></figure>
      <div class="actions">
        ${isProfile ? '<span class="muted">Es la foto de perfil</span>' : '<button type="button" class="btn btn-small" data-profile>Usar como foto de perfil</button>'}
        <a class="btn btn-small" href="${esc(url)}" target="_blank" rel="noopener" download>Descargar</a>
        <button type="button" class="btn btn-small btn-danger" data-delete>Eliminar foto</button>
      </div>`,
  });
  dialog.querySelector('[data-profile]')?.addEventListener('click', async () => {
    await api.savePerson({ id: p.id, photo_path: m.storage_path });
    close();
    toast('Foto de perfil actualizada', 'success');
    ctx.refresh(p.id);
  });
  dialog.querySelector('[data-delete]').addEventListener('click', async () => {
    if (!(await confirmDialog('¿Eliminar esta foto?'))) return;
    await api.deleteMedia(m);
    if (isProfile) await api.savePerson({ id: p.id, photo_path: null });
    close();
    ctx.refresh(p.id);
  });
}

function editTranscript(ctx, personId, m) {
  openModal({
    title: 'Editar transcripción',
    body: `<label class="field"><span>${esc(m.title || 'Audio')}</span>
      <textarea name="transcript" rows="10">${esc(m.transcript)}</textarea></label>`,
    onSubmit: async (f) => {
      await api.updateMedia(m.id, { transcript: new FormData(f).get('transcript') });
      toast('Transcripción guardada', 'success');
      await ctx.refresh(personId);
    },
  });
}
