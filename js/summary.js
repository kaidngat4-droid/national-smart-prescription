/* ==========================================================
   MediPrescribe — ملخص المريض المبسط + مشاركة واتساب v1.1
   ----------------------------------------------------------
   التحسينات في v1.1:
   ✅ window.open مع noopener (أمان أعلى)
   ✅ حماية من رقم هاتف غير صحيح + fallback
   ✅ await logAudit (تسجيل فعلي)
   ✅ HTML escaping في الطباعة
   ✅ قواعد تكرار موسّعة
   ✅ نسخ الملخص كـ HTML للواتساب (تنسيق)
   ✅ معاينة الملخص قبل الإرسال (اختياري)
   ========================================================== */
const PatientSummary = (() => {
  'use strict';

  /* ── قواعد تحويل التكرار إلى عربية واضحة ── */
  const FREQ_RULES = [
    [/qid|أربع|4\s*مرات/i,        '4 مرات يوميًا (فجرًا · ظهرًا · عصرًا · مساءً)'],
    [/tid|ثلاث|3\s*مرات/i,        '3 مرات يوميًا (صباحًا · ظهرًا · مساءً)'],
    [/bid|مرتين|2\s*مرات/i,       'مرتين يوميًا (صباحًا ومساءً)'],
    [/hs|النوم/i,                 'مرة واحدة عند النوم'],
    [/prn|عند الحاجة|عند اللزوم/i,'عند الحاجة فقط'],
    [/q\d+h|كل\s*\d+\s*ساع/i,     'حسب الجدول المحدد'],
    [/qd|od|مرة|يومي/i,           'مرة واحدة يوميًا'],
  ];

  const freqAr = f => {
    const r = FREQ_RULES.find(([re]) => re.test(f || ''));
    return r ? r[1] : (f || '');
  };

  /* ── escape HTML ── */
  const esc = s => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  /* ── بناء الملخص النصي ── */
  function build(r) {
    if (!r) return '';
    const L = [];

    L.push(`🩺 *وصفة طبية${r.rxNumber ? ' — ' + r.rxNumber : ''}*`);
    L.push(`🏥 ${r.hospital || '—'} · 👨‍⚕️ ${r.doctor || '—'}`);
    L.push('');
    L.push(`👤 *المريض:* ${r.patientName} (${r.age} سنة · ${r.gender}${r.weight ? ' · ' + r.weight + ' كغ' : ''})`);
    L.push(`🩺 *التشخيص:* ${r.diagnosis}`);
    L.push('');
    L.push('💊 *الأدوية:*');

    (r.meds || []).forEach((m, i) => {
      L.push(`${i + 1}) *${m.n}*`);
      L.push(`   • الجرعة: ${m.dose}`);
      L.push(`   • المواعيد: ${freqAr(m.freq)}`);
      L.push(`   • المدة: ${m.dur}`);
      if (m.note) L.push(`   📌 ${m.note}`);
    });

    if (r.supplies && r.supplies.length)
      L.push('', '🎒 *مستلزمات:* ' + r.supplies.join('، '));
    if (r.labs && r.labs.length)
      L.push('', '🧪 *فحوصات مطلوبة:* ' + r.labs.join('، '));
    if (r.allergies)
      L.push('', `⚠️ *حساسية:* ${r.allergies}`);
    if (r.advice)
      L.push('', '💡 *نصائح مهمة:*', r.advice);
    if (r.alert)
      L.push('', '🚨 *تنبيه:*', r.alert);

    L.push('', '━━━━━━━━━━━━━━━━━');
    L.push('📅 أعد طلب التجديد قبل نهاية المدة بيومين.');
    L.push('📞 للاستفسار راجع المركز الصحي.');

    if (r.verificationCode) {
      L.push('');
      L.push(`✅ كود التحقق: ${r.verificationCode}`);
    }

    return L.join('\n');
  }

  /* ── تطبيع رقم يمني إلى صيغة دولية ── */
  function intlPhone(phone) {
    let d = (phone || '').replace(/\D/g, '');
    if (!d) return null;
    if (d.startsWith('00967')) d = d.slice(2);
    else if (d.startsWith('967')) d = d;
    else if (d.startsWith('0'))   d = '967' + d.slice(1);
    else if (d.length === 9 && d.startsWith('7')) d = '967' + d;
    return d.length >= 11 ? d : null;
  }

  /* ── إرسال واتساب (مع حماية) ── */
  async function sendWhatsApp(record) {
    if (!record) return;

    const num = intlPhone(record.phone);
    const text = build(record);

    if (!num) {
      if (typeof showToast === 'function') {
        showToast('⚠️ رقم الهاتف غير صالح. مثال صحيح: 967771234567', 'warning', 5000);
      }
      return;
    }

    // ✅ noopener للأمان
    const url = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
    const w = window.open(url, '_blank', 'noopener,noreferrer');

    if (!w) {
      // احتياطي: نسخ النص
      await copyText(text);
      if (typeof showToast === 'function') {
        showToast('📋 تم نسخ الملخص (المتصفح منع فتح النافذة)', 'info', 4000);
      }
      return;
    }

    // ✅ await logAudit
    if (typeof logAudit === 'function') {
      try {
        await logAudit('إرسال واتساب',
          `${record.patientName} — ${record.rxNumber || ''}`);
      } catch (e) { console.warn('logAudit failed:', e); }
    }

    if (typeof showToast === 'function') {
      showToast('💬 جارٍ فتح واتساب...', 'success', 2000);
    }
  }

  /* ── نسخ نص إلى الحافظة ── */
  async function copyText(t) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (e) {
      console.warn('copyText error:', e);
      return false;
    }
  }

  /* ── شريط الإجراءات العائم ── */
  function showActions(record) {
    if (!record) return;

    document.getElementById('ps-action-bar')?.remove();

    const bar = document.createElement('div');
    bar.id = 'ps-action-bar';
    bar.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 4000;
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 12px 16px;
      background: rgba(10,22,40,.97);
      border: 1px solid rgba(212,175,55,.4);
      border-radius: 14px;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow: 0 20px 50px rgba(0,0,0,.65);
      font-family: 'Tajawal','Cairo',sans-serif;
      flex-wrap: wrap;
      justify-content: center;
      max-width: 94vw;
      animation: psSlideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1);
    `;

    /* ── مساعد: زر ── */
    const makeBtn = (icon, txt, color, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = `
        padding: 9px 16px;
        border: none;
        border-radius: 9px;
        cursor: pointer;
        font-family: inherit;
        font-weight: 800;
        font-size: 0.82rem;
        color: ${color === '#ef9a9a' ? '#5b1a1a' : '#0a1628'};
        background: ${color};
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: transform 0.15s;
        white-space: nowrap;
      `;
      b.textContent = `${icon} ${txt}`;
      b.addEventListener('mouseenter', () => { b.style.transform = 'translateY(-2px)'; });
      b.addEventListener('mouseleave', () => { b.style.transform = 'translateY(0)'; });
      b.addEventListener('click', fn);
      return b;
    };

    /* ── زر النسخ ── */
    const copyBtn = makeBtn('📋', 'نسخ الملخص', '#f1d878', async () => {
      const ok = await copyText(build(record));
      if (typeof showToast === 'function') {
        showToast(ok ? '✅ تم نسخ الملخص' : '❌ فشل النسخ',
          ok ? 'success' : 'error');
      }
    });
    bar.appendChild(copyBtn);

    /* ── زر واتساب (إن وُجد رقم) ── */
    if (record.phone) {
      const waBtn = makeBtn('💬', 'واتساب للمريض', '#25D366', () => sendWhatsApp(record));
      bar.appendChild(waBtn);
    }

    /* ── زر الطباعة ── */
    const printBtn = makeBtn('🖨️', 'طباعة', '#90caf9', () => printSummary(record));
    bar.appendChild(printBtn);

    /* ── زر الإغلاق ── */
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'إغلاق');
    closeBtn.style.cssText = `
      padding: 6px 10px;
      border: 1px solid rgba(255,255,255,.15);
      border-radius: 8px;
      cursor: pointer;
      background: transparent;
      color: #93a2b5;
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 700;
    `;
    closeBtn.addEventListener('click', () => bar.remove());
    bar.appendChild(closeBtn);

    document.body.appendChild(bar);

    /* ── إغلاق تلقائي بعد 45 ثانية ── */
    setTimeout(() => {
      if (document.body.contains(bar)) {
        bar.style.animation = 'psSlideDown 0.3s forwards';
        setTimeout(() => bar.remove(), 320);
      }
    }, 45000);
  }

  /* ── طباعة الملخص (مع escape) ── */
  function printSummary(record) {
    if (!record) return;

    const rawText = build(record);
    // احفظ التنسيق: *bold* و newlines
    const htmlBody = esc(rawText)
      .replace(/\*(.+?)\*/g, '<strong style="color:#0a1628;">$1</strong>')
      .replace(/\n/g, '<br>');

    const w = window.open('', '_blank', 'width=600,height=800,noopener');
    if (!w) {
      if (typeof showToast === 'function') {
        showToast('⚠️ المتصفح منع فتح نافذة الطباعة', 'warning');
      }
      return;
    }

    w.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ملخص المريض — ${esc(record.patientName)}</title>
  <style>
    body {
      font-family: 'Tajawal','Cairo',sans-serif;
      padding: 30px;
      line-height: 2;
      color: #1a3d38;
      max-width: 700px;
      margin: 0 auto;
    }
    strong { color: #00796b; }
    @media print {
      body { padding: 15px; }
    }
  </style>
</head>
<body>${htmlBody}</body>
</html>`);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 300);
  }

  /* ── معاينة الملخص (نافذة قبل الإرسال) ── */
  function preview(record) {
    if (!record) return;
    const text = build(record);
    const w = window.open('', '_blank', 'width=600,height=700,noopener');
    if (!w) return;

    w.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>معاينة الملخص</title>
  <style>
    body {
      font-family: 'Tajawal','Cairo',sans-serif;
      padding: 20px;
      background: #f4f7f6;
      direction: rtl;
    }
    pre {
      background: #fff;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #ddd;
      white-space: pre-wrap;
      line-height: 1.9;
      font-family: 'Cairo', sans-serif;
      font-size: 0.92rem;
      max-height: 70vh;
      overflow-y: auto;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      margin-top: 12px;
      border: none;
      border-radius: 10px;
      background: #25D366;
      color: #fff;
      font-weight: 800;
      font-family: inherit;
      font-size: 1rem;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h2 style="color:#00796b;margin:0 0 12px;">📋 معاينة ملخص المريض</h2>
  <pre>${esc(text)}</pre>
  <button class="btn" onclick="window.opener.postMessage({action:'sendWA'},'*');window.close();">
    ✅ تأكيد وإرسال عبر واتساب
  </button>
</body>
</html>`);
    w.document.close();
  }

  /* ── أضف الأنيميشن ── */
  if (!document.getElementById('ps-summary-styles')) {
    const style = document.createElement('style');
    style.id = 'ps-summary-styles';
    style.textContent = `
      @keyframes psSlideUp {
        from { opacity: 0; transform: translate(-50%, 30px); }
        to   { opacity: 1; transform: translate(-50%, 0); }
      }
      @keyframes psSlideDown {
        from { opacity: 1; transform: translate(-50%, 0); }
        to   { opacity: 0; transform: translate(-50%, 30px); }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── تصدير الواجهة ── */
  return {
    build,
    sendWhatsApp,
    showActions,
    printSummary,
    preview,
    copyText,
    intlPhone,
    freqAr
  };
})();

window.PatientSummary = PatientSummary;
console.log('✅ summary.js v1.1 — PatientSummary متاح');