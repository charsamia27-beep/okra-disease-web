/* =========================================================
   সার্ভিস ওয়ার্কার — অফলাইন সাপোর্ট
   একবার ইন্টারনেট দিয়ে খুললেই পরে নেট ছাড়া পুরো অ্যাপ চলবে
   (ক্যামেরা, মডেল, রোগ নির্ণয়, চিকিৎসা, ইতিহাস)।

   নতুন কোড push করলে VERSION বাড়াও, নাহলে পুরনো ক্যাশ থেকে যাবে।
   ========================================================= */

const VERSION   = 'okra-v1';
const SHELL     = VERSION + '-shell';    // নিজের ফাইল
const RUNTIME   = VERSION + '-runtime';  // CDN (ORT, ফন্ট)

const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';

/* নিজের ফাইল — সব relative, তাই GitHub Pages-এর সাবফোল্ডারেও চলে */
const SHELL_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/style.css',
  'css/responsive.css',
  'js/app.js',
  'js/camera.js',
  'js/predict.js',
  'js/result.js',
  'js/voice.js',
  'js/offline.js',
  'data/treatment.json',
  'model/best.onnx',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'images/reference/cercospora.jpg',
  'images/reference/healthy.jpg',
  'images/reference/how-to-capture.jpg',
  'images/reference/insect_damage.jpg',
  'images/reference/nutrient_deficiency.jpg',
  'images/reference/yvmv.jpg'
];

/* ONNX Runtime — wasm ফাইলের নাম ভার্সন ভেদে আলাদা হতে পারে,
   তাই যেটা পাওয়া যায় সেটাই রাখি (না পেলেও install আটকাবে না)।
   পেজ নিজেও লোড হওয়া ফাইলের তালিকা পাঠায় (নিচে 'cache-urls')। */
const ORT_FILES = [
  ORT_BASE + 'ort.min.js',
  ORT_BASE + 'ort-wasm-simd-threaded.wasm',
  ORT_BASE + 'ort-wasm-simd-threaded.mjs'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    // নিজের ফাইল একটাও না পেলে install ব্যর্থ — অর্ধেক অফলাইন অ্যাপ চাই না
    await shell.addAll(SHELL_FILES);

    const rt = await caches.open(RUNTIME);
    await Promise.allSettled(ORT_FILES.map(u => rt.add(new Request(u, { mode: 'cors' }))));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = [SHELL, RUNTIME];
    for (const k of await caches.keys()) {
      if (!keep.includes(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

/* পেজ যেসব CDN ফাইল আসলেই লোড করেছে, সেগুলোও ক্যাশে রাখো */
self.addEventListener('message', event => {
  const msg = event.data;
  if (!msg || msg.type !== 'cache-urls' || !Array.isArray(msg.urls)) return;
  event.waitUntil((async () => {
    const rt = await caches.open(RUNTIME);
    await Promise.allSettled(msg.urls
      .filter(isRuntimeUrl)
      .map(async u => {
        if (await rt.match(u)) return;
        const res = await fetch(u, { mode: u.startsWith(ORT_BASE) ? 'cors' : 'no-cors' });
        if (res.ok || res.type === 'opaque') await rt.put(u, res);
      }));
  })());
});

function isRuntimeUrl(u) {
  return u.startsWith(ORT_BASE) ||
         u.startsWith('https://fonts.googleapis.com/') ||
         u.startsWith('https://fonts.gstatic.com/');
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // আবহাওয়া API — শুধু নেট থেকে; অফলাইনে app.ts নিজেই পুরনো তথ্য দেখায়
  if (url.hostname === 'api.open-meteo.com') return;

  // CDN: আগে ক্যাশ, না থাকলে নেট থেকে এনে রেখে দাও
  if (isRuntimeUrl(req.url)) {
    event.respondWith(cacheFirst(req, RUNTIME));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // মডেল ও ছবি বড় আর কম বদলায় — আগে ক্যাশ
  if (url.pathname.endsWith('.onnx') || url.pathname.includes('/images/') ||
      url.pathname.includes('/icons/')) {
    event.respondWith(cacheFirst(req, SHELL));
    return;
  }

  // HTML/JS/CSS/JSON — আগে নেট (নতুন কোড পেতে), নেট না থাকলে ক্যাশ
  event.respondWith(networkFirst(req, SHELL));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    // দুর্বল নেটে বেশিক্ষণ আটকে না থেকে ৪ সেকেন্ড পর ক্যাশে যাও
    const res = await withTimeout(fetch(req), 4000);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // অচেনা পেজে গেলেও মূল অ্যাপ দেখাও
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    return new Response('অফলাইন', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); },
           e => { clearTimeout(t); reject(e); });
  });
}
