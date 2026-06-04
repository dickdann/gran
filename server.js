const fs = require('fs');
const http = require('http');
const path = require('path');
const childProcess = require('child_process');
const dotenv = require('dotenv');
const formidableModule = require('formidable');
const formidable = formidableModule.default || formidableModule;

dotenv.config();
const rootDir = __dirname;
const assetsDir = path.join(rootDir, 'assets');
const dataDir = path.join(rootDir, 'data');
const configPath = path.join(dataDir, 'config.json');
const preferredPort = Number(process.env.PORT || 3000);
const adminPassword = process.env.PASSWORD || 'morag79';
const adminToken = require('crypto').randomBytes(32).toString('hex');
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
const transitionTypes = ['fade-in', 'fade-through', 'slide-left', 'slide-right', 'slide-up', 'zoom-in', 'zoom-out', 'blur-fade'];

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

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
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

function mergeSlides(photos, savedSlides) {
  const photoSet = new Set(photos);
  const orderedSlides = savedSlides
    .filter((slide) => photoSet.has(slide.file))
    .map((slide) => normalizeSlide(slide.file, slide));
  const orderedSet = new Set(orderedSlides.map((slide) => slide.file));
  const appendedSlides = photos
    .filter((file) => !orderedSet.has(file))
    .map((file) => normalizeSlide(file, null));

  return [...orderedSlides, ...appendedSlides];
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

function mergedConfig() {
  const photos = listPhotos();
  const saved = loadSavedConfig();
  const savedSlides = Array.isArray(saved?.slides) ? saved.slides : [];
  const slides = mergeSlides(photos, savedSlides);
  const photoSet = new Set(photos);
  const hero = photoSet.has(saved?.hero) ? saved.hero : slides[0]?.file || '';

  return { hero, slides };
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

function rebuildConfigFromAssets() {
  const photos = listPhotos();
  const saved = loadSavedConfig();
  const savedSlides = Array.isArray(saved?.slides) ? saved.slides : [];
  const slides = mergeSlides(photos, savedSlides);
  const photoSet = new Set(photos);

  const config = {
    hero: photoSet.has(saved?.hero) ? saved.hero : slides[0]?.file || '',
    slides
  };

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

function ensureStartupConfig() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(configPath)) {
    console.log('Creating data/config.json from the current assets folder.');
    rebuildConfigFromAssets();
  }
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
  photos.filter((photo) => !cleanSet.has(photo)).forEach((photo) => cleanSlides.push(defaultSlide(photo)));

  const config = {
    hero: photoSet.has(payload.hero) ? payload.hero : cleanSlides[0]?.file || '',
    slides: cleanSlides
  };

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
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

      sendJson(response, 200, { token: adminToken });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (request.method === 'GET' && pathname === '/api/config') {
    sendJson(response, 200, mergedConfig());
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/upload') {
    if (request.headers.authorization !== `Bearer ${adminToken}`) {
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

      const config = rebuildConfigFromAssets();
      sendJson(response, 200, { ok: true, uploaded: validUploads.map((file) => file.originalFilename || file.newFilename), config });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/config') {
    if (request.headers.authorization !== `Bearer ${adminToken}`) {
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

  response.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(response);
});

ensureStartupConfig();

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
