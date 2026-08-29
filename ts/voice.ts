/* =========================================================
   বাংলা ভয়েস — কথা বলা (TTS) ও কথা শোনা (STT)

   গুরুত্বপূর্ণ: TTS চলাকালে STT বন্ধ রাখতে হয়,
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

let enabled   = true;
let state: VoiceState = 'idle';
let rec: SpeechRecognitionLike | null = null;
let wantListening = false;          // ব্যবহারকারী শোনা চালু রাখতে চান কি না
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

  // নিজের কথা যেন নিজে না শোনে
  const wasListening = wantListening;
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
    if (wasListening) startListening();   // আগে শুনছিল, আবার শুরু করো
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

/* ================= কথা শোনা ================= */

export function startListening(): void {
  if (!enabled || !canListen()) return;
  if (state === 'speaking') return;      // বলার সময় শোনা নয়

  wantListening = true;

  if (rec) { try { rec.abort(); } catch {} rec = null; }

  const Ctor = getSRCtor()!;
  rec = new Ctor();
  rec.lang = 'bn-BD';
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 3;

  rec.onresult = (e: any) => {
    const results = e.results?.[0];
    if (!results) return;

    // কয়েকটি সম্ভাবনার যেকোনো একটি মিললেই চলবে
    const heard: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const raw = String(results[i].transcript || '').trim();
      if (raw) heard.push(raw);
      const cmd = matchCommand(raw);
      if (cmd) { lastHeard = raw; onCommand?.(cmd, raw); return; }
    }
    lastHeard = heard.join(' / ');
    onCommand?.('unknown', lastHeard);
  };

  rec.onerror = (e: any) => {
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
      setTimeout(() => { if (wantListening) safeStart(); }, 350);
    }
  };

  safeStart();
}

function safeStart(): void {
  if (!rec) return;
  try {
    rec.start();
    setState('listening');
  } catch {
    // ইতিমধ্যে চালু থাকলে উপেক্ষা করো
  }
}

export function stopListening(): void {
  wantListening = false;
  if (rec) { try { rec.abort(); } catch {} }
  if (state === 'listening') setState('idle');
}

export function toggleListening(): void {
  if (wantListening) stopListening();
  else startListening();
}

export function isListening(): boolean { return wantListening; }

/* ================= কমান্ড মেলানো ================= */

export type Command =
  | 'capture' | 'again' | 'read' | 'stop'
  | 'gallery' | 'help' | 'officer' | 'home'
  | 'yes' | 'no' | 'greet' | 'describe' | 'unknown';

const PATTERNS: Array<{ cmd: Command; words: string[] }> = [
  /* প্রতিটি তালিকায় প্রমিত + আঞ্চলিক রূপ রাখা হয়েছে */

  { cmd: 'read',    words: [
    'আবার বলো', 'আবার বলুন', 'পড়ে শোনাও', 'পড়ো', 'পড়ুন', 'পড়',
    'শোনাও', 'শোনান', 'শুনাও', 'শুনাইও', 'শুনাও তো',
    'বলো', 'বলুন', 'বল', 'কও', 'কন', 'ক', 'কইও', 'কইয়া দেন', 'কইয়া দাও'
  ]},

  { cmd: 'capture', words: [
    'ছবি তোলো', 'ছবি তোল', 'ছবি তুলুন', 'ছবি তুলো', 'ছবি তুল',
    'ছবি লও', 'ছবি লন', 'ছবি নাও', 'ছবি নেন', 'ছবি তুলি',
    'ফটো তোলো', 'ফটো তোল', 'ফটো তুলুন', 'ফটো লও', 'ফটো',
    'ক্যামেরা', 'ছবি'
  ]},

  { cmd: 'again',   words: [
    'আরেকটা ছবি', 'আরেকটি ছবি', 'নতুন ছবি', 'আবার তুলুন',
    'আরেকটা', 'আরেকটি', 'আরেকখান', 'আরেকখানা',
    'আবার', 'আরবার', 'ফের', 'ফির', 'নতুন'
  ]},

  { cmd: 'stop',    words: [
    'থামো', 'থামুন', 'থাম', 'থামান', 'বন্ধ করো', 'বন্ধ কর', 'বন্ধ করেন',
    'বন্ধ', 'চুপ', 'রাখো', 'রাখেন'
  ]},

  { cmd: 'gallery', words: [
    'গ্যালারি', 'গ্যালারী', 'গ্যালারি থেকে', 'ছবি বাছাই', 'ফোল্ডার',
    'আগের ছবি', 'পুরান ছবি'
  ]},

  { cmd: 'help',    words: [
    'সাহায্য', 'হেল্প', 'কী করবো', 'কি করবো', 'কি করুম', 'কী করুম',
    'কীভাবে', 'কিভাবে', 'ক্যামনে', 'কেমনে', 'বুঝছি না', 'বুঝতাছি না'
  ]},

  { cmd: 'officer', words: [
    'কৃষি অফিসার', 'অফিসার', 'অফিসারের', 'নম্বর', 'নাম্বার',
    'ফোন', 'কল সেন্টার', 'কল করুম'
  ]},

  { cmd: 'home',    words: [
    'হোম', 'বাড়ি', 'প্রথম পাতা', 'শুরু', 'ফিরে', 'ফিরা', 'পিছে'
  ]},

  { cmd: 'yes',     words: [
    'হ্যাঁ', 'হ্যা', 'হা', 'হ', 'অয়', 'হয়', 'হুম', 'জি', 'জ্বি',
    'ঠিক আছে', 'আইচ্ছা', 'আচ্ছা', 'ঠিক', 'এমনই', 'এমনেই',
    'মিলে যায়', 'মিলছে', 'মিলে', 'একরকম'
  ]},

  { cmd: 'no',      words: [
    'মিলে না', 'মেলে না', 'মিলে নাই', 'মিলতাছে না',
    'আলাদা', 'অন্যরকম', 'নাহ', 'নাই', 'না'
  ]},

  { cmd: 'greet',   words: ['হ্যালো', 'হ্যালো', 'আসসালামু', 'সালাম', 'হাই', 'কেমন আছো', 'কেমন আছেন'] }
];

