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

import {
  initVoices, speak, stopSpeaking, canSpeak, hasBanglaVoice, getLastHeard,
  canListen, listenOnce, stopListening, isListening, getState,
  setVoiceEnabled, isVoiceEnabled, onVoiceState, onVoiceCommand,
  Command
} from './voice.js';

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
  stopSpeaking();

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
  $('btnSpeak')?.addEventListener('click', () => {
    if (!canSpeak()) { alert('এই ব্রাউজারে কথা বলার সুবিধা নেই।'); return; }
    speak(spokenText);
  });

  $('btnConfirmYes')?.addEventListener('click', () => onConfirm('yes'));
  $('btnConfirmNo')?.addEventListener('click',  () => onConfirm('no'));
  $('btnConfirmIdk')?.addEventListener('click', () => onConfirm('idk'));
}

/* ---------------- ভয়েস বোতাম — এক চাপ, এক কথা ---------------- */
function wireVoice(): void {
  const btn = $('voiceToggle');
  if (!btn) return;

  initVoices();
  setVoiceEnabled(true);
  btn.classList.add('is-on');

  btn.title = canListen()
    ? 'চাপুন, তারপর বলুন'
    : 'এই ব্রাউজারে কথা শোনা যায় না — চাপলে পড়ে শোনাবে';

  btn.addEventListener('click', () => {
    // পড়ার সময় চাপলে — থামাও
    if (getState() === 'speaking') { stopSpeaking(); return; }

    // শোনা চলাকালে চাপলে — বাতিল করো
    if (isListening()) { stopListening(); return; }

    // শোনার সুবিধা নেই — অন্তত পড়ে শোনাও
    if (!canListen()) {
      if (spokenText) speak(spokenText);
      else speak('এই ফোনে কথা শোনা যায় না। নিচের বোতামগুলো ব্যবহার করুন।');
      return;
    }

    listenOnce();
  });

  onVoiceState(st => {
    btn.classList.toggle('is-listening', st === 'listening');
    btn.classList.toggle('is-speaking',  st === 'speaking');
  });

  onVoiceCommand(handleCommand);
}

/* ---------------- ভয়েস কমান্ড ---------------- */
function currentScreen(): ScreenName {
  const names: ScreenName[] = ['camera','preview','analyzing','confirm','result','library','history','me','home'];
  for (const n of names) {
    if ($(`screen-${n}`) && !$(`screen-${n}`)!.classList.contains('hidden')) return n;
  }
  return 'home';
}

