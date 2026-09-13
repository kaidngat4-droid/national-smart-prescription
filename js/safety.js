/* ==========================================================
   MediPrescribe — وحدة فحص السلامة الدوائية v1.1
   ----------------------------------------------------------
   تفاعلات أدوية + حساسية + أمان الحمل + كشف التكرار

   التحسينات في v1.1:
   ✅ patientHistory async (يقرأ من DB أو window.allRecords)
   ✅ renderWarnings بحماية شاملة من null/undefined
   ✅ interactions تتحقق من الحقول الفارغة
   ✅ allergy بلا تكرار (matched flag)
   ✅ runAll يقبل كائن فارغ بأمان
   ✅ أدوات تطبيع محسّنة (عربية + إنجليزية)
   ✅ IIFE نظيف مع closure

   يتكامل مع:
   - DB.all('prescriptions') من db.js
   - window.allRecords من app.js
   ========================================================== */
const SafetyCheck = (() => {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     1. قاعدة تفاعلات الأدوية
     ═══════════════════════════════════════════════════════ */
  const INTERACTIONS = [
    // مضادات التخثر
    { a: 'warfarin',      b: 'aspirin',        severity: 'high',     msg: 'خطر نزيف حاد — الجمع يحتاج مراقبة INR وقراراً موثقاً' },
    { a: 'warfarin',      b: 'ibuprofen',      severity: 'high',     msg: 'رفع كبير لخطر النزيف الهضمي' },
    { a: 'warfarin',      b: 'diclofenac',     severity: 'high',     msg: 'رفع كبير لخطر النزيف' },
    { a: 'warfarin',      b: 'naproxen',       severity: 'high',     msg: 'رفع كبير لخطر النزيف' },
    { a: 'warfarin',      b: 'fluconazole',    severity: 'high',     msg: 'تثبيط استقلاب الوارفارين — خطر نزيف' },
    { a: 'warfarin',      b: 'amoxicillin',    severity: 'moderate', msg: 'قد يرفع INR — راقب التجلط' },

    // NSAIDs + ACE Inhibitors
    { a: 'aspirin',       b: 'ibuprofen',      severity: 'moderate', msg: 'تناقص حماية الأسبرين مع زيادة خطر القرحة' },
    { a: 'ibuprofen',     b: 'enalapril',      severity: 'moderate', msg: 'قد يقلل فعالية ضغط الدم ويضر الكلى' },
    { a: 'ibuprofen',     b: 'lisinopril',     severity: 'moderate', msg: 'قد يقلل فعالية ضغط الدم ويضر الكلى' },
    { a: 'ibuprofen',     b: 'losartan',       severity: 'moderate', msg: 'قد يضر الكلى' },

    // الميثوتريكسات
    { a: 'methotrexate',  b: 'cotrimoxazole',  severity: 'high',     msg: 'سمية حادة للميثوتريكسات — يمنع الجمع' },
    { a: 'aspirin',       b: 'methotrexate',   severity: 'moderate', msg: 'يزيد سمية الميثوتريكسات' },

    // الستاتينات
    { a: 'simvastatin',   b: 'clarithromycin', severity: 'high',     msg: 'خطر انحلال العضل الرهابي — أوقف الستاتين مؤقتاً' },
    { a: 'atorvastatin',  b: 'clarithromycin', severity: 'high',     msg: 'خطر انحلال العضل الرهابي' },
    { a: 'أملوديبين',     b: 'simvastatin',    severity: 'moderate', msg: 'قد يزيد خطر آلام العضلات' },

    // القلب
    { a: 'digoxin',       b: 'amiodarone',     severity: 'high',     msg: 'تسمم ديجوكسين محتمل — خفّض الجرعة 30-50%' },
    { a: 'beta-blocker',  b: 'verapamil',      severity: 'high',     msg: 'خطر بطء القلب الشديد' },
    { a: 'دابيغاتران',    b: 'أسبرين',          severity: 'moderate', msg: 'زيادة خطر النزيف' },

    // المضادات الحيوية
    { a: 'ciprofloxacin', b: 'tizanidine',     severity: 'high',     msg: 'هبوط شديد في الضغط — يمنع الجمع' },
    { a: 'ciprofloxacin', b: 'theophylline',   severity: 'high',     msg: 'خطر سمية الثيوفيلين' },

    // الكلى والبوتاسيوم
    { a: 'lisinopril',    b: 'spironolactone', severity: 'high',     msg: 'فرط بوتاسيوم الدم — راقب البوتاسيوم ووظائف الكلى' },
    { a: 'enalapril',     b: 'spironolactone', severity: 'high',     msg: 'فرط بوتاسيوم الدم — راقب البوتاسيوم ووظائف الكلى' },
    { a: 'ميتفورمين',     b: 'contrast',       severity: 'high',     msg: 'أوقف الميتفورمين قبل الصبغة' },

    // السكري
    { a: 'insulin',       b: 'propranolol',    severity: 'moderate', msg: 'حجب أعراض هبوط السكر — حذّر المريض' },
    { a: 'ميتفورمين',     b: 'كحول',           severity: 'moderate', msg: 'خطر الحماض اللبني' },

    // المعدة
    { a: 'omeprazole',    b: 'clopidogrel',    severity: 'high',     msg: 'يقلل فعالية كلوبيدوغريل' },

    // الأعصاب
    { a: 'sertraline',    b: 'tramadol',       severity: 'high',     msg: 'خطر متلازمة السيروتونين' },
    { a: 'fluoxetine',    b: 'tramadol',       severity: 'high',     msg: 'خطر متلازمة السيروتونين' },
    { a: 'ميثوتركسات',    b: 'nsaid',          severity: 'high',     msg: 'خطر سمية الكبد والكلى' }
  ];

  /* ═══════════════════════════════════════════════════════
     2. أصناف الحساسية المتقاطعة
     ═══════════════════════════════════════════════════════ */
  const ALLERGY_CLASSES = {
    penicillin: [
      'penicillin', 'amoxicillin', 'ampicillin',
      'amoxiclav', 'augmentin', 'cloxacillin',
      'أموكسيسيلين', 'أمبيسيلين', 'بنسلين'
    ],
    cephalosporin: [
      'cephalexin', 'ceftriaxone', 'cefuroxime', 'cefixime',
      'سيفالكسين', 'سيفوروكسيم'
    ],
    sulfa: [
      'cotrimoxazole', 'sulfamethoxazole', 'trimethoprim',
      'سلفوناميد', 'كو-تريموكسازول'
    ],
    nsaid: [
      'ibuprofen', 'diclofenac', 'aspirin', 'naproxen', 'indomethacin',
      'إيبوبروفين', 'نابروكسين', 'ديكلوفيناك', 'أسبرين'
    ],
    opioid: [
      'morphine', 'codeine', 'tramadol', 'pethidine',
      'مورفين', 'كودايين', 'ترامادول'
    ]
  };

  /* ═══════════════════════════════════════════════════════
     3. الأدوية غير الآمنة في الحمل
     ═══════════════════════════════════════════════════════ */
  const PREGNANCY_RISK = [
    'warfarin', 'methotrexate',
    'tetracycline', 'doxycycline',
    'ciprofloxacin', 'levofloxacin',
    'spironolactone',
    'lisinopril', 'enalapril', 'losartan',
    'atorvastatin', 'simvastatin',
    'misoprostol', 'isotretinoin',
    'valproate',
    'ميثوتركسات', 'وارفارين', 'أيزوتريتينوين',
    'إينالابريل', 'لوزارتان', 'سيبروفلوكساسين'
  ];

  /* ═══════════════════════════════════════════════════════
     4. أدوات تطبيع
     ═══════════════════════════════════════════════════════ */
  const norm = s => (s || '').toString()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ةه]/g, 'ه')
    .trim();

  const pkey = (a, b) => [norm(a), norm(b)].sort().join('|');

  // بناء خريطة التفاعلات مرة واحدة
  const PMAP = new Map(
    INTERACTIONS.map(i => [pkey(i.a, i.b), i])
  );

  /* ═══════════════════════════════════════════════════════
     5. فحص التفاعلات الدوائية
     ═══════════════════════════════════════════════════════ */
  function interactions(medsA, medsB) {
    const out = [];
    if (!Array.isArray(medsA) || !Array.isArray(medsB)) return out;

    for (const m1 of medsA) {
      if (!m1) continue;
      const n1 = m1.n || m1;
      if (!n1) continue;

      for (const m2 of medsB) {
        if (!m2) continue;
        const n2 = m2.n || m2;
        if (!n2) continue;

        // تخطَّ المقارنة مع النفس
        if (norm(n1) === norm(n2)) continue;

        const hit = PMAP.get(pkey(n1, n2));
        if (hit) {
          out.push({
            type: 'interaction',
            severity: hit.severity,
            msg: `💊 ${n1} + ${n2}: ${hit.msg}`
          });
        }
      }
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     6. فحص التكرار مع تاريخ المريض
     ═══════════════════════════════════════════════════════ */
  function duplicates(meds, historyMeds) {
    if (!Array.isArray(meds) || !Array.isArray(historyMeds)) return [];

    const hist = new Set(
      historyMeds
        .map(m => norm(m?.n || m))
        .filter(Boolean)
    );

    return meds
      .filter(m => {
        const n = norm(m?.n || m);
        return n && hist.has(n);
      })
      .map(m => ({
        type: 'duplicate',
        severity: 'moderate',
        msg: `🔁 المريض يتناول «${m.n || m}» ضمن وصفة سابقة — تأكد من عدم التكرار`
      }));
  }

  /* ═══════════════════════════════════════════════════════
     7. فحص الحساسية
     ═══════════════════════════════════════════════════════ */
  function allergy(meds, allergiesText) {
    if (!allergiesText || !Array.isArray(meds)) return [];

    const tokens = String(allergiesText)
      .split(/[،,\s]+/)
      .map(norm)
      .filter(Boolean);

    if (!tokens.length) return [];

    const out = [];

    for (const med of meds) {
      if (!med) continue;
      const medName = med.n || med;
      const mn = norm(medName);
      if (!mn) continue;

      let matched = false;

      for (const t of tokens) {
        if (matched) break;

        // تطابق مباشر: اسم الدواء يحتوي على المادة المسببة للحساسية
        if (mn.includes(t) || t.includes(mn)) {
          out.push({
            type: 'allergy',
            severity: 'high',
            msg: `⚠️ «${medName}» يطابق حساسية المريض المسجلة (${t})`
          });
          matched = true;
          break;
        }

        // تطابق صنف: المادة + الدواء في نفس الصنف
        for (const [cls, members] of Object.entries(ALLERGY_CLASSES)) {
          const tokenInClass = members.some(m => {
            const nm = norm(m);
            return nm.includes(t) || t.includes(nm);
          });

          const medInClass = members.some(m => {
            const nm = norm(m);
            return mn.includes(nm);
          });

          if (tokenInClass && medInClass) {
            out.push({
              type: 'allergy',
              severity: 'high',
              msg: `⚠️ «${medName}» ينتمي لصنف الحساسية المسجل للمريض (${cls})`
            });
            matched = true;
            break;
          }
        }
      }
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════
     8. فحص الحمل
     ═══════════════════════════════════════════════════════ */
  function pregnancy(meds, isPregnant) {
    if (!isPregnant || !Array.isArray(meds)) return [];

    return meds
      .filter(m => {
        if (!m) return false;
        const n = norm(m.n || m);
        return PREGNANCY_RISK.some(r => n.includes(norm(r)));
      })
      .map(m => ({
        type: 'pregnancy',
        severity: 'high',
        msg: `🤰 «${m.n || m}» غير آمن في الحمل — استبدله ببديل آمن`
      }));
  }

  /* ═══════════════════════════════════════════════════════
     9. [محسّن] جلب تاريخ المريض (async + fallback)
     ═══════════════════════════════════════════════════════ */
  async function patientHistory(name, phone) {
    const q = (name || '').trim();
    if (!q) return [];

    try {
      // ✅ الأولوية 1: قاعدة البيانات مباشرة
      if (typeof DB !== 'undefined' && typeof DB.all === 'function') {
        const records = await DB.all('prescriptions');
        return _extractHistory(records, q, phone);
      }

      // 🔄 احتياطي: window.allRecords (تصدّرها app.js)
      if (typeof window.allRecords !== 'undefined' &&
          Array.isArray(window.allRecords)) {
        return _extractHistory(window.allRecords, q, phone);
      }

      return [];
    } catch (e) {
      console.warn('safety.js patientHistory error:', e);
      return [];
    }
  }

  /* ── استخراج أدوية المريض من السجلات ── */
  function _extractHistory(records, q, phone) {
    if (!Array.isArray(records)) return [];

    const normQ = norm(q);
    const normPhone = phone ? String(phone).replace(/\D/g, '') : '';

    return records
      .filter(r => {
        if (!r) return false;

        // تطابق اسم (مرن)
        const recName = norm(r.patientName);
        if (recName && recName === normQ) return true;

        // تطابق هاتف
        if (normPhone && r.phone) {
          const recPhone = String(r.phone).replace(/\D/g, '');
          if (recPhone === normPhone) return true;
        }

        return false;
      })
      .flatMap(r =>
        (r.meds || []).map(m => ({
          n: m.n,
          diagnosis: r.diagnosis,
          at: r.createdAt,
          rxNumber: r.rxNumber
        }))
      );
  }

  /* ═══════════════════════════════════════════════════════
     10. الفحص الشامل
     ═══════════════════════════════════════════════════════ */
  function runAll(options) {
    // ✅ حماية: قبول كائن فارغ أو undefined
    const {
      meds = [],
      historyMeds = [],
      allergies = '',
      pregnant = false
    } = (options || {});

    const found = [
      ...interactions(meds, meds),          // تفاعلات الأدوية الحالية مع بعضها
      ...interactions(meds, historyMeds),   // تفاعلات مع أدوية سابقة
      ...duplicates(meds, historyMeds),     // تكرار الأدوية
      ...allergy(meds, allergies),          // حساسية
      ...pregnancy(meds, pregnant)          // الحمل
    ];

    return {
      all:      found.map(f => f.msg),
      blocking: found.filter(f => f.severity === 'high').map(f => f.msg),
      warnings: found.filter(f => f.severity !== 'high').map(f => f.msg)
    };
  }

  /* ═══════════════════════════════════════════════════════
     11. [محسّن] عرض التنبيهات HTML
     ═══════════════════════════════════════════════════════ */
  function renderWarnings(res) {
    // ✅ حماية شاملة
    if (!res || !Array.isArray(res.all) || res.all.length === 0) {
      return '';
    }

    const items = res.all
      .map(m => `<li style="margin:4px 0;">${m}</li>`)
      .join('');

    const high = Array.isArray(res.blocking) && res.blocking.length > 0;

    return `
      <div style="margin-bottom:14px;padding:12px;border-radius:8px;
                  background:${high ? 'rgba(229,57,53,.1)' : 'rgba(255,167,38,.08)'};
                  border:1px solid ${high ? 'rgba(229,57,53,.35)' : 'rgba(255,167,38,.3)'};
                  border-right:4px solid ${high ? '#e53935' : '#ffa726'};">
        <strong style="color:${high ? '#ff8a80' : '#ffcc80'};">
          🛡️ فحص السلامة (${res.all.length})
        </strong>
        <ul style="margin:8px 20px 0 0;color:#ffb4b4;font-size:.82rem;line-height:1.7;">
          ${items}
        </ul>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════
     12. تصدير الواجهة
     ═══════════════════════════════════════════════════════ */
  return {
    // الوظائف الرئيسية
    runAll,
    renderWarnings,
    patientHistory,

    // وظائف فردية (للاستخدام المتقدم)
    interactions,
    duplicates,
    allergy,
    pregnancy,

    // بيانات ثابتة (يمكن قراءتها)
    INTERACTIONS,
    ALLERGY_CLASSES,
    PREGNANCY_RISK
  };
})();

window.SafetyCheck = SafetyCheck;
console.log('✅ safety.js v1.1 — SafetyCheck متاح');
console.log('   ├─ تفاعلات:', SafetyCheck.INTERACTIONS.length);
console.log('   ├─ أصناف حساسية:', Object.keys(SafetyCheck.ALLERGY_CLASSES).length);
console.log('   └─ أدوية الحمل:', SafetyCheck.PREGNANCY_RISK.length);