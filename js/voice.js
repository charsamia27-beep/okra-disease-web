/* =========================================================
   বাংলা ভয়েস — কথা বলা (TTS) ও কথা শোনা (STT)

   নীতি: এক-চাপ, এক-কথা।
   মাইক কখনো নিজে থেকে চালু থাকে না। ব্যবহারকারী চাপলে
   একবার শোনে, উত্তর দেয়, তারপর নিজেই বন্ধ হয়ে যায়।

   কারণ: অবিরাম শোনার মোডে মাঠের বাতাস, গরুর ডাক, পাশের
   লোকের কথা — সবই কমান্ড হিসেবে ঢুকে পড়ত।

   গুরুত্বপূর্ণ: TTS চলাকালে STT বন্ধ থাকে,
   নাহলে অ্যাপ নিজের কথা শুনে লুপে পড়ে যায়।
   ========================================================= */
function getSRCtor() {
    const w = window;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
/* কত সেকেন্ড চুপ থাকলে মাইক ছেড়ে দেবে */
const LISTEN_TIMEOUT_MS = 7000;
let enabled = true;
let state = 'idle';
let rec = null;
let active = false; // এই মুহূর্তে শুনছে কি না
let gotResult = false; // এই দফায় কিছু শোনা গেছে কি না
let timeoutId = 0;
let bnVoice = null;
let onStateChange = null;
let onCommand = null;
export function setVoiceEnabled(v) {
    enabled = v;
    if (!v) {
        stopSpeaking();
        stopListening();
    }
}
export function isVoiceEnabled() { return enabled; }
export function getState() { return state; }
export function onVoiceState(fn) { onStateChange = fn; }
export function onVoiceCommand(fn) { onCommand = fn; }
function setState(s) {
    state = s;
    onStateChange?.(s);
}
/* ================= সমর্থন ================= */
export function canSpeak() { return 'speechSynthesis' in window; }
export function canListen() { return getSRCtor() !== null; }
/* ================= কথা বলা ================= */
function pickBanglaVoice() {
    if (!canSpeak())
        return;
    const all = speechSynthesis.getVoices();
    bnVoice = all.find(v => v.lang === 'bn-BD')
        ?? all.find(v => v.lang === 'bn-IN')
        ?? all.find(v => v.lang.toLowerCase().startsWith('bn'))
        ?? null;
}
export function initVoices() {
    if (!canSpeak())
        return;
    pickBanglaVoice();
    speechSynthesis.onvoiceschanged = () => pickBanglaVoice();
}
export function hasBanglaVoice() { return bnVoice !== null; }
export function speak(text, onDone) {
    if (!enabled || !canSpeak() || !text.trim()) {
        onDone?.();
        return;
    }
    /* নিজের কথা যেন নিজে না শোনে।
       এক-চাপ-এক-কথা মোডে বলা শেষে মাইক আর নিজে থেকে ফিরবে না —
       ব্যবহারকারী আবার চাপলে তবেই শুনবে। */
    stopListening();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'bn-BD';
    u.rate = 0.92;
    u.pitch = 1;
    if (bnVoice)
        u.voice = bnVoice;
    const finish = () => {
        setState('idle');
        onDone?.();
    };
    u.onend = finish;
    u.onerror = finish;
    setState('speaking');
    speechSynthesis.speak(u);
}
export function stopSpeaking() {
    if (!canSpeak())
        return;
    speechSynthesis.cancel();
    if (state === 'speaking')
        setState('idle');
}
/* ================= কথা শোনা — এক দফা ================= */
function clearTimer() {
    if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = 0;
    }
}
/* একবার শোনো, উত্তর দাও, থেমে যাও */
export function listenOnce() {
    if (!enabled || !canListen())
        return;
    if (active)
        return; // ইতিমধ্যে শুনছে
    if (state === 'speaking')
        stopSpeaking(); // বলা থামিয়ে শোনো
    if (rec) {
        try {
            rec.abort();
        }
        catch { }
        rec = null;
    }
    const Ctor = getSRCtor();
    rec = new Ctor();
    rec.lang = 'bn-BD';
    rec.continuous = false; // এক দফা
    rec.interimResults = false;
    rec.maxAlternatives = 5; // ASR-এর কয়েকটা অনুমান পেলে মেলানো সহজ
    gotResult = false;
    rec.onresult = (e) => {
        const alts = e.results?.[0];
        if (!alts)
            return;
        gotResult = true;
        /* সব বিকল্প জমাও, তারপর সবচেয়ে ভালো মিল বেছে নাও */
        const heard = [];
        for (let i = 0; i < alts.length; i++) {
            const raw = String(alts[i].transcript || '').trim();
            if (raw)
                heard.push(raw);
        }
        lastHeard = heard[0] ?? '';
        const hit = bestMatch(heard);
        if (hit) {
            lastHeard = hit.raw;
            finishListening();
            onCommand?.(hit.cmd, hit.raw);
        }
        else {
            finishListening();
            onCommand?.('unknown', heard[0] ?? '');
        }
    };
    rec.onerror = (e) => {
        const err = e?.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') {
            finishListening();
            onCommand?.('denied', '');
            return;
        }
        /* no-speech / audio-capture / network — চুপ করে থাকা যাবে না,
           ব্যবহারকারী যেন বোঝে কিছু একটা হয়েছে */
        if (err === 'no-speech') {
            gotResult = false; // onend ফলব্যাক জানাবে
            return;
        }
        if (err === 'network') {
            finishListening();
            onCommand?.('offline', '');
            return;
        }
    };
    rec.onend = () => {
        const had = gotResult;
        finishListening();
        /* কিছুই শোনা যায়নি — তবুও নীরব থাকা নয় */
        if (!had)
            onCommand?.('unknown', '');
    };
    try {
        rec.start();
        active = true;
        setState('listening');
        clearTimer();
        timeoutId = window.setTimeout(() => {
            if (active && rec) {
                try {
                    rec.abort();
                }
                catch { }
            }
        }, LISTEN_TIMEOUT_MS);
    }
    catch {
        /* ইতিমধ্যে চালু — উপেক্ষা করো */
        finishListening();
    }
}
function finishListening() {
    clearTimer();
    active = false;
    if (state === 'listening')
        setState('idle');
}
/* পুরনো নাম — এখন এক দফাই চালায় */
export function startListening() { listenOnce(); }
export function stopListening() {
    clearTimer();
    if (rec) {
        try {
            rec.abort();
        }
        catch { }
    }
    active = false;
    if (state === 'listening')
        setState('idle');
}
export function toggleListening() {
    if (active)
        stopListening();
    else
        listenOnce();
}
export function isListening() { return active; }
const PATTERNS = [
    { cmd: 'read', words: ['আবার বলো', 'আবার বলুন', 'পড়ে শোনাও', 'পড়ো', 'পড়ুন', 'পড়', 'শোনাও', 'শোনান', 'শুনতে', 'শুনাও', 'বলো', 'বলুন', 'বল'] },
    { cmd: 'capture', words: ['ছবি তোলো', 'ছবি তোল', 'ছবি তুলুন', 'ছবি তুলো', 'ছবি তুল', 'ছবি নাও', 'তোলো', 'তুলুন', 'তুলো', 'ক্যামেরা', 'ছবি'] },
    { cmd: 'again', words: ['আরেকটা ছবি', 'আরেকটি ছবি', 'নতুন ছবি', 'আবার তুলুন', 'আরেকটা', 'আরেকটি', 'আবার', 'নতুন'] },
    { cmd: 'stop', words: ['থামো', 'থামুন', 'থাম', 'বন্ধ করো', 'বন্ধ', 'চুপ'] },
    { cmd: 'gallery', words: ['গ্যালারি', 'গ্যালারী', 'গ্যালারি থেকে', 'ছবি বাছাই', 'ফোল্ডার'] },
    { cmd: 'help', words: ['সাহায্য', 'হেল্প', 'কী করবো', 'কি করবো', 'কীভাবে', 'কিভাবে', 'বুঝছি না'] },
    { cmd: 'officer', words: ['কৃষি অফিসার', 'অফিসার', 'নম্বর', 'ফোন', 'কল সেন্টার'] },
    { cmd: 'home', words: ['হোম', 'বাড়ি', 'প্রথম পাতা', 'শুরু', 'ফিরে'] },
    { cmd: 'yes', words: ['হ্যাঁ', 'হ্যা', 'হা', 'হুম', 'জি', 'ঠিক আছে', 'ঠিক', 'এমনই', 'মিলে যায়', 'মিলেছে'] },
    { cmd: 'no', words: ['মিলে না', 'মেলে না', 'আলাদা', 'নাহ', 'না'] }
];
/* শেষ যা শোনা গেছে — ডিবাগের জন্য */
let lastHeard = '';
export function getLastHeard() { return lastHeard; }
/* যেসব ছোট শব্দে আন্দাজ করা বিপজ্জনক — হুবহু মিলতে হবে।
   "না" আর "হ্যাঁ" ভুল করে মিললে কৃষক ভুল রোগ নিশ্চিত করে ফেলবে। */