function toast(msg: string): void {
  let el = $('vToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'vToast';
    el.className = 'vtoast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('is-on');
  window.clearTimeout((el as any)._t);
  (el as any)._t = window.setTimeout(() => el!.classList.remove('is-on'), 3500);
}

/* প্রতি স্ক্রিনে কী বলা যায় — ফলব্যাকে এটাই শোনানো হয় */
function hintFor(screen: ScreenName): string {
  switch (screen) {
    case 'confirm': return 'বলুন — হ্যাঁ, না, অথবা বুঝতে পারছি না।';
    case 'result':  return 'বলুন — পড়ো, আরেকটা ছবি, অথবা অফিসার।';
    case 'preview': return 'বলুন — হ্যাঁ, অথবা আবার।';
    case 'camera':  return 'বলুন — ছবি তোলো।';
    default:        return 'বলুন — ছবি তোলো, গ্যালারি, অথবা সাহায্য।';
  }
}

/* বুঝতে না পারলে কী করবে।
   নীরব থাকা নয় — কিন্তু আন্দাজ করাও নয়। */
function fallback(screen: ScreenName, raw: string): void {
  const hint = hintFor(screen);
  const short = raw.length > 40 ? raw.slice(0, 40) + '…' : raw;

  if (short) {
    toast('শুনলাম: "' + short + '" — বুঝিনি');
    speak('আপনি বললেন, ' + short + '। এটা বুঝতে পারিনি। ' + hint);
  } else {
    toast('কিছু শোনা যায়নি');
    speak('কিছু শোনা যায়নি। বোতামে চাপ দিয়ে আবার বলুন। ' + hint);
  }
}

function handleCommand(cmd: Command, raw: string): void {
  const screen = currentScreen();

  switch (cmd) {
    case 'denied':
      toast('মাইকের অনুমতি নেই');
      speak('মাইক ব্যবহারের অনুমতি পাওয়া যায়নি। ব্রাউজারের সেটিংসে অনুমতি দিন। অনুমতি ছাড়াও নিচের বোতাম দিয়ে সব কাজ করা যাবে।');
      return;

    case 'offline':
      toast('ইন্টারনেট নেই');
      speak('কথা শোনার জন্য ইন্টারনেট দরকার। এখন নিচের বোতামগুলো ব্যবহার করুন।');
      return;

    case 'stop':
      stopSpeaking();
      toast('থামলাম');
      return;

    case 'capture':
      toast('শুনলাম: ছবি তোলা');
      if (screen === 'camera') void onShutter();
      else void goTo('camera');
      return;

    case 'again':
      toast('শুনলাম: আরেকটি ছবি');
      void goTo('camera');
      return;

    case 'gallery':
      toast('শুনলাম: গ্যালারি');
      $<HTMLInputElement>('fileInput')?.click();
      return;

    case 'read':
      if (spokenText) { toast('পড়ে শোনাচ্ছি'); speak(spokenText); }
      else speak('এখন পড়ার মতো কিছু নেই। আগে পাতার ছবি তুলুন।');
      return;

    case 'officer':
      toast('কৃষি কল সেন্টার');
      speak('কৃষি কল সেন্টারের নম্বর ' + toBn(16123) + '। অথবা নিকটস্থ উপজেলা কৃষি অফিসে যান।');
      return;

    case 'home':
      void goTo('home');
      speak('প্রথম পাতায় এলাম।');
      return;

    case 'help':
      speak('বোতামে একবার চাপ দিন, তারপর বলুন। ' + hintFor(screen));
      return;

    /* হ্যাঁ / না — শুধু যেখানে অর্থ হয় সেখানেই।
       অন্য পর্দায় আন্দাজ না করে জিজ্ঞেস করাই নিরাপদ। */
    case 'yes':
      if (screen === 'confirm')      { toast('উত্তর: হ্যাঁ'); onConfirm('yes'); return; }
      if (screen === 'preview')      { toast('উত্তর: হ্যাঁ'); void runAnalysis(); return; }
      fallback(screen, raw);
      return;

    case 'no':
      if (screen === 'confirm')      { toast('উত্তর: না'); onConfirm('no'); return; }
      if (screen === 'preview')      { toast('আবার তুলুন'); void goTo('camera'); return; }
      fallback(screen, raw);
      return;

    default:
      fallback(screen, raw);
      return;
  }
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

  const question = `আপনার পাতা কি ${d.bn} এর মতো?`;
  if (q)    q.textContent = question;
  if (hint) hint.textContent = d.lookFor ?? 'দুটি ছবি মিলিয়ে দেখুন।';

  void goTo('confirm');
  if (isVoiceEnabled()) {
    setTimeout(() => speak(
      question + ' ' + (d.lookFor ?? '') +
      ' হ্যাঁ, না, নাকি বুঝতে পারছি না? ' +
      'মুখে বলতে চাইলে উপরের ভয়েস বোতামে চাপ দিন।'
    ), 350);
  }
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
  if (isVoiceEnabled()) setTimeout(() => speak(spokenText), 350);
}

function showOfficer(): void {
  const msg = 'কৃষি কল সেন্টার: ' + toBn(16123) + '। অথবা নিকটস্থ উপজেলা কৃষি অফিসে যান।';
  speak(msg);
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
