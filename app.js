const heroPhoto = document.getElementById('heroPhoto');
const playButton = document.getElementById('playButton');

function assetUrl(file) {
  return `assets/${file.split('/').map(encodeURIComponent).join('/')}`;
}

async function loadHome() {
  const response = await fetch('/api/config');
  const config = await response.json();
  const hero = config.hero || config.slides?.[0]?.file;

  if (hero) {
    heroPhoto.src = assetUrl(hero);
  } else {
    heroPhoto.removeAttribute('src');
    heroPhoto.alt = 'No memorial photograph selected';
  }
}

async function openPlayer() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    sessionStorage.setItem('requestFullscreenOnPlay', 'true');
  }

  window.location.href = 'play.html';
}

playButton.addEventListener('click', openPlayer);
loadHome().catch(() => {
  heroPhoto.alt = 'Unable to load memorial photograph';
});
