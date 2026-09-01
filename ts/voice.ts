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

/* ব্রাউজারের টাইপ ডেফিনিশনে SpeechRecognition এখনো নেই */
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror:  ((e: any) => void) | null;
  onend:    (() => void) | null;
}

type SRCtor = new () => SpeechRecognitionLike;

function getSRCtor(): SRCtor | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/* ================= অবস্থা ================= */

export type VoiceState = 'idle' | 'listening' | 'speaking';

/* কত সেকেন্ড চুপ থাকলে মাইক ছেড়ে দেবে */
const LISTEN_TIMEOUT_MS = 7000;

let enabled   = true;
let state: VoiceState = 'idle';
let rec: SpeechRecognitionLike | null = null;
let active = false;                 // এই মুহূর্তে শুনছে কি না
let gotResult = false;              // এই দফায় কিছু শোনা গেছে কি না
let timeoutId = 0;
let bnVoice: SpeechSynthesisVoice | null = null;

let onStateChange: ((s: VoiceState) => void) | null = null;
let onCommand: ((cmd: Command, raw: string) => void) | null = null;

export function setVoiceEnabled(v: boolean): void {
  enabled = v;
  if (!v) { stopSpeaking(); stopListening(); }
}
export function isVoiceEnabled(): boolean { return enabled; }
export function getState(): VoiceState { return state; }

export function onVoiceState(fn: (s: VoiceState) => void): void { onStateChange = fn; }
export function onVoiceCommand(fn: (cmd: Command, raw: string) => void): void { onCommand = fn; }

function setState(s: VoiceState): void {
  state = s;
  onStateChange?.(s);
}

/* ================= সমর্থন ================= */

export function canSpeak(): boolean  { return 'speechSynthesis' in window; }
export function canListen(): boolean { return getSRCtor() !== null; }

/* ================= কথা বলা ================= */

function pickBanglaVoice(): void {
  if (!canSpeak()) return;
  const all = speechSynthesis.getVoices();
  bnVoice = all.find(v => v.lang === 'bn-BD')
         ?? all.find(v => v.lang === 'bn-IN')
         ?? all.find(v => v.lang.toLowerCase().startsWith('bn'))
         ?? null;
}

export function initVoices(): void {
  if (!canSpeak()) return;
  pickBanglaVoice();
  speechSynthesis.onvoiceschanged = () => pickBanglaVoice();
}

export function hasBanglaVoice(): boolean { return bnVoice !== null; }

export function speak(text: string, onDone?: () => void): void {
  if (!enabled || !canSpeak() || !text.trim()) { onDone?.(); return; }

  /* নিজের কথা যেন নিজে না শোনে।
     এক-চাপ-এক-কথা মোডে বলা শেষে মাইক আর নিজে থেকে ফিরবে না —
     ব্যবহারকারী আবার চাপলে তবেই শুনবে। */
  stopListening();

  speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'bn-BD';
  u.rate = 0.92;
  u.pitch = 1;
  if (bnVoice) u.voice = bnVoice;

  const finish = () => {
    setState('idle');
    onDone?.();
  };

  u.onend   = finish;
  u.onerror = finish;

  setState('speaking');
  speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  if (state === 'speaking') setState('idle');
}

/* ================= কথা শোনা — এক দফা ================= */

function clearTimer(): void {
  if (timeoutId) { window.clearTimeout(timeoutId); timeoutId = 0; }
}

