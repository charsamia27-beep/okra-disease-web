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
    for (let i = 0; i < results.length; i++) {
      const raw = String(results[i].transcript || '').trim();
      const cmd = matchCommand(raw);
      if (cmd) { onCommand?.(cmd, raw); return; }
    }
    const first = String(results[0].transcript || '').trim();
    onCommand?.('unknown', first);
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
  | 'yes' | 'no' | 'unknown';

const PATTERNS: Array<{ cmd: Command; words: string[] }> = [
  { cmd: 'capture', words: ['ছবি তোলো', 'ছবি তোল', 'ছবি তুলুন', 'ছবি তুলো', 'তোলো', 'তুলুন', 'ছবি', 'ক্যামেরা'] },
  { cmd: 'again',   words: ['আবার', 'আরেকটা', 'আরেকটি', 'নতুন ছবি', 'নতুন'] },
  { cmd: 'read',    words: ['পড়ো', 'পড়ুন', 'শোনাও', 'শোনান', 'বলো', 'বলুন', 'আবার বলো'] },
  { cmd: 'stop',    words: ['থামো', 'থামুন', 'বন্ধ', 'চুপ'] },
  { cmd: 'gallery', words: ['গ্যালারি', 'গ্যালারী', 'ছবি বাছাই'] },
  { cmd: 'help',    words: ['সাহায্য', 'হেল্প', 'কী করবো', 'কি করবো', 'কীভাবে'] },
  { cmd: 'officer', words: ['অফিসার', 'কৃষি অফিসার', 'নম্বর', 'ফোন'] },
  { cmd: 'home',    words: ['হোম', 'বাড়ি', 'প্রথম', 'শুরু'] },
  { cmd: 'yes',     words: ['হ্যাঁ', 'হা', 'হুম', 'ঠিক', 'এমনই', 'মিলে'] },
  { cmd: 'no',      words: ['না', 'নাহ', 'আলাদা', 'মিলে না'] }
];

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
  return best?.cmd ?? null;
}
