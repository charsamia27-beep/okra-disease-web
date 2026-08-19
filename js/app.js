"use strict";
/* =========================================================
   ধাপ ১ — শুধু স্ক্রিন সুইচিং ও বোতাম সংযোগ
   পরের ধাপে ক্যামেরা যোগ হবে
   ========================================================= */
const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
/* ---------- স্ক্রিন বদল ---------- */
function goTo(name) {
    // এখন শুধু হোম আছে। পরের ধাপে বাকিগুলো যোগ হবে।
    const screens = $$('.screen');
    screens.forEach(s => s.classList.add('hidden'));
    const target = $(`screen-${name}`);
    if (target) {
        target.classList.remove('hidden');
    }
    else {
        console.log(`স্ক্রিন এখনো তৈরি হয়নি: ${name}`);
        alert(`"${name}" স্ক্রিন এখনো তৈরি হয়নি — পরের ধাপে আসছে।`);
        const home = $('screen-home');
        if (home)
            home.classList.remove('hidden');
        return;
    }
    // নিচের নেভে হাইলাইট
    $$('.nav__item').forEach(item => {
        item.classList.toggle('is-active', item.dataset.go === name);
    });
    window.scrollTo(0, 0);
}
/* ---------- বোতাম সংযোগ ---------- */
function wireButtons() {
    $$('[data-go]').forEach(el => {
        el.addEventListener('click', () => {
            const name = el.dataset.go;
            if (name)
                goTo(name);
        });
    });
    const start = $('btnStart');
    if (start) {
        start.addEventListener('click', () => goTo('camera'));
    }
}
/* ---------- ভয়েস চালু/বন্ধ (এখন শুধু টগল) ---------- */
let voiceEnabled = true;
function wireVoiceToggle() {
    const btn = $('voiceToggle');
    if (!btn)
        return;
    btn.classList.add('is-on');
    btn.addEventListener('click', () => {
        voiceEnabled = !voiceEnabled;
        btn.classList.toggle('is-on', voiceEnabled);
        btn.classList.toggle('is-off', !voiceEnabled);
        console.log('ভয়েস:', voiceEnabled ? 'চালু' : 'বন্ধ');
    });
}
/* ---------- আবহাওয়া (এখন স্থির লেখা) ---------- */
function fillWeatherPlaceholder() {
    const temp = $('wTemp');
    const spray = $('wSpray');
    if (temp)
        temp.textContent = '২৬° সে';
    if (spray)
        spray.textContent = 'উপযুক্ত';
}
/* ---------- চালু ---------- */
function init() {
    wireButtons();
    wireVoiceToggle();
    fillWeatherPlaceholder();
    console.log('✅ ধাপ ১ চালু হয়েছে');
}
document.addEventListener('DOMContentLoaded', init);
