const fs = require('fs');
const http = require('http');
const path = require('path');
const childProcess = require('child_process');
const dotenv = require('dotenv');
const { Jimp } = require('jimp');
const formidableModule = require('formidable');
const formidable = formidableModule.default || formidableModule;

dotenv.config();
const rootDir = __dirname;
const assetsDir = path.join(rootDir, 'assets');
const thumbsDir = path.join(rootDir, 'thumbs');
const dataDir = path.join(rootDir, 'data');
const configPath = path.join(dataDir, 'config.json');
const versionPath = path.join(rootDir, 'cache-version.txt');
const preferredPort = Number(process.env.PORT || 3000);
const adminPassword = process.env.PASSWORD || 'password';
const adminToken = require('crypto').randomBytes(32).toString('hex');
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
const transitionTypes = ['fade-in', 'fade-through', 'dissolve', 'slide-left', 'slide-right', 'slide-up', 'zoom-in', 'zoom-out', 'blur-fade', 'lift'];
const defaultTransitionDuration = 2.2;
const defaultSiteName = 'A Life Remembered';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml'
};

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function assetVersion() {
  if (!fs.existsSync(versionPath)) {
    return 'dev';
  }

  const version = fs.readFileSync(versionPath, 'utf8').trim();
  return version || 'dev';
}

function versionHtmlAssets(html) {
  const version = encodeURIComponent(assetVersion());

  return html.replace(/\b(href|src)="([^"?#]+\.(?:css|js))"/g, (match, attribute, url) => {
    if (/^(?:[a-z]+:)?\/\//i.test(url)) {
      return match;
    }

    return `${attribute}="${url}?v=${version}"`;
  });
}
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function injectSiteName(html) {
  return html.replaceAll('__SITE_NAME__', escapeHtml(configuredSiteName()));
}
function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((accumulator, cookie) => {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex === -1) {
        return accumulator;
      }

      const name = cookie.slice(0, separatorIndex);
      const value = cookie.slice(separatorIndex + 1);
      accumulator[name] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function getAdminToken(request) {
  const authorization = request.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (token) {
      return token;
    }
  }

  return parseCookies(request.headers.cookie || '').adminToken || '';
}

function listPhotos(dir = assetsDir, prefix = '') {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        return listPhotos(entryPath, relativePath);
      }

      return imageExtensions.has(path.extname(entry.name).toLowerCase()) ? [relativePath] : [];
    })
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

function randomTransition() {
  return transitionTypes[Math.floor(Math.random() * transitionTypes.length)];
}

function normalizeRotation(value) {
  const numericValue = Number(value) || 0;
  return ((numericValue % 360) + 360) % 360;
}

function normalizeTransitionDuration(value) {
  return Math.max(0.5, Math.min(8, Number(value) || defaultTransitionDuration));
}

function normalizeSiteName(value) {
  return String(value || '').trim() || defaultSiteName;
}

function ensureThumbsDir() {
  fs.mkdirSync(thumbsDir, { recursive: true });
}

function thumbnailPathFor(filePath) {
  const relativePath = path.relative(assetsDir, filePath);
  return path.join(thumbsDir, relativePath);
}

