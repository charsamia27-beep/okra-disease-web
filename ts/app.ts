/* =========================================================
   ধাপ ২ — স্ক্রিন সুইচিং + ক্যামেরা সংযোগ
   ========================================================= */

import {
  startCamera, stopCamera, captureFrame, readFile,
  hasTorch, toggleTorch, cameraErrorMessage, isRunning,
  CaptureResult
} from './camera.js';

import {
  predict, decide, nextCandidate, loadModel,
  DiseaseKey, Prediction, Verdict
} from './predict.js';

import {
  loadTreatments, getDisease, renderResult, toBn, RenderTargets
} from './result.js';

type ScreenName =
  | 'home' | 'camera' | 'preview' | 'analyzing' | 'confirm' | 'result'
  | 'library' | 'history' | 'me' | 'officer';

const $  = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;
const $$ = (sel: string) =>
  Array.from(document.querySelectorAll(sel)) as HTMLElement[];

/* সর্বশেষ তোলা ছবি — ধাপ ৩ এ মডেলে যাবে */
let lastShot: CaptureResult | null = null;

/* ---------------- স্ক্রিন বদল ---------------- */
async function goTo(name: ScreenName): Promise<void> {
  // প্রিভিউতে ক্যামেরা চালু রাখো — 'আবার তুলুন' তাহলে সাথে সাথে কাজ করে।
  // বাকি স্ক্রিনে বন্ধ, নাহলে ব্যাটারি খায় ও বাতি জ্বলে থাকে।
  if (name !== 'camera' && name !== 'preview') {
    stopCamera($<HTMLVideoElement>('camVideo') ?? undefined);
  }

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
let camToken = 0;

async function openCamera(): Promise<void> {
  const video   = $<HTMLVideoElement>('camVideo');
  const err     = $('camError');
  const torch   = $('btnTorch');
  const loading = $('camLoading');
  const shutter = $<HTMLButtonElement>('btnShutter');
  if (!video) return;

  const myToken = ++camToken;

  err?.classList.add('hidden');

  // আগে থেকেই চললে লোডিং দেখানোর দরকার নেই
  if (!isRunning()) loading?.classList.remove('hidden');
  if (shutter) shutter.disabled = true;

  try {
    await startCamera(video);

    // এর মধ্যে ব্যবহারকারী অন্য স্ক্রিনে চলে গেলে কিছু কোরো না
    if (myToken !== camToken) return;

    loading?.classList.add('hidden');
    torch?.classList.toggle('hidden', !hasTorch());
    if (shutter) shutter.disabled = false;
  } catch (e) {
    if (myToken !== camToken) return;

    loading?.classList.add('hidden');
    const msg = $('camErrorText');
    if (msg) msg.textContent = cameraErrorMessage(e);
    err?.classList.remove('hidden');
    torch?.classList.add('hidden');
    if (shutter) shutter.disabled = true;   // ক্যামেরা নেই, শাটার নিষ্ক্রিয়
  }
}

async function onShutter(): Promise<void> {
  const video = $<HTMLVideoElement>('camVideo');
  if (!video) return;

  if (!isRunning()) return;

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

  $('btnRetryCam')?.addEventListener('click', () => void openCamera());

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

  $('btnUsePhoto')?.addEventListener('click', () => void runAnalysis());

  $('btnAgain')?.addEventListener('click', () => void goTo('camera'));
  $('btnOfficer')?.addEventListener('click', showOfficer);
  $('btnSpeak')?.addEventListener('click', () => alert('ভয়েস ধাপ ৪ এ আসছে।'));

  $('btnConfirmYes')?.addEventListener('click', () => onConfirm('yes'));
  $('btnConfirmNo')?.addEventListener('click',  () => onConfirm('no'));
  $('btnConfirmIdk')?.addEventListener('click', () => onConfirm('idk'));
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


/* =========================================================
   বিশ্লেষণ ও ফলাফল
   ========================================================= */

let currentPrediction: Prediction | null = null;
let currentVerdict: Verdict | null = null;
let rejected: DiseaseKey[] = [];
let spokenText = '';

function targets(): RenderTargets {
  return {
    name:     $('rName')!,
    nameEn:   $('rNameEn')!,
    fill:     $('rFill')!,
    pct:      $('rPct')!,
    banner:   $('rBanner')!,
    symptoms: $('rSymptoms')!,
    actions:  $('rAction')!,
    chemical: $('rChem')!
  };
}

async function runAnalysis(): Promise<void> {
  if (!lastShot) return;

  rejected = [];
  await goTo('analyzing');

  const img = new Image();
  img.src = lastShot.dataUrl;
  await img.decode().catch(() => {});

  currentPrediction = await predict(img);
  currentVerdict    = decide(currentPrediction);

  if (currentVerdict.kind === 'confirm') {
    showConfirm(currentVerdict.candidate);
  } else {
    showResult();
  }
}

/* ---------------- নিশ্চিতকরণ ---------------- */
function showConfirm(key: DiseaseKey): void {
  const d = getDisease(key);
  if (!d || !lastShot) { showResult(); return; }

  const mine = $<HTMLImageElement>('confirmMine');
  const ref  = $<HTMLImageElement>('confirmRef');
  const q    = $('confirmQ');
  const hint = $('confirmHint');

  if (mine) mine.src = lastShot.dataUrl;

  if (ref) {
    ref.src = d.referenceImage;
    ref.onerror = () => {
      ref.classList.add('hidden');
      $('confirmRefMissing')?.classList.remove('hidden');
    };
    ref.onload = () => {
      ref.classList.remove('hidden');
      $('confirmRefMissing')?.classList.add('hidden');
    };
  }

  if (q)    q.textContent = `আপনার পাতা কি ${d.bn} এর মতো?`;
  if (hint) hint.textContent = d.lookFor ?? 'দুটি ছবি মিলিয়ে দেখুন।';

  void goTo('confirm');
}

function onConfirm(answer: 'yes' | 'no' | 'idk'): void {
  if (!currentPrediction || !currentVerdict || currentVerdict.kind !== 'confirm') return;

  if (answer === 'yes') {
    showResult(currentVerdict.candidate);
    return;
  }

  if (answer === 'idk') {
    currentVerdict = { kind: 'too_low', prediction: currentPrediction };
    showResult();
    return;
  }

  // "না" — পরের সম্ভাবনা
  rejected.push(currentVerdict.candidate);
  const next = nextCandidate(currentPrediction, rejected);

  if (next) {
    currentVerdict = { kind: 'confirm', prediction: currentPrediction, candidate: next };
    showConfirm(next);
  } else {
    currentVerdict = { kind: 'too_low', prediction: currentPrediction };
    showResult();
  }
}

/* ---------------- ফলাফল ---------------- */
function showResult(confirmedKey?: DiseaseKey): void {
  if (!currentVerdict) return;

  const img = $<HTMLImageElement>('resultImg');
  if (img && lastShot) img.src = lastShot.dataUrl;

  spokenText = renderResult(targets(), currentVerdict, confirmedKey);
  void goTo('result');
}

function showOfficer(): void {
  alert('উপজেলা কৃষি অফিসে যোগাযোগ করুন।\nকৃষি কল সেন্টার: ' + toBn(16123));
}

/* ---------------- চালু ---------------- */
async function init(): Promise<void> {
  wire();
  wireVoice();
  fillWeatherPlaceholder();

  try {
    await loadTreatments();
    await loadModel();
  } catch {
    alert('রোগের তথ্য লোড করা যায়নি। ইন্টারনেট সংযোগ দেখুন।');
  }

  /* ট্যাব লুকালে ক্যামেরা ছেড়ে দাও, ফিরে এলে আবার ধরো।
     না ছাড়লে অন্য ট্যাব/অ্যাপ ক্যামেরা পায় না। */
  document.addEventListener('visibilitychange', () => {
    const onCam = !$('screen-camera')?.classList.contains('hidden');
    if (document.hidden) {
      stopCamera($<HTMLVideoElement>('camVideo') ?? undefined);
    } else if (onCam) {
      void openCamera();
    }
  });

  /* ব্রাউজার ক্যাশ থেকে পেজ ফিরলে DOMContentLoaded চলে না */
  window.addEventListener('pageshow', ev => {
    if (!(ev as PageTransitionEvent).persisted) return;
    const onCam = !$('screen-camera')?.classList.contains('hidden');
    if (onCam) void openCamera();
  });

  /* পেজ ছাড়ার আগে ক্যামেরা ছেড়ে দাও */
  window.addEventListener('pagehide', () => {
    stopCamera($<HTMLVideoElement>('camVideo') ?? undefined);
  });

  console.log('✅ ধাপ ২ চালু হয়েছে');
}

document.addEventListener('DOMContentLoaded', () => void init());