/* একবার শোনো, উত্তর দাও, থেমে যাও */
export function listenOnce(): void {
  if (!enabled || !canListen()) return;
  if (active) return;                   // ইতিমধ্যে শুনছে
  if (state === 'speaking') stopSpeaking();   // বলা থামিয়ে শোনো

  if (rec) { try { rec.abort(); } catch {} rec = null; }

  const Ctor = getSRCtor()!;
  rec = new Ctor();
  rec.lang = 'bn-BD';
  rec.continuous = false;               // এক দফা
  rec.interimResults = false;
  rec.maxAlternatives = 5;              // ASR-এর কয়েকটা অনুমান পেলে মেলানো সহজ

  gotResult = false;

  rec.onresult = (e: any) => {
    const alts = e.results?.[0];
    if (!alts) return;

    gotResult = true;

    /* সব বিকল্প জমাও, তারপর সবচেয়ে ভালো মিল বেছে নাও */
    const heard: string[] = [];
        for (let i = 0; i < alts.length; i++) {
      const raw = String(alts[i].transcript || '').trim();
      const conf = alts[i].confidence ?? 1;
      if (raw && conf > 0.35) heard.push(raw);   // কম আত্মবিশ্বাসে বিশ্বাস নয়
    }

    lastHeard = heard[0] ?? '';

    const hit = bestMatch(heard);
    if (hit) {
      lastHeard = hit.raw;
      finishListening();
      onCommand?.(hit.cmd, hit.raw);
    } else {
      finishListening();
      onCommand?.('unknown', heard[0] ?? '');
    }
  };

  rec.onerror = (e: any) => {
    const err = e?.error;

    if (err === 'not-allowed' || err === 'service-not-allowed') {
      finishListening();
      onCommand?.('denied', '');
      return;
    }

    /* no-speech / audio-capture / network — চুপ করে থাকা যাবে না,
       ব্যবহারকারী যেন বোঝে কিছু একটা হয়েছে */
    if (err === 'no-speech') {
      gotResult = false;   // onend ফলব্যাক জানাবে
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
    if (!had) onCommand?.('unknown', '');
  };

  try {
    rec.start();
    active = true;
    setState('listening');

    clearTimer();
    timeoutId = window.setTimeout(() => {
      if (active && rec) { try { rec.abort(); } catch {} }
    }, LISTEN_TIMEOUT_MS);
  } catch {
    /* ইতিমধ্যে চালু — উপেক্ষা করো */
    finishListening();
  }
}

function finishListening(): void {
  clearTimer();
  active = false;
  if (state === 'listening') setState('idle');
}

/* পুরনো নাম — এখন এক দফাই চালায় */
export function startListening(): void { listenOnce(); }

export function stopListening(): void {
  clearTimer();
  if (rec) { try { rec.abort(); } catch {} }
  active = false;
  if (state === 'listening') setState('idle');
}

export function toggleListening(): void {
  if (active) stopListening();
  else listenOnce();
}

export function isListening(): boolean { return active; }

/* ================= কমান্ড মেলানো ================= */

export type Command =
  | 'capture' | 'again' | 'read' | 'stop'
  | 'gallery' | 'help' | 'officer' | 'home'
  | 'yes' | 'no'
  | 'unknown' | 'denied' | 'offline';

const PATTERNS: Array<{ cmd: Command; words: string[] }> = [
  { cmd: 'read',    words: ['আবার বলো', 'আবার বলুন', 'পড়ে শোনাও', 'পড়ে শোনান', 'পড়ুন', 'শোনাও', 'শোনান'] },
  { cmd: 'capture', words: ['ছবি তোলো', 'ছবি তোল', 'ছবি তুলুন', 'ছবি তুলো', 'ছবি তুল', 'ছবি নাও', 'ক্যামেরা চালু'] },
  { cmd: 'again',   words: ['আরেকটা ছবি', 'আরেকটি ছবি', 'নতুন ছবি', 'আবার তুলুন', 'আবার তোলো'] },
  { cmd: 'stop',    words: ['থামো', 'থামুন', 'বন্ধ করো', 'চুপ করো'] },
  { cmd: 'gallery', words: ['গ্যালারি', 'গ্যালারী', 'গ্যালারি থেকে'] },
  { cmd: 'help',    words: ['সাহায্য', 'হেল্প', 'কী করবো', 'কি করবো', 'বুঝছি না'] },
  { cmd: 'officer', words: ['কৃষি অফিসার', 'অফিসারকে', 'কল সেন্টার'] },
  { cmd: 'home',    words: ['প্রথম পাতা', 'হোমে যাও', 'শুরুতে যাও'] },
  { cmd: 'yes',     words: ['হ্যাঁ', 'হ্যা', 'হা', 'হুম', 'জি', 'ঠিক আছে', 'এমনই', 'মিলে যায়', 'মিলেছে'] },
  { cmd: 'no',      words: ['মিলে না', 'মেলে না', 'আলাদা', 'নাহ', 'না'] }
];

/* শেষ যা শোনা গেছে — ডিবাগের জন্য */
let lastHeard = '';
export function getLastHeard(): string { return lastHeard; }

/* যেসব ছোট শব্দে আন্দাজ করা বিপজ্জনক — হুবহু মিলতে হবে।
   "না" আর "হ্যাঁ" ভুল করে মিললে কৃষক ভুল রোগ নিশ্চিত করে ফেলবে। */
const EXACT_ONLY_MAX_LEN = 3;

function normalize(s: string): string {
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, '')   // অদৃশ্য অক্ষর
    .replace(/[।,.!?;:'"()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/* সম্পাদনা দূরত্ব — ASR এক-দুই অক্ষর এদিক-ওদিক করলে ধরার জন্য */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  let prev = new Array<number>(b.length + 1);
  let cur  = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > cap) return cap + 1;   // আর দেখে লাভ নেই
    const t = prev; prev = cur; cur = t;
  }
  return prev[b.length];
}

