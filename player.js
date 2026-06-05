const stage = document.getElementById('slideshowStage');
const fullscreenButton = document.getElementById('fullscreenButton');
const layers = [document.getElementById('slideA'), document.getElementById('slideB')];

let slides = [];
let currentIndex = 0;
let activeLayer = 0;
let timer = null;
let transitionCleanupTimer = null;
let isTransitioning = false;

const transitionDurationMs = 1800;

const transitionClasses = {
  'fade-in': 'enter-fade-in',
  'fade-through': 'enter-fade-through',
  dissolve: 'enter-dissolve',
  'slide-left': 'enter-slide-left',
  'slide-right': 'enter-slide-right',
  'slide-up': 'enter-slide-up',
  'zoom-in': 'enter-zoom-in',
  'zoom-out': 'enter-zoom-out',
  'blur-fade': 'enter-blur-fade',
  lift: 'enter-lift'
};

function assetUrl(file) {
  return `assets/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function clearTransitionClasses(layer) {
  Object.values(transitionClasses).forEach((className) => layer.classList.remove(className));
  layer.classList.remove('entering');
  layer.classList.remove('exiting');
  layer.classList.remove('preparing');
}

function applyRotation(layer, slide) {
  layer.style.setProperty('--photo-rotation', `${Number(slide?.rotation) || 0}deg`);
}

function showSlide(index, instant = false) {
  if (!slides.length) {
    stage.classList.add('empty-stage');
    return;
  }

  if (isTransitioning && !instant) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => showSlide(index), 250);
    return;
  }

  const slideIndex = (index + slides.length) % slides.length;
  const slide = slides[slideIndex];
  const nextLayer = layers[1 - activeLayer];
  const currentLayer = layers[activeLayer];
  const transitionClass = transitionClasses[slide.transition] || transitionClasses['fade-in'];

  window.clearTimeout(transitionCleanupTimer);
  clearTransitionClasses(nextLayer);
  nextLayer.src = assetUrl(slide.file);
  applyRotation(nextLayer, slide);

  if (instant) {
    nextLayer.className = 'slide-image active';
    currentLayer.classList.remove('active');
    clearTransitionClasses(currentLayer);
    activeLayer = 1 - activeLayer;
    currentIndex = slideIndex;
    window.clearTimeout(timer);
    timer = window.setTimeout(nextSlide, Math.max(2, Number(slide.duration) || 6) * 1000);
    return;
  }

  isTransitioning = true;
  nextLayer.className = `slide-image preparing entering ${transitionClass}`;
  currentLayer.classList.add('exiting');
  currentLayer.classList.remove('active');
  nextLayer.getBoundingClientRect();

  requestAnimationFrame(() => {
    nextLayer.classList.remove('preparing');
    nextLayer.classList.add('active');
    transitionCleanupTimer = window.setTimeout(() => {
      clearTransitionClasses(nextLayer);
      clearTransitionClasses(currentLayer);
      currentLayer.removeAttribute('src');
      isTransitioning = false;
    }, transitionDurationMs);
  });

  activeLayer = 1 - activeLayer;
  currentIndex = slideIndex;
  window.clearTimeout(timer);
  timer = window.setTimeout(nextSlide, Math.max(2, Number(slide.duration) || 6) * 1000);
}

function nextSlide() {
  showSlide((currentIndex + 1) % slides.length);
}

async function requestFullscreen() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    fullscreenButton.hidden = false;
  }
}

async function start() {
  const response = await fetch('/api/config');
  const config = await response.json();
  slides = (config.slides || []).filter((slide) => !slide.hidden);

  if (!slides.length) {
    stage.dataset.message = 'No photos found';
    return;
  }

  applyRotation(layers[activeLayer], slides[0]);
  showSlide(0, true);
  requestFullscreen();
}

fullscreenButton.addEventListener('click', requestFullscreen);
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.hidden = Boolean(document.fullscreenElement);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight' || event.key === ' ') {
    event.preventDefault();
    if (event.repeat) {
      return;
    }
    nextSlide();
  }
});

start().catch(() => {
  stage.dataset.message = 'Unable to load slideshow';
});
