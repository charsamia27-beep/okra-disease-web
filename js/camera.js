/* =========================================================
   ক্যামেরা মডিউল
   - লাইভ প্রিভিউ (getUserMedia, পেছনের ক্যামেরা)
   - canvas দিয়ে ফ্রেম ধরা
   - টর্চ/ফ্ল্যাশ (ডিভাইস সাপোর্ট করলে)
   - না চললে গ্যালারি fallback
   ========================================================= */
let stream = null;
let track = null;
let torchOn = false;
/* ---------- স্ট্রিম কি এখনো জীবিত? ---------- */
export function isRunning() {
    return !!track && track.readyState === 'live';
}
/* ---------- ক্যামেরা চালু ---------- */
export async function startCamera(video) {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('NO_API');
    }
    // আগের স্ট্রিম চললে সেটাই ব্যবহার করো — নতুন করে চালু করা ধীর
    if (isRunning() && stream) {
        if (video.srcObject !== stream)
            video.srcObject = stream;
        if (video.paused)
            video.play().catch(() => { });
        return;
    }
    stopCamera();
    /* ৭২০p চাই — ১০৮০p সস্তা ফোনে ধীর, আর মডেলের জন্য ২২৪px ই যথেষ্ট */
    const constraints = {
        video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    };
    try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    catch (err) {
        const name = err?.name ?? '';
        // অনুমতি নেই — আবার চেষ্টা করে লাভ নেই
        if (name === 'NotAllowedError' || name === 'SecurityError') {
            throw err;
        }
        /* NotFoundError / NotReadableError:
           অন্য ট্যাব বা অ্যাপ ক্যামেরা ধরে রেখেছে, অথবা হার্ডওয়্যার
           এখনো ছাড়েনি। একটু অপেক্ষা করে সহজ শর্তে আরেকবার। */
        await sleep(450);
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        catch {
            await sleep(700);
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false
            });
        }
    }
    track = stream.getVideoTracks()[0] ?? null;
    video.srcObject = stream;
    // play() আটকে গেলে যেন পুরো ফ্লো থেমে না যায়
    video.play().catch(() => { });
    // প্রথম ফ্রেম আসা পর্যন্ত অপেক্ষা, সর্বোচ্চ ৩ সেকেন্ড
    await waitForFrame(video, 3000);
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
/* ---------- প্রথম ফ্রেমের অপেক্ষা ---------- */
function waitForFrame(video, timeoutMs) {
    return new Promise(resolve => {
        if (video.readyState >= 2 && video.videoWidth > 0) {
            resolve();
            return;
        }
        let done = false;
        const finish = () => {
            if (done)
                return;
            done = true;
            video.removeEventListener('loadeddata', finish);
            resolve();
        };
        video.addEventListener('loadeddata', finish);
        setTimeout(finish, timeoutMs);
    });
}
/* ---------- ক্যামেরা বন্ধ ---------- */
export function stopCamera(video) {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
    }
    stream = null;
    track = null;
    torchOn = false;
    // srcObject না মুছলে ব্রাউজার ক্যামেরা ধরে রাখতে পারে
    if (video) {
        video.pause();
        video.srcObject = null;
    }
}
/* ---------- টর্চ আছে কি না ---------- */
export function hasTorch() {
    if (!track || typeof track.getCapabilities !== 'function')
        return false;
    const caps = track.getCapabilities();
    return caps.torch === true;
}
/* ---------- টর্চ চালু/বন্ধ ---------- */
export async function toggleTorch() {
    if (!track || !hasTorch())
        return false;
    torchOn = !torchOn;
    await track.applyConstraints({
        advanced: [{ torch: torchOn }]
    });
    return torchOn;
}
/* ---------- ফ্রেম ধরা ---------- */
export function captureFrame(video, maxSide = 1280) {
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
        canvas.toBlob(blob => {
            if (!blob) {
                reject(new Error('NO_BLOB'));
                return;
            }
            resolve({ blob, dataUrl, width: w, height: h });
        }, 'image/jpeg', 0.9);
    });
}
/* ---------- গ্যালারি/ফাইল থেকে ---------- */
export function readFile(file, maxSide = 1280) {
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
            canvas.toBlob(blob => {
                URL.revokeObjectURL(url);
                if (!blob) {
                    reject(new Error('NO_BLOB'));
                    return;
                }
                resolve({ blob, dataUrl, width: w, height: h });
            }, 'image/jpeg', 0.9);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('BAD_IMAGE'));
        };
        img.src = url;
    });
}
/* ---------- ত্রুটির বাংলা বার্তা ---------- */
export function cameraErrorMessage(err) {
    const name = err?.name ?? '';
    const msg = err?.message ?? '';
    if (msg === 'NO_API') {
        return 'এই ব্রাউজারে ক্যামেরা চলে না। গ্যালারি থেকে ছবি নিন।';
    }
    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return 'ক্যামেরার অনুমতি দেওয়া হয়নি। ব্রাউজারের সেটিংসে অনুমতি দিন, অথবা গ্যালারি থেকে ছবি নিন।';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return 'ক্যামেরা পাওয়া যাচ্ছে না। অন্য ট্যাব বা অ্যাপ ক্যামেরা ব্যবহার করছে কি না দেখুন, তারপর নিচের বোতামে চাপ দিন।';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return 'ক্যামেরা অন্য কোনো অ্যাপ ব্যবহার করছে। সেটি বন্ধ করে আবার চেষ্টা করুন।';
    }
    return 'ক্যামেরা চালু করা যায়নি। গ্যালারি থেকে ছবি নিন।';
}
