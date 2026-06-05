const transitions = [
  ['fade-in', 'Fade in'],
  ['fade-through', 'Fade through'],
  ['dissolve', 'Soft dissolve'],
  ['slide-left', 'Slide left'],
  ['slide-right', 'Slide right'],
  ['slide-up', 'Slide up'],
  ['zoom-in', 'Gentle zoom in'],
  ['zoom-out', 'Gentle zoom out'],
  ['blur-fade', 'Blur fade'],
  ['lift', 'Lift']
];

const adminShell = document.getElementById('adminShell');
const passwordPanel = document.getElementById('passwordPanel');
const passwordForm = document.getElementById('passwordForm');
const passwordInput = document.getElementById('passwordInput');
const passwordError = document.getElementById('passwordError');
const photoRows = document.getElementById('photoRows');
const saveStatus = document.getElementById('saveStatus');
const siteNameInput = document.getElementById('siteNameInput');
const siteNameSaveButton = document.getElementById('siteNameSaveButton');
const transitionDurationInput = document.getElementById('transitionDurationInput');
const uploadInput = document.getElementById('photoUploadInput');
const uploadDropzone = document.getElementById('uploadDropzone');
const uploadStatus = document.getElementById('uploadStatus');
const photoModal = document.getElementById('photoModal');
const photoModalImage = document.getElementById('photoModalImage');
const photoModalClose = document.getElementById('photoModalClose');
const photoRotateButton = document.getElementById('photoRotateButton');
const photoDeleteButton = document.getElementById('photoDeleteButton');

let slides = [];
let hero = '';
let siteName = '';
let transitionDuration = 2.2;
let draggedIndex = null;
let autoSaveTimer = null;