async function createThumbnailIfMissing(filePath) {
  if (!imageExtensions.has(path.extname(filePath).toLowerCase())) {
    return null;
  }

  const destination = thumbnailPathFor(filePath);
  if (fs.existsSync(destination)) {
    return destination;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const image = await Jimp.read(filePath);
  await image.scaleToFit({ w: 200, h: 200 }).write(destination);
  console.log("Created thumbnail for", filePath);
  return destination;
}

async function generateMissingThumbnails() {
  ensureThumbsDir();

  const photos = listPhotos();
  const photoPaths = photos.map((photo) => path.join(assetsDir, photo));

  await Promise.all(photoPaths.map((photoPath) => createThumbnailIfMissing(photoPath)));
}

async function shrinkPhotoIfNeeded(photoPath, maxSize = 1200) {
  const image = await Jimp.read(photoPath);
  const { width, height } = image.bitmap;

  if (width <= maxSize && height <= maxSize) {
    return false;
  }

  await image.scaleToFit({ w: maxSize, h: maxSize }).write(photoPath);
  return true;
}

async function shrinkPhotoAssets(maxSize = 1200, onProgress = () => {}) {
  const photos = listPhotos();
  const result = {
    total: photos.length,
    shrunk: 0,
    skipped: 0,
    failed: []
  };
  let processed = 0;

  onProgress({ type: 'start', total: result.total });

  for (const photo of photos) {
    const photoPath = path.join(assetsDir, photo);
    let status = 'skipped';

    try {
      const wasShrunk = await shrinkPhotoIfNeeded(photoPath, maxSize);

      if (!wasShrunk) {
        result.skipped += 1;
      } else {
        result.shrunk += 1;
        status = 'shrunk';
      }
    } catch (error) {
      result.failed.push({ file: photo, error: error.message });
      status = 'failed';
    } finally {
      processed += 1;
      onProgress({
        type: 'progress',
        file: photo,
        status,
        processed,
        total: result.total,
        shrunk: result.shrunk,
        skipped: result.skipped,
        failed: result.failed
      });
    }
  }

  return result;
}

function defaultSlide(file) {
  return {
    file,
    transition: randomTransition(),
    duration: 6,
    hidden: false,
    rotation: 0
  };
}

function normalizeSlide(file, existingSlide) {
  return {
    file,
    transition: typeof existingSlide?.transition === 'string' && transitionTypes.includes(existingSlide.transition)
      ? existingSlide.transition
      : randomTransition(),
    duration: Math.max(2, Math.min(60, Number(existingSlide?.duration) || 6)),
    hidden: Boolean(existingSlide?.hidden),
    rotation: normalizeRotation(existingSlide?.rotation)
  };
}

function buildSlideList(photos, savedSlides) {
  const photoSet = new Set(photos);
  const orderedSlides = savedSlides
    .filter((slide) => photoSet.has(slide.file))
    .map((slide) => normalizeSlide(slide.file, slide));
  const orderedSet = new Set(orderedSlides.map((slide) => slide.file));
  const newSlides = photos
    .filter((file) => !orderedSet.has(file))
    .map((file) => normalizeSlide(file, null));

  return [...newSlides, ...orderedSlides];
}

function mergeSlides(photos, savedSlides) {
  return buildSlideList(photos, savedSlides);
}

function formatFileList(files, limit = 8) {
  if (!files.length) {
    return 'none';
  }

  const visible = files.slice(0, limit).join(', ');
  const remaining = files.length - limit;
  return remaining > 0 ? `${visible}, and ${remaining} more` : visible;
}

function loadSavedConfig() {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.warn('Could not read config.json:', error.message);
    return null;
  }
}

function configuredSiteName() {
  return normalizeSiteName(loadSavedConfig()?.siteName);
}

function buildConfigFromAssets(saved, photos) {
  const savedSlides = Array.isArray(saved?.slides) ? saved.slides : [];
  const slides = mergeSlides(photos, savedSlides);
  const photoSet = new Set(photos);
  const hero = photoSet.has(saved?.hero) ? saved.hero : slides[0]?.file || '';

  return {
    hero,
    siteName: normalizeSiteName(saved?.siteName),
    transitionDuration: normalizeTransitionDuration(saved?.transitionDuration),
    slides
  };
}

function configReport(saved, photos, config, previousConfigText) {
  const savedSlides = Array.isArray(saved?.slides) ? saved.slides : [];
  const photoSet = new Set(photos);
  const configuredSet = new Set(savedSlides.map((slide) => slide.file));
  const missingSlides = savedSlides
    .map((slide) => slide.file)
    .filter((file) => !photoSet.has(file));
  const addedSlides = photos.filter((photo) => !configuredSet.has(photo));
  const nextConfigText = `${JSON.stringify(config, null, 2)}\n`;

  return {
    assetCount: photos.length,
    configuredCount: savedSlides.length,
    finalCount: config.slides.length,
    missingSlides,
    addedSlides,
    heroChanged: Boolean(saved?.hero && saved.hero !== config.hero),
    previousHero: saved?.hero || '',
    nextHero: config.hero,
    shouldWrite: previousConfigText !== nextConfigText,
    nextConfigText
  };
}

function logConfigSync(context, report, wroteConfig) {
  console.log(`[config-sync] ${context}: scanned ${report.assetCount} asset photo(s) and ${report.configuredCount} configured slide(s).`);

  if (report.missingSlides.length) {
    console.log(`[config-sync] ${context}: removed ${report.missingSlides.length} stale slide(s): ${formatFileList(report.missingSlides)}.`);
  }

  if (report.addedSlides.length) {
    console.log(`[config-sync] ${context}: added ${report.addedSlides.length} new asset slide(s): ${formatFileList(report.addedSlides)}.`);
  }

  if (report.heroChanged) {
    console.log(`[config-sync] ${context}: hero changed from "${report.previousHero}" to "${report.nextHero}" because the saved hero was missing.`);
  }

  if (!report.missingSlides.length && !report.addedSlides.length && !report.heroChanged && !wroteConfig) {
    console.log(`[config-sync] ${context}: config already matches assets.`);
    return;
  }

  console.log(`[config-sync] ${context}: ${wroteConfig ? 'wrote updated' : 'kept'} data/config.json with ${report.finalCount} slide(s).`);
}

