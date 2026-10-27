/* =========================================================
   ধাপ ২ — স্ক্রিন সুইচিং + ক্যামেরা সংযোগ
   ========================================================= */

import {
  startCamera, stopCamera, captureFrame, readFile,
  hasTorch, toggleTorch, cameraErrorMessage, isRunning,
  CaptureResult
} from './camera.js';


import {
  loadTreatments, getDisease, renderResult, toBn, RenderTargets
} from './result.js';

import {
  initVoices, speak, stopSpeaking, canSpeak, hasBanglaVoice, getLastHeard,
  canListen, listenOnce, stopListening, isListening, getState,
  setVoiceEnabled, isVoiceEnabled, onVoiceState, onVoiceCommand,
  Command
} from './voice.js';

import {
  predict, decide, nextCandidate, loadModel, CLASS_ORDER,
  DiseaseKey, Prediction, Verdict
} from './predict.js';

import { registerOffline, watchConnection } from './offline.js';

type ScreenName =
  | 'home' | 'camera' | 'preview' | 'analyzing' | 'confirm' | 'result'
  | 'library' | 'history' | 'me' | 'officer';

const $  = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;
const $$ = (sel: string) =>
  Array.from(document.querySelectorAll(sel)) as HTMLElement[];

/* সর্বশেষ তোলা ছবি — ধাপ ৩ এ মডেলে যাবে */
let lastShot: CaptureResult | null = null;
let lastSource: 'camera' | 'gallery' = 'camera';

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

  if (name === 'library') renderLibrary();
  if (name === 'history') renderHistory();
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
        lastSource = 'camera';
    showPreview(lastShot.dataUrl);
  } catch {
    alert('ছবি তোলা যায়নি। আবার চেষ্টা করুন।');
  }
}

