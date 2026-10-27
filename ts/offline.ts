/* =========================================================
   অফলাইন: সার্ভিস ওয়ার্কার রেজিস্টার + নেট আছে/নেই ব্যানার
   ========================================================= */

/** লোড হওয়া CDN ফাইলগুলো (ONNX Runtime wasm, ফন্ট) SW-কে জানাও
    যাতে প্রথমবারেই সব ক্যাশে উঠে যায় */
function sendLoadedResources(sw: ServiceWorker | null): void {
  if (!sw) return;
  const urls = performance.getEntriesByType('resource')
    .map(e => e.name)
    .filter(u => u.startsWith('https://'));
  sw.postMessage({ type: 'cache-urls', urls });
}

export async function registerOffline(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller ?? reg.active;
    sendLoadedResources(sw);

    // মডেল লোডের পর আরও ফাইল আসতে পারে — একটু পরে আবার পাঠাও
    setTimeout(() => sendLoadedResources(navigator.serviceWorker.controller ?? reg.active), 8000);
  } catch (err) {
    console.warn('সার্ভিস ওয়ার্কার চালু হয়নি', err);
  }
}

/** উপরে ছোট ব্যানার: নেট নেই হলে জানাও, ফিরলে লুকাও */
export function watchConnection(onChange?: (online: boolean) => void): void {
  const bar = document.getElementById('offlineBar');
  const showBar = () => { if (bar) bar.classList.toggle('hidden', navigator.onLine); };
  const update = () => { showBar(); onChange?.(navigator.onLine); };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  showBar();  // শুরুতে শুধু ব্যানার; onChange কেবল বদল হলে
}
