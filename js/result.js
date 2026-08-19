/* =========================================================
   ফলাফল ও চিকিৎসা তথ্য রেন্ডার
   ========================================================= */
let data = null;
export async function loadTreatments() {
    const res = await fetch('data/treatment.json');
    if (!res.ok)
        throw new Error('TREATMENT_LOAD_FAILED');
    data = await res.json();
}
export function getDisease(key) {
    return data?.diseases[key] ?? null;
}
export function getVersion() {
    return data?.version ?? '—';
}
/* ---------------- বাংলা সংখ্যা ---------------- */
const BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
export function toBn(n) {
    return String(n).replace(/[0-9]/g, d => BN[+d]);
}
export function renderResult(t, verdict, confirmedKey) {
    /* ফেরত দেয় ভয়েসে পড়ার জন্য লেখা */
    if (verdict.kind === 'not_leaf') {
        return renderProblem(t, 'এটি পাতার ছবি নয়', 'Not a leaf image', 'ছবিতে ঢেঁড়স পাতা খুঁজে পাওয়া যায়নি। একটি পাতা ফ্রেমে ভরে আবার ছবি তুলুন।', ['একটি পাতা হাতে ধরে কাছ থেকে ছবি তুলুন।',
            'হাত স্থির রাখুন, ছবি যেন ঝাপসা না হয়।',
            'ছায়া যেন পাতার উপর না পড়ে।']);
    }
    if (verdict.kind === 'too_low') {
        return renderProblem(t, 'নিশ্চিতভাবে বলা যাচ্ছে না', 'Low confidence', 'ছবি থেকে রোগ নিশ্চিত করা গেল না। এই অবস্থায় কোনো ওষুধ দেবেন না।', ['পাতাটি হাতে ধরে, স্থির হাতে আরেকটি ছবি তুলুন।',
            'পাতার নিচের দিকেরও ছবি তুলুন।',
            'তবু না হলে পাতাটি নিয়ে উপজেলা কৃষি অফিসে যান।'], verdict.prediction.confidence);
    }
    const key = confirmedKey ?? (verdict.kind === 'sure' ? verdict.disease : verdict.prediction.top);
    const d = getDisease(key);
    if (!d)
        return '';
    const p = verdict.prediction;
    const pct = Math.round(p.confidence * 100);
    t.name.textContent = d.bn;
    t.nameEn.textContent = d.en;
    const color = d.tone === 'ok' ? 'var(--green)'
        : d.tone === 'warn' ? 'var(--flower)'
            : 'var(--maroon)';
    t.fill.style.width = pct + '%';
    t.fill.style.background = color;
    t.pct.textContent = toBn(pct) + '%';
    /* ব্যানার — ভাইরাস আর ছত্রাকের বার্তা আলাদা */
    if (d.type === 'none') {
        t.banner.className = 'banner banner--ok';
        t.banner.textContent = 'গাছ ভালো আছে। এখন কিছু করার দরকার নেই।';
    }
    else if (d.hasCure === false) {
        t.banner.className = 'banner banner--stop';
        t.banner.textContent = 'এই রোগের ওষুধ নেই। স্প্রে করলে টাকা নষ্ট হবে — নিচের করণীয় দেখুন।';
    }
    else {
        t.banner.className = 'banner banner--warn';
        t.banner.textContent = 'রোগ পাওয়া গেছে। করণীয় দেখুন এবং কৃষি অফিসারের পরামর্শ নিন।';
    }
    t.symptoms.className = 'block';
    t.symptoms.innerHTML = list('যা দেখা যায়', d.symptoms);
    t.actions.className = 'block';
    t.actions.innerHTML = list('করণীয়', d.actions);
    if (d.chemical) {
        t.chemical.className = 'block';
        t.chemical.innerHTML = `
      <h3><span class="dot"></span>${esc(d.chemical.label)}</h3>
      <div class="chem">
        ${d.chemical.name ? `<p><b>${esc(d.chemical.name)}</b></p>` : ''}
        ${d.chemical.dose ? `<p>মাত্রা: ${esc(d.chemical.dose)}</p>` : ''}
        ${d.chemical.phiDays !== null
            ? `<p>স্প্রের ${toBn(d.chemical.phiDays)} দিন পর ফল তোলা নিরাপদ</p>` : ''}
        <span class="chem__warn">⚠️ ${esc(d.chemical.note)}</span>
      </div>`;
    }
    else {
        t.chemical.className = 'hidden';
        t.chemical.innerHTML = '';
    }
    return `${d.bn}। নিশ্চয়তা ${toBn(pct)} শতাংশ। করণীয়: ${d.actions.join(' ')}`;
}
/* ---------------- সমস্যা অবস্থা ---------------- */
function renderProblem(t, titleBn, titleEn, bannerText, steps, conf) {
    t.name.textContent = titleBn;
    t.nameEn.textContent = titleEn;
    t.fill.style.width = conf ? Math.round(conf * 100) + '%' : '0%';
    t.fill.style.background = 'var(--maroon)';
    t.pct.textContent = conf ? toBn(Math.round(conf * 100)) + '%' : '—';
    t.banner.className = 'banner banner--stop';
    t.banner.textContent = bannerText;
    t.symptoms.className = 'block';
    t.symptoms.innerHTML = list('এখন কী করবেন', steps);
    t.actions.className = 'hidden';
    t.actions.innerHTML = '';
    t.chemical.className = 'hidden';
    t.chemical.innerHTML = '';
    return `${titleBn}। ${bannerText}`;
}
/* ---------------- ছোট সহায়ক ---------------- */
function list(title, items) {
    return `<h3><span class="dot"></span>${esc(title)}</h3>
    <ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
}
function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}