function syncConfigWithAssets(context, options = {}) {
  fs.mkdirSync(dataDir, { recursive: true });

  const previousConfigText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const saved = loadSavedConfig();
  const photos = listPhotos();
  const config = buildConfigFromAssets(saved, photos);
  const report = configReport(saved, photos, config, previousConfigText);
  const wroteConfig = options.forceWrite || report.shouldWrite;

  if (wroteConfig) {
    fs.writeFileSync(configPath, report.nextConfigText);
  }

  if (options.log === 'fixes') {
    if (shouldLogConfigFix(report)) {
      logConfigSync(context, report, wroteConfig);
    }
  } else if (options.log !== false) {
    logConfigSync(context, report, wroteConfig);
  }

  return config;
}

function shouldLogConfigFix(report) {
  return report.missingSlides.length > 0 || report.addedSlides.length > 0 || report.heroChanged;
}

function mergedConfig() {
  return syncConfigWithAssets('api/config', { log: 'fixes' });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error('Request body is too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function rebuildConfigFromAssets(context = 'rebuild') {
  return syncConfigWithAssets(context, { forceWrite: true });
}

function ensureStartupConfig() {
  syncConfigWithAssets('startup');
}

function saveConfig(payload) {
  const photos = listPhotos();
  const photoSet = new Set(photos);
  const slides = Array.isArray(payload.slides) ? payload.slides : [];
  const cleanSlides = slides
    .filter((slide) => photoSet.has(slide.file))
    .map((slide) => ({
      file: slide.file,
      transition: typeof slide.transition === 'string' && transitionTypes.includes(slide.transition)
        ? slide.transition
        : randomTransition(),
      duration: Math.max(2, Math.min(60, Number(slide.duration) || 6)),
      hidden: Boolean(slide.hidden),
      rotation: normalizeRotation(slide.rotation)
    }));

  const cleanSet = new Set(cleanSlides.map((slide) => slide.file));
  const newSlides = photos
    .filter((photo) => !cleanSet.has(photo))
    .map((photo) => defaultSlide(photo));

  const orderedSlides = [...newSlides, ...cleanSlides];

  const config = {
    hero: photoSet.has(payload.hero) ? payload.hero : orderedSlides[0]?.file || '',
    siteName: normalizeSiteName(payload.siteName),
    transitionDuration: normalizeTransitionDuration(payload.transitionDuration),
    slides: orderedSlides
  };

  fs.mkdirSync(dataDir, { recursive: true });
  const previousConfigText = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const report = configReport({ ...payload, slides }, photos, config, previousConfigText);
  fs.writeFileSync(configPath, report.nextConfigText);

  if (shouldLogConfigFix(report)) {
    logConfigSync('api/config save', report, true);
  }

  return config;
}

function safePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split('?')[0]);
  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
  const filePath = path.normalize(path.join(rootDir, requestedPath));

  if (!filePath.startsWith(rootDir)) {
    return null;
  }

  return filePath;
}

