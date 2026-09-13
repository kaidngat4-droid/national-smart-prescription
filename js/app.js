/* ==========================================================
   MediPrescribe Pro — app.js
   منطق لوحة تحكم الطبيب — الإصدار 3.1 (الموثوقة إكلينيكياً)
   ----------------------------------------------------------
   التحديثات الطبية الموثوقة في 3.1:
   • ClinicalValidator: تحقق إكلينيكي شامل (عمر/وزن/تشخيص/أدوية/حمل)
   • حساب الجرعات بالوزن مع سقف الحد الأقصى + تقريب عملي آمن
   • VitalsInterpreter: تفسير طبي للضغط/الحرارة/SpO₂/النبض مع تنبيهات
   • حفظ ذرّي (Atomic) مع Rollback عند الفشل
   • حماية كاملة من XSS في كل المخرجات
   • سبب إلزامي موثّق لتجاوز تنبيهات السلامة
   • صلاحية الوصفة (30 يوم) + عدد التعبئات في السجل والطباعة
   • جدول مواعيد الجرعات في الطباعة
   • التحقق من سلامة Blockchain عند الإقلاع

   ✅ يتكامل مع: safety.js / rx.js / summary.js / blockchain.js
                 local-ai.js / bluetooth-vitals.js / i18n.js (اختياري)
   ✅ يعمل بدون أي منها إن لم تكن موجودة (حماية typeof)
========================================================== */


/* ==========================================================
   00. أدوات أساسية + الثوابت الإكلينيكية
   ========================================================== */
const APP_VERSION = '3.1.0';
const RX_VALIDITY_DAYS = 30;          // صلاحية الوصفة بالأيام
const DEFAULT_REFILLS = 0;            // عدد التعبئات الافتراضي

