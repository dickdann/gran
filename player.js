const stage = document.getElementById('slideshowStage');
const fullscreenButton = document.getElementById('fullscreenButton');
const layers = [document.getElementById('slideA'), document.getElementById('slideB')];

let slides = [];
let currentIndex = 0;
let activeLayer = 0;
let timer = null;

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
}

function applyRotation(layer, slide) {
  layer.style.setProperty('--photo-rotation', `${Number(slide?.rotation) || 0}deg`);
}

function showSlide(index, instant = false) {
  if (!slides.length) {
    stage.classList.add('empty-stage');
    return;
  }

  const slide = slides[index];
  const nextLayer = layers[1 - activeLayer];
  const currentLayer = layers[activeLayer];
  const transitionClass = transitionClasses[slide.transition] || transitionClasses['fade-in'];

  clearTransitionClasses(nextLayer);
  nextLayer.src = assetUrl(slide.file);
  applyRotation(nextLayer, slide);
  nextLayer.className = `slide-image ${instant ? '' : transitionClass}`.trim();

  requestAnimationFrame(() => {
    nextLayer.classList.add('active');
    currentLayer.classList.remove('active');
    setTimeout(() => clearTransitionClasses(nextLayer), 1800);
  });

  activeLayer = 1 - activeLayer;
  currentIndex = index;
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
  layers[activeLayer].src = assetUrl(slides[0].file);
  layers[activeLayer].classList.add('active');
  timer = window.setTimeout(nextSlide, Math.max(2, Number(slides[0].duration) || 6) * 1000);
  requestFullscreen();
}

fullscreenButton.addEventListener('click', requestFullscreen);
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.hidden = Boolean(document.fullscreenElement);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowRight' || event.key === ' ') {
    nextSlide();
  }
});

start().catch(() => {
  stage.dataset.message = 'Unable to load slideshow';
});
