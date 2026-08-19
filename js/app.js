/* =========================================================
   ধাপ ২ — স্ক্রিন সুইচিং + ক্যামেরা সংযোগ
   ========================================================= */
import { startCamera, stopCamera, captureFrame, readFile, hasTorch, toggleTorch, cameraErrorMessage, isRunning } from './camera.js';
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
    // ধাপ ৩ এ এখানে মডেল বসবে
    $('btnUsePhoto')?.addEventListener('click', () => {
        alert('ছবি গৃহীত। মডেল সংযোজন ধাপ ৩ ও ৫ এ আসছে।');
    });
}
/* ---------------- ভয়েস টগল (ধাপ ৪ এ কাজ করবে) ---------------- */
let voiceEnabled = true;
function wireVoice() {
    const btn = $('voiceToggle');
    if (!btn)
        return;
    btn.classList.add('is-on');
    btn.addEventListener('click', () => {
        voiceEnabled = !voiceEnabled;
        btn.classList.toggle('is-on', voiceEnabled);
        btn.classList.toggle('is-off', !voiceEnabled);
    });
}
function fillWeatherPlaceholder() {
    const t = $('wTemp');
    const s = $('wSpray');
    if (t)
        t.textContent = '২৬° সে';
    if (s)
        s.textContent = 'উপযুক্ত';
}
/* ---------------- চালু ---------------- */
function init() {
    wire();
    wireVoice();
    fillWeatherPlaceholder();
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
document.addEventListener('DOMContentLoaded', init);