async function onPickFile(file: File | undefined): Promise<void> {
  if (!file) return;
  try {
    lastShot = await readFile(file);
        lastSource = 'gallery';
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

  $('btnConfirmYes')?.addEventListener('click', () => onConfirm('yes'));
  $('btnConfirmNo')?.addEventListener('click',  () => onConfirm('no'));
  $('btnConfirmIdk')?.addEventListener('click', () => onConfirm('idk'));
  
  $('btnExportScans')?.addEventListener('click', exportScans);

  $('btnClearHist')?.addEventListener('click', () => {
    if (!confirm('সব স্ক্যান মুছে ফেলবেন?')) return;
    localStorage.removeItem(HIST_KEY);
    renderHistory();
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

    // নেট নেই — শোনার চেষ্টা করে চুপ থাকার চেয়ে আগেই জানাও।
    // ফলাফল খোলা থাকলে সেটা পড়ে শোনাও (TTS অফলাইনেও চলে)।
    if (!navigator.onLine) {
      toast('ইন্টারনেট নেই — কথা শোনা যাবে না');
      speak(spokenText
        ? spokenText
        : 'এখন ইন্টারনেট নেই। কথা বলে নয়, বোতাম চেপে ব্যবহার করুন। ছবি তুলে রোগ দেখা যাবে।');
      return;
    }

    listenOnce();
  });

  // অফলাইনে মাইক ধূসর, টিপলে কী হবে তা title-এ বলা
  const markOffline = () => {
    const off = !navigator.onLine;
    btn.classList.toggle('is-offline', off);
    btn.title = off
      ? 'ইন্টারনেট নেই — চাপলে পড়ে শোনাবে'
      : canListen() ? 'চাপুন, তারপর বলুন'
                    : 'এই ব্রাউজারে কথা শোনা যায় না — চাপলে পড়ে শোনাবে';
  };
  window.addEventListener('online', markOffline);
  window.addEventListener('offline', markOffline);
  markOffline();

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

function fallback(screen: ScreenName, raw: string): void {
  const hint = hintFor(screen);
  const short = raw.length > 40 ? raw.slice(0, 40) + '…' : raw;

  /* লক্ষণের বর্ণনা শুনলে — কমান্ড নয়, কিন্তু কাজের কথা */
  const symptomWords = ['দাগ', 'হলুদ', 'কোঁকড়া', 'ছিদ্র', 'পাতা', 'শুকিয়ে', 'পোকা', 'সাদা', 'রোগ'];
  if (short && symptomWords.some(w => short.includes(w))) {

    if (screen === 'result' && spokenText) {
      toast('ফলাফল পড়ে শোনাচ্ছি');
      speak(spokenText);
      return;
    }

    if (screen === 'confirm') {
      toast('আবার বলছি');
      speak(($('confirmQ')?.textContent ?? '') + '। ' +
            ($('confirmHint')?.textContent ?? '') +
            ' হ্যাঁ, না, নাকি বুঝতে পারছি না?');
      return;
    }

    toast('লক্ষণ শুনলাম');
    speak('বুঝেছি। তবে শুধু শুনে রোগ বলা ঠিক হবে না। ' +
          'ক্যামেরা চালু করছি — পাতাটি হাতে ধরে কাছ থেকে একটি ছবি তুলুন। ' +
          'আমি দেখে বলছি।', () => {
      void goTo('camera');
    });
    return;
  }

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
      /* ফলাফলের পাতায় "ছবি তুলুন" মানে নতুন ছবি — ওটা ঠিক আছে */
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

async function fillWeather(): Promise<void> {
  const t = $('wTemp');
  const s = $('wSpray');
  if (t) t.textContent = '…';
  if (s) s.textContent = '…';

  const show = (temp: number, spray: string, ok: boolean) => {
    if (t) t.textContent = toBn(Math.round(temp)) + '° সে';
    if (s) {
      s.textContent = spray;
      s.classList.toggle('weather__value--ok', ok);
          lastWeather.temp = temp;
    lastWeather.spray = spray;
    }
  };

  /* অফলাইনে শেষ পাওয়া আবহাওয়া দেখাও, সাথে কত আগের তা বলো */
  const WEATHER_KEY = 'okra_weather_last';
  const showSaved = (): boolean => {
    try {
      const w = JSON.parse(localStorage.getItem(WEATHER_KEY) ?? 'null');
      if (!w) return false;
      const hrs = Math.max(0, Math.round((Date.now() - w.at) / 3600000));
      if (t) t.textContent = toBn(Math.round(w.temp)) + '° সে';
      lastWeather.temp = w.temp;
      lastWeather.spray = w.spray;
      if (s) {
        s.textContent = hrs < 1 ? w.spray : `${w.spray} (${toBn(hrs)} ঘণ্টা আগের)`;
        s.classList.toggle('weather__value--ok', w.ok && hrs < 3);
      }
      return true;
    } catch { return false; }
  };
  const showNone = () => {
    if (t) t.textContent = '—';
    if (s) { s.textContent = 'নেট নেই'; s.classList.remove('weather__value--ok'); }
  };

  if (!navigator.onLine) {
    if (!showSaved()) showNone();
    return;
  }

  const fetchAt = async (lat: number, lon: number) => {
    lastWeather.lat = lat;
    lastWeather.lon = lon;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation` +
                `&forecast_days=1&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('weather');
    const c = (await r.json()).current;

    // স্প্রের উপযুক্ত সময়: বৃষ্টি নেই, বাতাস কম, খুব গরম নয়
    const rain = c.precipitation > 0.1;
    const windy = c.wind_speed_10m > 15;
    const hot = c.temperature_2m > 34;

    const verdict =
      rain  ? 'বৃষ্টি — এখন নয়' :
      windy ? 'বাতাস বেশি' :
      hot   ? 'গরম — বিকেলে দিন' : 'উপযুক্ত';

    const ok = !rain && !windy && !hot;
    show(c.temperature_2m, verdict, ok);
    try {
      localStorage.setItem(WEATHER_KEY, JSON.stringify({
        temp: c.temperature_2m, spray: verdict, ok, at: Date.now()
      }));
    } catch { /* জায়গা না থাকলে বাদ */ }
  };

  const offlineFallback = () => { if (!showSaved()) showNone(); };
  const fallback = () => { fetchAt(23.81, 90.41).catch(offlineFallback); };  // ঢাকা

  if (!navigator.geolocation) { fallback(); return; }

  navigator.geolocation.getCurrentPosition(
    pos => { void fetchAt(pos.coords.latitude, pos.coords.longitude).catch(fallback); },
    fallback,
    { timeout: 6000, maximumAge: 900000 }
  );
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
        if (lastShot && currentVerdict.kind !== 'not_leaf') {
    const p = currentVerdict.prediction;
      if (lastShot && (currentVerdict.kind === 'sure' || confirmedKey)) {
    saveScan(
      confirmedKey ?? (currentVerdict as any).disease,
      currentVerdict.prediction.confidence,
      lastShot.dataUrl,
      !!confirmedKey
    );
  }
  }
  void goTo('result');
  if (isVoiceEnabled()) setTimeout(() => speak(spokenText), 350);
}

function showOfficer(): void {
  void goTo('officer');
  if (isVoiceEnabled()) {
    setTimeout(() => speak(
      'কৃষি কল সেন্টারের নম্বর ' + toBn(16123) +
      '। অথবা আক্রান্ত পাতাটি নিয়ে নিকটস্থ উপজেলা কৃষি অফিসে যান।'
    ), 300);
  }
}

/* ---------------- চালু ---------------- */
async function init(): Promise<void> {
  wire();
  wireVoice();
  void fillWeather();

  // নেট ফিরলে আবহাওয়া আবার আনো
  watchConnection(online => { if (online) void fillWeather(); });

  try {
    await loadTreatments();
    await loadModel();
  } catch {
    alert(navigator.onLine
      ? 'রোগের তথ্য লোড করা যায়নি। পেজটি আবার খুলুন।'
      : 'প্রথমবার অ্যাপটি ইন্টারনেট দিয়ে খুলতে হবে। এরপর নেট ছাড়াই চলবে।');
  }

  // মডেল লোডের পর SW চালু করো, যাতে লোড হওয়া সব ফাইল ক্যাশে যায়
  void registerOffline();

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

/* =========================================================
   রোগের তালিকা
   ========================================================= */
function renderLibrary(): void {
  const box = $('libList');
  if (!box) return;
  box.innerHTML = '';

  for (const key of CLASS_ORDER) {
    if (key === 'invalid') continue;          // এটা রোগ নয়
    const d = getDisease(key as DiseaseKey);
    if (!d) continue;

    const btn = document.createElement('button');
    btn.className = 'lib-item';

    const tone = d.tone ?? 'warn';
    const tag =
      tone === 'stop' ? 'ওষুধ নেই' :
      tone === 'ok'   ? 'সমস্যা নেই' : 'চিকিৎসা আছে';

    btn.innerHTML = `
      <img class="lib-item__thumb" src="${d.referenceImage}" alt=""
           onerror="this.style.visibility='hidden'">
      <span class="lib-item__body">
        <span class="lib-item__bn">${d.bn}</span>
        <span class="lib-item__en" style="display:block;">${d.en}</span>
        <span class="lib-item__tag tag--${tone}">${tag}</span>
      </span>`;

    btn.addEventListener('click', () => {
      currentPrediction = null;
      currentVerdict = null;
      const imgEl = $<HTMLImageElement>('resultImg');
      if (imgEl) imgEl.src = d.referenceImage;

      spokenText = renderResult(
        targets(),
        { kind: 'sure', prediction: fakePrediction(key as DiseaseKey), disease: key as DiseaseKey },
        key as DiseaseKey
      );
      void goTo('result');
    });

    box.appendChild(btn);
  }
}

/* তালিকা থেকে দেখার সময় ১০০% নিশ্চয়তা ধরা হয় */
function fakePrediction(key: DiseaseKey): Prediction {
  const scores = {} as Record<DiseaseKey, number>;
  CLASS_ORDER.forEach(k => { scores[k as DiseaseKey] = k === key ? 1 : 0; });
  const rest = CLASS_ORDER.filter(k => k !== key)[0] as DiseaseKey;
  return { scores, top: key, second: rest, confidence: 1, isLeaf: 1 };
}

/* =========================================================
   আমার স্ক্যান
   ========================================================= */
interface Scan {
  key: string;
  conf: number;
  at: number;
  thumb: string;
  full?: string;          // বড় ছবি
  lat?: number;
  lon?: number;
  place?: string;
  temp?: number;
  spray?: string;
  device?: string;
  source?: 'camera' | 'gallery';
  confirmed?: boolean;    // কৃষক নিশ্চিত করেছে কি না
}
const HIST_KEY = 'okra_scans';

/* আবহাওয়া ও অবস্থান — fillWeather থেকে জমা হয় */
let lastWeather: { temp?: number; spray?: string; lat?: number; lon?: number } = {};

function loadScans(): Scan[] {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) ?? '[]'); }
  catch { return []; }
}

function saveScan(key: DiseaseKey, conf: number, dataUrl: string, confirmed: boolean): void {
  makeThumb(dataUrl, 160, thumb => {
    makeThumb(dataUrl, 640, full => {
      const list = loadScans();
      list.unshift({
        key, conf, thumb, full,
        at: Date.now(),
        lat: lastWeather.lat,
        lon: lastWeather.lon,
        temp: lastWeather.temp,
        spray: lastWeather.spray,
        device: navigator.userAgent.slice(0, 80),
        source: lastSource,
        confirmed
      });

      /* জায়গা কম পড়লে পুরনোগুলোর বড় ছবি ফেলে দাও */
      let keep = list.slice(0, 30);
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          localStorage.setItem(HIST_KEY, JSON.stringify(keep));
          return;
        } catch {
          keep = keep.slice(0, Math.max(5, keep.length - 8))
                     .map((s, i) => i > 2 ? { ...s, full: undefined } : s);
        }
      }
    });
  });
}