/* এক ধাপ: হুবহু অংশ মিল। দীর্ঘতম শব্দ আগে, যেন
   "আবার বলো" আগে "আবার" এর সাথে না মেলে। */
function exactMatch(raw: string): { cmd: Command; len: number } | null {
  const tokens = raw.split(' ').filter(Boolean);
  let best: { cmd: Command; len: number } | null = null;

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
    /* শোনা কথার তুলনায় মিলটা যেন খুব ছোট না হয়।
     ফ্যানের শব্দে লম্বা আবর্জনা এলে তার ভেতরে দুই অক্ষর
     মিলে গেলেই কমান্ড ধরে নেওয়া চলবে না। */
  if (best && raw.length > 0 && best.len / raw.length < 0.4) return null;
  return best;
}

/* দুই ধাপ: কাছাকাছি মিল। শব্দ ধরে ধরে দূরত্ব মাপা।
   ছোট শব্দে (হ্যাঁ / না) কখনো আন্দাজ নয়। */
function fuzzyMatch(raw: string): { cmd: Command; len: number } | null {
  const tokens = raw.split(' ').filter(Boolean);
  if (tokens.length === 0) return null;

  let best: { cmd: Command; len: number; dist: number } | null = null;

  for (const p of PATTERNS) {
    for (const w of p.words) {
      if (w.length <= 5) continue;   // ছোট শব্দ বাদ
      if (w.includes(' ')) continue;                  // বহু-শব্দ আগেই দেখা হয়েছে

      const cap = 1;

      for (const t of tokens) {
        const d = editDistance(t, w, cap);
        if (d > cap) continue;
        if (!best || d < best.dist || (d === best.dist && w.length > best.len)) {
          best = { cmd: p.cmd, len: w.length, dist: d };
        }
      }
    }
  }

  return best ? { cmd: best.cmd, len: best.len } : null;
}

export function matchCommand(rawInput: string): Command | null {
  const raw = normalize(rawInput);
  if (!raw) return null;
  return (exactMatch(raw) ?? fuzzyMatch(raw))?.cmd ?? null;
}

/* ASR-এর সবগুলো অনুমান দেখে সবচেয়ে ভালো মিল।
   প্রথম অনুমান ভুল হলেও দ্বিতীয়টা প্রায়ই ঠিক থাকে। */
function bestMatch(candidates: string[]): { cmd: Command; raw: string } | null {
  let best: { cmd: Command; raw: string; len: number } | null = null;

  // আগে সব অনুমানে হুবহু মিল খোঁজো
  for (const c of candidates) {
    const hit = exactMatch(normalize(c));
    if (hit && (!best || hit.len > best.len)) {
      best = { cmd: hit.cmd, raw: c, len: hit.len };
    }
  }
  if (best) return { cmd: best.cmd, raw: best.raw };

  // না পেলে তবেই কাছাকাছি মিল
  for (const c of candidates) {
    const hit = fuzzyMatch(normalize(c));
    if (hit && (!best || hit.len > best.len)) {
      best = { cmd: hit.cmd, raw: c, len: hit.len };
    }
  }
  return best ? { cmd: best.cmd, raw: best.raw } : null;
}
