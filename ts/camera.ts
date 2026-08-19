/* =========================================================
   ক্যামেরা মডিউল
   - লাইভ প্রিভিউ (getUserMedia, পেছনের ক্যামেরা)
   - canvas দিয়ে ফ্রেম ধরা
   - টর্চ/ফ্ল্যাশ (ডিভাইস সাপোর্ট করলে)
   - না চললে গ্যালারি fallback
   ========================================================= */

export interface CaptureResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

/* টর্চ এখনো সব ব্রাউজারের টাইপ ডেফিনিশনে নেই */
interface TorchConstraint extends MediaTrackConstraintSet {
  torch?: boolean;
}
interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

let stream: MediaStream | null = null;
let track: MediaStreamTrack | null = null;
let torchOn = false;

/* ---------- ক্যামেরা চালু ---------- */
export async function startCamera(video: HTMLVideoElement): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('NO_API');
  }

  stopCamera();

  const constraints: MediaStreamConstraints = {
    video: {
      facingMode: { ideal: 'environment' },
      width:  { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    // পেছনের ক্যামেরা না পেলে যেকোনো ক্যামেরা
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }

  track = stream.getVideoTracks()[0] ?? null;
  video.srcObject = stream;
  await video.play();
}

/* ---------- ক্যামেরা বন্ধ ---------- */
export function stopCamera(): void {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }
  stream = null;
  track = null;
  torchOn = false;
}

/* ---------- টর্চ আছে কি না ---------- */
export function hasTorch(): boolean {
  if (!track || typeof track.getCapabilities !== 'function') return false;
  const caps = track.getCapabilities() as TorchCapabilities;
  return caps.torch === true;
}

/* ---------- টর্চ চালু/বন্ধ ---------- */
export async function toggleTorch(): Promise<boolean> {
  if (!track || !hasTorch()) return false;
  torchOn = !torchOn;
  await track.applyConstraints({
    advanced: [{ torch: torchOn } as TorchConstraint]
  });
  return torchOn;
}

/* ---------- ফ্রেম ধরা ---------- */
export function captureFrame(
  video: HTMLVideoElement,
  maxSide = 1280
): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (!vw || !vh) {
      reject(new Error('VIDEO_NOT_READY'));
      return;
    }

    // বড় দিক maxSide এ নামাও — মডেলের জন্য যথেষ্ট, ফাইলও হালকা
    const scale = Math.min(1, maxSide / Math.max(vw, vh));
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('NO_CANVAS'));
      return;
    }

    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error('NO_BLOB'));
          return;
        }
        resolve({ blob, dataUrl, width: w, height: h });
      },
      'image/jpeg',
      0.9
    );
  });
}

/* ---------- গ্যালারি/ফাইল থেকে ---------- */
export function readFile(file: File, maxSide = 1280): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('NO_CANVAS'));
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

      canvas.toBlob(
        blob => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error('NO_BLOB'));
            return;
          }
          resolve({ blob, dataUrl, width: w, height: h });
        },
        'image/jpeg',
        0.9
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('BAD_IMAGE'));
    };

    img.src = url;
  });
}

/* ---------- ত্রুটির বাংলা বার্তা ---------- */
export function cameraErrorMessage(err: unknown): string {
  const name = (err as DOMException)?.name ?? '';
  const msg = (err as Error)?.message ?? '';

  if (msg === 'NO_API') {
    return 'এই ব্রাউজারে ক্যামেরা চলে না। গ্যালারি থেকে ছবি নিন।';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'ক্যামেরার অনুমতি দেওয়া হয়নি। ব্রাউজারের সেটিংসে অনুমতি দিন, অথবা গ্যালারি থেকে ছবি নিন।';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'এই ডিভাইসে ক্যামেরা পাওয়া যায়নি। গ্যালারি থেকে ছবি নিন।';
  }
  if (name === 'NotReadableError') {
    return 'ক্যামেরা অন্য কোনো অ্যাপ ব্যবহার করছে। সেটি বন্ধ করে আবার চেষ্টা করুন।';
  }
  return 'ক্যামেরা চালু করা যায়নি। গ্যালারি থেকে ছবি নিন।';
}