function makeThumb(dataUrl: string, size: number, cb: (t: string) => void): void {
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const side = Math.min(im.width, im.height);
    c.getContext('2d')!.drawImage(
      im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, size, size
    );
    cb(c.toDataURL('image/jpeg', size > 300 ? 0.75 : 0.6));
  };
  im.onerror = () => cb('');
  im.src = dataUrl;
}

function renderHistory(): void {
  const box = $('histList');
  if (!box) return;

  const list = loadScans();
  if (list.length === 0) {
    box.innerHTML = '<p class="empty">এখনো কোনো স্ক্যান নেই।<br>পাতার ছবি তুললে এখানে জমা হবে।</p>';
    return;
  }

  box.innerHTML = '';
  list.forEach((s, idx) => {
    const d = getDisease(s.key as DiseaseKey);
    const card = document.createElement('div');
    card.className = 'scan';

    const rows: string[] = [];
    rows.push(`<div class="scan__row"><span>নিশ্চয়তা</span><b>${toBn(Math.round(s.conf * 100))}%</b></div>`);
    rows.push(`<div class="scan__row"><span>তারিখ</span><b>${dateBn(s.at)}</b></div>`);
    rows.push(`<div class="scan__row"><span>সময়</span><b>${timeBn(s.at)}</b></div>`);
    if (s.temp !== undefined)
      rows.push(`<div class="scan__row"><span>আবহাওয়া</span><b>${toBn(Math.round(s.temp))}° সে${s.spray ? ' · ' + s.spray : ''}</b></div>`);
    if (s.lat !== undefined && s.lon !== undefined)
      rows.push(`<div class="scan__row"><span>অবস্থান</span><b>${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</b></div>`);
    rows.push(`<div class="scan__row"><span>ছবির উৎস</span><b>${s.source === 'gallery' ? 'গ্যালারি' : 'ক্যামেরা'}</b></div>`);
    rows.push(`<div class="scan__row"><span>কৃষক নিশ্চিত করেছেন</span><b>${s.confirmed ? 'হ্যাঁ' : 'না'}</b></div>`);

    card.innerHTML = `
      <img class="scan__img" src="${s.full || s.thumb}" alt="">
      <div class="scan__body">
        <div class="scan__title">${d ? d.bn : 'অজানা'}</div>
        <div class="scan__en">${d ? d.en : ''}</div>
        ${rows.join('')}
      </div>`;

    /* ছবিতে চাপ দিলে বড় করে দেখাও */
    const img = card.querySelector('.scan__img') as HTMLImageElement;
    img.addEventListener('click', () => img.classList.toggle('scan__img--big'));

    box.appendChild(card);
  });
}

function dateBn(ms: number): string {
  const d = new Date(ms);
  const mon = ['জানু','ফেব','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্ট','অক্টো','নভে','ডিসে'];
  return toBn(d.getDate()) + ' ' + mon[d.getMonth()] + ' ' + toBn(d.getFullYear());
}

function timeBn(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const ampm = h < 12 ? 'সকাল' : h < 16 ? 'দুপুর' : h < 19 ? 'বিকাল' : 'রাত';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, '0').split('').map(c => toBn(Number(c))).join('');
  return ampm + ' ' + toBn(h12) + ':' + mm;
}
/* সব স্ক্যান JSON হিসেবে নামাও — পরে মডেল উন্নত করতে কাজে লাগবে */
function exportScans(): void {
  const list = loadScans().map(s => ({ ...s, thumb: undefined, full: undefined }));
  if (list.length === 0) { alert('রপ্তানি করার মতো কিছু নেই।'); return; }

  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'okra_scans_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);  // আগে মুছলে কিছু ফোনে ডাউনলোড হয় না
}
document.addEventListener('DOMContentLoaded', () => void init());