function safeAssetPath(fileName) {
  const relativePath = String(fileName || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');

  if (!relativePath) {
    return null;
  }

  const filePath = path.resolve(assetsDir, relativePath);
  const assetsRoot = path.resolve(assetsDir);

  if (filePath !== assetsRoot && !filePath.startsWith(`${assetsRoot}${path.sep}`)) {
    return null;
  }

  return filePath;
}

async function handleApi(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/photos') {
    sendJson(response, 200, { photos: listPhotos() });
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/login') {
    try {
      const body = await readBody(request);
      const payload = JSON.parse(body);

      if (String(payload.password || '') !== adminPassword) {
        sendJson(response, 401, { error: 'Unauthorized' });
        return true;
      }

      sendJson(response, 200, { token: adminToken }, {
        'Set-Cookie': `adminToken=${encodeURIComponent(adminToken)}; Path=/; SameSite=Lax`
      });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (request.method === 'GET' && pathname === '/api/session') {
    if (getAdminToken(request) !== adminToken) {
      sendJson(response, 401, { authenticated: false, error: 'Unauthorized' }, {
        'Set-Cookie': 'adminToken=; Path=/; Max-Age=0; SameSite=Lax'
      });
      return true;
    }

    sendJson(response, 200, { authenticated: true });
    return true;
  }

  if (request.method === 'GET' && pathname === '/api/config') {
    sendJson(response, 200, mergedConfig());
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/upload') {
    if (getAdminToken(request) !== adminToken) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return true;
    }

    try {
      const form = formidable({
        multiples: true,
        uploadDir: assetsDir,
        keepExtensions: true,
        filename: (name, ext, part, form) => {
          const original = (part.originalFilename || '').replace(/[^a-zA-Z0-9._-]/g, '_');
          return original || `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
        }
      });

      const [fields, files] = await new Promise((resolve, reject) => {
        form.parse(request, (error, fields, files) => {
          if (error) {
            reject(error);
            return;
          }
          resolve([fields, files]);
        });
      });

      const uploadedFiles = Array.isArray(files.files) ? files.files : files.files ? [files.files] : [];
      const validUploads = uploadedFiles.filter((file) => imageExtensions.has(path.extname(file.originalFilename || file.newFilename || '').toLowerCase()));

      if (!validUploads.length) {
        sendJson(response, 400, { error: 'No valid image files were uploaded.' });
        return true;
      }

      await Promise.all(validUploads.map(async (file) => {
        const filePath = path.join(assetsDir, file.newFilename || file.originalFilename);
        await shrinkPhotoIfNeeded(filePath, 1200);
        await createThumbnailIfMissing(filePath);
      }));
      const config = rebuildConfigFromAssets('upload');
      sendJson(response, 200, { ok: true, uploaded: validUploads.map((file) => file.originalFilename || file.newFilename), config });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (request.method === 'DELETE' && pathname === '/api/photo') {
    if (getAdminToken(request) !== adminToken) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return true;
    }

    try {
      const body = await readBody(request);
      const payload = JSON.parse(body);
      const assetPath = safeAssetPath(payload.file);

      if (!assetPath || !imageExtensions.has(path.extname(assetPath).toLowerCase())) {
        sendJson(response, 400, { error: 'Invalid image file.' });
        return true;
      }

      const thumbnailPath = path.join(thumbsDir, path.relative(assetsDir, assetPath));

      fs.rmSync(assetPath, { force: true });
      fs.rmSync(thumbnailPath, { force: true });

      const config = rebuildConfigFromAssets('delete');
      sendJson(response, 200, { ok: true, deleted: payload.file, config });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/shrink') {
    if (getAdminToken(request) !== adminToken) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return true;
    }

    response.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store'
    });

    const sendProgress = (payload) => {
      response.write(`${JSON.stringify(payload)}\n`);
    };

    try {
      const result = await shrinkPhotoAssets(1200, sendProgress);
      const config = rebuildConfigFromAssets('shrink');
      sendProgress({ type: 'done', ok: true, ...result, config });
    } catch (error) {
      sendProgress({ type: 'error', error: error.message });
    }
    response.end();
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/config') {
    if (getAdminToken(request) !== adminToken) {
      sendJson(response, 401, { error: 'Unauthorized' });
      return true;
    }

    try {
      const body = await readBody(request);
      const config = saveConfig(JSON.parse(body));
      sendJson(response, 200, config);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  return false;
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (await handleApi(request, response, requestUrl.pathname)) {
    return;
  }

  const filePath = safePath(requestUrl.pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const headers = { 'Content-Type': mimeTypes[extension] || 'application/octet-stream' };

  if (['.html', '.css', '.js', '.json'].includes(extension)) {
    headers['Cache-Control'] = 'no-store';
  }

  if (extension === '.html') {
    const html = injectSiteName(versionHtmlAssets(fs.readFileSync(filePath, 'utf8')));
    response.writeHead(200, headers);
    response.end(html);
    return;
  }

  response.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(response);
});

ensureStartupConfig();
ensureThumbsDir();

generateMissingThumbnails().catch((error) => {
  console.warn('Could not generate thumbnails:', error.message);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && !process.env.PORT) {
    server.listen(0);
    return;
  }

  throw error;
});

server.listen(preferredPort, () => {
  const address = server.address();
  const activePort = typeof address === 'object' && address ? address.port : preferredPort;
  const url = `http://localhost:${activePort}`;
  console.log(`Photo memorial site running at ${url}`);

  if (process.argv.includes('--open')) {
    childProcess.exec(`start "" "${url}"`);
  }
});
