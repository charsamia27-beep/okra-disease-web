/* =========================================================
   ধাপ ২ — স্ক্রিন সুইচিং + ক্যামেরা সংযোগ
   ========================================================= */
import { startCamera, stopCamera, captureFrame, readFile, hasTorch, toggleTorch, cameraErrorMessage, isRunning } from './camera.js';
import { predict, decide, nextCandidate, loadModel } from './predict.js';
import { loadTreatments, getDisease, renderResult, toBn } from './result.js';
import { initVoices, speak, stopSpeaking, canSpeak, canListen, toggleListening, isListening, setVoiceEnabled, isVoiceEnabled, onVoiceState, onVoiceCommand } from './voice.js';
const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
/* সর্বশেষ তোলা ছবি — ধাপ ৩ এ মডেলে যাবে */
let lastShot = null;
/* ---------------- স্ক্রিন বদল ---------------- */
async function goTo(name) {
    // প্রিভিউতে ক্যামেরা চালু রাখো — 'আবার তুলুন' তাহলে সাথে সাথে কাজ করে।
    // বাকি স্ক্রিনে বন্ধ, নাহলে ব্যাটারি খায় ও বাতি জ্বলে থাকে।
    if (name !== 'camera' && name !== 'preview') {
        stopCamera($('camVideo') ?? undefined);
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
    $$('.nav__item').forEach(i => i.classList.toggle('is-active', i.dataset.go === name));
    window.scrollTo(0, 0);
    if (name === 'camera')
        await openCamera();
}
/* ---------------- ক্যামেরা ---------------- */
let camToken = 0;
async function openCamera() {
    const video = $('camVideo');
    const err = $('camError');
    const torch = $('btnTorch');
    const loading = $('camLoading');
    const shutter = $('btnShutter');
    if (!video)
        return;
    const myToken = ++camToken;
    err?.classList.add('hidden');
    // আগে থেকেই চললে লোডিং দেখানোর দরকার নেই
    if (!isRunning())
        loading?.classList.remove('hidden');
    if (shutter)
        shutter.disabled = true;
    try {
        await startCamera(video);
        // এর মধ্যে ব্যবহারকারী অন্য স্ক্রিনে চলে গেলে কিছু কোরো না
        if (myToken !== camToken)
            return;
        loading?.classList.add('hidden');
        torch?.classList.toggle('hidden', !hasTorch());
        if (shutter)
            shutter.disabled = false;
    }
    catch (e) {
        if (myToken !== camToken)
            return;
        loading?.classList.add('hidden');
        const msg = $('camErrorText');
        if (msg)
            msg.textContent = cameraErrorMessage(e);
        err?.classList.remove('hidden');
        torch?.classList.add('hidden');
        if (shutter)
            shutter.disabled = true; // ক্যামেরা নেই, শাটার নিষ্ক্রিয়
    }
}
async function onShutter() {
    const video = $('camVideo');
    if (!video)
        return;
    if (!isRunning())
        return;
    try {
        lastShot = await captureFrame(video);
        showPreview(lastShot.dataUrl);
    }
    catch {
        alert('ছবি তোলা যায়নি। আবার চেষ্টা করুন।');
    }
}
async function onPickFile(file) {
    if (!file)
        return;
    try {
        lastShot = await readFile(file);
        showPreview(lastShot.dataUrl);
    }
    catch {
        alert('ছবিটি পড়া যায়নি। অন্য ছবি বেছে নিন।');
    }
}
function showPreview(dataUrl) {
    const img = $('previewImg');
    if (img)
        img.src = dataUrl;
    void goTo('preview');
}
/* ---------------- বোতাম সংযোগ ---------------- */
function wire() {
    $$('[data-go]').forEach(el => el.addEventListener('click', () => void goTo(el.dataset.go)));
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
    const fileInput = $('fileInput');
    $('btnGallery')?.addEventListener('click', () => fileInput?.click());
    $('btnGalleryHome')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', e => {
        const f = e.target.files?.[0];
        void onPickFile(f);
        e.target.value = '';
    });
    $('btnUsePhoto')?.addEventListener('click', () => void runAnalysis());
    $('btnAgain')?.addEventListener('click', () => void goTo('camera'));
    $('btnOfficer')?.addEventListener('click', showOfficer);
    $('btnSpeak')?.addEventListener('click', () => {
        if (!canSpeak()) {
            alert('এই ব্রাউজারে কথা বলার সুবিধা নেই।');
            return;
        }
        speak(spokenText);
    });
    $('btnConfirmYes')?.addEventListener('click', () => onConfirm('yes'));
    $('btnConfirmNo')?.addEventListener('click', () => onConfirm('no'));
    $('btnConfirmIdk')?.addEventListener('click', () => onConfirm('idk'));
}
/* ---------------- ভয়েস টগল (ধাপ ৪ এ কাজ করবে) ---------------- */
function wireVoice() {
    const btn = $('voiceToggle');
    if (!btn)
        return;
    initVoices();
    if (!canListen()) {
        // শোনা সম্ভব নয় — বোতাম শুধু বলা চালু/বন্ধ করবে
        btn.title = 'এই ব্রাউজারে কথা শোনা যায় না';
    }
    btn.classList.add('is-on');
    btn.addEventListener('click', () => {
        if (!isVoiceEnabled()) {
            setVoiceEnabled(true);
            btn.classList.remove('is-off');
            btn.classList.add('is-on');
            speak('ভয়েস চালু হয়েছে।');
            return;
        }
        if (canListen()) {
            toggleListening();
            if (!isListening()) {
                setVoiceEnabled(false);
                btn.classList.remove('is-on', 'is-listening');
                btn.classList.add('is-off');
            }
        }
        else {
            setVoiceEnabled(false);
            btn.classList.remove('is-on');
            btn.classList.add('is-off');
        }
    });
    onVoiceState(st => {
        btn.classList.toggle('is-listening', st === 'listening');
        btn.classList.toggle('is-speaking', st === 'speaking');
    });
    onVoiceCommand(handleCommand);
}
/* ---------------- ভয়েস কমান্ড ---------------- */
function currentScreen() {
    const names = ['camera', 'preview', 'analyzing', 'confirm', 'result', 'library', 'history', 'me', 'home'];
    for (const n of names) {
        if ($(`screen-${n}`) && !$(`screen-${n}`).classList.contains('hidden'))
            return n;
    }
    return 'home';
}
function handleCommand(cmd, raw) {
    const screen = currentScreen();
    switch (cmd) {
        case 'stop':
            stopSpeaking();
            return;
        case 'capture':
            if (screen === 'camera')
                void onShutter();
            else
                void goTo('camera');
            return;
        case 'again':
            void goTo('camera');
            return;
        case 'gallery':
            $('fileInput')?.click();
            return;
        case 'read':
            if (spokenText)
                speak(spokenText);
            else
                speak('এখন পড়ার মতো কিছু নেই।');
            return;
        case 'officer':
            speak('কৃষি কল সেন্টারের নম্বর ১৬১২৩। অথবা নিকটস্থ উপজেলা কৃষি অফিসে যান।');
            return;
        case 'home':
            void goTo('home');
            return;
        case 'help':
            speak('বলুন — ছবি তোলো, আবার, পড়ো, অথবা থামো।');
            return;
        case 'yes':
            if (screen === 'confirm')
                onConfirm('yes');
            else if (screen === 'preview')
                void runAnalysis();
            return;
        case 'no':
            if (screen === 'confirm')
                onConfirm('no');
            else if (screen === 'preview')
                void goTo('camera');
            return;
        default:
            speak('বুঝতে পারিনি। আবার বলুন।');
            return;
    }
}
function fillWeatherPlaceholder() {
    const t = $('wTemp');
    const s = $('wSpray');
    if (t)
        t.textContent = '২৬° সে';
    if (s)
        s.textContent = 'উপযুক্ত';
}
/* =========================================================
   বিশ্লেষণ ও ফলাফল
   ========================================================= */