const EXACT_ONLY_MAX_LEN = 3;
function normalize(s) {
    return s
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // অদৃশ্য অক্ষর
        .replace(/[।,.!?;:'"()\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
}
/* সম্পাদনা দূরত্ব — ASR এক-দুই অক্ষর এদিক-ওদিক করলে ধরার জন্য */
function editDistance(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap)
        return cap + 1;
    let prev = new Array(b.length + 1);
    let cur = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++)
        prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        cur[0] = i;
        let rowMin = cur[0];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
            if (cur[j] < rowMin)
                rowMin = cur[j];
        }
        if (rowMin > cap)
            return cap + 1; // আর দেখে লাভ নেই
        const t = prev;
        prev = cur;
        cur = t;
    }
    return prev[b.length];
}
/* এক ধাপ: হুবহু অংশ মিল। দীর্ঘতম শব্দ আগে, যেন
   "আবার বলো" আগে "আবার" এর সাথে না মেলে। */
function exactMatch(raw) {
    const tokens = raw.split(' ').filter(Boolean);
    let best = null;
    for (const p of PATTERNS) {
        for (const w of p.words) {
            /* ছোট শব্দ আস্ত শব্দ হিসেবেই মিলতে হবে।
               নইলে "নাকি" এর ভেতরের "না" ধরা পড়ে যায় —
               আর নিশ্চিতকরণের পর্দায় সেটা ভুল রোগ নিশ্চিত করে দেয়। */
            const hit = w.length <= EXACT_ONLY_MAX_LEN
                ? tokens.includes(w)
                : raw.includes(w);
            if (hit && (!best || w.length > best.len)) {
                best = { cmd: p.cmd, len: w.length };
            }
        }
    }
    return best;
}
/* দুই ধাপ: কাছাকাছি মিল। শব্দ ধরে ধরে দূরত্ব মাপা।
   ছোট শব্দে (হ্যাঁ / না) কখনো আন্দাজ নয়। */