/* ── حماية XSS: تجب أي نص قبل حقنه في HTML ── */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function clampNum(v, min, max) {
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function safeParseInt(v, fallback = null) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function safeParseFloat(v, fallback = null) {
  const n = parseFloat(v);
  return Number.isNaN(n) ? fallback : n;
}

/* ── الوزن المتوقع للأطفال (1–12 سنة): (العمر × 2) + 8 ── */
function expectedChildWeight(age) {
  if (age == null || age < 1 || age > 12) return null;
  return 2 * age + 8;
}

/* ── تحويل التكرار إلى مواعيد عملية ── */
const FREQ_SCHEDULE = [
  { re: /مرة\s*واحدة|مرة\s*يومي|OD|once/i,          times: ['08:00 صباحاً'] },
  { re: /مرتين|مرة\s*every\s*12|q12|BD|bis|كل\s*12/i, times: ['08:00 ص', '08:00 م'] },
  { re: /ثلاث|3\s*مرات|q8|كل\s*8|tid|ter/i,          times: ['06:00 ص', '02:00 م', '10:00 م'] },
  { re: /أربع|4\s*مرات|q6|كل\s*6|qid/i,              times: ['06ص', '12ظ', '06م', '12ل'] },
  { re: /قبل\s*النوم|ليلاً|nocte|HS/i,                times: ['قبل النوم'] },
  { re: /صباحاً/i,                                    times: ['08:00 صباحاً'] },
];
function scheduleFor(freq) {
  if (!freq) return '';
  const hit = FREQ_SCHEDULE.find(f => f.re.test(String(freq)));
  return hit ? hit.times.join(' — ') : '';
}


/* ==========================================================
   01. حماية الصفحة (Auth Guard)
   ========================================================== */
const session = (typeof getCurrentUser === 'function')
  ? getCurrentUser()
  : JSON.parse(localStorage.getItem('mp_session') || 'null');

if (!session) {
  location.replace('login.html');
  throw new Error('No session');
}

console.log('%c⚕️ MediPrescribe v' + APP_VERSION, 'color:#d4af37;font-weight:bold');
console.log('🔐 المستخدم:', session.fullName, '|', session.role);


/* ==========================================================
   02. عرض بيانات المستخدم + إخفاء روابط admin-only
   ========================================================== */
function initUserInterface() {
  const badge = document.getElementById('user-badge');
  if (badge) {
    badge.textContent = `${session.fullName} · ${session.roleLabel || session.role}`;
    badge.title = `${session.username} — ${session.hospital || ''}`;
  }

  if (session.role !== 'admin') {
    document.getElementById('nav-users')?.remove();
    document.getElementById('nav-audit')?.remove();
  }
}


/* ==========================================================
   03. ملء قوائم المستشفيات والتشخيصات
   ========================================================== */
function fillHospitalSelect() {
  const select = document.getElementById('p-hospital');
  if (!select) return;

  if (typeof HOSPITALS === 'undefined' || !HOSPITALS.length) {
    select.innerHTML = '<option>— لا توجد مستشفيات —</option>';
    return;
  }

  select.innerHTML = HOSPITALS.map(h => `<option>${esc(h)}</option>`).join('');

  if (session.hospital) {
    const idx = HOSPITALS.indexOf(session.hospital);
    if (idx >= 0) select.selectedIndex = idx;
  }
}

function fillDiagnosisSelect() {
  const select = document.getElementById('dx-list');
  if (!select) return;

  if (typeof DIAGNOSES === 'undefined' || !DIAGNOSES.length) {
    select.innerHTML = '<option value="">— لا توجد بروتوكولات —</option>';
    return;
  }

  select.innerHTML = '<option value="">— اختر تشخيصاً —</option>' +
    DIAGNOSES.map(d =>
      `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');

  select.addEventListener('change', () => {
    const id = safeParseInt(select.value);
    id ? showProtocol(id) : hideProtocol();
  });
}


/* ==========================================================
   04. البحث الحي بالتشخيص (Debounced)
   ========================================================== */
function initDiagnosisSearch() {
  const input = document.getElementById('dx-search');
  const box = document.getElementById('dx-suggestions');
  if (!input || !box || typeof DIAGNOSES === 'undefined') return;

  let selectedIndex = -1;

  function renderSuggestions(query) {
    if (!query || query.length < 2) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }

    const q = query.toLowerCase();
    const results = DIAGNOSES.filter(d =>
      d.name.includes(query) ||
      d.cat.includes(query) ||
      (d.ref || '').toLowerCase().includes(q)
    ).slice(0, 8);

    if (!results.length) {
      box.innerHTML = '<div style="padding:10px 14px;color:#93a2b5;font-size:.85rem;">لا توجد نتائج</div>';
      box.classList.remove('hidden');
      return;
    }

    box.innerHTML = results.map(d => `
      <div data-id="${esc(d.id)}" data-name="${esc(d.name)}" role="option">
        <strong>${esc(d.name)}</strong>
        <small style="color:#93a2b5;display:block;font-size:.75rem;margin-top:2px;">
          ${esc(d.cat)} · ${esc(d.ref || '')}
        </small>
      </div>
    `).join('');

    box.classList.remove('hidden');

    box.querySelectorAll('div[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        const id = safeParseInt(el.dataset.id);
        input.value = el.dataset.name;
        box.classList.add('hidden');
        const select = document.getElementById('dx-list');
        if (select) select.value = String(id);
        showProtocol(id);
      });
    });
  }

  const debouncedRender = debounce((val) => {
    renderSuggestions(val.trim());
    selectedIndex = -1;
  }, 250);

  input.addEventListener('input', e => debouncedRender(e.target.value));

  input.addEventListener('focus', e => {
    if (e.target.value.trim().length >= 2) {
      renderSuggestions(e.target.value.trim());
    }
  });

  input.addEventListener('keydown', e => {
    const items = box.querySelectorAll('div[data-id]');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateHighlight(items);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      items[selectedIndex].click();
    } else if (e.key === 'Escape') {
      box.classList.add('hidden');
    }
  });

  function updateHighlight(items) {
    items.forEach((it, i) => {
      it.style.background = i === selectedIndex ? 'rgba(212,175,55,.1)' : '';
    });
  }

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !box.contains(e.target)) {
      box.classList.add('hidden');
    }
  });
}


/* ==========================================================
   05. المحرك الإكلينيكي — ClinicalValidator
   (تحقق طبي موثوق قبل كل عرض/حفظ)
   ========================================================== */
const ClinicalValidator = {

  /* ── تحقق من معطيات المريض الأساسية ── */
  validatePatient({ age, gender, weight, height }) {
    const errors = [], warnings = [];

    if (age != null) {
      if (age < 0 || age > 120) errors.push('العمر خارج النطاق المنطقي (0–120 سنة)');
      if (age < 1)  warnings.push('👶 رضيع — الجرعات يجب أن تحسب بدقة حسب الوزن');
      if (age >= 65) warnings.push('🧓 مريض مسن — ابدأ بجرعات منخفضة وافحص التفاعلات');
    }

    if (weight != null) {
      if (weight < 2 || weight > 250) {
        errors.push('الوزن خارج النطاق المنطقي (2–250 كغ)');
      } else if (age != null && age >= 1 && age <= 12) {
        const exp = expectedChildWeight(age);
        if (exp && (weight < exp * 0.65 || weight > exp * 1.45)) {
          warnings.push(`⚖️ الوزن ${weight}كغ يبتعد كثيراً عن المتوقع لعمر ${age}س (~${exp}كغ) — تحقق من الإدخال`);
        }
      }
    }

    if (height != null && (height < 40 || height > 250)) {
      warnings.push('📏 الطول غير منطقي — تحقق من الوحدة (سم)');
    }

    return { errors, warnings };
  },

  /* ── ملاءمة التشخيص للعمر (حقول اختيارية ageMin/ageMax في البروتوكول) ── */
  checkDiagnosisAge(dx, age) {
    if (!dx || age == null) return { ok: true };
    if (dx.ageMin != null && age < dx.ageMin) {
      return { ok: false, msg: `«${esc(dx.name)}» مصنّف لعمر ≥ ${dx.ageMin} سنة (المريض ${age}س)` };
    }
    if (dx.ageMax != null && age > dx.ageMax) {
      return { ok: false, msg: `«${esc(dx.name)}» مصنّف لعمر ≤ ${dx.ageMax} سنة (المريض ${age}س)` };
    }
    return { ok: true };
  },

  /* ── حساب الجرعة بالوزن: سقف أقصى + تقريب عملي آمن ── */
  calculateDose(med, weight) {
    if (!med || !med.calc || !weight || weight <= 0) return null;
    let dose = med.calc.mgkg * weight;
    let capped = false;

    if (med.calc.max) {
      const maxVal = safeParseFloat(String(med.calc.max).replace(/[^\d.]/g, ''));
      if (maxVal != null && dose > maxVal) { dose = maxVal; capped = true; }
    }

    let rounded;
    if (dose >= 100)      rounded = Math.round(dose / 10) * 10;
    else if (dose >= 10)  rounded = Math.round(dose);
    else                  rounded = Math.round(dose * 2) / 2;

    return { raw: dose, dose: rounded, unit: med.calc.unit || 'ملغ', capped };
  },

  /* ── فحص كل دواء مقابل ملف المريض ──
     حقول اختيارية في بيانات الدواء:
     pregCat (A/B/C/D/X) · pedsOnly:false · calc:{mgkg,unit,max}   */
  checkMedSafety(med, profile) {
    const alerts = [];
    if (!med) return alerts;

    if (profile.pregnant && med.pregCat) {
      const cat = String(med.pregCat).toUpperCase();
      if (cat === 'X') {
        alerts.push({ level: 'block', msg: `⛔ ${med.n}: فئة حمل X — ممنوع أثناء الحمل` });
      } else if (cat === 'D') {
        alerts.push({ level: 'block', msg: `⛔ ${med.n}: فئة حمل D — خطر واضح، يتطلب تقييماً متخصصاً` });
      } else if (cat === 'C') {
        alerts.push({ level: 'warn', msg: `⚠️ ${med.n}: فئة حمل C — يُستخدم بحذر بعد تقييم المنفعة/الخطر` });
      }
    }

    if (med.pedsOnly === false && profile.age != null && profile.age < 12) {
      alerts.push({ level: 'warn', msg: `⚠️ ${med.n}: السلامة للأطفال غير مثبتة` });
    }

    if (med.calc && profile.weight != null) {
      const r = this.calculateDose(med, profile.weight);
      if (r && r.capped) {
        alerts.push({ level: 'warn',
          msg: `⚠️ ${med.n}: الجرعة المحسوبة ${r.raw.toFixed(1)}${r.unit} تتجاوز الحد الأقصى — اعتُمد ${r.dose}${r.unit}` });
      }
    }

    return alerts;
  },

  /* ── تجميع تقرير سلامة كامل (للعرض وللحفظ) ── */
  buildSafetyReport(dx, profile) {
    const report = { blocks: [], warns: [] };

    const ageCheck = this.checkDiagnosisAge(dx, profile.age);
    if (!ageCheck.ok) report.warns.push(ageCheck.msg);

    (dx?.meds || []).forEach(m => {
      this.checkMedSafety(m, profile).forEach(a => {
        (a.level === 'block' ? report.blocks : report.warns).push(a.msg);
      });
    });

    return report;
  }
};


/* ==========================================================
   05-أ. عرض البروتوكول المختار (+ فحص السلامة async)
   ========================================================== */
let currentProtocolId = null;

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function collectPatientProfile() {
  return {
    age:     safeParseInt(document.getElementById('p-age')?.value),
    gender:  document.getElementById('p-gender')?.value || '',
    weight:  safeParseFloat(document.getElementById('p-weight')?.value),
    height:  safeParseFloat(document.getElementById('p-height')?.value),
    pregnant: (document.getElementById('p-gender')?.value === 'أنثى') &&
              !!(document.getElementById('p-pregnant')?.checked)
  };
}

async function buildProtocolHTML(id) {
  const dx = DIAGNOSES.find(d => d.id === id);
  if (!dx) return '';

  const profile = collectPatientProfile();

  /* ── 1) تقرير السلامة الإكلينيكي المحلي ── */
  const localReport = ClinicalValidator.buildSafetyReport(dx, profile);
  let clinicalHTML = '';
  if (localReport.blocks.length || localReport.warns.length) {
    clinicalHTML = `
      <div style="margin-bottom:12px;">
        ${localReport.blocks.map(m => `
          <div style="padding:9px 12px;margin-bottom:6px;background:rgba(229,57,53,.12);
                      border:1px solid rgba(229,57,53,.4);border-radius:8px;
                      font-size:.83rem;color:#ff8a80;line-height:1.7;">${m}</div>`).join('')}
        ${localReport.warns.map(m => `
          <div style="padding:9px 12px;margin-bottom:6px;background:rgba(255,167,38,.08);
                      border:1px solid rgba(255,167,38,.3);border-radius:8px;
                      font-size:.83rem;color:#ffcc80;line-height:1.7;">${m}</div>`).join('')}
      </div>`;
  }

  /* ── 2) فحص السلامة التاريخي (async) ── */
  let safetyHTML = '';
  if (typeof SafetyCheck !== 'undefined' &&
      typeof SafetyCheck.patientHistory === 'function') {
    try {
      const _pName  = document.getElementById('p-name')?.value.trim() || '';
      const _pPhone = document.getElementById('p-phone')?.value.trim() || '';
      const _allergies = document.getElementById('p-allergies')?.value.trim() || '';

      const historyMeds = await SafetyCheck.patientHistory(_pName, _pPhone);

      const safetyResult = SafetyCheck.runAll({
        meds: dx.meds,
        historyMeds,
        allergies: _allergies,
        pregnant: profile.pregnant
      });

      safetyHTML = SafetyCheck.renderWarnings(safetyResult);
    } catch (err) {
      console.warn('SafetyCheck error in showProtocol:', err);
    }
  }

  /* ── 3) الأدوية والجرعات المحسوبة الآمنة ── */
  const medsHTML = dx.meds.map((m, i) => {
    const calc = ClinicalValidator.calculateDose(m, profile.weight);
    const sched = scheduleFor(m.freq);
    let calcInfo = '';
    if (calc) {
      calcInfo = `
        <div style="font-size:.78rem;color:#7ec9ff;margin-top:4px;
                    background:rgba(2,136,209,.1);padding:6px 10px;border-radius:6px;line-height:1.7;">
          💉 الجرعة المحسوبة: <strong>${calc.dose} ${esc(calc.unit)}</strong>
          ${calc.capped ? ' <span style="color:#ffb74d;">(تم ضبطها بالحد الأقصى)</span>' : ''}
          ${m.calc.max ? ` — الحد الأقصى: ${esc(m.calc.max)}` : ''}
          ${sched ? `<br>🕐 المواعيد: ${esc(sched)}` : ''}
        </div>`;
    } else if (m.calc && (!profile.weight || profile.weight <= 0)) {
      calcInfo = `
        <div style="font-size:.75rem;color:#ffb74d;margin-top:4px;line-height:1.7;">
          ⚖️ أدخل وزن المريض لحساب الجرعة تلقائياً
        </div>`;
    }
    return `
      <div style="padding:10px 12px;background:rgba(255,255,255,.03);
                  border-radius:8px;margin-bottom:8px;border-right:3px solid var(--mp-gold);">
        <div style="font-weight:700;color:var(--mp-gold-light);">
          ${i + 1}. ${esc(m.n)}
          ${m.pregCat ? `<span style="font-size:.68rem;background:rgba(233,30,99,.15);
              color:#f48fb1;padding:2px 7px;border-radius:4px;margin-right:6px;">حمل ${esc(m.pregCat)}</span>` : ''}
        </div>
        <div style="font-size:.85rem;color:#c7d2de;margin-top:4px;">
          💊 <strong>${esc(m.dose)}</strong> — ${esc(m.freq)} — ${esc(m.dur)}
        </div>
        ${m.note ? `<div style="font-size:.78rem;color:#93a2b5;margin-top:4px;">📌 ${esc(m.note)}</div>` : ''}
        ${calcInfo}
      </div>`;
  }).join('');

  /* ── 4) المستلزمات والفحوصات ── */
  const suppliesHTML = (dx.supplies || []).length
    ? `<div style="margin-top:14px;">
        <strong style="color:var(--mp-gold-light);">🎒 المستلزمات:</strong>
        <ul style="margin:6px 0 0 20px;color:#c7d2de;font-size:.85rem;line-height:1.8;">
          ${dx.supplies.map(s => `<li>${esc(s)}</li>`).join('')}
        </ul>
      </div>` : '';

  const labsHTML = (dx.labs || []).length
    ? `<div style="margin-top:14px;">
        <strong style="color:var(--mp-gold-light);">🧪 الفحوصات:</strong>
        <ul style="margin:6px 0 0 20px;color:#c7d2de;font-size:.85rem;line-height:1.8;">
          ${dx.labs.map(l => `<li>${esc(l)}</li>`).join('')}
        </ul>
      </div>` : '';

  /* ── 5) وصية الاستخدام الرشيد للمضادات ── */
  const stewardshipHTML = dx.antibiotic ? `
    <div style="margin-top:12px;padding:11px 13px;background:rgba(2,136,209,.08);
                border:1px solid rgba(2,136,209,.3);border-radius:8px;
                font-size:.8rem;color:#7ec9ff;line-height:1.8;">
      <strong>🧫 مضاد حيوي — الاستخدام الرشيد:</strong><br>
      • وثّق الاستطباب قبل الصرف &nbsp;• خذ مسحة/زرعاً عند الإمكان<br>
      • راجع الاستجابة خلال 48–72 ساعة &nbsp;• لا توصف للعدوى الفيروسية
    </div>` : '';

  return `
    <div class="flex-between" style="align-items:flex-start;">
      <h2 class="card-title dark" style="flex:1;">
        🩺 ${esc(dx.name)}
        <span style="font-size:.75rem;font-weight:400;color:#93a2b5;margin-right:auto;">
          ${esc(dx.cat)}
        </span>
      </h2>
      <button type="button" class="btn-icon btn-sm protocol-close-btn" id="protocol-close-btn"
              title="إغلاق البروتوكول" aria-label="إغلاق البروتوكول"
              style="background:rgba(255,255,255,.06);color:var(--text-inverse);flex-shrink:0;">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    <div style="font-size:.78rem;color:#93a2b5;margin-bottom:14px;">
      📚 مرجع: <strong style="color:#c7d2de;">${esc(dx.ref || 'WHO / Guidelines')}</strong>
    </div>

    ${clinicalHTML}
    ${safetyHTML}
    ${stewardshipHTML}

    <div style="margin-bottom:14px;">
      <strong style="color:var(--mp-gold-light);display:block;margin-bottom:8px;">
        💊 الأدوية والجرعات:
      </strong>
      ${medsHTML}
    </div>

    ${suppliesHTML}
    ${labsHTML}

    <div style="margin-top:14px;padding:12px;background:rgba(67,160,71,.08);
                border:1px solid rgba(67,160,71,.25);border-radius:8px;">
      <strong style="color:#81c784;">💡 النصائح:</strong>
      <p style="color:#c7d2de;font-size:.85rem;margin-top:6px;line-height:1.8;">
        ${esc(dx.advice || '—')}
      </p>
    </div>

    ${dx.alert ? `
      <div style="margin-top:10px;padding:12px;background:rgba(229,57,53,.08);
                  border:1px solid rgba(229,57,53,.3);border-radius:8px;">
        <strong style="color:#ff8a80;">⚠️ تحذير:</strong>
        <p style="color:#ffb4b4;font-size:.85rem;margin-top:6px;line-height:1.8;">
          ${esc(dx.alert)}
        </p>
      </div>
    ` : ''}

    <div style="margin-top:12px;padding-top:10px;border-top:1px dashed rgba(255,255,255,.1);
                font-size:.7rem;color:#93a2b5;text-align:center;">
      ⚠️ مراجعة إكلينيكية آلية — القرار النهائي مسؤولية الطبيب المعالج
    </div>
  `;
}

async function showProtocol(id) {
  const dx = DIAGNOSES.find(d => d.id === id);
  if (!dx) return;

  currentProtocolId = id;
  const html = await buildProtocolHTML(id);

  if (isMobileViewport()) {
    const modal = document.getElementById('protocol-modal');
    const modalBody = document.getElementById('protocol-modal-body');
    const box = document.getElementById('protocol-box');
    if (modal && modalBody) {
      box?.classList.add('hidden');
      modalBody.innerHTML = html;
      modal.classList.remove('hidden');
      document.getElementById('protocol-close-btn')?.addEventListener('click', hideProtocol);
      return;
    }
  }

  const box = document.getElementById('protocol-box');
  if (!box) return;

  box.innerHTML = html;
  box.classList.remove('hidden');
  document.getElementById('protocol-modal')?.classList.add('hidden');
  document.getElementById('protocol-close-btn')?.addEventListener('click', hideProtocol);
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideProtocol() {
  currentProtocolId = null;
  document.getElementById('protocol-box')?.classList.add('hidden');
  document.getElementById('protocol-modal')?.classList.add('hidden');
}


/* ==========================================================
   06-أ. نافذة سبب التجاوز الإلزامي (موثّقة طبياً)
   ========================================================== */
function requestOverrideReason(alerts) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(4,10,20,.8);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:#0d1b2e;border:1px solid rgba(229,57,53,.5);border-radius:14px;
                  max-width:460px;width:100%;padding:22px;direction:rtl;" role="dialog" aria-modal="true">
        <div style="font-weight:800;color:#ff8a80;font-size:1.05rem;margin-bottom:6px;">
          ⛔ تنبيهات سلامة حرجة
        </div>
        <div style="font-size:.82rem;color:#c7d2de;line-height:1.9;max-height:140px;overflow-y:auto;
                    background:rgba(229,57,53,.07);border-radius:8px;padding:10px 12px;margin-bottom:14px;">
          ${alerts.map(a => '• ' + esc(a)).join('<br>')}
        </div>
        <label style="display:block;font-size:.82rem;color:#ffb74d;margin-bottom:6px;font-weight:700;">
          ✍️ سبب التجاوز الإكلينيكي (إلزامي — يُسجَّل في التدقيق):
        </label>
        <textarea id="override-reason-input" rows="3"
          placeholder="مثال: لا توجد بدائل مناسبة، المريض تحت المراقبة..."
          style="width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);
                 border-radius:8px;color:#e8eef5;padding:10px;font-family:inherit;font-size:.85rem;
                 resize:vertical;box-sizing:border-box;"></textarea>
        <div style="display:flex;gap:10px;margin-top:16px;">
          <button type="button" id="override-confirm"
            style="flex:1;padding:10px;background:rgba(229,57,53,.85);color:#fff;border:none;
                   border-radius:8px;font-weight:700;cursor:pointer;">تأكيد التجاوز</button>
          <button type="button" id="override-cancel"
            style="flex:1;padding:10px;background:rgba(255,255,255,.08);color:#c7d2de;
                   border:1px solid rgba(255,255,255,.15);border-radius:8px;cursor:pointer;">إلغاء</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    const input = overlay.querySelector('#override-reason-input');
    input.focus();

    const cleanup = (val) => { overlay.remove(); resolve(val); };

    overlay.querySelector('#override-confirm').addEventListener('click', () => {
      const reason = input.value.trim();
      if (reason.length < 5) {
        input.style.borderColor = '#e53935';
        input.placeholder = '⚠️ اكتب سبباً واضحاً (5 أحرف على الأقل)';
        input.focus();
        return;
      }
      cleanup(reason);
    });
    overlay.querySelector('#override-cancel').addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(null); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') cleanup(null);
    });
  });
}


/* ==========================================================
   06-ب. حفظ الوصفة — بوابات السلامة + الحفظ الذرّي
   ========================================================== */
async function initPrescriptionForm() {
  const form = document.getElementById('prescription-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    await savePrescription({ thenPrint: false });
  });

  document.getElementById('save-print-btn')?.addEventListener('click', async () => {
    await savePrescription({ thenPrint: true });
  });
}

async function savePrescription({ thenPrint = false } = {}) {
  const form = document.getElementById('prescription-form');
  if (!form) return;

  /* ── جمع البيانات ── */
  const name    = (document.getElementById('p-name')?.value || '').trim();
  const age     = clampNum(safeParseInt(document.getElementById('p-age')?.value), 0, 120);
  const gender  = document.getElementById('p-gender')?.value || '';
  const weight  = clampNum(safeParseFloat(document.getElementById('p-weight')?.value), 2, 250);
  const height  = clampNum(safeParseFloat(document.getElementById('p-height')?.value), 40, 250);
  const phone   = (document.getElementById('p-phone')?.value || '').trim();
  const hospital = document.getElementById('p-hospital')?.value || '';
  const diagnosisId = safeParseInt(document.getElementById('dx-list')?.value);

  const allergies  = (document.getElementById('p-allergies')?.value || '').trim();
  const pregnant   = (gender === 'أنثى') && !!(document.getElementById('p-pregnant')?.checked);
  const chronicMeds = (document.getElementById('p-chronic')?.value || '').trim();

  /* ── بوابة 1: الحقول الإلزامية ── */
  if (!name || age == null || !gender || !diagnosisId) {
    showToast('⚠️ يرجى إكمال الحقول الإلزامية (الاسم، العمر، الجنس، التشخيص)', 'warning');
    return;
  }

  const dx = DIAGNOSES.find(d => d.id === diagnosisId);
  if (!dx) {
    showToast('❌ التشخيص المحدد غير صالح', 'error');
    return;
  }

  /* ── بوابة 2: التحقق الإكلينيكي من معطيات المريض ── */
  const patientCheck = ClinicalValidator.validatePatient({ age, gender, weight, height });
  if (patientCheck.errors.length) {
    showToast('⛔ ' + patientCheck.errors[0], 'error', 5000);
    return;
  }
  patientCheck.warnings.forEach(w => showToast(w, 'warning', 6000));

  /* ── بوابة 3: ملاءمة التشخيص للعمر ── */
  const ageCheck = ClinicalValidator.checkDiagnosisAge(dx, age);
  if (!ageCheck.ok) {
    const ok = confirm(ageCheck.msg + '\n\nهل تريد المتابعة رغم عدم تطابق الفئة العمرية؟');
    if (!ok) { showToast('تم إيقاف الوصفة — غير مناسبة للفئة العمرية', 'error'); return; }
    await logAudit('تجاوز عدم تطابق عمر/تشخيص', ageCheck.msg);
  }

  /* ── بوابة 4: السلامة الدوائية الموحّدة ── */
  const safetyOverride = { alerts: [], reason: null, by: session.username, at: null };
  const profile = { age, gender, weight, height, pregnant };

  const localReport = ClinicalValidator.buildSafetyReport(dx, profile);
  let blockingAlerts = [...localReport.blocks];

  if (typeof SafetyCheck !== 'undefined' &&
      typeof SafetyCheck.patientHistory === 'function') {
    try {
      const historyMeds = await SafetyCheck.patientHistory(name, phone);
      const safety = SafetyCheck.runAll({
        meds: dx.meds, historyMeds, allergies, pregnant
      });
      blockingAlerts = blockingAlerts.concat(safety.blocking || []);
    } catch (err) {
      console.warn('Safety gate error:', err);
    }
  }

  if (blockingAlerts.length) {
    safetyOverride.alerts = blockingAlerts;
    const reason = await requestOverrideReason(blockingAlerts);
    if (!reason) {
      showToast('⛔ تم إيقاف الوصفة لأسباب سلامة', 'error');
      return;
    }
    safetyOverride.reason = reason;
    safetyOverride.at = Date.now();
    await logAudit('تجاوز تنبيه سلامة',
      `${name} — ${blockingAlerts.length} تنبيه حرج — السبب: ${reason}`);
  }
  localReport.warns.forEach(w => showToast(w, 'warning', 6000));

  /* ── بوابة 5: الفحص السريري عبر Blockchain ── */
  if (typeof PrescriptionChain !== 'undefined' &&
      typeof PrescriptionChain.validateMedical === 'function') {
    try {
      const bcCheck = PrescriptionChain.validateMedical({
        rxNumber: 'PENDING',
        patientName: name, age, gender,
        diagnosis: dx.name, diagnosisId: dx.id,
        meds: dx.meds, allergies,
        doctorUsername: session.username,
        doctor: session.fullName
      });
      if (bcCheck.errors && bcCheck.errors.length) {
        console.warn('⛔ الفحص السريري (Blockchain):', bcCheck.errors);
        showToast('⚠️ ' + bcCheck.errors[0], 'warning', 6000);
      }
    } catch (err) {
      console.warn('blockchain validateMedical error:', err);
    }
  }

  /* ── تعطيل الأزرار أثناء الحفظ ── */
  const btn = form.querySelector('button[type="submit"]');
  const savePrintBtn = document.getElementById('save-print-btn');
  const originalHTML = btn ? btn.innerHTML : '';
  const originalPrintHTML = savePrintBtn ? savePrintBtn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ جارٍ الحفظ...'; }
  if (savePrintBtn) { savePrintBtn.disabled = true; savePrintBtn.innerHTML = '⏳ جارٍ الحفظ...'; }

  let prescriptionId = null;
  let patientId = null;
  let patientSaved = false;
  let rxSaved = false;
  let blockchainReceipt = null;

  try {
    /* ── فحص الصلاحية ── */
    if (typeof hasPermission === 'function' && !hasPermission('create_prescription')) {
      showToast('🚫 لا تمتلك صلاحية إنشاء وصفات', 'error');
      return;
    }

    /* ── رقم وصفة + كود تحقق ── */
    let rxMeta = { rxNumber: null, verificationCode: null };
    if (typeof RxSecure !== 'undefined' && typeof RxSecure.assign === 'function') {
      try { rxMeta = await RxSecure.assign(name); }
      catch (err) { console.warn('RxSecure error:', err); }
    }

    /* ── بيانات مشتقة ── */
    const bmi = (weight && height) ? +(weight / Math.pow(height / 100, 2)).toFixed(1) : null;
    const validUntil = Date.now() + RX_VALIDITY_DAYS * 864e5;

    /* ══ الحفظ الذرّي: مريض ← وصفة، مع Rollback عند الفشل ══ */
    patientId = await DB.add('patients', {
      name, age, gender, weight, height, bmi, phone, hospital,
      allergies, pregnant, chronicMeds,
      createdAt: Date.now(),
      createdBy: session.username
    });
    patientSaved = true;

    prescriptionId = await DB.add('prescriptions', {
      rxNumber: rxMeta.rxNumber,
      verificationCode: rxMeta.verificationCode,
      patientId,
      patientName: name,
      age, gender, weight, height, bmi, phone, hospital,
      diagnosisId: dx.id,
      diagnosis: dx.name,
      diagnosisCategory: dx.cat,
      meds: dx.meds,
      supplies: dx.supplies || [],
      labs: dx.labs || [],
      advice: dx.advice || '',
      alert: dx.alert || '',
      allergies, pregnant, chronicMeds,
      safetyOverride: safetyOverride.alerts.length ? safetyOverride : null,
      validUntil,
      refills: DEFAULT_REFILLS,
      doctor: session.fullName,
      doctorId: session.id,
      doctorUsername: session.username,
      doctorLicense: session.license || null,
      role: session.role,
      createdAt: Date.now()
    });
    rxSaved = true;

    /* ── تسجيل على Blockchain (اختياري — لا يوقف الحفظ) ── */
    if (typeof PrescriptionChain !== 'undefined' &&
        typeof PrescriptionChain.addPrescription === 'function' &&
        rxMeta.rxNumber) {
      try {
        await PrescriptionChain.init();

        blockchainReceipt = await PrescriptionChain.addPrescription({
          rxNumber: rxMeta.rxNumber,
          patientName: name,
          age, gender, weight, phone, hospital,
          diagnosis: dx.name, diagnosisId: dx.id,
          meds: dx.meds,
          allergies,
          doctor: session.fullName,
          doctorUsername: session.username,
          verificationCode: rxMeta.verificationCode,
          createdAt: Date.now()
        });

        const saved = await DB.get('prescriptions', prescriptionId);
        if (saved) {
          saved.blockchainHash = blockchainReceipt.hash;
          saved.blockchainIndex = blockchainReceipt.index;
          saved.blockchainSignature = blockchainReceipt.signature;
          saved.blockchainMerkle = blockchainReceipt.merkleRoot;
          saved.blockchainWarnings = blockchainReceipt.clinicalWarnings || [];
          await DB.put('prescriptions', saved);
        }

        console.log('⛓️ وصفة موقعة — كتلة #' + blockchainReceipt.index);
      } catch (err) {
        if (err && err.clinicalErrors && err.clinicalErrors.length) {
          console.warn('⛔ الفحص السريري (Blockchain):', err.clinicalErrors);
          showToast('⚠️ ' + err.clinicalErrors[0], 'warning', 6000);
        } else {
          console.warn('blockchain error:', err);
        }
      }
    }

    /* ── سجل التدقيق ── */
    await logAudit('إنشاء وصفة',
      `${name} — ${dx.name}${rxMeta.rxNumber ? ' — ' + rxMeta.rxNumber : ''}` +
      (blockchainReceipt ? ` [BC:#${blockchainReceipt.index}]` : ''));

    /* ── النجاح ── */
    showToast(
      `✅ تم حفظ وصفة ${name} بنجاح${rxMeta.rxNumber ? ' · ' + rxMeta.rxNumber : ''}` +
      (blockchainReceipt ? ' ⛓️' : ''), 'success');
    playSaveAnimation(btn);
    clearDraft();
    setUnsavedState(false);

    if (typeof PatientSummary !== 'undefined' &&
        typeof PatientSummary.showActions === 'function') {
      try {
        PatientSummary.showActions({
          id: prescriptionId,
          rxNumber: rxMeta.rxNumber,
          verificationCode: rxMeta.verificationCode,
          patientName: name,
          age, gender, weight, height, bmi, phone, hospital,
          diagnosis: dx.name,
          meds: dx.meds,
          supplies: dx.supplies || [],
          labs: dx.labs || [],
          advice: dx.advice || '',
          alert: dx.alert || '',
          allergies, pregnant, chronicMeds,
          validUntil,
          doctor: session.fullName,
          createdAt: Date.now()
        });
      } catch (err) { console.warn('PatientSummary error:', err); }
    }

    try {
      window.dispatchEvent(new CustomEvent('prescription-saved', {
        detail: { id: prescriptionId, rxNumber: rxMeta.rxNumber, blockchain: blockchainReceipt }
      }));
    } catch (_) { /* تجاهل */ }

    /* ── إعادة تعيين النموذج ── */
    setTimeout(() => {
      form.reset();
      hideProtocol();
      document.getElementById('dx-suggestions')?.classList.add('hidden');
      updateFormProgress();
      togglePregnancyField();
      updateBirthYearHint();
      updateBMIHint();

      const hospitalSelect = document.getElementById('p-hospital');
      if (session.hospital && hospitalSelect && typeof HOSPITALS !== 'undefined') {
        const idx = HOSPITALS.indexOf(session.hospital);
        if (idx >= 0) hospitalSelect.selectedIndex = idx;
      }
    }, 500);

    /* ── تحديث الواجهة ── */
    await loadRecords();
    await updateStats();
    await renderRecentPatients();

    if (thenPrint && prescriptionId) {
      await printRecord(prescriptionId);
    }

  } catch (err) {
    /* ══ Rollback: إعادة النظام لحالته قبل المحاولة ══ */
    console.error('save prescription error:', err);
    try {
      if (rxSaved && prescriptionId) await DB.del('prescriptions', prescriptionId);
      else if (patientSaved && patientId) await DB.del('patients', patientId);
    } catch (rbErr) {
      console.error('Rollback failed:', rbErr);
    }
    showToast('❌ فشل حفظ الوصفة (تم التراجع عن التغييرات): ' + (err.message || err), 'error', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    if (savePrintBtn) { savePrintBtn.disabled = false; savePrintBtn.innerHTML = originalPrintHTML; }
  }
}


/* ==========================================================
   07. جدول السجلات + البحث (+ صلاحية + واتساب + blockchain)
   ========================================================== */
let allRecords = [];
window.allRecords = allRecords;

async function loadRecords() {
  try {
    if (typeof hasPermission === 'function' && !hasPermission('view_records')) {
      const tbody = document.getElementById('records-body');
      if (tbody) tbody.innerHTML = `
        <tr><td colspan="8" class="empty-state">🚫 لا تمتلك صلاحية عرض السجلات</td></tr>`;
      return;
    }

    allRecords = await DB.all('prescriptions');
    window.allRecords = allRecords;
    allRecords.sort((a, b) => b.createdAt - a.createdAt);
    renderRecords(allRecords);
    updateRecordsCountBadge(allRecords.length);
  } catch (err) {
    console.error('loadRecords error:', err);
    showToast('❌ فشل تحميل السجلات', 'error');
  }
}

/* ── شارة صلاحية الوصفة ── */
function validityChip(r) {
  if (!r.validUntil) return '';
  const daysLeft = Math.ceil((r.validUntil - Date.now()) / 864e5);
  if (daysLeft < 0) {
    return `<span title="انتهت الصلاحية" style="display:inline-block;font-size:.68rem;
      background:rgba(158,158,158,.15);color:#bdbdbd;padding:2px 7px;border-radius:4px;margin-top:4px;">
      ⌛ منتهية منذ ${Math.abs(daysLeft)} يوم</span>`;
  }
  return `<span title="صالحة حتى ${new Date(r.validUntil).toLocaleDateString('ar-EG')}"
    style="display:inline-block;font-size:.68rem;background:rgba(67,160,71,.12);
    color:#81c784;padding:2px 7px;border-radius:4px;margin-top:4px;">
    ✅ سارية (${daysLeft} يوم)</span>`;
}

function renderRecords(records) {
  const tbody = document.getElementById('records-body');
  if (!tbody) return;

  if (!records.length) {
    tbody.innerHTML = `
      <tr><td colspan="8" class="empty-state">📭 لا توجد وصفات محفوظة بعد</td></tr>`;
    return;
  }

  const canDelete = typeof hasPermission === 'function'
    ? hasPermission('delete_records')
    : session.role === 'admin';

  const hasSummary = typeof PatientSummary !== 'undefined';

  tbody.innerHTML = records.map((r, i) => {
    const date = new Date(r.createdAt).toLocaleDateString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const time = new Date(r.createdAt).toLocaleTimeString('ar-EG', {
      hour: '2-digit', minute: '2-digit'
    });

    const meta = [
      r.age != null ? `${r.age}س` : '',
      r.gender || '',
      r.weight ? `${r.weight}كغ` : '',
      r.bmi ? `BMI ${r.bmi}` : ''
    ].filter(Boolean).join(' · ');

    let safetyBadges = '';
    if (r.allergies) {
      safetyBadges += `<span title="${esc('حساسية: ' + r.allergies)}" style="display:inline-block;font-size:.7rem;
        background:rgba(255,152,0,.15);color:#ffb74d;padding:2px 6px;border-radius:4px;margin-top:4px;">🩸 حساسية</span> `;
    }
    if (r.pregnant) {
      safetyBadges += `<span title="حامل" style="display:inline-block;font-size:.7rem;
        background:rgba(233,30,99,.15);color:#f48fb1;padding:2px 6px;border-radius:4px;margin-top:4px;">🤰 حامل</span>`;
    }
    if (r.safetyOverride) {
      safetyBadges += `<span title="${esc('تجاوز سلامة: ' + (r.safetyOverride.reason || ''))}"
        style="display:inline-block;font-size:.7rem;background:rgba(229,57,53,.15);
        color:#ff8a80;padding:2px 6px;border-radius:4px;margin-top:4px;">⚠️ تجاوز موثق</span>`;
    }

    let bcBadge = '';
    if (r.blockchainHash) {
      bcBadge = `<div class="bc-badge" title="موثقة على blockchain">⛓️ BC#${esc(r.blockchainIndex ?? '?')}</div>`;
    }

    return `
      <tr>
        <td>${i + 1}</td>
        <td>
          <strong>${esc(r.patientName)}</strong>
          ${safetyBadges ? `<br>${safetyBadges}` : ''}
          ${bcBadge}
          ${r.rxNumber ? `<br><small style="color:var(--mp-gold);font-family:monospace;">${esc(r.rxNumber)}</small>` : ''}
          ${r.phone ? `<br><small style="color:#93a2b5;">${esc(r.phone)}</small>` : ''}
          ${validityChip(r)}
        </td>
        <td style="font-size:.82rem;">${esc(meta) || '—'}</td>
        <td><span style="color:var(--mp-gold-light);">${esc(r.diagnosis)}</span></td>
        <td style="font-size:.82rem;">${esc(r.hospital || '—')}</td>
        <td style="font-size:.82rem;">${esc(r.doctor || '—')}</td>
        <td style="font-size:.8rem;">${date}<br>
          <small style="color:#93a2b5;">${time}</small>
        </td>
        <td>
          <div class="row-actions">
            <button type="button" class="view-btn" data-id="${esc(r.id)}" title="عرض">👁️</button>
            <button type="button" class="print-btn-row" data-id="${esc(r.id)}" title="طباعة">🖨️</button>
            ${hasSummary && r.phone ? `<button type="button" class="wa-btn" data-id="${esc(r.id)}" title="ملخص واتساب">💬</button>` : ''}
            ${canDelete ? `<button type="button" class="del-btn" data-id="${esc(r.id)}" title="حذف">🗑️</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.view-btn').forEach(b => {
    b.addEventListener('click', () => viewRecord(parseInt(b.dataset.id, 10)));
  });
  tbody.querySelectorAll('.print-btn-row').forEach(b => {
    b.addEventListener('click', () => printRecord(parseInt(b.dataset.id, 10)));
  });
  tbody.querySelectorAll('.wa-btn').forEach(b => {
    b.addEventListener('click', () => {
      const rec = allRecords.find(x => x.id === parseInt(b.dataset.id, 10));
      if (rec && typeof PatientSummary !== 'undefined' &&
          typeof PatientSummary.sendWhatsApp === 'function') {
        PatientSummary.sendWhatsApp(rec);
      }
    });
  });
  tbody.querySelectorAll('.del-btn').forEach(b => {
    b.addEventListener('click', () => deleteRecord(parseInt(b.dataset.id, 10)));
  });
}

function initRecordsSearch() {
  const input = document.getElementById('records-search');
  if (!input) return;

  const debouncedSearch = debounce((q) => {
    q = q.trim().toLowerCase();
    if (!q) { renderRecords(allRecords); return; }

    const filtered = allRecords.filter(r => {
      const haystack = [
        r.patientName, r.diagnosis, r.phone, r.hospital,
        r.doctor, r.rxNumber, r.diagnosisCategory
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });

    renderRecords(filtered);
  }, 250);

  input.addEventListener('input', e => debouncedSearch(e.target.value));
}


/* ==========================================================
   08. عرض / حذف / طباعة سجل (+ QR + blockchain + صلاحية)
   ========================================================== */
async function viewRecord(id) {
  const r = allRecords.find(x => x.id === id);
  if (!r) return;

  const setVal = (elId, val) => {
    const el = document.getElementById(elId);
    if (el) el.value = val ?? '';
  };

  setVal('p-name', r.patientName);
  setVal('p-age', r.age);
  setVal('p-gender', r.gender);
  setVal('p-weight', r.weight);
  setVal('p-height', r.height);
  setVal('p-phone', r.phone);

  const allergiesEl = document.getElementById('p-allergies');
  if (allergiesEl) allergiesEl.value = r.allergies || '';
  const chronicEl = document.getElementById('p-chronic');
  if (chronicEl) chronicEl.value = r.chronicMeds || '';

  togglePregnancyField();
  const pregnantEl = document.getElementById('p-pregnant');
  if (pregnantEl) pregnantEl.checked = !!r.pregnant;

  if (r.hospital && typeof HOSPITALS !== 'undefined') {
    const sel = document.getElementById('p-hospital');
    const idx = HOSPITALS.indexOf(r.hospital);
    if (sel && idx >= 0) sel.selectedIndex = idx;
  }

  const dxList = document.getElementById('dx-list');
  if (dxList && r.diagnosisId != null) dxList.value = String(r.diagnosisId);

  await showProtocol(r.diagnosisId);
  updateFormProgress();
  updateBirthYearHint();
  updateBMIHint();

  document.querySelector('.grid-2')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast(`👁️ عرض وصفة: ${esc(r.patientName)}`, 'info', 2000);
}

async function deleteRecord(id) {
  if (!confirm('⚠️ هل أنت متأكد من حذف هذه الوصفة؟\nلا يمكن التراجع عن هذا الإجراء.')) return;

  try {
    await DB.del('prescriptions', id);
    await logAudit('حذف وصفة', `المعرف: ${id}`);
    showToast('🗑️ تم حذف الوصفة', 'success');
    await loadRecords();
    await updateStats();
    await renderRecentPatients();
  } catch (err) {
    console.error('delete error:', err);
    showToast('❌ فشل الحذف', 'error');
  }
}

async function printRecord(id) {
  const r = allRecords.find(x => x.id === id);
  if (!r) return;

  /* ── QR برابط تحقق كامل ── */
  let qrImg = '';
  if (r.rxNumber && typeof RxSecure !== 'undefined' &&
      typeof RxSecure.qrDataURL === 'function') {
    try {
      const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/');
      const verifyLink =
        `${base}verify.html?rx=${encodeURIComponent(r.rxNumber)}` +
        `&code=${encodeURIComponent(r.verificationCode || '')}`;
      const qr = await RxSecure.qrDataURL(verifyLink, 110);
      if (qr) {
        qrImg = `<img src="${qr}" width="110" height="110"
                  style="border:1px solid #ddd;border-radius:8px;background:#fff;">`;
      }
    } catch (err) { console.warn('QR error:', err); }
  }

  /* ── كتلة رقم الوصفة ── */
  const rxBlock = r.rxNumber ? `
    <div style="display:flex;align-items:center;gap:14px;margin:14px 0;padding:12px;
                border:1.5px dashed #d4af37;border-radius:10px;background:#fffdf5;">
      ${qrImg}
      <div style="font-size:.9rem;">
        <div>رقم الوصفة: <strong style="font-family:monospace;">${esc(r.rxNumber)}</strong></div>
        <div style="margin-top:4px;">كود التحقق:
          <strong style="font-family:monospace;letter-spacing:3px;color:#b8860b;">
            ${esc(r.verificationCode || '—')}</strong>
        </div>
        <div style="color:#888;font-size:.72rem;margin-top:6px;">امسح رمز QR أو زر صفحة التحقق</div>
      </div>
    </div>` : '';

  /* ── كتلة الصلاحية والتعبئات ── */
  const validityBlock = r.validUntil ? `
    <div style="margin:12px 0;padding:10px 14px;background:#f9fbe7;
                border-right:3px solid #7cb342;border-radius:6px;font-size:.85rem;">
      ⏳ صالحة حتى: <strong>${new Date(r.validUntil).toLocaleDateString('ar-EG')}</strong>
      &nbsp;·&nbsp; عدد التعبئات المسموحة: <strong>${r.refills ?? 0}</strong>
    </div>` : '';

  /* ── كتلة blockchain ── */
  const bcBlock = r.blockchainHash ? `
    <div style="margin:12px 0;padding:10px 14px;background:#f0f9ff;
                border-right:3px solid #0288d1;border-radius:6px;font-size:.8rem;">
      <strong>⛓️ موثقة على Blockchain:</strong>
      <div style="font-family:monospace;font-size:.72rem;color:#555;margin-top:4px;word-break:break-all;">
        ${esc(String(r.blockchainHash).substring(0, 40))}...
      </div>
      <div style="font-size:.7rem;color:#888;margin-top:4px;">
        كتلة #${esc(r.blockchainIndex ?? '—')}
        ${r.blockchainSignature ? ` — التوقيع: ${esc(String(r.blockchainSignature).substring(0, 16))}...` : ''}
      </div>
    </div>` : '';

  /* ── معلومات السلامة ── */
  const safetyInfo = r.allergies ? `
    <div style="margin:8px 0;padding:8px 12px;background:#fff8e1;
                border-right:3px solid #ff9800;border-radius:6px;font-size:.85rem;">
      <strong>⚠️ حساسية معروفة:</strong> ${esc(r.allergies)}
    </div>` : '';

  const pregnancyInfo = r.pregnant ? `
    <div style="margin:8px 0;padding:8px 12px;background:#fce4ec;
                border-right:3px solid #e91e63;border-radius:6px;font-size:.85rem;">
      <strong>🤰 المريضة حامل:</strong> تم مراعاة ذلك في الوصفة
    </div>` : '';

  const chronicInfo = r.chronicMeds ? `
    <div style="margin:8px 0;padding:8px 12px;background:#e8eaf6;
                border-right:3px solid #3f51b5;border-radius:6px;font-size:.85rem;">
      <strong>💊 أدوية مزمنة:</strong> ${esc(r.chronicMeds)}
    </div>` : '';

  const overrideInfo = r.safetyOverride ? `
    <div style="margin:8px 0;padding:8px 12px;background:#fff3f3;
                border-right:3px solid #e53935;border-radius:6px;font-size:.82rem;">
      <strong>⚠️ تم تجاوز تنبيهات سلامة:</strong> ${esc((r.safetyOverride.alerts || []).join(' | '))}
      <br><small>السبب: ${esc(r.safetyOverride.reason || '—')} — بقلم: ${esc(r.safetyOverride.by || '—')}</small>
    </div>` : '';

  const bmiRow = r.bmi ? `
    <tr><td colspan="2"><strong>BMI:</strong> ${esc(r.bmi)}
      (${r.bmi < 18.5 ? 'نحافة' : r.bmi < 25 ? 'طبيعي' : r.bmi < 30 ? 'زيادة وزن' : 'سمنة'})</td></tr>` : '';

  const printHTML = `
    <div style="padding:30px;font-family:'Tajawal','Cairo',sans-serif;direction:rtl;">
      <div style="text-align:center;border-bottom:2px solid #d4af37;padding-bottom:16px;margin-bottom:20px;">
        <h1 style="color:#0a1628;margin:0;">⚕️ MediPrescribe</h1>
        <small style="color:#666;">النظام الوطني الذكي للوصفات الطبية — وزارة الصحة والبيئة</small>
      </div>

      ${rxBlock}
      ${bcBlock}
      ${validityBlock}

      <h2 style="color:#0a1628;border-bottom:1px dashed #ccc;padding-bottom:8px;">
        وصفة طبية — ${esc(r.diagnosis)}
      </h2>

      ${safetyInfo}
      ${pregnancyInfo}
      ${chronicInfo}
      ${overrideInfo}

      <table style="width:100%;margin:16px 0;font-size:.9rem;">
        <tr>
          <td><strong>المريض:</strong> ${esc(r.patientName)}</td>
          <td><strong>العمر:</strong> ${esc(r.age ?? '—')} سنة</td>
        </tr>
        <tr>
          <td><strong>الجنس:</strong> ${esc(r.gender || '—')}</td>
          <td><strong>الوزن:</strong> ${esc(r.weight || '—')} كغ</td>
        </tr>
        <tr>
          <td><strong>الهاتف:</strong> ${esc(r.phone || '—')}</td>
          <td><strong>المستشفى:</strong> ${esc(r.hospital || '—')}</td>
        </tr>
        ${bmiRow}
      </table>

      <h3 style="color:#0a1628;margin-top:20px;">الأدوية:</h3>
      <table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-top:8px;">
        <thead>
          <tr style="background:#f4f7f6;">
            <th style="border:1px solid #ccc;padding:8px;text-align:right;">الدواء</th>
            <th style="border:1px solid #ccc;padding:8px;text-align:right;">الجرعة</th>
            <th style="border:1px solid #ccc;padding:8px;text-align:right;">التكرار</th>
            <th style="border:1px solid #ccc;padding:8px;text-align:right;">المواعيد</th>
            <th style="border:1px solid #ccc;padding:8px;text-align:right;">المدة</th>
          </tr>
        </thead>
        <tbody>
          ${(r.meds || []).map(m => {
            const calc = ClinicalValidator.calculateDose(m, r.weight);
            const doseText = calc
              ? `${esc(m.dose)} <br><small style="color:#0277bd;">محسوبة: ${calc.dose} ${esc(calc.unit)}</small>`
              : esc(m.dose);
            return `
            <tr>
              <td style="border:1px solid #ccc;padding:8px;">${esc(m.n)}</td>
              <td style="border:1px solid #ccc;padding:8px;">${doseText}</td>
              <td style="border:1px solid #ccc;padding:8px;">${esc(m.freq)}</td>
              <td style="border:1px solid #ccc;padding:8px;font-size:.78rem;">${esc(scheduleFor(m.freq) || '—')}</td>
              <td style="border:1px solid #ccc;padding:8px;">${esc(m.dur)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      ${r.advice ? `
        <div style="margin-top:20px;padding:12px;background:#f4f7f6;border-right:4px solid #00796b;">
          <strong>💡 النصائح:</strong>
          <p style="margin-top:6px;line-height:1.8;">${esc(r.advice)}</p>
        </div>` : ''}

      ${r.alert ? `
        <div style="margin-top:12px;padding:12px;background:#fff3f3;border-right:4px solid #e53935;">
          <strong>⚠️ تحذير:</strong>
          <p style="margin-top:6px;line-height:1.8;">${esc(r.alert)}</p>
        </div>` : ''}

      <div style="margin-top:40px;display:flex;justify-content:space-between;font-size:.85rem;">
        <div>
          <div>الطبيب: <strong>${esc(r.doctor || '—')}</strong>
            ${r.doctorLicense ? `<br><small style="color:#666;">رقم الترخيص: ${esc(r.doctorLicense)}</small>` : ''}
          </div>
          <div style="margin-top:30px;border-top:1px solid #333;width:200px;padding-top:4px;">التوقيع</div>
        </div>
        <div style="text-align:left;">
          <div>التاريخ: ${new Date(r.createdAt).toLocaleDateString('ar-EG')}</div>
          <div>الوقت: ${new Date(r.createdAt).toLocaleTimeString('ar-EG')}</div>
        </div>
      </div>

      <div style="margin-top:26px;padding-top:10px;border-top:1px dashed #bbb;font-size:.7rem;color:#888;text-align:center;">
        وصفة صادرة إلكترونياً — تحقق عبر رمز QR · صالحة ${RX_VALIDITY_DAYS} يوم من تاريخ الإصدار ·
        ${esc(r.rxNumber || '')} · الإصدار ${APP_VERSION}
      </div>
    </div>
  `;

  const printWindow = window.open('', '_blank', 'width=800,height=900,noopener');
  if (printWindow) {
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>طباعة وصفة — ${esc(r.patientName)}</title>
        <style>
          @media print { body { margin: 0; } @page { size: A4; margin: 1cm; } }
        </style>
      </head>
      <body>${printHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { try { printWindow.print(); } catch (_) {} }, 400);
  } else {
    const area = document.getElementById('print-area');
    if (area) { area.innerHTML = printHTML; window.print(); }
  }

  await logAudit('طباعة وصفة', `المعرف: ${id}`);
}


/* ==========================================================
   09. زر الطباعة الرئيسي
   ========================================================== */
function initPrintButton() {
  const btn = document.getElementById('print-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const name = document.getElementById('p-name')?.value.trim();
    const dxId = safeParseInt(document.getElementById('dx-list')?.value);

    if (!name || !dxId) {
      showToast('⚠️ يرجى إكمال البيانات قبل الطباعة', 'warning');
      return;
    }

    const match = allRecords.find(r =>
      r.patientName === name && r.diagnosisId === dxId);

    if (match) {
      await printRecord(match.id);
    } else {
      showToast('💡 يرجى حفظ الوصفة أولاً ثم الطباعة', 'info');
    }
  });
}


/* ==========================================================
   10. الإحصائيات
   ========================================================== */
async function updateStats() {
  try {
    const records = await DB.all('prescriptions');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = records.filter(r => r.createdAt >= today.getTime()).length;

    const setText = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    setText('stat-patients', records.length.toLocaleString('ar-EG'));
    setText('stat-today', todayCount.toLocaleString('ar-EG'));
    setText('stat-dx', ((typeof DIAGNOSES !== 'undefined' && DIAGNOSES.length) || 0)
      .toLocaleString('ar-EG'));

    const lastEl = document.getElementById('stat-last');
    if (lastEl) {
      if (records.length) {
        const last = records.reduce((a, b) => a.createdAt > b.createdAt ? a : b);
        lastEl.textContent = new Date(last.createdAt).toLocaleDateString('ar-EG', {
          day: '2-digit', month: '2-digit'
        });
      } else {
        lastEl.textContent = '—';
      }
    }
  } catch (err) {
    console.error('updateStats error:', err);
  }
}


/* ==========================================================
   11. Toast Notifications
   ========================================================== */
function showToast(message, type = 'info', duration = 3000) {
  const box = document.getElementById('toast-box');
  if (!box) {
    console.log(`[${type}] ${message}`);
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  box.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity .3s, transform .3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

window.showToast = showToast;


/* ==========================================================
   12. تصدير CSV (+ صلاحية + blockchain + BMI)
   ========================================================== */
async function exportCSV() {
  try {
    if (typeof hasPermission === 'function' && !hasPermission('export_data')) {
      showToast('🚫 لا تمتلك صلاحية التصدير', 'error');
      return;
    }

    const records = await DB.all('prescriptions');
    if (!records.length) {
      showToast('⚠️ لا توجد سجلات للتصدير', 'info');
      return;
    }

    const headers = [
      '#', 'رقم الوصفة', 'الاسم', 'العمر', 'الجنس', 'الوزن', 'الطول', 'BMI', 'الهاتف',
      'التشخيص', 'التصنيف', 'المستشفى', 'الطبيب',
      'الحساسية', 'حامل', 'أدوية مزمنة',
      'تجاوز سلامة', 'سبب التجاوز',
      'كتلة blockchain', 'hash blockchain',
      'تاريخ الإصدار', 'صالحة حتى', 'عدد التعبئات'
    ];

    const rows = records.map((r, i) => [
      i + 1,
      r.rxNumber || '',
      r.patientName || '',
      r.age ?? '',
      r.gender || '',
      r.weight ?? '',
      r.height ?? '',
      r.bmi ?? '',
      r.phone || '',
      r.diagnosis || '',
      r.diagnosisCategory || '',
      r.hospital || '',
      r.doctor || '',
      r.allergies || '',
      r.pregnant ? 'نعم' : 'لا',
      r.chronicMeds || '',
      r.safetyOverride ? 'نعم' : 'لا',
      r.safetyOverride?.reason || '',
      r.blockchainIndex != null ? '#' + r.blockchainIndex : '',
      r.blockchainHash ? String(r.blockchainHash).substring(0, 16) : '',
      new Date(r.createdAt).toLocaleString('ar-EG'),
      r.validUntil ? new Date(r.validUntil).toLocaleDateString('ar-EG') : '',
      r.refills ?? 0
    ]);

    const csv = '﻿' +
      [headers, ...rows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MediPrescribe_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    await logAudit('تصدير CSV', `${records.length} سجل`);
    showToast(`✅ تم تصدير ${records.length} سجل`, 'success');
  } catch (err) {
    console.error('exportCSV error:', err);
    showToast('❌ فشل التصدير: ' + (err.message || err), 'error');
  }
}


/* ==========================================================
   13. تسجيل الخروج
   ========================================================== */
function initLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;

    try {
      await logAudit('تسجيل خروج', session.username);
    } catch (e) {
      console.warn('logAudit failed:', e);
    }

    clearDraft();
    localStorage.removeItem('mp_session');
    location.replace('login.html');
  });
}


/* ==========================================================
   14. اختصارات لوحة المفاتيح
   ========================================================== */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      document.querySelector('#prescription-form button[type="submit"]')?.click();
    }
    if (e.ctrlKey && e.key === 'p') {
      e.preventDefault();
      document.getElementById('print-btn')?.click();
    }
    if (e.key === 'Escape') {
      document.getElementById('dx-suggestions')?.classList.add('hidden');
      document.getElementById('ps-action-bar')?.remove();
      document.getElementById('protocol-modal')?.classList.add('hidden');
      document.getElementById('override-modal-overlay')?.remove();
    }
  });
}


/* ==========================================================
   15. مساعد AI للتشخيص
   ========================================================== */
function initAIPredictor() {
  const textarea = document.getElementById('ai-symptoms');
  const predictBtn = document.getElementById('ai-predict-btn');
  const clearBtn = document.getElementById('ai-clear-btn');
  const results = document.getElementById('ai-results');

  if (!textarea || !predictBtn || !results) return;
  if (typeof LocalAI === 'undefined') {
    console.warn('⚠️ LocalAI غير محمّل — تعطيل مساعد AI');
    predictBtn.disabled = true;
    return;
  }

  function predict() {
    const text = textarea.value.trim();
    if (!text || text.length < 3) {
      showToast('⚠️ اكتب الأعراض أولاً', 'warning');
      return;
    }

    const demographics = {
      age: safeParseInt(document.getElementById('p-age')?.value),
      gender: document.getElementById('p-gender')?.value || '',
      weight: safeParseFloat(document.getElementById('p-weight')?.value)
    };

    const result = LocalAI.predict(text, demographics, 5);
    const predictions = LocalAI.getPredictionsWithNames(result.predictions);

    if (result.emergency) {
      results.innerHTML = `
        <div style="padding:14px;background:rgba(229,57,53,.12);border:2px solid rgba(229,57,53,.5);border-radius:10px;">
          <div style="font-size:1.1rem;font-weight:800;color:#ff6b6b;margin-bottom:8px;">🚨 تنبيه طارئ</div>
          <div style="color:#ffb4b4;font-size:.85rem;line-height:1.8;">
            ${(result.advice || []).map(a => `• ${esc(a)}`).join('<br>')}
          </div>
        </div>`;
      results.classList.remove('hidden');
      showToast('🚨 أعراض خطرة — راجع الطبيب فوراً', 'error', 8000);
      return;
    }

    if (!predictions.length) {
      results.innerHTML = `
        <div style="text-align:center;padding:14px;color:var(--text-muted);">
          <div style="font-size:2rem;margin-bottom:8px;">🤔</div>
          ${esc(result.message || 'لم يتم العثور على تطابق')}
        </div>`;
      results.classList.remove('hidden');
      return;
    }

    const symptomsHTML = result.symptoms.map(s =>
      `<span class="ai-symptom-tag">${esc(s)}</span>`).join('');

    const predictionsHTML = predictions.map((p, i) => `
      <div class="ai-prediction" data-dx-id="${esc(p.dxId)}" role="button" tabindex="0">
        <div class="ai-prediction-rank">${i + 1}</div>
        <div class="ai-prediction-info">
          <div class="ai-prediction-name">${esc(p.name)}</div>
          <div class="ai-prediction-meta">${esc(p.cat)} · تطابق ${p.matchedSymptoms.length} عرض</div>
        </div>
        <div class="ai-prediction-score">${p.confidencePercent}%</div>
      </div>`).join('');

    const questionsHTML = result.followUp && result.followUp.length ? `
      <div class="ai-questions">
        <div style="font-size:.78rem;font-weight:700;color:#90caf9;margin-bottom:6px;">📋 أسئلة توضيحية:</div>
        ${result.followUp.map(q => `<div class="ai-question-item">${esc(q.question)}</div>`).join('')}
      </div>` : '';

    const contradictionsHTML = result.contradictions && result.contradictions.length ? `
      <div style="margin-top:10px;padding:10px;background:rgba(255,167,38,.08);
                  border:1px solid rgba(255,167,38,.3);border-radius:8px;
                  font-size:.8rem;color:#ffcc80;line-height:1.7;">
        <strong>⚠️ تنبيهات:</strong><br>
        ${result.contradictions.map(c => '• ' + esc(c.message)).join('<br>')}
      </div>` : '';

    results.innerHTML = `
      <div class="ai-confidence">
        <span style="font-weight:700;color:#ffb74d;">🎯 دقة التحليل:</span>
        <div class="ai-confidence-bar">
          <div class="ai-confidence-fill" style="width:${esc(result.confidence)}%"></div>
        </div>
        <span style="font-weight:800;color:#ffb74d;">${esc(result.confidence)}%</span>
      </div>

      <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px;">
        🔍 الأعراض المُكتشفة (${result.symptoms.length}):
      </div>
      <div class="ai-symptoms-tags">${symptomsHTML}</div>

      <div style="font-size:.75rem;color:var(--text-muted);margin:12px 0 8px;">
        💡 التشخيصات المقترحة (اضغط للاختيار):
      </div>
      ${predictionsHTML}
      ${questionsHTML}
      ${contradictionsHTML}

      <div style="font-size:.7rem;color:var(--text-muted);margin-top:12px;text-align:center;
                  padding-top:10px;border-top:1px dashed rgba(255,255,255,.1);">
        ⚠️ مساعد ذكي — لا يُغني عن الحكم الإكلينيكي للطبيب
      </div>`;

    results.classList.remove('hidden');

    results.querySelectorAll('.ai-prediction').forEach(el => {
      const handler = () => {
        const dxId = parseInt(el.dataset.dxId, 10);
        const select = document.getElementById('dx-list');
        if (select) {
          select.value = String(dxId);
          select.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof showProtocol === 'function') showProtocol(dxId);
          showToast('✅ تم اختيار التشخيص المقترح', 'success', 2000);
          select.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      };
      el.addEventListener('click', handler);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });

    if (typeof logAudit === 'function') {
      logAudit('AI Prediction',
        `الأعراض: ${text.substring(0, 50)} — ${predictions.length} تنبؤ`);
    }
  }

  predictBtn.addEventListener('click', predict);

  clearBtn?.addEventListener('click', () => {
    textarea.value = '';
    results.classList.add('hidden');
    textarea.focus();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); predict(); }
  });
}


/* ==========================================================
   16. قراءات Bluetooth الحيوية + المفسّر الإكلينيكي
   ========================================================== */
const VitalsInterpreter = {

  bp(sys, dia, age) {
    if (sys == null || dia == null) return null;
    if (age != null && age < 13) {
      /* تبسيط إرشادي للأطفال — يفضل الرسم البياني للنسب المئوية */
      if (sys >= 120 || dia >= 80)
        return { level: 'warn', color: '#ffb74d',
          msg: `⚠️ ضغط مرتفع لعمر ${age} سنة — يُفضل قياس متكرر ومراجعة النسب المئوية` };
      if (sys <= 90 || dia <= 50)
        return { level: 'danger', color: '#ff8a80',
          msg: '🚨 ضغط منخفض — افحص الإشراف والعلامات الحيوية' };
      return { level: 'ok', color: '#81c784', msg: '✅ ضغط ضمن المدى المقبول للطفل' };
    }
    if (sys >= 180 || dia >= 110)
      return { level: 'danger', color: '#ff8a80',
        msg: '🚨 ارتفاع شديد (أزمة/طارئ محتمل) — قيّم الأعراض العضوية فوراً' };
    if (sys >= 160 || dia >= 100)
      return { level: 'danger', color: '#ff8a80',
        msg: '⛔ ارتفاع درجة 2 — يحتاج تدخلاً دوائياً عاجلاً' };
    if (sys >= 140 || dia >= 90)
      return { level: 'warn', color: '#ffb74d',
        msg: '⚠️ ارتفاع درجة 1 — قياس متكرر + تعديل نمط الحياة/علاج' };
    if (sys < 90 || dia < 60)
      return { level: 'warn', color: '#ffb74d',
        msg: '⚠️ ضغط منخفض — ابحث عن الجفاف/النزف/الإنتان' };
    return { level: 'ok', color: '#81c784', msg: '✅ ضغط طبيعي' };
  },

  tempC(t) {
    if (t == null) return null;
    if (t < 35)   return { level: 'danger', color: '#ff8a80',
      msg: '🚨 نقص حرارة — افحص التعرض/الإرهاق/الاستقلاب' };
    if (t < 37.3) return { level: 'ok', color: '#81c784', msg: '✅ حرارة طبيعية' };
    if (t <= 38)  return { level: 'warn', color: '#ffb74d',
      msg: '⚠️ ارتفاع خفيف — راقب وعالج السبب' };
    if (t <= 39)  return { level: 'warn', color: '#ffb74d',
      msg: '🌡️ حمى — فكر بمضاد حيوي حسب الاستطباب وخفّض الحرارة' };
    if (t <= 40.5) return { level: 'danger', color: '#ff8a80',
      msg: '🚨 حمى شديدة — تحتاج خفضاً فورياً وتقييماً' };
    return { level: 'danger', color: '#ff8a80',
      msg: '🚨❗ فرط حرارة >40.5 — طارئ طبي' };
  },

  spo2(s) {
    if (s == null) return null;
    if (s >= 95)  return { level: 'ok', color: '#81c784', msg: '✅ تشبع طبيعي' };
    if (s >= 92)  return { level: 'warn', color: '#ffb74d',
      msg: '⚠️ تشبع منخفض — مراقبة مستمرة + أكسجين عند الحاجة' };
    if (s >= 90)  return { level: 'warn', color: '#ffb74d',
      msg: '⛔ تشبع منخفض — أكسجين وتقييم عاجل' };
    return { level: 'danger', color: '#ff8a80',
      msg: '🚨 نقص أكسجة شديد — تدخل فوري' };
  },

  pulse(p, age) {
    if (p == null) return null;
    const ranges = [
      { maxAge: 1,  min: 100, max: 160 },
      { maxAge: 4,  min: 90,  max: 140 },
      { maxAge: 6,  min: 80,  max: 130 },
      { maxAge: 12, min: 70,  max: 110 },
      { maxAge: 18, min: 60,  max: 100 },
      { maxAge: 200, min: 60, max: 100 }
    ];
    const r = ranges.find(x => (age ?? 30) <= x.maxAge) || ranges[ranges.length - 1];
    if (p > r.max) return { level: 'warn', color: '#ffb74d',
      msg: `⚠️ تسرع نبض (المدى الطبيعي ${r.min}–${r.max})` };
    if (p < r.min) return { level: 'warn', color: '#ffb74d',
      msg: `⚠️ بطء نبض (المدى الطبيعي ${r.min}–${r.max})` };
    return { level: 'ok', color: '#81c784', msg: '✅ نبض ضمن الطبيعي' };
  }
};

function initBluetoothVitals() {
  const display = document.getElementById('vitals-display');
  const btns = {
    bp: document.getElementById('bt-bp-btn'),
    temp: document.getElementById('bt-temp-btn'),
    spo2: document.getElementById('bt-spo2-btn'),
    weight: document.getElementById('bt-weight-btn-main')
  };

  if (!display || typeof VitalsReader === 'undefined') return;

  if (!VitalsReader.isSupported()) {
    Object.values(btns).forEach(b => {
      if (b) { b.disabled = true; b.title = 'Web Bluetooth غير مدعوم'; }
    });
    console.warn('⚠️ Web Bluetooth غير مدعوم');
    return;
  }

  function setLoading(btn, loading) { if (btn) btn.disabled = loading; }

  function clinicalAlertHTML(reading) {
    const age = safeParseInt(document.getElementById('p-age')?.value);
    let interp = null, valueLine = '';

    if (reading.type === 'blood_pressure') {
      interp = VitalsInterpreter.bp(reading.systolic, reading.diastolic, age);
      valueLine = `${reading.systolic}/${reading.diastolic} mmHg`;
    } else if (reading.type === 'temperature') {
      interp = VitalsInterpreter.tempC(reading.value);
      valueLine = `${reading.value}°C`;
    } else if (reading.type === 'spo2') {
      interp = VitalsInterpreter.spo2(reading.spo2);
      valueLine = `SpO₂ ${reading.spo2}% · نبض ${reading.pulse}`;
    } else if (reading.type === 'weight') {
      return ''; /* الوزن يُفسَّر ضمن ملف المريض */
    }

    if (!interp) return '';

    /* سجل تدقيق للقراءات غير الطبيعية */
    if (interp.level !== 'ok' && typeof logAudit === 'function') {
      logAudit('قراءة حيوية غير طبيعية', `${valueLine} — ${interp.msg}`);
    }

    return `
      <div style="margin-top:12px;padding:11px 13px;border-radius:9px;line-height:1.8;font-size:.85rem;
                  background:${interp.level === 'ok'
                    ? 'rgba(67,160,71,.1)' : interp.level === 'warn'
                    ? 'rgba(255,167,38,.1)' : 'rgba(229,57,53,.12)'};
                  border:1px solid ${interp.color}55;">
        <div style="font-weight:800;color:${interp.color};">${interp.msg}</div>
        <div style="color:#c7d2de;font-size:.78rem;margin-top:4px;">القيمة: ${esc(valueLine)}</div>
      </div>`;
  }

  function showVitalsReading(reading) {
    const ts = reading.timestamp.toLocaleTimeString('ar-EG');
    const alertHTML = clinicalAlertHTML(reading);
    let html = '';

    if (reading.type === 'blood_pressure') {
      html = `
        <div class="vitals-display-title">💓 قراءة ضغط الدم</div>
        <div class="vitals-display-values">
          <div class="vitals-value"><span class="label">الانقباضي</span>
            <span class="num">${reading.systolic} <small>mmHg</small></span></div>
          <div class="vitals-value"><span class="label">الانبساطي</span>
            <span class="num">${reading.diastolic} <small>mmHg</small></span></div>
          ${reading.pulse ? `
          <div class="vitals-value"><span class="label">النبض</span>
            <span class="num">${reading.pulse} <small>نبضة/د</small></span></div>` : ''}
        </div>
        <div style="font-size:.7rem;color:#93a2b5;margin-top:8px;">⏱️ ${ts}</div>
        ${alertHTML}`;

    } else if (reading.type === 'temperature') {
      html = `
        <div class="vitals-display-title">🌡️ قراءة الحرارة</div>
        <div class="vitals-display-values">
          <div class="vitals-value"><span class="label">الحرارة</span>
            <span class="num">${reading.value} <small>°C</small></span></div>
        </div>
        <div style="font-size:.7rem;color:#93a2b5;margin-top:8px;">⏱️ ${ts}</div>
        ${alertHTML}`;

    } else if (reading.type === 'spo2') {
      html = `
        <div class="vitals-display-title">🫁 قراءة SpO₂ والنبض</div>
        <div class="vitals-display-values">
          <div class="vitals-value"><span class="label">SpO₂</span>
            <span class="num">${reading.spo2} <small>%</small></span></div>
          <div class="vitals-value"><span class="label">النبض</span>
            <span class="num">${reading.pulse} <small>نبضة/د</small></span></div>
        </div>
        <div style="font-size:.7rem;color:#93a2b5;margin-top:8px;">⏱️ ${ts}</div>
        ${alertHTML}`;

    } else if (reading.type === 'weight') {
      const weightVal = reading.weight || reading.value;
      html = `
        <div class="vitals-display-title">⚖️ قراءة الوزن</div>
        <div class="vitals-display-values">
          <div class="vitals-value"><span class="label">الوزن</span>
            <span class="num">${weightVal} <small>كغ</small></span></div>
        </div>
        <div style="font-size:.7rem;color:#93a2b5;margin-top:8px;">⏱️ ${ts}</div>`;

      const weightInput = document.getElementById('p-weight');
      if (weightInput) {
        weightInput.value = weightVal;
        weightInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    display.innerHTML = html;
    display.classList.remove('hidden');

    clearTimeout(display._hideTimer);
    display._hideTimer = setTimeout(() => display.classList.add('hidden'), 15000);
  }

  async function handleRead(type, btn) {
    setLoading(btn, true);
    showToast('🔍 جارٍ البحث عن الجهاز... اختر من القائمة', 'info', 4000);

    try {
      const reading = await VitalsReader.read(type);
      showVitalsReading(reading);
      showToast('✅ تمت القراءة بنجاح', 'success', 2000);

      if (typeof logAudit === 'function') {
        await logAudit('قراءة حيوية',
          `${reading.type}: ${JSON.stringify(reading).substring(0, 100)}`);
      }
    } catch (err) {
      console.error('Bluetooth error:', err);
      let msg = err.message || 'فشلت القراءة';
      if (msg.includes('User cancelled') || msg.includes('لم يتم اختيار')) {
        msg = 'تم إلغاء القراءة';
      } else if (msg.includes('HTTPS')) {
        msg = '⚠️ يجب استخدام HTTPS';
      }
      showToast('❌ ' + msg, 'error', 4000);
    } finally {
      setLoading(btn, false);
    }
  }

  btns.bp?.addEventListener('click', () => handleRead('BLOOD_PRESSURE', btns.bp));
  btns.temp?.addEventListener('click', () => handleRead('HEALTH_THERMOMETER', btns.temp));
  btns.spo2?.addEventListener('click', () => handleRead('PULSE_OXIMETER', btns.spo2));
  btns.weight?.addEventListener('click', () => handleRead('WEIGHT_SCALE', btns.weight));
}


/* ==========================================================
   17. أدوات مساعدة عامة (Debounce)
   ========================================================== */
function debounce(fn, delay = 250) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}


/* ==========================================================
   18. الحمل — للإناث فقط
   ========================================================== */
function togglePregnancyField() {
  const genderEl = document.getElementById('p-gender');
  const wrap = document.getElementById('p-pregnant-wrap');
  const checkbox = document.getElementById('p-pregnant');
  if (!genderEl || !wrap || !checkbox) return;

  if (genderEl.value === 'أنثى') {
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
    checkbox.checked = false;
  }
}

function initPregnancyGenderLock() {
  const genderEl = document.getElementById('p-gender');
  if (!genderEl) return;
  togglePregnancyField();
  genderEl.addEventListener('change', togglePregnancyField);
}


/* ==========================================================
   19. الحفظ المؤقت التلقائي (Draft Autosave)
   ========================================================== */
const DRAFT_KEY = 'mp_prescription_draft';
const DRAFT_FIELDS = [
  'p-name', 'p-age', 'p-dob', 'p-gender', 'p-weight', 'p-height', 'p-phone',
  'p-hospital', 'p-allergies', 'p-chronic', 'p-pregnant', 'dx-list'
];
let draftSaveTimer = null;

function collectDraft() {
  const data = {};
  DRAFT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    data[id] = (el.type === 'checkbox') ? el.checked : el.value;
  });
  return data;
}

function saveDraftNow() {
  try {
    const data = collectDraft();
    const hasContent = Object.entries(data).some(([k, v]) => v && v !== false);
    if (hasContent) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, ts: Date.now() }));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch (e) {
    console.warn('saveDraftNow error:', e);
  }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}

function restoreDraft() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  } catch (e) { saved = null; }
  if (!saved || !saved.data) return;

  const ageMinutes = (Date.now() - (saved.ts || 0)) / 60000;
  if (ageMinutes > 24 * 60) { clearDraft(); return; }

  const restore = () => {
    Object.entries(saved.data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = val;
    });
    togglePregnancyField();
    updateFormProgress();
    updateBirthYearHint();
    updateBMIHint();
    if (saved.data['dx-list']) {
      const id = safeParseInt(saved.data['dx-list']);
      if (id) showProtocol(id);
    }
    setUnsavedState(true);
    showToast('📝 تم استرجاع مسودة غير محفوظة', 'info');
  };

  if (confirm('يوجد مسودة وصفة غير محفوظة من جلسة سابقة. هل تريد استرجاعها؟')) {
    restore();
  } else {
    clearDraft();
  }
}

function initAutosave() {
  const form = document.getElementById('prescription-form');
  if (!form) return;

  restoreDraft();

  const onChange = () => {
    setUnsavedState(true);
    updateFormProgress();
    updateBirthYearHint();
    updateBMIHint();
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(saveDraftNow, 15000);
  };

  DRAFT_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', onChange);
    el.addEventListener('change', onChange);
  });

  window.addEventListener('beforeunload', saveDraftNow);
}


/* ==========================================================
   20. مؤشر "غير محفوظ"
   ========================================================== */
function setUnsavedState(isUnsaved) {
  const badge = document.getElementById('unsaved-indicator');
  if (!badge) return;
  badge.classList.toggle('hidden', !isUnsaved);
}


/* ==========================================================
   21. شريط تقدم تعبئة النموذج
   ========================================================== */
function updateFormProgress() {
  const fill = document.getElementById('form-progress-fill');
  const label = document.getElementById('form-progress-label');
  if (!fill || !label) return;

  const fields = ['p-name', 'p-age', 'p-gender', 'p-weight', 'p-height', 'p-phone', 'dx-list'];
  const filled = fields.filter(id => {
    const el = document.getElementById(id);
    return el && String(el.value || '').trim().length > 0;
  }).length;

  const pct = Math.round((filled / fields.length) * 100);
  fill.style.width = pct + '%';
  label.textContent = pct + '%';
  fill.classList.toggle('complete', pct === 100);
}

function initFormProgress() {
  const form = document.getElementById('prescription-form');
  if (!form) return;
  form.addEventListener('input', updateFormProgress);
  form.addEventListener('change', updateFormProgress);
  updateFormProgress();
}


/* ==========================================================
   22. تاريخ الميلاد + سنة الميلاد التقريبية + BMI
   ========================================================== */
function updateBirthYearHint() {
  const ageEl = document.getElementById('p-age');
  const hint = document.getElementById('p-birthyear-hint');
  if (!ageEl || !hint) return;

  const age = safeParseInt(ageEl.value);
  if (age == null || age <= 0 || age > 120) {
    hint.textContent = '';
    return;
  }
  const year = new Date().getFullYear() - age;
  hint.textContent = `📅 سنة الميلاد التقريبية: ${year}`;
}

/* إن أُدخل تاريخ ميلاد حقيقي، احسب العمر تلقائياً */
function ageFromDOB(dobValue) {
  if (!dobValue) return null;
  const dob = new Date(dobValue);
  if (isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 && age <= 120 ? age : null;
}

function updateBMIHint() {
  const weightEl = document.getElementById('p-weight');
  const heightEl = document.getElementById('p-height');
  const hint = document.getElementById('p-bmi-hint');
  if (!hint) return;

  const w = safeParseFloat(weightEl?.value);
  const h = safeParseFloat(heightEl?.value);
  if (!w || !h) { hint.textContent = ''; return; }

  const bmi = w / Math.pow(h / 100, 2);
  const cat = bmi < 18.5 ? 'نحافة' : bmi < 25 ? 'طبيعي'
            : bmi < 30 ? 'زيادة وزن' : 'سمنة';
  hint.textContent = `⚖️ BMI: ${bmi.toFixed(1)} (${cat})`;
}

function initBirthYearHint() {
  const ageEl = document.getElementById('p-age');
  const dobEl = document.getElementById('p-dob');
  const heightEl = document.getElementById('p-height');

  ageEl?.addEventListener('input', updateBirthYearHint);

  dobEl?.addEventListener('change', () => {
    const age = ageFromDOB(dobEl.value);
    if (age != null && ageEl) {
      ageEl.value = age;
      updateBirthYearHint();
      showToast(`📅 تم حساب العمر تلقائياً: ${age} سنة`, 'info', 2500);
    }
  });

  heightEl?.addEventListener('input', updateBMIHint);
  document.getElementById('p-weight')?.addEventListener('input', updateBMIHint);
}


/* ==========================================================
   23. تنسيق الهاتف اليمني
   ========================================================== */
function formatYemenPhone(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

function initPhoneFormatting() {
  const phoneEl = document.getElementById('p-phone');
  if (!phoneEl) return;
  phoneEl.addEventListener('input', () => {
    const cursorAtEnd = phoneEl.selectionEnd === phoneEl.value.length;
    phoneEl.value = formatYemenPhone(phoneEl.value);
    if (cursorAtEnd) {
      phoneEl.selectionStart = phoneEl.selectionEnd = phoneEl.value.length;
    }
  });
}


/* ==========================================================
   24. Dark/Light Mode
   ========================================================== */
const THEME_KEY = 'mp_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.classList.toggle('light-mode', theme === 'light');
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    btn.innerHTML = theme === 'light'
      ? '<i class="fas fa-sun" aria-hidden="true"></i>'
      : '<i class="fas fa-moon" aria-hidden="true"></i>';
  }
}

function initThemeToggle() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);

  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}


/* ==========================================================
   25. آخر 3 مرضى
   ========================================================== */
async function renderRecentPatients() {
  const wrap = document.getElementById('recent-patients-list');
  if (!wrap) return;

  try {
    const records = (allRecords && allRecords.length)
      ? allRecords
      : await DB.all('prescriptions');

    const recent = [...records]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 3);

    if (!recent.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:16px;grid-column:1/-1;">لا يوجد مرضى بعد</div>';
      return;
    }

    wrap.innerHTML = recent.map(r => {
      const initials = (r.patientName || '?')
        .split(' ').filter(Boolean).slice(0, 2)
        .map(w => w[0]).join('').toUpperCase();

      const date = new Date(r.createdAt).toLocaleDateString('ar-EG', {
        day: '2-digit', month: '2-digit'
      });

      return `
        <div class="recent-patient-card" data-id="${esc(r.id)}" role="button" tabindex="0">
          <div class="recent-patient-avatar">${esc(initials)}</div>
          <div class="recent-patient-info">
            <div class="recent-patient-name">${esc(r.patientName || '—')}</div>
            <div class="recent-patient-meta">${esc(r.diagnosis || '—')} · ${date}</div>
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.recent-patient-card').forEach(card => {
      const handler = () => {
        const id = parseInt(card.dataset.id, 10);
        if (typeof viewRecord === 'function') viewRecord(id);
      };
      card.addEventListener('click', handler);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
      });
    });
  } catch (err) {
    console.error('renderRecentPatients error:', err);
  }
}


