// Formularios: crear/editar persona y agregar parientes.
import { api } from './api.js';
import { openModal } from './modal.js';
import { esc, fullName, resizeImage, extFromType, toast } from './utils.js';

const RELATION_TITLES = {
  father: 'Agregar padre',
  mother: 'Agregar madre',
  child: 'Agregar hijo/a',
  spouse: 'Agregar esposo/a o pareja',
};

function numOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param ctx {index, persons, refresh(selectId)}
 * @param opts {person?: persona a editar, relation?: {type, of: id}}
 */
export function openPersonForm(ctx, { person = null, relation = null } = {}) {
  const editing = !!person;
  const of = relation ? ctx.index.byId.get(relation.of) : null;
  const p = person || {
    gender: relation?.type === 'father' ? 'M' : relation?.type === 'mother' ? 'F' : '',
    last_name: relation?.type === 'child' || relation?.type === 'father' ? (of?.last_name || '') : '',
  };

  // Personas que se pueden vincular (todas menos la propia)
  const candidates = relation
    ? ctx.persons.filter((x) => x.id !== relation.of).sort((a, b) => fullName(a).localeCompare(fullName(b)))
    : [];
  const ofSpouses = relation?.type === 'child' ? ctx.index.spousesOf(relation.of) : [];

  const title = editing ? `Editar a ${fullName(person)}`
    : relation ? `${RELATION_TITLES[relation.type]} · ${fullName(of)}` : 'Agregar persona';

  const body = `
    ${candidates.length ? `
      <label class="field">
        <span>Vincular a una persona que ya existe <small>(opcional)</small></span>
        <select name="existing">
          <option value="">— Crear una persona nueva —</option>
          ${candidates.map((c) => `<option value="${esc(c.id)}">${esc(fullName(c))}${c.birth_year ? ` (${c.birth_year})` : ''}</option>`).join('')}
        </select>
      </label>` : ''}
    <div class="new-fields">
      <div class="grid-2">
        <label class="field"><span>Nombre(s) *</span>
          <input name="first_name" required autocomplete="off" value="${esc(p.first_name)}"></label>
        <label class="field"><span>Apellidos</span>
          <input name="last_name" autocomplete="off" value="${esc(p.last_name)}"></label>
      </div>
      <div class="grid-3">
        <label class="field"><span>Sexo</span>
          <select name="gender">
            <option value="">—</option>
            <option value="M" ${p.gender === 'M' ? 'selected' : ''}>Hombre</option>
            <option value="F" ${p.gender === 'F' ? 'selected' : ''}>Mujer</option>
            <option value="O" ${p.gender === 'O' ? 'selected' : ''}>Otro</option>
          </select></label>
        <label class="field"><span>Año de nacimiento</span>
          <input name="birth_year" type="number" inputmode="numeric" min="1000" max="2200" value="${esc(p.birth_year)}"></label>
        <label class="field"><span>Año de fallecimiento</span>
          <input name="death_year" type="number" inputmode="numeric" min="1000" max="2200" value="${esc(p.death_year)}"></label>
      </div>
      <label class="field field-narrow"><span>Edad <small>(si no se conoce el año de nacimiento)</small></span>
        <input name="age" type="number" inputmode="numeric" min="0" max="130" value="${esc(p.age)}"></label>
      <label class="field"><span>Descripción corta</span>
        <textarea name="description" rows="3" maxlength="600" placeholder="Quién es, a qué se dedicaba, recuerdos…">${esc(p.description)}</textarea></label>
      <label class="field"><span>${editing && p.photo_path ? 'Cambiar foto de perfil' : 'Foto de perfil'}</span>
        <input name="photo" type="file" accept="image/*"></label>
    </div>
    ${ofSpouses.length ? `
      <fieldset class="field checks">
        <legend>Este hijo/a también es de:</legend>
        ${ofSpouses.map((s, i) => `<label class="check"><input type="checkbox" name="other_parent" value="${esc(s)}" ${i === 0 && ofSpouses.length === 1 ? 'checked' : ''}> ${esc(fullName(ctx.index.byId.get(s)))}</label>`).join('')}
      </fieldset>` : ''}`;

  const { form } = openModal({
    title,
    body,
    submitLabel: editing ? 'Guardar cambios' : 'Agregar',
    onSubmit: async (f) => {
      const fd = new FormData(f);
      const existing = fd.get('existing');
      let id = existing || null;

      if (!id) {
        const first = String(fd.get('first_name') || '').trim();
        if (!first) throw new Error('Escribe al menos el nombre');
        const birth = numOrNull(fd.get('birth_year'));
        const death = numOrNull(fd.get('death_year'));
        if (birth && death && death < birth) throw new Error('El año de fallecimiento es anterior al de nacimiento');
        let saved = await api.savePerson({
          ...(editing ? { id: person.id } : {}),
          first_name: first,
          last_name: String(fd.get('last_name') || '').trim() || null,
          gender: fd.get('gender') || null,
          birth_year: birth,
          death_year: death,
          age: birth ? null : numOrNull(fd.get('age')),
          description: String(fd.get('description') || '').trim() || null,
        });
        id = saved.id;

        const photo = fd.get('photo');
        if (photo && photo.size) {
          const img = await resizeImage(photo);
          const media = await api.addMedia({
            person_id: id, kind: 'photo', title: 'Foto de perfil', file: img, ext: extFromType(img.type, 'jpg'),
          });
          saved = await api.savePerson({ id, photo_path: media.storage_path });
        }
      }

      if (relation) {
        const t = relation.type;
        if (t === 'father' || t === 'mother') {
          if (ctx.index.parentsOf(relation.of).length >= 2) {
            toast('Esta persona ya tiene dos padres registrados', 'warn');
          }
          await api.addRelation(relation.of, id, 'parent');
          // Si el otro progenitor ya existe, se registran como pareja
          for (const other of ctx.index.parentsOf(relation.of)) {
            if (other !== id && !ctx.index.spousesOf(other).includes(id)) {
              await api.addRelation(other, id, 'spouse');
            }
          }
        } else if (t === 'child') {
          await api.addRelation(id, relation.of, 'parent');
          for (const other of fd.getAll('other_parent')) await api.addRelation(id, other, 'parent');
        } else if (t === 'spouse') {
          await api.addRelation(relation.of, id, 'spouse');
        }
      }

      toast(editing ? 'Cambios guardados' : 'Persona agregada', 'success');
      await ctx.refresh(relation ? relation.of : id);
    },
  });

  // Ocultar campos de persona nueva al elegir una existente
  const sel = form.querySelector('select[name="existing"]');
  if (sel) {
    sel.addEventListener('change', () => {
      const linking = !!sel.value;
      form.querySelector('.new-fields').hidden = linking;
      form.querySelector('input[name="first_name"]').required = !linking;
    });
  }
  if (!candidates.length) form.querySelector('input[name="first_name"]')?.focus();
}

export function openTextForm(ctx, personId, media = null) {
  openModal({
    title: media ? 'Editar texto' : 'Agregar texto o anécdota',
    body: `
      <label class="field"><span>Título</span>
        <input name="title" value="${esc(media?.title)}" placeholder="Ej.: Cómo conoció a la abuela"></label>
      <label class="field"><span>Texto *</span>
        <textarea name="text" rows="9" required>${esc(media?.text_content)}</textarea></label>`,
    onSubmit: async (f) => {
      const fd = new FormData(f);
      const text = String(fd.get('text') || '').trim();
      if (!text) throw new Error('El texto está vacío');
      const title = String(fd.get('title') || '').trim() || null;
      if (media) await api.updateMedia(media.id, { title, text_content: text });
      else await api.addMedia({ person_id: personId, kind: 'text', title, text_content: text });
      toast('Texto guardado', 'success');
      await ctx.refresh(personId);
    },
  });
}
