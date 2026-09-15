/* ==========================================================
   MediPrescribe — PatientSummary v2.0
   ----------------------------------------------------------
   Patient Summary + WhatsApp + Print + Preview

   التحسينات:
   ✅ تطبيع احترافي لرقم الهاتف
   ✅ دعم أرقام اليمن المحلية والدولية
   ✅ منع window.opener قدر الإمكان
   ✅ لا يوجد postMessage('*')
   ✅ معاينة آمنة ثم فتح واتساب مباشرة
   ✅ التعامل الصحيح مع Popup Blocker
   ✅ تسجيل Audit أكثر موثوقية
   ✅ HTML escaping كامل للطباعة
   ✅ حماية من XSS في بيانات المريض
   ✅ دعم بيانات الأدوية بأكثر من بنية
   ✅ تحسين تحويل تكرار الجرعات
   ✅ دعم وزن المريض
   ✅ دعم diagnosis / allergies / advice / alerts
   ✅ دعم supplies / labs
   ✅ واجهة أزرار محسنة
   ✅ توافق مع MediPrescribe
   ========================================================== */

const PatientSummary = (() => {
  'use strict';

  /* ==========================================================
     CONFIG
     ========================================================== */

  const VERSION = '2.0.0';

  const CONFIG = {
    defaultCountryCode: '967',

    /*
     * يفضّل استخدام رقم الهاتف المخزن بصيغة دولية:
     * 967771234567
     */

    whatsappBaseUrl: 'https://wa.me/',

    popupFeatures:
      'noopener,noreferrer,width=720,height=850,resizable=yes,scrollbars=yes',

    previewFeatures:
      'noopener,noreferrer,width=720,height=850,resizable=yes,scrollbars=yes',

    actionBarDuration: 45000,

    maxTextLength: 10000,

    hospitalFallback: 'المركز الصحي',

    doctorFallback: 'الطبيب',

    patientFallback: 'غير محدد',

    diagnosisFallback: 'غير محدد',

    genderFallback: 'غير محدد',

    weightUnit: 'كغ'
  };

  /* ==========================================================
     FREQUENCY RULES
     ========================================================== */

  const FREQ_RULES = [
    {
      patterns: [
        /\bqid\b/i,
        /4\s*مرات/i,
        /اربع مرات/i,
        /أربع مرات/i
      ],
      text: '4 مرات يوميًا'
    },

    {
      patterns: [
        /\btid\b/i,
        /3\s*مرات/i,
        /ثلاث مرات/i
      ],
      text: '3 مرات يوميًا'
    },

    {
      patterns: [
        /\bbid\b/i,
        /2\s*مرات/i,
        /مرتين/i
      ],
      text: 'مرتين يوميًا'
    },

    {
      patterns: [
        /\bhs\b/i,
        /عند النوم/i,
        /وقت النوم/i
      ],
      text: 'مرة واحدة عند النوم'
    },

    {
      patterns: [
        /\bprn\b/i,
        /عند الحاجة/i,
        /عند اللزوم/i
      ],
      text: 'عند الحاجة فقط'
    },

    {
      patterns: [
        /\bq\d+\s*h\b/i,
        /كل\s*\d+\s*ساع/i
      ],
      text: 'كل حسب عدد الساعات المحدد'
    },

    {
      patterns: [
        /\bqd\b/i,
        /\bod\b/i,
        /مرة يوميا/i,
        /مرة يومياً/i,
        /مرة يومي/i
      ],
      text: 'مرة واحدة يوميًا'
    }
  ];

  function freqAr(value) {
    const f = String(value ?? '').trim();

    if (!f) {
      return 'حسب الوصفة';
    }

    for (const rule of FREQ_RULES) {
      if (rule.patterns.some(re => re.test(f))) {
        return rule.text;
      }
    }

    return f;
  }

  /* ==========================================================
     GENERIC HELPERS
     ========================================================== */

  function safeString(value, fallback = '') {
    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function showToastSafe(
    message,
    type = 'info',
    duration = 3500
  ) {
    try {
      if (typeof showToast === 'function') {
        showToast(
          message,
          type,
          duration
        );
      }
    } catch (error) {
      console.warn(
        '[PatientSummary] showToast failed:',
        error
      );
    }
  }

  /* ==========================================================
     MEDICATION HELPERS
     ========================================================== */

  function getMedicationName(med) {
    if (med === null || med === undefined) {
      return '';
    }

    if (typeof med === 'string') {
      return med;
    }

    return (
      med.name ||
      med.genericName ||
      med.generic ||
      med.drugName ||
      med.medication ||
      med.activeIngredient ||
      med.brandName ||
      ''
    );
  }

  function getMedicationDose(med) {
    if (!med || typeof med !== 'object') {
      return '';
    }

    if (
      med.doseText !== undefined &&
      med.doseText !== null &&
      String(med.doseText).trim()
    ) {
      return String(med.doseText).trim();
    }

    const dose =
      med.dose ??
      med.doseMg ??
      med.amount ??
      '';

    const unit =
      med.unit ??
      med.doseUnit ??
      '';

    if (!dose) {
      return '';
    }

    return `${dose}${unit ? ` ${unit}` : ''}`.trim();
  }

  function getMedicationFrequency(med) {
    if (!med || typeof med !== 'object') {
      return '';
    }

    return (
      med.frequency ||
      med.freq ||
      med.dosingFrequency ||
      med.schedule ||
      ''
    );
  }

  function getMedicationDuration(med) {
    if (!med || typeof med !== 'object') {
      return '';
    }

    if (med.durationText) {
      return med.durationText;
    }

    const duration =
      med.duration ??
      med.dur ??
      '';

    const unit =
      med.durationUnit ??
      med.durationType ??
      '';

    if (!duration) {
      return '';
    }

    return `${duration}${unit ? ` ${unit}` : ''}`.trim();
  }

  function getMedicationRoute(med) {
    if (!med || typeof med !== 'object') {
      return '';
    }

    return (
      med.route ||
      med.administrationRoute ||
      ''
    );
  }

  function getMedicationNote(med) {
    if (!med || typeof med !== 'object') {
      return '';
    }

    return (
      med.note ||
      med.notes ||
      med.instructions ||
      med.instruction ||
      ''
    );
  }

  function getMedications(record) {
    if (!record || typeof record !== 'object') {
      return [];
    }

    const meds =
      record.meds ||
      record.medications ||
      record.medicines ||
      record.drugs ||
      record.prescriptions ||
      record.items ||
      [];

    return Array.isArray(meds)
      ? meds
      : [];
  }

  /* ==========================================================
     PATIENT DATA NORMALIZATION
     ========================================================== */

  function normalizeRecord(record) {
    if (!record || typeof record !== 'object') {
      return null;
    }

    const medications =
      getMedications(record);

    const normalizedMeds =
      medications.map((med, index) => ({
        index: index + 1,

        name:
          safeString(
            getMedicationName(med),
            'دواء غير محدد'
          ),

        dose:
          safeString(
            getMedicationDose(med),
            'حسب الوصفة'
          ),

        frequency:
          safeString(
            getMedicationFrequency(med),
            'حسب الوصفة'
          ),

        duration:
          safeString(
            getMedicationDuration(med),
            'حسب الوصفة'
          ),

        route:
          safeString(
            getMedicationRoute(med),
            ''
          ),

        note:
          safeString(
            getMedicationNote(med),
            ''
          )
      }));

    return {
      rxNumber:
        safeString(
          record.rxNumber ||
          record.prescriptionNumber ||
          record.prescriptionId ||
          record.rxId,
          ''
        ),

      hospital:
        safeString(
          record.hospital ||
          record.hospitalName ||
          record.clinic ||
          record.center ||
          record.facility,
          CONFIG.hospitalFallback
        ),

      doctor:
        safeString(
          record.doctor ||
          record.doctorName ||
          record.prescriber ||
          record.prescriberName,
          CONFIG.doctorFallback
        ),

      patientName:
        safeString(
          record.patientName ||
          record.name ||
          record.patient ||
          record.fullName,
          CONFIG.patientFallback
        ),

      age:
        safeString(
          record.age ||
          record.ageYears,
          '—'
        ),

      gender:
        safeString(
          record.gender ||
          record.sex,
          CONFIG.genderFallback
        ),

      weight:
        safeString(
          record.weight ||
          record.weightKg ||
          record.bodyWeight,
          ''
        ),

      diagnosis:
        safeString(
          record.diagnosis ||
          record.diagnoses ||
          record.condition ||
          record.reason,
          CONFIG.diagnosisFallback
        ),

      phone:
        safeString(
          record.phone ||
          record.phoneNumber ||
          record.mobile ||
          record.mobileNumber ||
          record.whatsapp,
          ''
        ),

      allergies:
        safeString(
          Array.isArray(record.allergies)
            ? record.allergies.join('، ')
            : (
                record.allergies ||
                record.drugAllergies ||
                ''
              ),
          ''
        ),

      advice:
        safeString(
          record.advice ||
          record.instructions ||
          record.patientAdvice,
          ''
        ),

      alert:
        safeString(
          record.alert ||
          record.warning ||
          record.safetyAlert,
          ''
        ),

      verificationCode:
        safeString(
          record.verificationCode ||
          record.verifyCode ||
          record.verification,
          ''
        ),

      supplies:
        normalizeList(
          record.supplies ||
          record.itemsToBring ||
          record.medicalSupplies
        ),

      labs:
        normalizeList(
          record.labs ||
          record.labTests ||
          record.tests ||
          record.requiredLabs
        ),

      meds: normalizedMeds,

      raw: record
    };
  }

  function normalizeList(value) {
    if (!Array.isArray(value)) {
      if (
        value === null ||
        value === undefined ||
        value === ''
      ) {
        return [];
      }

      return [String(value)];
    }

    return value
      .map(item => {
        if (
          item === null ||
          item === undefined
        ) {
          return '';
        }

        if (typeof item === 'string') {
          return item.trim();
        }

        if (typeof item === 'object') {
          return safeString(
            item.name ||
            item.label ||
            item.title ||
            item.value,
            ''
          );
        }

        return String(item);
      })
      .filter(Boolean);
  }

  /* ==========================================================
     PHONE NORMALIZATION
     ========================================================== */

  function normalizeDigits(value) {
    return String(value ?? '')
      .replace(/[٠-٩]/g, digit => {
        const map = {
          '٠': '0',
          '١': '1',
          '٢': '2',
          '٣': '3',
          '٤': '4',
          '٥': '5',
          '٦': '6',
          '٧': '7',
          '٨': '8',
          '٩': '9'
        };

        return map[digit];
      })
      .replace(/\D/g, '');
  }

  /**
   * تطبيع رقم الهاتف.
   *
   * أمثلة يمنية صحيحة:
   * 0771234567
   * 771234567
   * 967771234567
   * 00967771234567
   * +967771234567
   *
   * النتيجة:
   * 967771234567
   */

  function intlPhone(
    phone,
    countryCode = CONFIG.defaultCountryCode
  ) {
    let d = normalizeDigits(phone);

    if (!d) {
      return null;
    }

    const cc =
      normalizeDigits(countryCode);

    if (!cc) {
      return null;
    }

    /* 00967xxxxxxxxx */
    if (d.startsWith('00')) {
      d = d.slice(2);
    }

    /* already international */
    if (d.startsWith(cc)) {
      return validateInternationalPhone(
        d,
        cc
      );
    }

    /* local 0xxxxxxxxx */
    if (d.startsWith('0')) {
      d = cc + d.slice(1);

      return validateInternationalPhone(
        d,
        cc
      );
    }

    /*
     * Yemen mobile:
     * 7xxxxxxxx
     */
    if (
      cc === '967' &&
      d.length === 9 &&
      d.startsWith('7')
    ) {
      d = cc + d;

      return validateInternationalPhone(
        d,
        cc
      );
    }

    /*
     * If country-specific validation cannot
     * determine the number, reject instead
     * of silently sending to a wrong number.
     */
    return null;
  }

  function validateInternationalPhone(
    value,
    countryCode
  ) {
    if (!value) {
      return null;
    }

    /*
     * E.164 numbers are normally 8–15 digits.
     */
    if (
      value.length < 8 ||
      value.length > 15
    ) {
      return null;
    }

    if (
      !value.startsWith(countryCode)
    ) {
      return null;
    }

    /*
     * Yemen mobile validation:
     * +967 7xxxxxxxx
     */
    if (countryCode === '967') {
      const subscriber =
        value.slice(3);

      if (
        subscriber.length !== 9 ||
        !subscriber.startsWith('7')
      ) {
        return null;
      }
    }

    return value;
  }

  function isValidPhone(phone) {
    return Boolean(
      intlPhone(phone)
    );
  }

  /* ==========================================================
     TEXT SUMMARY
     ========================================================== */

  function build(record) {
    const r =
      normalizeRecord(record);

    if (!r) {
      return '';
    }

    const L = [];

    /* Header */
    L.push(
      `🩺 *وصفة طبية${
        r.rxNumber
          ? ` — ${r.rxNumber}`
          : ''
      }*`
    );

    L.push(
      `🏥 ${r.hospital} · 👨‍⚕️ ${r.doctor}`
    );

    L.push('');

    /* Patient */
    const patientDetails = [
      r.age !== '—'
        ? `${r.age} سنة`
        : '',

      r.gender !== 'غير محدد'
        ? r.gender
        : '',

      r.weight
        ? `${r.weight} ${CONFIG.weightUnit}`
        : ''
    ]
      .filter(Boolean)
      .join(' · ');

    L.push(
      `👤 *المريض:* ${r.patientName}${
        patientDetails
          ? ` (${patientDetails})`
          : ''
      }`
    );

    L.push(
      `🩺 *التشخيص:* ${r.diagnosis}`
    );

    /* Medications */
    if (r.meds.length) {
      L.push('');
      L.push('💊 *الأدوية:*');

      r.meds.forEach(m => {
        L.push(
          `${m.index}) *${m.name}*`
        );

        L.push(
          `   • الجرعة: ${m.dose}`
        );

        L.push(
          `   • المواعيد: ${freqAr(m.frequency)}`
        );

        L.push(
          `   • المدة: ${m.duration}`
        );

        if (m.route) {
          L.push(
            `   • الطريق: ${m.route}`
          );
        }

        if (m.note) {
          L.push(
            `   📌 ${m.note}`
          );
        }
      });
    }

    /* Supplies */
    if (r.supplies.length) {
      L.push('');
      L.push(
        `🎒 *مستلزمات:* ${r.supplies.join('، ')}`
      );
    }

    /* Labs */
    if (r.labs.length) {
      L.push('');
      L.push(
        `🧪 *فحوصات مطلوبة:* ${r.labs.join('، ')}`
      );
    }

    /* Allergies */
    if (r.allergies) {
      L.push('');
      L.push(
        `⚠️ *حساسية:* ${r.allergies}`
      );
    }

    /* Advice */
    if (r.advice) {
      L.push('');
      L.push(
        '💡 *نصائح مهمة:*'
      );
      L.push(r.advice);
    }

    /* Alert */
    if (r.alert) {
      L.push('');
      L.push(
        '🚨 *تنبيه:*'
      );
      L.push(r.alert);
    }

    /* Footer */
    L.push('');
    L.push('━━━━━━━━━━━━━━━━━');
    L.push(
      '📅 أعد طلب التجديد قبل نهاية المدة بيومين.'
    );
    L.push(
      '📞 للاستفسار راجع المركز الصحي.'
    );

    /* Verification */
    if (r.verificationCode) {
      L.push('');
      L.push(
        `✅ كود التحقق: ${r.verificationCode}`
      );
    }

    let result =
      L.join('\n');

    /*
     * Prevent unexpectedly huge WhatsApp messages.
     */
    if (
      result.length >
      CONFIG.maxTextLength
    ) {
      result =
        result.slice(
          0,
          CONFIG.maxTextLength - 80
        ) +
        '\n\n… تم اختصار الملخص.';
    }

    return result;
  }

  /* ==========================================================
     WHATSAPP URL
     ========================================================== */

  function whatsappUrl(record) {
    const r =
      normalizeRecord(record);

    if (!r) {
      return null;
    }

    const phone =
      intlPhone(r.phone);

    if (!phone) {
      return null;
    }

    const text =
      build(r);

    if (!text) {
      return null;
    }

    return (
      `${CONFIG.whatsappBaseUrl}` +
      `${phone}?text=` +
      encodeURIComponent(text)
    );
  }

  /* ==========================================================
     AUDIT
     ========================================================== */

  async function audit(
    action,
    record
  ) {
    try {
      if (
        typeof logAudit !==
        'function'
      ) {
        return false;
      }

      const r =
        normalizeRecord(record);

      if (!r) {
        return false;
      }

      await logAudit(
        action,
        [
          r.patientName,
          r.rxNumber
            ? `RX:${r.rxNumber}`
            : ''
        ]
          .filter(Boolean)
          .join(' — ')
      );

      return true;
    } catch (error) {
      console.warn(
        '[PatientSummary] Audit failed:',
        error
      );

      return false;
    }
  }

  /* ==========================================================
     CLIPBOARD
     ========================================================== */

  async function copyText(text) {
    const value =
      String(text ?? '');

    if (!value) {
      return false;
    }

    /*
     * Modern Clipboard API
     */
    try {
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText ===
          'function'
      ) {
        await navigator.clipboard.writeText(
          value
        );

        return true;
      }
    } catch (error) {
      console.warn(
        '[PatientSummary] Clipboard API failed:',
        error
      );
    }

    /*
     * Legacy fallback
     */
    try {
      const textarea =
        document.createElement(
          'textarea'
        );

      textarea.value = value;

      textarea.setAttribute(
        'readonly',
        ''
      );

      textarea.style.position =
        'fixed';

      textarea.style.left =
        '-9999px';

      textarea.style.top =
        '0';

      textarea.style.opacity =
        '0';

      document.body.appendChild(
        textarea
      );

      textarea.focus();
      textarea.select();

      const success =
        document.execCommand(
          'copy'
        );

      textarea.remove();

      return Boolean(success);
    } catch (error) {
      console.warn(
        '[PatientSummary] Legacy copy failed:',
        error
      );

      return false;
    }
  }

  /* ==========================================================
     OPEN POPUP SAFELY
     ========================================================== */

  function openPopup(
    url = '',
    features =
      CONFIG.popupFeatures
  ) {
    try {
      return window.open(
        url,
        '_blank',
        features
      );
    } catch (error) {
      console.warn(
        '[PatientSummary] window.open failed:',
        error
      );

      return null;
    }
  }

  /* ==========================================================
     WHATSAPP SEND
     ========================================================== */

  async function sendWhatsApp(
    record
  ) {
    const r =
      normalizeRecord(record);

    if (!r) {
      showToastSafe(
        '❌ بيانات الوصفة غير صالحة.',
        'error'
      );

      return {
        success: false,
        reason: 'invalid-record'
      };
    }

    const url =
      whatsappUrl(r);

    if (!url) {
      showToastSafe(
        '⚠️ رقم الهاتف غير صالح. استخدم مثلًا: 967771234567',
        'warning',
        5000
      );

      return {
        success: false,
        reason: 'invalid-phone'
      };
    }

    /*
     * IMPORTANT:
     * Open popup BEFORE await.
     *
     * Otherwise browsers may consider the
     * popup no longer user initiated.
     */
    const popup =
      openPopup(
        'about:blank',
        CONFIG.popupFeatures
      );

    if (!popup) {
      /*
       * Popup blocked.
       * Do not silently fail.
       */
      const copied =
        await copyText(
          build(r)
        );

      showToastSafe(
        copied
          ? '📋 تم نسخ الملخص. المتصفح منع فتح واتساب.'
          : '⚠️ المتصفح منع فتح واتساب والنسخ غير متاح.',
        copied
          ? 'info'
          : 'warning',
        5000
      );

      return {
        success: false,
        reason: 'popup-blocked',
        copied
      };
    }

    /*
     * Audit is attempted before navigation.
     * It does NOT block WhatsApp forever.
     */
    await audit(
      'فتح واتساب للمريض',
      r
    );

    try {
      popup.location.href =
        url;
    } catch (error) {
      console.warn(
        '[PatientSummary] WhatsApp navigation failed:',
        error
      );

      /*
       * Fallback:
       */
      try {
        window.location.href =
          url;
      } catch (_) {
        // intentionally ignored
      }
    }

    showToastSafe(
      '💬 تم فتح واتساب بالملخص. راجع الرسالة قبل الإرسال.',
      'success',
      3500
    );

    return {
      success: true,
      phone: intlPhone(r.phone),
      url
    };
  }

  /* ==========================================================
     PRINT
     ========================================================== */

  function buildPrintHtml(
    record
  ) {
    const r =
      normalizeRecord(record);

    if (!r) {
      return '';
    }

    const rawText =
      build(r);

    const htmlBody =
      escapeHtml(rawText)
        /*
         * WhatsApp bold syntax
         */
        .replace(
          /\*(.+?)\*/g,
          '<strong>$1</strong>'
        )
        .replace(
          /\n/g,
          '<br>'
        );

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >

  <title>
    ملخص المريض — ${escapeHtml(r.patientName)}
  </title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 30px 20px;
      background: #ffffff;
      color: #172a2a;
      font-family:
        "Tajawal",
        "Cairo",
        Arial,
        sans-serif;
      line-height: 1.9;
    }

    .page {
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
    }

    .header {
      border-bottom: 2px solid #1a756d;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }

    .title {
      margin: 0;
      font-size: 1.45rem;
      font-weight: 900;
      color: #155e59;
    }

    .meta {
      margin-top: 8px;
      font-size: 0.9rem;
      color: #536565;
    }

    .summary {
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      font-size: 1rem;
    }

    strong {
      color: #155e59;
      font-weight: 900;
    }

    .footer {
      margin-top: 30px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      color: #687777;
      font-size: 0.78rem;
    }

    @media print {
      body {
        padding: 12px;
      }

      .page {
        max-width: none;
      }
    }
  </style>
</head>

<body>
  <main class="page">

    <header class="header">
      <h1 class="title">
        🩺 ملخص الوصفة الطبية
      </h1>

      <div class="meta">
        ${escapeHtml(r.hospital)}
        —
        ${escapeHtml(r.doctor)}
        ${
          r.rxNumber
            ? ` — ${escapeHtml(r.rxNumber)}`
            : ''
        }
      </div>
    </header>

    <section class="summary">
      ${htmlBody}
    </section>

    <footer class="footer">
      هذا الملخص صادر من نظام MediPrescribe.
      يجب مراجعة الوصفة الأصلية عند الحاجة.
    </footer>

  </main>
</body>
</html>`;
  }

  function printSummary(
    record
  ) {
    const r =
      normalizeRecord(record);

    if (!r) {
      showToastSafe(
        '❌ لا توجد بيانات صالحة للطباعة.',
        'error'
      );

      return {
        success: false
      };
    }

    const html =
      buildPrintHtml(r);

    const popup =
      openPopup(
        '',
        'width=800,height=900,resizable=yes,scrollbars=yes'
      );

    if (!popup) {
      showToastSafe(
        '⚠️ المتصفح منع فتح نافذة الطباعة.',
        'warning'
      );

      return {
        success: false,
        reason: 'popup-blocked'
      };
    }

    try {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();

      setTimeout(() => {
        try {
          popup.focus();
          popup.print();
        } catch (error) {
          console.warn(
            '[PatientSummary] print failed:',
            error
          );
        }
      }, 400);

      audit(
        'طباعة ملخص المريض',
        r
      );

      return {
        success: true
      };
    } catch (error) {
      console.error(
        '[PatientSummary] print error:',
        error
      );

      try {
        popup.close();
      } catch (_) {}

      showToastSafe(
        '❌ تعذر إنشاء نسخة الطباعة.',
        'error'
      );

      return {
        success: false,
        reason: 'print-error'
      };
    }
  }

  /* ==========================================================
     PREVIEW
     ========================================================== */

  function buildPreviewHtml(
    record
  ) {
    const r =
      normalizeRecord(record);

    if (!r) {
      return '';
    }

    const text =
      build(r);

    const url =
      whatsappUrl(r);

    const phone =
      intlPhone(r.phone);

    const safeText =
      escapeHtml(text);

    const safeUrl =
      escapeAttribute(url || '');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >

  <title>
    معاينة ملخص المريض
  </title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 20px;
      background: #f4f7f6;
      color: #182a2a;
      direction: rtl;
      font-family:
        "Tajawal",
        "Cairo",
        Arial,
        sans-serif;
    }

    .container {
      width: 100%;
      max-width: 720px;
      margin: 0 auto;
    }

    .card {
      background: #fff;
      border: 1px solid #dce5e3;
      border-radius: 16px;
      padding: 20px;
      box-shadow:
        0 10px 30px rgba(0,0,0,.08);
    }

    h2 {
      margin: 0 0 5px;
      color: #0c756b;
      font-size: 1.25rem;
    }

    .patient {
      color: #687777;
      font-size: .88rem;
      margin-bottom: 16px;
    }

    pre {
      margin: 0;
      background: #fafcfc;
      border: 1px solid #e1e8e7;
      border-radius: 12px;
      padding: 16px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      line-height: 1.85;
      font-family:
        "Cairo",
        "Tajawal",
        Arial,
        sans-serif;
      font-size: .92rem;
      max-height: 60vh;
      overflow-y: auto;
    }

    .actions {
      display: grid;
      gap: 10px;
      margin-top: 15px;
    }

    button,
    .button {
      width: 100%;
      min-height: 48px;
      border: 0;
      border-radius: 11px;
      cursor: pointer;
      font-family: inherit;
      font-size: .95rem;
      font-weight: 800;
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px 15px;
    }

    .send {
      background: #25D366;
      color: #fff;
    }

    .copy {
      background: #f1d878;
      color: #172a2a;
    }

    .close {
      background: #e8eeee;
      color: #334545;
    }

    .notice {
      margin-top: 12px;
      padding: 11px 12px;
      border-radius: 10px;
      background: #fff8df;
      border: 1px solid #eadb96;
      color: #66551b;
      font-size: .8rem;
      line-height: 1.7;
    }
  </style>
</head>

<body>

  <main class="container">

    <section class="card">

      <h2>
        📋 معاينة ملخص المريض
      </h2>

      <div class="patient">
        ${escapeHtml(r.patientName)}
        ${
          r.rxNumber
            ? ` — ${escapeHtml(r.rxNumber)}`
            : ''
        }
      </div>

      <pre id="summary">${safeText}</pre>

      <div class="actions">

        ${
          phone
            ? `
              <button
                id="sendBtn"
                class="send"
                type="button"
              >
                💬 تأكيد وفتح واتساب
              </button>
            `
            : `
              <button
                class="send"
                type="button"
                disabled
                style="opacity:.5;cursor:not-allowed;"
              >
                ⚠️ رقم الهاتف غير صالح
              </button>
            `
        }

        <button
          id="copyBtn"
          class="copy"
          type="button"
        >
          📋 نسخ الملخص
        </button>

        <button
          id="closeBtn"
          class="close"
          type="button"
        >
          إغلاق
        </button>

      </div>

      <div class="notice">
        ℹ️ سيتم فتح واتساب فقط بعد تأكيدك.
        راجع محتوى الرسالة قبل الضغط على إرسال داخل واتساب.
      </div>

    </section>

  </main>

  <script>
    const whatsappUrl =
      ${JSON.stringify(url || '')};

    const summary =
      ${JSON.stringify(text)};

    document
      .getElementById('copyBtn')
      ?.addEventListener(
        'click',
        async () => {
          try {
            if (
              navigator.clipboard &&
              navigator.clipboard.writeText
            ) {
              await navigator.clipboard.writeText(
                summary
              );

              alert('تم نسخ الملخص');
              return;
            }

            const ta =
              document.createElement('textarea');

            ta.value = summary;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';

            document.body.appendChild(ta);

            ta.select();

            document.execCommand('copy');

            ta.remove();

            alert('تم نسخ الملخص');
          } catch (error) {
            alert('تعذر نسخ الملخص');
          }
        }
      );

    document
      .getElementById('sendBtn')
      ?.addEventListener(
        'click',
        () => {
          if (!whatsappUrl) {
            alert('رقم الهاتف غير صالح');
            return;
          }

          /*
           * Navigate this preview window directly.
           * No opener / postMessage is required.
           */
          window.location.href =
            whatsappUrl;
        }
      );

    document
      .getElementById('closeBtn')
      ?.addEventListener(
        'click',
        () => {
          window.close();
        }
      );
  </script>

</body>
</html>`;
  }

  function preview(
    record
  ) {
    const r =
      normalizeRecord(record);

    if (!r) {
      showToastSafe(
        '❌ لا توجد بيانات صالحة للمعاينة.',
        'error'
      );

      return {
        success: false
      };
    }

    const html =
      buildPreviewHtml(r);

    const popup =
      openPopup(
        '',
        CONFIG.previewFeatures
      );

    if (!popup) {
      showToastSafe(
        '⚠️ المتصفح منع فتح نافذة المعاينة.',
        'warning',
        4500
      );

      return {
        success: false,
        reason: 'popup-blocked'
      };
    }

    try {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();

      audit(
        'معاينة ملخص المريض',
        r
      );

      return {
        success: true
      };
    } catch (error) {
      console.error(
        '[PatientSummary] preview error:',
        error
      );

      try {
        popup.close();
      } catch (_) {}

      return {
        success: false,
        reason: 'preview-error'
      };
    }
  }

  /* ==========================================================
     ACTION BAR
     ========================================================== */

  function removeActionBar() {
    const existing =
      document.getElementById(
        'ps-action-bar'
      );

    if (existing) {
      existing.remove();
    }
  }

  function createButton({
    icon = '',
    text = '',
    background = '#eee',
    color = '#111',
    ariaLabel = '',
    onClick
  }) {
    const button =
      document.createElement(
        'button'
      );

    button.type = 'button';

    button.setAttribute(
      'aria-label',
      ariaLabel || text
    );

    button.style.cssText = `
      min-height: 42px;
      padding: 9px 15px;
      border: none;
      border-radius: 9px;
      cursor: pointer;
      font-family: inherit;
      font-weight: 800;
      font-size: .82rem;
      color: ${color};
      background: ${background};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition:
        transform .15s ease,
        filter .15s ease;
      white-space: nowrap;
    `;

    button.textContent =
      `${icon} ${text}`.trim();

    button.addEventListener(
      'mouseenter',
      () => {
        button.style.transform =
          'translateY(-2px)';

        button.style.filter =
          'brightness(1.04)';
      }
    );

    button.addEventListener(
      'mouseleave',
      () => {
        button.style.transform =
          'translateY(0)';

        button.style.filter =
          'brightness(1)';
      }
    );

    button.addEventListener(
      'click',
      onClick
    );

    return button;
  }

  function showActions(
    record
  ) {
    const r =
      normalizeRecord(record);

    if (!r) {
      return;
    }

    removeActionBar();

    const bar =
      document.createElement(
        'div'
      );

    bar.id =
      'ps-action-bar';

    bar.setAttribute(
      'role',
      'toolbar'
    );

    bar.setAttribute(
      'aria-label',
      'إجراءات ملخص المريض'
    );

    bar.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 4000;
      display: flex;
      gap: 9px;
      align-items: center;
      padding: 12px 14px;
      background: rgba(10,22,40,.97);
      border: 1px solid rgba(212,175,55,.4);
      border-radius: 14px;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow:
        0 20px 50px rgba(0,0,0,.65);
      font-family:
        "Tajawal",
        "Cairo",
        Arial,
        sans-serif;
      flex-wrap: wrap;
      justify-content: center;
      max-width: 95vw;
      animation:
        psSlideUp .35s
        cubic-bezier(.22,1,.36,1);
    `;

    /* COPY */
    const copyBtn =
      createButton({
        icon: '📋',
        text: 'نسخ الملخص',
        background: '#f1d878',
        color: '#0a1628',
        onClick: async () => {
          const ok =
            await copyText(
              build(r)
            );

          showToastSafe(
            ok
              ? '✅ تم نسخ الملخص'
              : '❌ فشل نسخ الملخص',
            ok
              ? 'success'
              : 'error'
          );

          if (ok) {
            await audit(
              'نسخ ملخص المريض',
              r
            );
          }
        }
      });

    bar.appendChild(
      copyBtn
    );

    /* WHATSAPP */
    if (r.phone) {
      const valid =
        isValidPhone(r.phone);

      const waBtn =
        createButton({
          icon: '💬',
          text: 'واتساب للمريض',
          background:
            valid
              ? '#25D366'
              : '#9e9e9e',
          color: '#ffffff',
          onClick: () => {
            if (!valid) {
              showToastSafe(
                '⚠️ رقم الهاتف غير صالح.',
                'warning'
              );

              return;
            }

            sendWhatsApp(r);
          }
        });

      bar.appendChild(
        waBtn
      );
    }

    /* PREVIEW */
    const previewBtn =
      createButton({
        icon: '👁️',
        text: 'معاينة',
        background: '#ce93d8',
        color: '#30133a',
        onClick: () =>
          preview(r)
      });

    bar.appendChild(
      previewBtn
    );

    /* PRINT */
    const printBtn =
      createButton({
        icon: '🖨️',
        text: 'طباعة',
        background: '#90caf9',
        color: '#08243d',
        onClick: () =>
          printSummary(r)
      });

    bar.appendChild(
      printBtn
    );

    /* CLOSE */
    const closeBtn =
      document.createElement(
        'button'
      );

    closeBtn.type =
      'button';

    closeBtn.textContent =
      '✕';

    closeBtn.setAttribute(
      'aria-label',
      'إغلاق شريط الإجراءات'
    );

    closeBtn.style.cssText = `
      min-width: 38px;
      min-height: 38px;
      padding: 6px 10px;
      border: 1px solid rgba(255,255,255,.15);
      border-radius: 8px;
      cursor: pointer;
      background: transparent;
      color: #93a2b5;
      font-family: inherit;
      font-size: .9rem;
      font-weight: 700;
    `;

    closeBtn.addEventListener(
      'click',
      removeActionBar
    );

    bar.appendChild(
      closeBtn
    );

    document.body.appendChild(
      bar
    );

    /* AUTO CLOSE */
    const timer =
      setTimeout(() => {
        if (
          document.body.contains(bar)
        ) {
          bar.style.animation =
            'psSlideDown .3s forwards';

          setTimeout(
            () => {
              if (
                document.body.contains(
                  bar
                )
              ) {
                bar.remove();
              }
            },
            320
          );
        }
      },
      CONFIG.actionBarDuration
    );

    /*
     * Store timer so future versions can
     * cancel it if needed.
     */
    bar._psTimer = timer;
  }

  /* ==========================================================
     CSS
     ========================================================== */

  function installStyles() {
    if (
      document.getElementById(
        'ps-summary-styles'
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        'style'
      );

    style.id =
      'ps-summary-styles';

    style.textContent = `
      @keyframes psSlideUp {
        from {
          opacity: 0;
          transform:
            translate(-50%, 30px);
        }

        to {
          opacity: 1;
          transform:
            translate(-50%, 0);
        }
      }

      @keyframes psSlideDown {
        from {
          opacity: 1;
          transform:
            translate(-50%, 0);
        }

        to {
          opacity: 0;
          transform:
            translate(-50%, 30px);
        }
      }

      #ps-action-bar button:focus-visible {
        outline:
          3px solid
          rgba(255,255,255,.7);

        outline-offset: 2px;
      }

      @media (max-width: 600px) {
        #ps-action-bar {
          bottom: 10px !important;
          width: 94vw;
          padding: 10px !important;
        }

        #ps-action-bar button {
          flex: 1 1 auto;
          min-width: 125px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #ps-action-bar {
          animation: none !important;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  /* ==========================================================
     SUMMARY API
     ========================================================== */

  function getPatientSummary(
    record
  ) {
    const r =
      normalizeRecord(record);

    if (!r) {
      return null;
    }

    return {
      version: VERSION,

      patientName:
        r.patientName,

      rxNumber:
        r.rxNumber,

      phone:
        r.phone,

      normalizedPhone:
        intlPhone(r.phone),

      hospital:
        r.hospital,

      doctor:
        r.doctor,

      diagnosis:
        r.diagnosis,

      medicationCount:
        r.meds.length,

      text:
        build(r),

      whatsappUrl:
        whatsappUrl(r),

      hasValidPhone:
        isValidPhone(r.phone),

      medications:
        r.meds.map(m => ({
          name: m.name,
          dose: m.dose,
          frequency: m.frequency,
          frequencyArabic:
            freqAr(m.frequency),
          duration: m.duration,
          route: m.route,
          note: m.note
        }))
    };
  }

  /* ==========================================================
     INITIALIZATION
     ========================================================== */

  function init() {
    try {
      if (
        typeof document !==
        'undefined'
      ) {
        installStyles();
      }

      return true;
    } catch (error) {
      console.warn(
        '[PatientSummary] init failed:',
        error
      );

      return false;
    }
  }

  /* ==========================================================
     PUBLIC API
     ========================================================== */

  const API = {
    VERSION,

    CONFIG,

    init,

    build,

    normalizeRecord,

    getPatientSummary,

    getMedications,

    freqAr,

    intlPhone,

    isValidPhone,

    whatsappUrl,

    sendWhatsApp,

    copyText,

    printSummary,

    preview,

    showActions,

    removeActionBar,

    escapeHtml
  };

  /*
   * Initialize automatically in browser.
   */
  if (
    typeof window !==
    'undefined'
  ) {
    init();
  }

  return API;

})();

/* ==========================================================
   GLOBAL EXPORT
   ========================================================== */

if (
  typeof window !==
  'undefined'
) {
  window.PatientSummary =
    PatientSummary;

  console.log(
    `✅ PatientSummary v${PatientSummary.VERSION} — متاح`
  );
         }
