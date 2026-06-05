const galleryImage = document.getElementById('galleryImage');
const galleryCounter = document.getElementById('galleryCounter');
const previousPhotoButton = document.getElementById('previousPhotoButton');
const nextPhotoButton = document.getElementById('nextPhotoButton');
const downloadMainButton = document.getElementById('downloadMainButton');
const openThumbGridButton = document.getElementById('openThumbGridButton');
const closeThumbGridButton = document.getElementById('closeThumbGridButton');
const gallerySelector = document.getElementById('gallerySelector');
const thumbGridPanel = document.getElementById('thumbGridPanel');
const thumbGrid = document.getElementById('thumbGrid');
const galleryModal = document.getElementById('galleryModal');
const galleryModalImage = document.getElementById('galleryModalImage');
const galleryModalClose = document.getElementById('galleryModalClose');
const downloadModalButton = document.getElementById('downloadModalButton');

let slides = [];
let currentIndex = 0;

function assetUrl(file) {
  return `assets/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function thumbnailUrl(file) {
  return `thumbs/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function fileName(file) {
  return file.split('/').pop() || 'photo';
}

function normalizeRotation(value) {
  const numericValue = Number(value) || 0;
  return ((numericValue % 360) + 360) % 360;
}

function rotationStyle(slide) {
  return `rotate(${normalizeRotation(slide?.rotation)}deg)`;
}

function setDownload(link, slide) {
  const url = assetUrl(slide.file);
  link.href = url;
  link.download = fileName(slide.file);
}

function setFallbackToAsset(image, slide) {
  image.onerror = () => {
    image.onerror = null;
    image.src = assetUrl(slide.file);
  };
}

function renderMainPhoto() {
  if (!slides.length) {
    galleryImage.removeAttribute('src');
    galleryImage.alt = 'No photos found';
    galleryImage.removeAttribute('role');
    galleryImage.removeAttribute('tabindex');
    galleryImage.removeAttribute('aria-label');
    galleryCounter.textContent = 'No photos found';
    previousPhotoButton.disabled = true;
    nextPhotoButton.disabled = true;
    downloadMainButton.removeAttribute('href');
    return;
  }

  const slide = slides[currentIndex];
  galleryImage.src = assetUrl(slide.file);
  galleryImage.alt = fileName(slide.file);
  galleryImage.setAttribute('role', 'button');
  galleryImage.setAttribute('tabindex', '0');
  galleryImage.setAttribute('aria-label', `Open ${fileName(slide.file)} full screen`);
  galleryImage.style.transform = rotationStyle(slide);
  galleryCounter.textContent = `${currentIndex + 1} / ${slides.length}`;
  setDownload(downloadMainButton, slide);

  Array.from(gallerySelector.children).forEach((button, index) => {
    const isCurrent = index === currentIndex;
    button.classList.toggle('current', isCurrent);
    button.setAttribute('aria-current', isCurrent ? 'true' : 'false');
    if (isCurrent) {
      button.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  });
}

function showPhoto(index) {
  if (!slides.length) {
    return;
  }

  currentIndex = (index + slides.length) % slides.length;
  renderMainPhoto();
}

function renderSelector() {
  gallerySelector.innerHTML = slides.map((slide, index) => `
    <button class="gallery-selector-button" type="button" data-index="${index}" aria-label="Show ${fileName(slide.file)}">
      <img src="${thumbnailUrl(slide.file)}" alt="" style="transform: ${rotationStyle(slide)}; transform-origin: center center;">
    </button>
  `).join('');

  gallerySelector.querySelectorAll('img').forEach((image, index) => setFallbackToAsset(image, slides[index]));
}

function renderThumbGrid() {
  thumbGrid.innerHTML = slides.map((slide, index) => `
    <button class="thumb-grid-button" type="button" data-index="${index}" aria-label="Open ${fileName(slide.file)}">
      <img src="${thumbnailUrl(slide.file)}" alt="" style="transform: ${rotationStyle(slide)}; transform-origin: center center;">
    </button>
  `).join('');

  thumbGrid.querySelectorAll('img').forEach((image, index) => setFallbackToAsset(image, slides[index]));
}

function openThumbGrid() {
  thumbGridPanel.hidden = false;
  thumbGridPanel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeThumbGrid() {
  thumbGridPanel.hidden = true;
  thumbGridPanel.setAttribute('aria-hidden', 'true');
  if (galleryModal.hidden) {
    document.body.classList.remove('modal-open');
  }
}

function openModal(index) {
  const slide = slides[index];
  if (!slide) {
    return;
  }

  galleryModalImage.src = assetUrl(slide.file);
  galleryModalImage.alt = fileName(slide.file);
  galleryModalImage.style.transform = rotationStyle(slide);
  setDownload(downloadModalButton, slide);
  galleryModal.hidden = false;
  galleryModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeModal() {
  galleryModal.hidden = true;
  galleryModal.setAttribute('aria-hidden', 'true');
  galleryModalImage.removeAttribute('src');
  galleryModalImage.style.transform = '';
  if (thumbGridPanel.hidden) {
    document.body.classList.remove('modal-open');
  }
}

async function loadGallery() {
  const response = await fetch('/api/config');
  if (!response.ok) {
    throw new Error('Could not load gallery.');
  }

  const config = await response.json();
  slides = Array.isArray(config.slides) ? config.slides : [];
  const heroIndex = slides.findIndex((slide) => slide.file === config.hero);
  currentIndex = heroIndex >= 0 ? heroIndex : 0;
  renderSelector();
  renderThumbGrid();
  renderMainPhoto();
}

previousPhotoButton.addEventListener('click', () => showPhoto(currentIndex - 1));
nextPhotoButton.addEventListener('click', () => showPhoto(currentIndex + 1));
galleryImage.addEventListener('click', () => {
  if (slides.length) {
    openModal(currentIndex);
  }
});
galleryImage.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && slides.length) {
    event.preventDefault();
    openModal(currentIndex);
  }
});

gallerySelector.addEventListener('click', (event) => {
  const button = event.target.closest('[data-index]');
  if (button) {
    showPhoto(Number(button.dataset.index));
  }
});

openThumbGridButton.addEventListener('click', openThumbGrid);
closeThumbGridButton.addEventListener('click', closeThumbGrid);

thumbGrid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-index]');
  if (button) {
    openModal(Number(button.dataset.index));
  }
});

galleryModal.addEventListener('click', (event) => {
  if (event.target === galleryModal) {
    closeModal();
  }
});

galleryModalClose.addEventListener('click', closeModal);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!galleryModal.hidden) {
      closeModal();
      return;
    }
    if (!thumbGridPanel.hidden) {
      closeThumbGrid();
    }
  }

  if (galleryModal.hidden && thumbGridPanel.hidden && event.key === 'ArrowLeft') {
    showPhoto(currentIndex - 1);
  }

  if (galleryModal.hidden && thumbGridPanel.hidden && event.key === 'ArrowRight') {
    showPhoto(currentIndex + 1);
  }
});

loadGallery().catch((error) => {
  galleryCounter.textContent = error.message || 'Unable to load gallery';
});