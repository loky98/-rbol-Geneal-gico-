// Arranque de la aplicación: login, carga de datos y coordinación de vistas.
import { api } from './api.js';
import { buildIndex } from './family.js';
import { FamilyTree } from './tree.js';
import { renderPanel } from './person-panel.js';
import { openPersonForm } from './forms.js';
import { transcribe, progressLabel } from './transcribe.js';
import { $, esc, fullName, lifeShort, toast } from './utils.js';

const state = {
  data: { persons: [], relationships: [], media: [] },
  index: null,
  selectedId: null,
};

const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

const ctx = {
  get index() { return state.index; },
  get persons() { return state.data.persons; },
  transcribing: new Map(), // mediaId -> texto de progreso
  refresh,
  select,
  transcribeMedia,
};

let tree;

// ---------- Login ----------
async function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-mode').hidden = api.mode !== 'local';
  $('#password').focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter || $('#login-form button');
  const err = $('#login-error');
  err.hidden = true;
  btn.disabled = true;
  try {
    if (await api.login($('#password').value)) {
      $('#password').value = '';
      await startApp();
    } else {
      err.hidden = false;
      $('#password').select();
    }
  } catch (ex) {
    console.error(ex);
    err.textContent = 'No se pudo conectar. Revisa tu conexión.';
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await api.logout();
  location.reload();
});

// ---------- App ----------
async function startApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  if (!tree) {
    tree = new FamilyTree($('#tree'), {
      onSelect: (id) => select(id, false),
      photoUrl: (path) => api.fileUrl(path),
    });
  }
  await refresh(null, { fit: true });
}

async function refresh(selectId = state.selectedId, { fit = false } = {}) {
  try {
    state.data = await api.loadAll();
  } catch (err) {
    console.error(err);
    toast('No se pudieron cargar los datos', 'error');
    return;
  }
  state.index = buildIndex(state.data);
  if (selectId && !state.index.byId.has(selectId)) selectId = null;
  state.selectedId = selectId;

  $('#empty').hidden = state.data.persons.length > 0;
  tree.render(state.index, state.data.persons, state.selectedId);
  if (fit) tree.fit(isMobile() ? 0.6 : 0.3);
  renderSelected();
}

function renderSelected() {
  const panel = $('#panel');
  if (state.selectedId) {
    renderPanel(ctx, panel, state.selectedId);
    panel.classList.add('open');
    document.body.classList.add('panel-open');
  } else {
    panel.classList.remove('open', 'expanded');
    document.body.classList.remove('panel-open');
  }
}

// En móvil la hoja inferior se expande al tocar la barrita o al desplazarse
$('#panel').addEventListener('click', (e) => {
  if (e.target.closest('.panel-grip')) $('#panel').classList.toggle('expanded');
});
$('#panel').addEventListener('scroll', (e) => {
  if (e.target.scrollTop > 24) e.target.classList.add('expanded');
}, { passive: true });

function select(id, center = false) {
  const changed = id !== state.selectedId;
  state.selectedId = id;
  tree.setSelected(id);
  renderSelected();
  if (id && changed) $('#panel').scrollTop = 0;
  if (id && (center || isMobile())) {
    const vh = isMobile() ? $('#tree').clientHeight * 0.42 : undefined;
    tree.centerOn(id, vh);
  }
}

async function transcribeMedia(media) {
  if (!media || ctx.transcribing.has(media.id)) return;
  const personId = media.person_id;
  const update = (label) => {
    ctx.transcribing.set(media.id, label);
    if (state.selectedId === personId) renderSelected();
  };
  update('Preparando audio…');
  try {
    const url = await api.fileUrl(media.storage_path);
    const text = await transcribe(url, (p) => update(progressLabel(p)));
    await api.updateMedia(media.id, { transcript: text || '(sin voz detectada)' });
    toast('Transcripción lista', 'success');
  } catch (err) {
    console.error(err);
    toast(`No se pudo transcribir: ${err.message}`, 'error', 6000);
  } finally {
    ctx.transcribing.delete(media.id);
    await refresh(state.selectedId);
  }
}

// ---------- Barra superior ----------
const addPerson = () => openPersonForm(ctx);
$('#add-person').addEventListener('click', addPerson);
$('#empty-add').addEventListener('click', addPerson);
$('#zoom-in').addEventListener('click', () => tree.zoomBy(1.25));
$('#zoom-out').addEventListener('click', () => tree.zoomBy(0.8));
$('#zoom-fit').addEventListener('click', () => tree.fit());

// Buscador
const search = $('#search');
const results = $('#search-results');
search.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  if (!q) { results.hidden = true; return; }
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const matches = state.data.persons
    .filter((p) => norm(fullName(p)).includes(norm(q)))
    .slice(0, 8);
  results.innerHTML = matches.length
    ? matches.map((p) => `<li><button type="button" data-id="${esc(p.id)}">${esc(fullName(p))}
        <small>${esc(lifeShort(p))}</small></button></li>`).join('')
    : '<li class="muted">Sin resultados</li>';
  results.hidden = false;
});
results.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  results.hidden = true;
  search.value = '';
  search.blur();
  select(b.dataset.id, true);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) results.hidden = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal').open && state.selectedId) select(null);
});

// ---------- Inicio ----------
if (await api.hasSession()) startApp(); else showLogin();