let currentPrediction = null;
let currentVerdict = null;
let rejected = [];
let spokenText = '';
function targets() {
    return {
        name: $('rName'),
        nameEn: $('rNameEn'),
        fill: $('rFill'),
        pct: $('rPct'),
        banner: $('rBanner'),
        symptoms: $('rSymptoms'),
        actions: $('rAction'),
        chemical: $('rChem')
    };
}
async function runAnalysis() {
    if (!lastShot)
        return;
    rejected = [];
    await goTo('analyzing');
    const img = new Image();
    img.src = lastShot.dataUrl;
    await img.decode().catch(() => { });
    currentPrediction = await predict(img);
    currentVerdict = decide(currentPrediction);
    if (currentVerdict.kind === 'confirm') {
        showConfirm(currentVerdict.candidate);
    }
    else {
        showResult();
    }
}
/* ---------------- নিশ্চিতকরণ ---------------- */
function showConfirm(key) {
    const d = getDisease(key);
    if (!d || !lastShot) {
        showResult();
        return;
    }
    const mine = $('confirmMine');
    const ref = $('confirmRef');
    const q = $('confirmQ');
    const hint = $('confirmHint');
    if (mine)
        mine.src = lastShot.dataUrl;
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
    if (q)
        q.textContent = question;
    if (hint)
        hint.textContent = d.lookFor ?? 'দুটি ছবি মিলিয়ে দেখুন।';
    void goTo('confirm');
    if (isVoiceEnabled()) {
        setTimeout(() => speak(question + ' ' + (d.lookFor ?? '') + ' হ্যাঁ, না, নাকি বুঝতে পারছি না?'), 350);
    }
}
function onConfirm(answer) {
    if (!currentPrediction || !currentVerdict || currentVerdict.kind !== 'confirm')
        return;
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
    }
    else {
        currentVerdict = { kind: 'too_low', prediction: currentPrediction };
        showResult();
    }
}
/* ---------------- ফলাফল ---------------- */
function showResult(confirmedKey) {
    if (!currentVerdict)
        return;
    const img = $('resultImg');
    if (img && lastShot)
        img.src = lastShot.dataUrl;
    spokenText = renderResult(targets(), currentVerdict, confirmedKey);
    void goTo('result');
    if (isVoiceEnabled())
        setTimeout(() => speak(spokenText), 350);
}
function showOfficer() {
    const msg = 'কৃষি কল সেন্টার: ' + toBn(16123) + '। অথবা নিকটস্থ উপজেলা কৃষি অফিসে যান।';
    speak(msg);
    alert('উপজেলা কৃষি অফিসে যোগাযোগ করুন।\nকৃষি কল সেন্টার: ' + toBn(16123));
}
/* ---------------- চালু ---------------- */
async function init() {
    wire();
    wireVoice();
    fillWeatherPlaceholder();
    try {
        await loadTreatments();
        await loadModel();
    }
    catch {
        alert('রোগের তথ্য লোড করা যায়নি। ইন্টারনেট সংযোগ দেখুন।');
    }
    /* ট্যাব লুকালে ক্যামেরা ছেড়ে দাও, ফিরে এলে আবার ধরো।
       না ছাড়লে অন্য ট্যাব/অ্যাপ ক্যামেরা পায় না। */
    document.addEventListener('visibilitychange', () => {
        const onCam = !$('screen-camera')?.classList.contains('hidden');
        if (document.hidden) {
            stopCamera($('camVideo') ?? undefined);
        }
        else if (onCam) {
            void openCamera();
        }
    });
    /* ব্রাউজার ক্যাশ থেকে পেজ ফিরলে DOMContentLoaded চলে না */
    window.addEventListener('pageshow', ev => {
        if (!ev.persisted)
            return;
        const onCam = !$('screen-camera')?.classList.contains('hidden');
        if (onCam)
            void openCamera();
    });
    /* পেজ ছাড়ার আগে ক্যামেরা ছেড়ে দাও */
    window.addEventListener('pagehide', () => {
        stopCamera($('camVideo') ?? undefined);
    });
    console.log('✅ ধাপ ২ চালু হয়েছে');
}
document.addEventListener('DOMContentLoaded', () => void init());
