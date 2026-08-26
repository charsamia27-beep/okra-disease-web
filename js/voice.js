/* =========================================================
   বাংলা ভয়েস — কথা বলা (TTS) ও কথা শোনা (STT)

   গুরুত্বপূর্ণ: TTS চলাকালে STT বন্ধ রাখতে হয়,
   নাহলে অ্যাপ নিজের কথা শুনে লুপে পড়ে যায়।
   ========================================================= */
function getSRCtor() {
    const w = window;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
let enabled = true;
let state = 'idle';
let rec = null;
let wantListening = false; // ব্যবহারকারী শোনা চালু রাখতে চান কি না
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
    // নিজের কথা যেন নিজে না শোনে
    const wasListening = wantListening;
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
        if (wasListening)
            startListening(); // আগে শুনছিল, আবার শুরু করো
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
/* ================= কথা শোনা ================= */
export function startListening() {
    if (!enabled || !canListen())
        return;
    if (state === 'speaking')
        return; // বলার সময় শোনা নয়
    wantListening = true;
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
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
        const results = e.results?.[0];
        if (!results)
            return;
        // কয়েকটি সম্ভাবনার যেকোনো একটি মিললেই চলবে
        for (let i = 0; i < results.length; i++) {
            const raw = String(results[i].transcript || '').trim();
            const cmd = matchCommand(raw);
            if (cmd) {
                onCommand?.(cmd, raw);
                return;
            }
        }
        const first = String(results[0].transcript || '').trim();
        onCommand?.('unknown', first);
    };
    rec.onerror = (e) => {
        const err = e?.error;
        // no-speech / aborted স্বাভাবিক, চুপচাপ আবার শুরু হবে
        if (err === 'not-allowed' || err === 'service-not-allowed') {
            wantListening = false;
            setState('idle');
        }
    };
    rec.onend = () => {
        setState('idle');
        // ব্যবহারকারী বন্ধ না করলে আবার শোনা শুরু
        if (wantListening && enabled && state !== 'speaking') {
            setTimeout(() => { if (wantListening)
                safeStart(); }, 350);
        }
    };
    safeStart();
}
function safeStart() {
    if (!rec)
        return;
    try {
        rec.start();
        setState('listening');
    }
    catch {
        // ইতিমধ্যে চালু থাকলে উপেক্ষা করো
    }
}
export function stopListening() {
    wantListening = false;
    if (rec) {
        try {
            rec.abort();
        }
        catch { }
    }
    if (state === 'listening')
        setState('idle');
}
export function toggleListening() {
    if (wantListening)
        stopListening();
    else
        startListening();
}
export function isListening() { return wantListening; }
const PATTERNS = [
    { cmd: 'capture', words: ['ছবি তোলো', 'ছবি তোল', 'ছবি তুলুন', 'ছবি তুলো', 'তোলো', 'তুলুন', 'ছবি', 'ক্যামেরা'] },
    { cmd: 'again', words: ['আবার', 'আরেকটা', 'আরেকটি', 'নতুন ছবি', 'নতুন'] },
    { cmd: 'read', words: ['পড়ো', 'পড়ুন', 'শোনাও', 'শোনান', 'বলো', 'বলুন', 'আবার বলো'] },
    { cmd: 'stop', words: ['থামো', 'থামুন', 'বন্ধ', 'চুপ'] },
    { cmd: 'gallery', words: ['গ্যালারি', 'গ্যালারী', 'ছবি বাছাই'] },
    { cmd: 'help', words: ['সাহায্য', 'হেল্প', 'কী করবো', 'কি করবো', 'কীভাবে'] },
    { cmd: 'officer', words: ['অফিসার', 'কৃষি অফিসার', 'নম্বর', 'ফোন'] },
    { cmd: 'home', words: ['হোম', 'বাড়ি', 'প্রথম', 'শুরু'] },
    { cmd: 'yes', words: ['হ্যাঁ', 'হা', 'হুম', 'ঠিক', 'এমনই', 'মিলে'] },
    { cmd: 'no', words: ['না', 'নাহ', 'আলাদা', 'মিলে না'] }
];
export function matchCommand(rawInput) {
    const raw = rawInput.replace(/[।,.!?]/g, ' ').toLowerCase().trim();
    if (!raw)
        return null;
    // দীর্ঘতম মিল আগে দেখো, যেন "আবার বলো" আগে "আবার" এর সাথে না মেলে
    let best = null;
    for (const p of PATTERNS) {
        for (const w of p.words) {
            if (raw.includes(w) && (!best || w.length > best.len)) {
                best = { cmd: p.cmd, len: w.length };
            }
        }
    }
    return best?.cmd ?? null;
}