function fuzzyMatch(raw) {
    const tokens = raw.split(' ').filter(Boolean);
    if (tokens.length === 0)
        return null;
    let best = null;
    for (const p of PATTERNS) {
        for (const w of p.words) {
            if (w.length <= EXACT_ONLY_MAX_LEN)
                continue; // ছোট শব্দ বাদ
            if (w.includes(' '))
                continue; // বহু-শব্দ আগেই দেখা হয়েছে
            const cap = w.length <= 5 ? 1 : 2;
            for (const t of tokens) {
                const d = editDistance(t, w, cap);
                if (d > cap)
                    continue;
                if (!best || d < best.dist || (d === best.dist && w.length > best.len)) {
                    best = { cmd: p.cmd, len: w.length, dist: d };
                }
            }
        }
    }
    return best ? { cmd: best.cmd, len: best.len } : null;
}
export function matchCommand(rawInput) {
    const raw = normalize(rawInput);
    if (!raw)
        return null;
    return (exactMatch(raw) ?? fuzzyMatch(raw))?.cmd ?? null;
}
/* ASR-এর সবগুলো অনুমান দেখে সবচেয়ে ভালো মিল।
   প্রথম অনুমান ভুল হলেও দ্বিতীয়টা প্রায়ই ঠিক থাকে। */
function bestMatch(candidates) {
    let best = null;
    // আগে সব অনুমানে হুবহু মিল খোঁজো
    for (const c of candidates) {
        const hit = exactMatch(normalize(c));
        if (hit && (!best || hit.len > best.len)) {
            best = { cmd: hit.cmd, raw: c, len: hit.len };
        }
    }
    if (best)
        return { cmd: best.cmd, raw: best.raw };
    // না পেলে তবেই কাছাকাছি মিল
    for (const c of candidates) {
        const hit = fuzzyMatch(normalize(c));
        if (hit && (!best || hit.len > best.len)) {
            best = { cmd: hit.cmd, raw: c, len: hit.len };
        }
    }
    return best ? { cmd: best.cmd, raw: best.raw } : null;
}
