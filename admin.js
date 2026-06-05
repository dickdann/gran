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
const shrinkButton = document.getElementById('shrinkButton');
const shrinkProgressWrap = document.getElementById('shrinkProgressWrap');
const shrinkProgress = document.getElementById('shrinkProgress');
const saveStatus = document.getElementById('saveStatus');
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
let transitionDuration = 1.8;
let draggedIndex = null;
let autoSaveTimer = null;

function normalizeTransitionDuration(value) {
  return Math.max(0.5, Math.min(8, Number(value) || 1.8));
}

function applyConfig(config) {
  slides = config.slides || [];
  hero = config.hero || slides[0]?.file || '';
  transitionDuration = normalizeTransitionDuration(config.transitionDuration);
  transitionDurationInput.value = transitionDuration;
}

function assetUrl(file) {
  return `assets/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function thumbnailUrl(file) {
  return `thumbs/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function normalizeRotation(value) {
  const numericValue = Number(value) || 0;
  return ((numericValue % 360) + 360) % 360;
}

function rotationStyle(value) {
  return `rotate(${normalizeRotation(value)}deg)`;
}

function unlock(token) {
  sessionStorage.setItem('adminToken', token);
  adminShell.classList.remove('locked');
  passwordPanel.hidden = true;
  passwordError.textContent = '';
  window.scrollTo(0, 0);
  loadConfig();
}

function clearStoredAuth() {
  sessionStorage.removeItem('adminToken');
  document.cookie = 'adminToken=; Path=/; Max-Age=0; SameSite=Lax';
}

function lockForLogin(message = '') {
  clearStoredAuth();
  adminShell.classList.add('locked');
  passwordPanel.hidden = false;
  passwordInput.value = '';
  passwordError.textContent = message;
  saveStatus.textContent = message;
  passwordInput.focus();
}

function handleUnauthorized(response, message = 'Session expired. Enter the admin password again.') {
  if (response.status !== 401) {
    return false;
  }

  lockForLogin(message);
  return true;
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
          <img class="admin-thumb" src="${thumbnailUrl(slide.file)}" alt="Preview of ${slide.file}" style="transform: ${rotationStyle(slide.rotation)}; transform-origin: center center;">
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
  transitionDuration = normalizeTransitionDuration(transitionDurationInput.value);
  slides = rows.map((row) => {
    const currentSlide = slides[Number(row.dataset.index)];
    return {
      file: currentSlide.file,
      transition: row.querySelector('[data-field="transition"]').value,
      duration: Number(row.querySelector('[data-field="duration"]').value) || 6,
      hidden: Boolean(row.querySelector('[data-field="hidden"]').checked),
      rotation: normalizeRotation(currentSlide.rotation)
    };
  });
  hero = photoRows.querySelector('input[name="hero"]:checked')?.value || slides[0]?.file || '';
}

async function loadConfig() {
  saveStatus.textContent = 'Loading photos...';
  const response = await fetch('/api/config');
  if (!response.ok) {
    throw new Error('Could not load the slideshow.');
  }

  const config = await response.json();
  applyConfig(config);
  renderRows();
  saveStatus.textContent = `${slides.length} photos ready.`;
}

async function persistConfig(nextSlides = slides, nextHero = hero, nextTransitionDuration = transitionDuration) {
  const response = await fetch('/api/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken() || ''}`
    },
    body: JSON.stringify({ hero: nextHero, transitionDuration: nextTransitionDuration, slides: nextSlides })
  });

  if (!response.ok) {
    if (!handleUnauthorized(response)) {
      const data = await response.json().catch(() => ({}));
      saveStatus.textContent = data.error || 'Could not save changes.';
    }
    return null;
  }

  const config = await response.json();
  applyConfig(config);
  renderRows();
  return config;
}

function queueAutoSave() {
  if (adminShell.classList.contains('locked')) {
    return;
  }

  clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(async () => {
    captureRows();
    saveStatus.textContent = 'Saving changes...';

    const config = await persistConfig(slides, hero, transitionDuration);
    if (config) {
      saveStatus.textContent = 'Changes saved automatically.';
    }
  }, 150);
}

