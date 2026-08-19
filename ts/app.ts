/* =========================================================
   ধাপ ২ — স্ক্রিন সুইচিং + ক্যামেরা সংযোগ
   ========================================================= */

import {
  startCamera, stopCamera, captureFrame, readFile,
  hasTorch, toggleTorch, cameraErrorMessage,
  CaptureResult
} from './camera.js';

type ScreenName = 'home' | 'camera' | 'preview' | 'library' | 'history' | 'me' | 'officer';

const $  = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;
const $$ = (sel: string) =>
  Array.from(document.querySelectorAll(sel)) as HTMLElement[];

/* সর্বশেষ তোলা ছবি — ধাপ ৩ এ মডেলে যাবে */
let lastShot: CaptureResult | null = null;

/* ---------------- স্ক্রিন বদল ---------------- */
async function goTo(name: ScreenName): Promise<void> {
  // ক্যামেরা ছেড়ে গেলে বন্ধ করো — নাহলে ব্যাটারি খায়, বাতি জ্বলে থাকে
  if (name !== 'camera') stopCamera();

  const target = $(`screen-${name}`);
  if (!target) {
    alert(`"${name}" স্ক্রিন এখনো তৈরি হয়নি — পরের ধাপে আসছে।`);
    return;
  }

  $$('.screen').forEach(s => s.classList.add('hidden'));
  target.classList.remove('hidden');

  // ক্যামেরা স্ক্রিনে হেডার/নেভ লুকাও
  const full = name === 'camera';
  $('appHeader')?.classList.toggle('hidden', full);
  $('appNav')?.classList.toggle('hidden', full);
  document.body.classList.toggle('is-fullscreen', full);

  $$('.nav__item').forEach(i =>
    i.classList.toggle('is-active', i.dataset.go === name)
  );

  window.scrollTo(0, 0);

  if (name === 'camera') await openCamera();
}

/* ---------------- ক্যামেরা ---------------- */
async function openCamera(): Promise<void> {
  const video = $<HTMLVideoElement>('camVideo');
  const err   = $('camError');
  const torch = $('btnTorch');
  if (!video) return;

  err?.classList.add('hidden');

  try {
    await startCamera(video);
    torch?.classList.toggle('hidden', !hasTorch());
  } catch (e) {
    if (err) {
      err.textContent = cameraErrorMessage(e);
      err.classList.remove('hidden');
    }
    torch?.classList.add('hidden');
  }
}

async function onShutter(): Promise<void> {
  const video = $<HTMLVideoElement>('camVideo');
  if (!video) return;

  try {
    lastShot = await captureFrame(video);
    showPreview(lastShot.dataUrl);
  } catch {
    alert('ছবি তোলা যায়নি। আবার চেষ্টা করুন।');
  }
}

async function onPickFile(file: File | undefined): Promise<void> {
  if (!file) return;
  try {
    lastShot = await readFile(file);
    showPreview(lastShot.dataUrl);
  } catch {
    alert('ছবিটি পড়া যায়নি। অন্য ছবি বেছে নিন।');
  }
}

function showPreview(dataUrl: string): void {
  const img = $<HTMLImageElement>('previewImg');
  if (img) img.src = dataUrl;
  void goTo('preview');
}

/* ---------------- বোতাম সংযোগ ---------------- */
function wire(): void {
  $$('[data-go]').forEach(el =>
    el.addEventListener('click', () => void goTo(el.dataset.go as ScreenName))
  );

  $('btnStart')?.addEventListener('click', () => void goTo('camera'));
  $('btnShutter')?.addEventListener('click', () => void onShutter());
  $('btnCamClose')?.addEventListener('click', () => void goTo('home'));
  $('btnRetake')?.addEventListener('click', () => void goTo('camera'));

  $('btnTorch')?.addEventListener('click', async () => {
    const on = await toggleTorch();
    $('btnTorch')?.classList.toggle('is-on', on);
  });

  // গ্যালারি
  const fileInput = $<HTMLInputElement>('fileInput');
  $('btnGallery')?.addEventListener('click', () => fileInput?.click());
  $('btnGalleryHome')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', e => {
    const f = (e.target as HTMLInputElement).files?.[0];
    void onPickFile(f);
    (e.target as HTMLInputElement).value = '';
  });

  // ধাপ ৩ এ এখানে মডেল বসবে
  $('btnUsePhoto')?.addEventListener('click', () => {
    alert('ছবি গৃহীত। মডেল সংযোজন ধাপ ৩ ও ৫ এ আসছে।');
  });
}

/* ---------------- ভয়েস টগল (ধাপ ৪ এ কাজ করবে) ---------------- */
let voiceEnabled = true;
function wireVoice(): void {
  const btn = $('voiceToggle');
  if (!btn) return;
  btn.classList.add('is-on');
  btn.addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    btn.classList.toggle('is-on', voiceEnabled);
    btn.classList.toggle('is-off', !voiceEnabled);
  });
}

function fillWeatherPlaceholder(): void {
  const t = $('wTemp');
  const s = $('wSpray');
  if (t) t.textContent = '২৬° সে';
  if (s) s.textContent = 'উপযুক্ত';
}

/* ---------------- চালু ---------------- */
function init(): void {
  wire();
  wireVoice();
  fillWeatherPlaceholder();

  // ট্যাব লুকালে ক্যামেরা বন্ধ
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
  });

  console.log('✅ ধাপ ২ চালু হয়েছে');
}

document.addEventListener('DOMContentLoaded', init);