/* ==========================================================
   26. Badge عدد السجلات
   ========================================================== */
function updateRecordsCountBadge(count) {
  const badge = document.getElementById('records-count-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}


/* ==========================================================
   27. Animation نجاح الحفظ
   ========================================================== */
function playSaveAnimation(btn) {
  if (!btn) return;
  btn.classList.add('save-success-pulse');
  setTimeout(() => btn.classList.remove('save-success-pulse'), 900);
}


/* ==========================================================
   28. التشغيل التلقائي
   ========================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('%c🏥 MediPrescribe — لوحة التحكم v' + APP_VERSION, 'color:#d4af37;font-weight:bold');
  console.log('   ├─ الدور:', session.role);
  console.log('   ├─ ClinicalValidator: ✅');
  console.log('   ├─ VitalsInterpreter: ✅');
  console.log('   ├─ SafetyCheck:', typeof SafetyCheck !== 'undefined' ? '✅' : '❌');
  console.log('   ├─ RxSecure:', typeof RxSecure !== 'undefined' ? '✅' : '❌');
  console.log('   ├─ PatientSummary:', typeof PatientSummary !== 'undefined' ? '✅' : '❌');
  console.log('   ├─ PrescriptionChain:', typeof PrescriptionChain !== 'undefined' ? '✅' : '❌');
  console.log('   ├─ LocalAI:', typeof LocalAI !== 'undefined' ? '✅' : '❌');
  console.log('   ├─ VitalsReader:', typeof VitalsReader !== 'undefined' ? '✅' : '❌');
  console.log('   └─ I18n:', typeof I18n !== 'undefined' ? '✅' : '❌');

  // 0) الثيم قبل أي رسم
  initThemeToggle();

  // 1) تهيئة قاعدة البيانات
  try {
    await initDB();
  } catch (err) {
    console.error('initDB failed:', err);
    showToast('❌ فشل تحميل قاعدة البيانات', 'error', 5000);
    return;
  }

  // 2) تهيئة Blockchain + فحص سلامة السلسلة
  if (typeof PrescriptionChain !== 'undefined' &&
      typeof PrescriptionChain.init === 'function') {
    try {
      await PrescriptionChain.init();
      const bcInfo = await PrescriptionChain.getChainInfo();
      console.log('⛓️ blockchain جاهزة —', bcInfo?.length || 0, 'كتلة');

      if (typeof PrescriptionChain.verifyChain === 'function') {
        const chainValid = await PrescriptionChain.verifyChain();
        if (!chainValid) {
          showToast('⚠️ تحذير: سلامة Blockchain مُعطَّلة — أبلغ مسؤول النظام', 'warning', 8000);
          await logAudit('تحذير سلامة Blockchain', 'فشل التحقق من السلسلة عند الإقلاع');
        }
      }
    } catch (err) {
      console.warn('⚠️ blockchain init error:', err);
    }
  }

  // 3) الواجهة والمستخدم
  initUserInterface();

  // 4) قوائم واختيارات
  fillHospitalSelect();
  fillDiagnosisSelect();

  // 5) المكونات التفاعلية
  initDiagnosisSearch();
  initPrescriptionForm();
  initRecordsSearch();
  initPrintButton();
  initLogout();
  initKeyboardShortcuts();

  // 6) الميزات الإضافية
  initPregnancyGenderLock();
  initFormProgress();
  initBirthYearHint();
  initPhoneFormatting();
  initAutosave();
  initAIPredictor();
  initBluetoothVitals();

  // 7) إغلاق Modal البروتوكول
  document.getElementById('protocol-modal-close')?.addEventListener('click', hideProtocol);
  document.getElementById('protocol-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'protocol-modal') hideProtocol();
  });

  // 8) ربط زر التصدير
  document.getElementById('export-btn')?.addEventListener('click', exportCSV);

  // 9) تحميل البيانات الأولية
  await loadRecords();
  await updateStats();
  await renderRecentPatients();

  console.log('✅ app.js v' + APP_VERSION + ' — كل المكونات جاهزة');
});


/* ==========================================================
   29. تصدير الدوال للاستخدام الخارجي
   ========================================================== */
window.appAPI = {
  APP_VERSION,
  RX_VALIDITY_DAYS,
  showToast,
  loadRecords,
  updateStats,
  exportCSV,
  showProtocol,
  hideProtocol,
  viewRecord,
  deleteRecord,
  printRecord,
  renderRecentPatients,
  updateRecordsCountBadge,
  ClinicalValidator,
  VitalsInterpreter,
  scheduleFor,
  esc,
  currentProtocolId: () => currentProtocolId
};