function assetUrl(file) {
  return `assets/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function normalizeRotation(value) {
  const numericValue = Number(value) || 0;
  return ((numericValue % 360) + 360) % 360;
}

function rotationStyle(value) {
  return `rotate(${normalizeRotation(value)}deg)`;
}

function unlock(token = '') {
  if (token) {
    sessionStorage.setItem('adminToken', token);
  }
  adminShell.classList.remove('locked');
  passwordPanel.hidden = true;
  window.scrollTo(0, 0);
  loadConfig();
}

function lockAdmin(message = '') {
  sessionStorage.removeItem('adminToken');
  adminShell.classList.add('locked');
  passwordPanel.hidden = false;
  passwordInput.value = '';
  passwordInput.focus();
  saveStatus.textContent = message;
}

function authHeaders(extraHeaders = {}) {
  const token = sessionStorage.getItem('adminToken') || '';
  return token ? { ...extraHeaders, Authorization: `Bearer ${token}` } : extraHeaders;
}

function applyConfig(config, options = {}) {
  slides = config.slides || [];
  hero = config.hero || slides[0]?.file || '';
  siteName = config.siteName || '';
  transitionDuration = Number(config.transitionDuration) || 2.2;

  if (siteNameInput && (options.updateSiteNameInput || document.activeElement !== siteNameInput)) {
    siteNameInput.value = siteName;
  }

  if (transitionDurationInput && document.activeElement !== transitionDurationInput) {
    transitionDurationInput.value = transitionDuration;
  }

  renderRows();
}

function transitionOptions(selected) {
  return transitions.map(([value, label]) => {
    const isSelected = value === selected ? ' selected' : '';
    return `<option value="${value}"${isSelected}>${label}</option>`;
  }).join('');
}

function renderRows() {
  photoRows.innerHTML = slides.map((slide, index) => `
    <tr draggable="true" data-index="${index}">
      <td><button class="drag-handle" type="button" aria-label="Move ${slide.file}">::</button></td>
      <td>
        <button class="thumbnail-button" type="button" data-open-photo="${slide.file}" aria-label="Open ${slide.file} in full size">
          <img class="admin-thumb" src="${assetUrl(slide.file)}" alt="Preview of ${slide.file}" style="transform: ${rotationStyle(slide.rotation)}; transform-origin: center center;">
        </button>
      </td>
      <td class="filename-cell">${slide.file}</td>
      <td><input type="radio" name="hero" value="${slide.file}" ${hero === slide.file ? 'checked' : ''} aria-label="Set ${slide.file} as hero"></td>
      <td><select data-field="transition" aria-label="Transition for ${slide.file}">${transitionOptions(slide.transition)}</select></td>
      <td><input data-field="duration" type="number" min="2" max="60" step="1" value="${slide.duration}" aria-label="Seconds for ${slide.file}"><span class="seconds-label">sec</span></td>
      <td><label class="hide-checkbox"><input data-field="hidden" type="checkbox" ${slide.hidden ? 'checked' : ''} aria-label="Hide ${slide.file} from display"> Hide</label></td>
    </tr>
  `).join('');
}

function openPhotoModal(file) {
  const slide = slides.find((entry) => entry.file === file);
  photoModalImage.dataset.file = file;
  photoModalImage.src = assetUrl(file);
  photoModalImage.alt = file;
  photoModalImage.style.transform = rotationStyle(slide?.rotation);
  photoModal.hidden = false;
  photoModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closePhotoModal() {
  photoModal.hidden = true;
  photoModal.setAttribute('aria-hidden', 'true');
  photoModalImage.removeAttribute('src');
  photoModalImage.removeAttribute('data-file');
  photoModalImage.style.transform = '';
  document.body.classList.remove('modal-open');
}

function captureRows() {
  const rows = Array.from(photoRows.querySelectorAll('tr'));
  slides = rows.map((row) => {
    const previousSlide = slides[Number(row.dataset.index)];
    return {
      file: previousSlide.file,
      transition: row.querySelector('[data-field="transition"]').value,
      duration: Number(row.querySelector('[data-field="duration"]').value) || 6,
      hidden: Boolean(row.querySelector('[data-field="hidden"]').checked),
      rotation: normalizeRotation(previousSlide.rotation)
    };
  });
  hero = photoRows.querySelector('input[name="hero"]:checked')?.value || slides[0]?.file || '';
}

function capturePlaybackSettings() {
  if (transitionDurationInput) {
    transitionDuration = Number(transitionDurationInput.value) || transitionDuration;
  }
}

async function loadConfig() {
  saveStatus.textContent = 'Loading photos...';
  const response = await fetch('/api/config');
  const config = await response.json();
  applyConfig(config, { updateSiteNameInput: true });
  saveStatus.textContent = `${slides.length} photos ready.`;
}

async function persistConfig(nextSlides = slides, nextHero = hero, options = {}) {
  const response = await fetch('/api/config', {
    method: 'POST',
    credentials: 'same-origin',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      hero: nextHero,
      siteName: options.siteName ?? siteName,
      transitionDuration: options.transitionDuration ?? transitionDuration,
      slides: nextSlides
    })
  });

  if (!response.ok) {
    lockAdmin('Session expired. Enter the admin password again.');
    return null;
  }

  const config = await response.json();
  applyConfig(config, { updateSiteNameInput: Boolean(options.updateSiteNameInput) });
  return config;
}

function queueAutoSave() {
  if (adminShell.classList.contains('locked')) {
    return;
  }

  clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(async () => {
    captureRows();
    capturePlaybackSettings();
    saveStatus.textContent = 'Saving changes...';

    const config = await persistConfig(slides, hero);
    if (config) {
      saveStatus.textContent = 'Changes saved automatically.';
    }
  }, 150);
}

async function saveSiteName() {
  captureRows();
  capturePlaybackSettings();
  siteName = siteNameInput.value;
  siteNameSaveButton.disabled = true;
  saveStatus.textContent = 'Saving memorial name...';

  const config = await persistConfig(slides, hero, { siteName, updateSiteNameInput: true });
  if (config) {
    saveStatus.textContent = 'Memorial name saved.';
  }
  siteNameSaveButton.disabled = false;
}

async function restoreSession() {
  const response = await fetch('/api/session', {
    credentials: 'same-origin',
    headers: authHeaders()
  });

  if (response.ok) {
    unlock(sessionStorage.getItem('adminToken') || '');
    return;
  }

  lockAdmin('');
}

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: passwordInput.value })
  });

  if (!response.ok) {
    passwordError.textContent = 'That password did not match.';
    passwordInput.select();
    return;
  }

  const { token } = await response.json();
  passwordError.textContent = '';
  unlock(token);
});

photoRows.addEventListener('dragstart', (event) => {
  const row = event.target.closest('tr');
  if (!row) {
    return;
  }

  draggedIndex = Number(row.dataset.index);
  row.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
});

photoRows.addEventListener('dragend', (event) => {
  event.target.closest('tr')?.classList.remove('dragging');
  draggedIndex = null;
});

photoRows.addEventListener('dragover', (event) => {
  event.preventDefault();
});

photoRows.addEventListener('drop', (event) => {
  event.preventDefault();
  const targetRow = event.target.closest('tr');
  if (!targetRow || draggedIndex === null) {
    return;
  }

  captureRows();
  const targetIndex = Number(targetRow.dataset.index);
  const [movedSlide] = slides.splice(draggedIndex, 1);
  slides.splice(targetIndex, 0, movedSlide);
  renderRows();
  queueAutoSave();
});

photoRows.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open-photo]');
  if (!trigger) {
    return;
  }

  event.preventDefault();
  openPhotoModal(trigger.dataset.openPhoto);
});

photoRows.addEventListener('input', (event) => {
  if (event.target.matches('[data-field="duration"]')) {
    queueAutoSave();
  }
});

transitionDurationInput.addEventListener('input', () => {
  queueAutoSave();
});

photoRows.addEventListener('change', (event) => {
  if (event.target.name === 'hero') {
    hero = event.target.value;
    queueAutoSave();
    return;
  }

  if (event.target.matches('[data-field="transition"], [data-field="hidden"]')) {
    queueAutoSave();
  }
});

photoModal.addEventListener('click', (event) => {
  if (event.target === photoModal) {
    closePhotoModal();
  }
});

photoModalClose.addEventListener('click', closePhotoModal);

photoRotateButton.addEventListener('click', async () => {
  const file = photoModalImage.dataset.file;
  if (!file) {
    return;
  }

  const slide = slides.find((entry) => entry.file === file);
  if (!slide) {
    return;
  }

  slide.rotation = (normalizeRotation(slide.rotation) + 270) % 360;
  photoModalImage.style.transform = rotationStyle(slide.rotation);
  saveStatus.textContent = 'Rotating photo...';

  const config = await persistConfig(slides, hero);
  if (config) {
    saveStatus.textContent = `Rotated ${file}.`;
  }
});

photoDeleteButton.addEventListener('click', async () => {
  const file = photoModalImage.dataset.file;
  if (!file || !window.confirm('Delete this photo from the slideshow?')) {
    return;
  }

  saveStatus.textContent = 'Deleting photo...';

  const response = await fetch('/api/photo', {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ file })
  });

  if (!response.ok) {
    lockAdmin('Session expired. Enter the admin password again.');
    return;
  }

  const data = await response.json();
  applyConfig(data.config, { updateSiteNameInput: true });
  closePhotoModal();
  saveStatus.textContent = 'Photo deleted.';
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !photoModal.hidden) {
    closePhotoModal();
  }
});

async function uploadPhotos(fileList) {
  if (!fileList || !fileList.length) {
    return;
  }

  const formData = new FormData();
  Array.from(fileList).forEach((file) => formData.append('files', file));

  uploadStatus.textContent = 'Uploading...';
  uploadInput.disabled = true;

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      credentials: 'same-origin',
      headers: authHeaders(),
      body: formData
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Upload failed.');
    }

    await loadConfig();
    uploadStatus.textContent = `Uploaded ${data.uploaded?.length || 0} photo(s).`;
  } catch (error) {
    uploadStatus.textContent = error.message || 'Upload failed.';
  } finally {
    uploadInput.disabled = false;
    uploadInput.value = '';
  }
}

uploadInput.addEventListener('change', (event) => uploadPhotos(event.target.files));

['dragenter', 'dragover'].forEach((eventName) => {
  uploadDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadDropzone.classList.add('dragging');
  });
});

['dragleave', 'dragend', 'drop'].forEach((eventName) => {
  uploadDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadDropzone.classList.remove('dragging');
  });
});

uploadDropzone.addEventListener('drop', (event) => {
  uploadPhotos(event.dataTransfer?.files);
});

siteNameSaveButton.addEventListener('click', saveSiteName);
restoreSession();
