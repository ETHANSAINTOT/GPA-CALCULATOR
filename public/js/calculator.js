import { computeSummary, formatGpa } from '/shared/gpa.js';
import { api, onSubmit } from './api.js';

const DELETE_CONFIRMATION = 'DELETEMYACCOUNT-FORCE';

const $ = (selector) => document.querySelector(selector);
const form = $('#ue-form');
const deleteDialog = $('#delete-dialog');
const deleteForm = $('#delete-form');

let state = await api('GET', '/api/me');
let editingId = null;

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;
const gpaHundredths = (gpa) => Math.round((gpa + Number.EPSILON) * 100);

function render() {
  const { user, ues, summary } = state;

  $('#first-name').textContent = user.firstName;
  $('#credits').textContent = summary.credits;
  $('#gpa').textContent = formatGpa(summary.gpa);
  $('#gpa-meter').style.width = `${(summary.gpa / 4) * 100}%`;

  const ueCount = ues.length ? ` · ${ues.length} UE ajoutée${ues.length > 1 ? 's' : ''}` : '';
  $('#gpa-detail').textContent = `Départ : ${formatGpa(user.baseGpa)} sur ${plural(user.baseCredits, 'crédit')}${ueCount}`;
  $('#ue-count').textContent = ues.length ? `${ues.length} UE` : '';

  $('#ue-table').hidden = ues.length === 0;
  $('#ue-empty').hidden = ues.length > 0;
  $('#ue-rows').replaceChildren(...ues.map(renderRow));

  renderPreview();
}

function renderRow(ue) {
  const credits = [String(ue.credits)];
  if (ue.grade === 'E') credits.push(el('span', { className: 'not-acquired', textContent: 'non acquis' }));

  return el('tr', { className: ue.id === editingId ? 'editing' : '' }, [
    el('td', { className: 'ue-name', textContent: ue.name }),
    el('td', {}, credits),
    el('td', {}, [el('span', { className: `grade grade-${ue.grade}`, textContent: ue.grade })]),
    el('td', {}, [
      el('div', { className: 'row-actions' }, [
        el('button', { type: 'button', className: 'btn btn-sm', textContent: 'Modifier', onclick: () => startEditing(ue) }),
        el('button', { type: 'button', className: 'btn btn-sm btn-danger-ghost', textContent: 'Supprimer', onclick: () => removeUe(ue) }),
      ]),
    ]),
  ]);
}

// Shows what the GPA would become if the form were submitted as is.
function renderPreview() {
  const preview = $('#preview');
  const { credits, grade } = Object.fromEntries(new FormData(form));
  if (!/^\d+$/.test(credits)) {
    preview.hidden = true;
    return;
  }

  const draft = { credits: Number(credits), grade };
  const ues = editingId === null
    ? [...state.ues, draft]
    : state.ues.map((ue) => (ue.id === editingId ? draft : ue));
  const next = computeSummary(state.user.baseGpa, state.user.baseCredits, ues);
  const delta = gpaHundredths(next.gpa) - gpaHundredths(state.summary.gpa);

  const deltaText = delta === 0 ? '(=)' : `(${delta > 0 ? '+' : '−'}${(Math.abs(delta) / 100).toFixed(2)})`;
  const deltaClass = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'muted';

  preview.replaceChildren(
    editingId === null ? 'Avec cette UE : GPA ' : 'Avec cette modification : GPA ',
    el('strong', { textContent: formatGpa(next.gpa) }),
    ' ',
    el('span', { className: deltaClass, textContent: deltaText }),
    ` · ${plural(next.credits, 'crédit')}`,
  );
  preview.hidden = false;
}

function startEditing(ue) {
  editingId = ue.id;
  form.elements.name.value = ue.name;
  form.elements.credits.value = ue.credits;
  form.elements.grade.value = ue.grade;
  $('#form-title').textContent = `Modifier « ${ue.name} »`;
  $('#ue-submit').textContent = 'Enregistrer';
  $('#ue-cancel').hidden = false;
  form.querySelector('.form-error').hidden = true;
  render();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.elements.name.focus({ preventScroll: true });
}

function stopEditing() {
  editingId = null;
  form.reset();
  $('#form-title').textContent = "Ajouter une unité d'enseignement";
  $('#ue-submit').textContent = 'Ajouter';
  $('#ue-cancel').hidden = true;
  form.querySelector('.form-error').hidden = true;
  render();
}

async function removeUe(ue) {
  if (!confirm(`Supprimer l'UE « ${ue.name} » ?`)) return;
  try {
    state = await api('DELETE', `/api/ues/${ue.id}`);
  } catch (error) {
    alert(error.message);
    return;
  }
  if (editingId === ue.id) stopEditing();
  else render();
}

form.addEventListener('input', renderPreview);
$('#ue-cancel').addEventListener('click', stopEditing);

onSubmit(form, async (data) => {
  state = editingId === null
    ? await api('POST', '/api/ues', data)
    : await api('PUT', `/api/ues/${editingId}`, data);
  stopEditing();
  form.elements.name.focus();
});

$('#sign-out').addEventListener('click', async () => {
  await api('POST', '/api/logout');
  location.href = '/';
});

$('#delete-account').addEventListener('click', () => {
  deleteForm.reset();
  deleteForm.querySelector('.form-error').hidden = true;
  $('#delete-confirm').disabled = true;
  deleteDialog.showModal();
});

$('#delete-cancel').addEventListener('click', () => deleteDialog.close());

deleteForm.elements.confirmation.addEventListener('input', (event) => {
  $('#delete-confirm').disabled = event.target.value !== DELETE_CONFIRMATION;
});

onSubmit(deleteForm, async (data) => {
  await api('DELETE', '/api/account', data);
  location.href = '/';
});

render();
