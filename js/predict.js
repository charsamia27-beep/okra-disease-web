/* =========================================================
   পূর্বাভাস ও সিদ্ধান্ত লজিক

   ধাপ ৫ এ শুধু predict() এর ভেতরটা বদলাবে।
   থ্রেশহোল্ড ও সিদ্ধান্তের নিয়ম অপরিবর্তিত থাকবে।
   ========================================================= */
/* ⚠️ এই ক্রম ট্রেনিং ফোল্ডারের ক্রমের সাথে হুবহু মিলতে হবে।
   না মিললে মডেল ঠিক চলবে কিন্তু ভুল নাম দেখাবে। */
export const CLASS_ORDER = ['healthy', 'yvmv', 'elcv', 'cercospora'];
/* সিদ্ধান্তের সীমা */
export const CONF_HIGH = 0.90; // এর উপরে সরাসরি ফলাফল
export const CONF_LOW = 0.60; // এর নিচে কিছুই দেখাবে না
export const LEAF_MIN = 0.50; // পাতা কি না
/* ---------------- মডেল ---------------- */
let model = null;
export async function loadModel() {
    /*  ধাপ ৫:
        const tf = await import('...tfjs...');
        model = await tf.loadGraphModel('model/model.json');            */
    model = null;
}
export function isModelReady() {
    return model !== null;
}
export async function predict(img) {
    /*  ধাপ ৫ — আসল কোড এখানে বসবে:
  
        const t = tf.browser.fromPixels(img)
          .resizeBilinear([224, 224]).toFloat().div(255).expandDims(0);
        const out = await (model as tf.GraphModel).predict(t) as tf.Tensor;
        const raw = Array.from(await out.data());
        t.dispose(); out.dispose();
        return buildPrediction(raw, leafScore);                          */
    await new Promise(r => setTimeout(r, 900)); // নকল দেরি
    // নকল স্কোর — বাস্তবের মতো অসম বণ্টন
    const raw = CLASS_ORDER.map(() => Math.random());
    const boost = Math.floor(Math.random() * CLASS_ORDER.length);
    raw[boost] += 1.4 + Math.random() * 2.2;
    const leaf = Math.random() < 0.12 ? Math.random() * 0.45 : 0.75 + Math.random() * 0.25;
    return buildPrediction(raw, leaf);
}
/* ---------------- সহায়ক ---------------- */
export function buildPrediction(raw, leaf) {
    const probs = softmax(raw);
    const scores = {};
    CLASS_ORDER.forEach((k, i) => { scores[k] = probs[i]; });
    const sorted = [...CLASS_ORDER].sort((a, b) => scores[b] - scores[a]);
    return {
        scores,
        top: sorted[0],
        second: sorted[1],
        confidence: scores[sorted[0]],
        isLeaf: leaf
    };
}
function softmax(xs) {
    const max = Math.max(...xs);
    const exp = xs.map(x => Math.exp(x - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(e => e / sum);
}
/* ---------------- সিদ্ধান্ত ---------------- */
export function decide(p) {
    if (p.isLeaf < LEAF_MIN)
        return { kind: 'not_leaf' };
    if (p.confidence < CONF_LOW)
        return { kind: 'too_low', prediction: p };
    if (p.confidence < CONF_HIGH)
        return { kind: 'confirm', prediction: p, candidate: p.top };
    return { kind: 'sure', prediction: p, disease: p.top };
}
/* নিশ্চিতকরণে "না" বললে পরের সম্ভাবনা */
export function nextCandidate(p, rejected) {
    const left = [...CLASS_ORDER]
        .filter(k => !rejected.includes(k))
        .sort((a, b) => p.scores[b] - p.scores[a]);
    if (left.length === 0)
        return null;
    if (p.scores[left[0]] < 0.10)
        return null; // এত কম হলে আর জিজ্ঞেস করে লাভ নেই
    return left[0];
}
