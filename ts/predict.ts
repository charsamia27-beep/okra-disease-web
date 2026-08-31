export const CLASS_ORDER = ['cercospora', 'healthy', 'insect_damage', 'invalid', 'nutrient_deficiency', 'yvmv'] as const;
export type DiseaseKey = typeof CLASS_ORDER[number];

/* সিদ্ধান্তের সীমা */
export const CONF_HIGH = 0.97;  // এর উপরে সরাসরি ফলাফল
export const CONF_LOW  = 0.70;  // এর নিচে কিছুই দেখাবে না
export const LEAF_MIN  = 0.65;  // পাতা কি না

export interface Prediction {
  scores: Record<DiseaseKey, number>;
  top: DiseaseKey;
  second: DiseaseKey;
  confidence: number;
  isLeaf: number;          // ০–১, ছবিটা আদৌ পাতা কি না
}

export type Verdict =
  | { kind: 'not_leaf' }
  | { kind: 'too_low';  prediction: Prediction }
  | { kind: 'confirm';  prediction: Prediction; candidate: DiseaseKey }
  | { kind: 'sure';     prediction: Prediction; disease: DiseaseKey };

/* ---------------- মডেল ---------------- */

declare const ort: any;

let session: any = null;

export async function loadModel(): Promise<void> {
  session = await ort.InferenceSession.create('model/best.onnx', {
    executionProviders: ['wasm']
  });
}

export function isModelReady(): boolean {
  return session !== null;
}

export async function predict(img: HTMLImageElement): Promise<Prediction> {
  const S = 224;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d')!;
    // ছবির কেন্দ্র থেকে বর্গাকার অংশ , পটভূমি বাদ যাবে
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);

  const px = ctx.getImageData(0, 0, S, S).data;
  const data = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) {
    data[i]             = px[i * 4]     / 255;
    data[i + S * S]     = px[i * 4 + 1] / 255;
    data[i + 2 * S * S] = px[i * 4 + 2] / 255;
  }

  const feeds: Record<string, any> = {};
  feeds[session.inputNames[0]] = new ort.Tensor('float32', data, [1, 3, S, S]);
  const out = await session.run(feeds);
  const probs = Array.from(out[session.outputNames[0]].data as Float32Array);


  const invalidIdx = CLASS_ORDER.indexOf('invalid');
  const leaf = 1 - probs[invalidIdx];

  return buildPrediction(probs.map(p => Math.log(Math.max(p, 1e-9))), leaf);
}

/* ---------------- সহায়ক ---------------- */

export function buildPrediction(raw: number[], leaf: number): Prediction {
  const probs = softmax(raw);

  const scores = {} as Record<DiseaseKey, number>;
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

function softmax(xs: number[]): number[] {
  const max = Math.max(...xs);
  const exp = xs.map(x => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(e => e / sum);
}

/* ---------------- সিদ্ধান্ত ---------------- */

export function decide(p: Prediction): Verdict {
  if (p.isLeaf < LEAF_MIN)        return { kind: 'not_leaf' };
  if (p.top === 'healthy' && p.confidence < 0.92)
    return { kind: 'confirm', prediction: p, candidate: 'healthy' };
  if (p.confidence < CONF_LOW)    return { kind: 'too_low', prediction: p };
  if (p.confidence < CONF_HIGH)   return { kind: 'confirm', prediction: p, candidate: p.top };
  return { kind: 'sure', prediction: p, disease: p.top };
}

/* নিশ্চিতকরণে "না" বললে পরের সম্ভাবনা */
export function nextCandidate(p: Prediction, rejected: DiseaseKey[]): DiseaseKey | null {
  const left = [...CLASS_ORDER]
    .filter(k => !rejected.includes(k))
    .sort((a, b) => p.scores[b] - p.scores[a]);

  if (left.length === 0) return null;
  if (p.scores[left[0]] < 0.10) return null;   // এত কম হলে আর জিজ্ঞেস করে লাভ নেই
  return left[0];
}
