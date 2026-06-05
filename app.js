const heroPhoto = document.getElementById('heroPhoto');
const playButton = document.getElementById('playButton');

function assetUrl(file) {
  return `assets/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function normalizeRotation(value) {
  const numericValue = Number(value) || 0;
  return ((numericValue % 360) + 360) % 360;
}

async function loadHome() {
  const response = await fetch('/api/config');
  const config = await response.json();
  const hero = config.hero || config.slides?.[0]?.file;

  if (hero) {
    const slide = config.slides?.find((entry) => entry.file === hero);
    heroPhoto.src = assetUrl(hero);
    heroPhoto.style.transform = `rotate(${normalizeRotation(slide?.rotation)}deg)`;
    heroPhoto.style.transformOrigin = 'center center';
  } else {
    heroPhoto.removeAttribute('src');
    heroPhoto.alt = 'No memorial photograph selected';
  }
}

async function openPlayer() {
  document.body.classList.add('launching-player');
  playButton.disabled = true;

  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    sessionStorage.setItem('requestFullscreenOnPlay', 'true');
  }

  window.location.assign('play.html');
}

playButton.addEventListener('click', openPlayer);
loadHome().catch(() => {
  heroPhoto.alt = 'Unable to load memorial photograph';
});