function readSessionToken() {
  const cookieEntry = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('adminToken='));

  if (!cookieEntry) {
    return '';
  }

  return decodeURIComponent(cookieEntry.slice('adminToken='.length));
}

function getAuthToken() {
  return sessionStorage.getItem('adminToken') || readSessionToken();
}

async function restoreSession() {
  const existingToken = sessionStorage.getItem('adminToken') || readSessionToken();
  if (!existingToken) {
    passwordInput.focus();
    return;
  }

  const response = await fetch('/api/session', {
    headers: {
      Authorization: `Bearer ${existingToken}`
    }
  });

  if (!response.ok) {
    lockForLogin('Session expired. Enter the admin password again.');
    return;
  }

  unlock(existingToken);
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

transitionDurationInput.addEventListener('input', queueAutoSave);

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

  const config = await persistConfig(slides, hero, transitionDuration);
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

  try {
    const response = await fetch('/api/photo', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken() || ''}`
      },
      body: JSON.stringify({ file })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (handleUnauthorized(response)) {
        closePhotoModal();
        return;
      }

      throw new Error(data.error || 'Delete failed.');
    }

    applyConfig(data.config || {});
    renderRows();
    closePhotoModal();
    saveStatus.textContent = 'Photo deleted.';
  } catch (error) {
    saveStatus.textContent = error.message || 'Delete failed.';
  }
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
      headers: {
        Authorization: `Bearer ${getAuthToken() || ''}`
      },
      body: formData
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (handleUnauthorized(response)) {
        return;
      }

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

function showShrinkProgress(total = 100, processed = 0) {
  shrinkProgress.max = Math.max(1, Number(total) || 1);
  shrinkProgress.value = Math.max(0, Math.min(shrinkProgress.max, Number(processed) || 0));
  shrinkProgressWrap.hidden = false;
}

function hideShrinkProgress() {
  shrinkProgress.value = 0;
  shrinkProgressWrap.hidden = true;
}

function updateShrinkProgress(eventData) {
  if (eventData.type === 'start') {
    showShrinkProgress(eventData.total, 0);
    saveStatus.textContent = `Preparing to shrink ${eventData.total || 0} photo(s)...`;
    return;
  }

  if (eventData.type === 'progress') {
    showShrinkProgress(eventData.total, eventData.processed);
    saveStatus.textContent = `Shrinking photos... ${eventData.processed || 0}/${eventData.total || 0}`;
  }
}

async function readShrinkProgress(response) {
  if (!response.body) {
    return response.json();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalData = null;

  function readLine(line) {
    if (!line.trim()) {
      return;
    }

    const eventData = JSON.parse(line);
    if (eventData.type === 'done') {
      finalData = eventData;
      showShrinkProgress(eventData.total, eventData.total);
      return;
    }

    if (eventData.type === 'error') {
      throw new Error(eventData.error || 'Shrink failed.');
    }

    updateShrinkProgress(eventData);
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(readLine);
  }

  buffer += decoder.decode();
  readLine(buffer);

  if (!finalData) {
    throw new Error('Shrink failed before completion.');
  }

  return finalData;
}

shrinkButton.addEventListener('click', async () => {
  if (!window.confirm('Shrink every photo larger than 1200px wide or tall? This will overwrite the original files.')) {
    return;
  }

  shrinkButton.disabled = true;
  showShrinkProgress(100, 0);
  saveStatus.textContent = 'Shrinking photos...';

  try {
    const response = await fetch('/api/shrink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAuthToken() || ''}`
      }
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (handleUnauthorized(response)) {
        return;
      }

      throw new Error(data.error || 'Shrink failed.');
    }

    const data = await readShrinkProgress(response);
    await loadConfig();
    const failedCount = data.failed?.length || 0;
    saveStatus.textContent = `Shrunk ${data.shrunk || 0} photo(s); ${data.skipped || 0} already small${failedCount ? `; ${failedCount} failed` : ''}.`;
  } catch (error) {
    saveStatus.textContent = error.message || 'Shrink failed.';
  } finally {
    shrinkButton.disabled = false;
    window.setTimeout(hideShrinkProgress, 1200);
  }
});

restoreSession();