/* ---------------- লক্ষণ থেকে রোগ অনুমান ----------------
   কৃষক মুখে লক্ষণ বললে সম্ভাব্য রোগ ধরার চেষ্টা।
   এটি চূড়ান্ত নয় — ছবি তোলার পরামর্শ দেওয়া হয়।            */

export type SymptomGuess = { key: string; matched: string[] };

const SYMPTOM_MAP: Array<{ key: string; words: string[] }> = [
  { key: 'yvmv', words: [
    'হলুদ শিরা', 'শিরা হলুদ', 'শিরা', 'শিরায়', 'জাল', 'জালের মতো', 'মোজাইক',
    'হলুদ', 'হলদে', 'হইলদা', 'হলদা', 'হইল্দা', 'হলুদা', 'হইলদ্যা',
    'হলুদ হইয়া', 'হলুদ হয়ে'
  ]},

  { key: 'elcv', words: [
    'কোঁকড়া', 'কুঁকড়ে', 'কুকড়ে', 'কোকড়া', 'কুকরা', 'কুঁচকে', 'কুচকাইয়া',
    'কুঁচকানো', 'মুচড়াইয়া', 'মুড়ে', 'মোড়ানো',
    'বেঁকে', 'বাঁকা', 'ব্যাঁকা', 'বাকা', 'দানা', 'কার্ল'
  ]},

  { key: 'cercospora', words: [
    'বাদামি দাগ', 'ধূসর দাগ', 'গোল দাগ', 'কালো দাগ',
    'ছোপ', 'ছুপ', 'বলয়', 'বাদামি', 'বাদামী', 'ধূসর', 'ছাই রঙ',
    'দাগ', 'দাক', 'দাগি', 'দাগ পড়ছে', 'দাগ পড়ছে'
  ]},

  { key: 'healthy', words: [
    'ভালো আছে', 'ভাল আছে', 'বালা আছে', 'সুস্থ', 'স্বাভাবিক',
    'কোনো সমস্যা নেই', 'সমস্যা নাই', 'কুনো সমস্যা নাই', 'ঠিক আছে'
  ]}
];

export function matchSymptom(rawInput: string): SymptomGuess | null {
  const raw = rawInput.replace(/[।,.!?]/g, ' ').trim();
  if (!raw) return null;

  let best: { key: string; len: number; word: string } | null = null;

  for (const m of SYMPTOM_MAP) {
    for (const w of m.words) {
      if (raw.includes(w) && (!best || w.length > best.len)) {
        best = { key: m.key, len: w.length, word: w };
      }
    }
  }
  return best ? { key: best.key, matched: [best.word] } : null;
}

/* শেষ যা শোনা গেছে — ডিবাগের জন্য */
let lastHeard = '';
export function getLastHeard(): string { return lastHeard; }

export function matchCommand(rawInput: string): Command | null {
  const raw = rawInput.replace(/[।,.!?]/g, ' ').toLowerCase().trim();
  if (!raw) return null;

  // দীর্ঘতম মিল আগে দেখো, যেন "আবার বলো" আগে "আবার" এর সাথে না মেলে
  let best: { cmd: Command; len: number } | null = null;

  for (const p of PATTERNS) {
    for (const w of p.words) {
      if (raw.includes(w) && (!best || w.length > best.len)) {
        best = { cmd: p.cmd, len: w.length };
      }
    }
  }
  if (best) return best.cmd;

  // কমান্ড নয় — লক্ষণের বর্ণনা কি না দেখো
  if (matchSymptom(raw)) return 'describe';

  return null;
}
