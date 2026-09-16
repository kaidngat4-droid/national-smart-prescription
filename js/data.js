/* ==========================================================
 * data.js v5.0 — Clinical Internal Medicine Dataset
 * النسخة المصححة: 130 تشخيصاً باطنياً
 * ==========================================================
 *
 * التصحيحات الرئيسية v5.0:
 *   ✅ إصلاح الخطأ النحوي بين ID 100 و 101
 *   ✅ تحديث عدد التشخيصات المتوقع إلى 130
 *   ✅ مراجعة سريرية كاملة للـ 30 تشخيصاً الجديدة
 *   ✅ إضافة procedures للسرطانات الجلدية
 *   ✅ إضافة calc للأدوية الوزنية المفقودة
 *   ✅ توحيد معيار alert (طوارئ) vs advice (روتيني)
 *
 * تنبيه سريري:
 *   هذه البيانات لا تُستخدم كوصفة طبية مستقلة.
 *   يجب التحقق من الجرعة، العمر، الوزن، الحمل، وظائف الكلى
 *   والكبد، التداخلات الدوائية، الحساسية، والبروتوكول المحلي
 *   قبل الاستخدام السريري.
 *
 * المراجع: WHO / ADA / AHA-ACC / GOLD / GINA / IDSA / ACG /
 *          ESC / NICE / ATA / ACR / KDIGO / ATS / CDC /
 *          AAD / BAD / EADV / ILAE
 * ========================================================== */


/* ==========================================================
 * 1) CONSTANTS
 * ========================================================== */

const DATA_VERSION = '5.0';

const HOSPITALS = Object.freeze([
  'هيئة مستشفى الثورة العام',
  'مستشفى جبله الجامعي',
  'مستشفى البدر الدولي',
  'مستشفى الحمد التخصصي',
  'مستشفى الأمين النموذجي',
  'مستشفى النور التخصصي',
  'مستشفى المنار التخصصي',
  'مستشفى المجد التخصصي'
]);

const CATEGORIES = Object.freeze([
  'أمراض القلب والضغط',
  'الغدد الصم والسكري',
  'أمراض الدم',
  'الصدرية',
  'الأذن والحنجرة',
  'البولية والتناسلية',
  'الجهاز الهضمي',
  'الكبد',
  'الأمراض المعدية',
  'المفاصل',
  'الكلى والمسالك',
  'الأعصاب',
  'الجلدية',
  'الأيض'
]);


/* ==========================================================
 * 2) HELPERS
 * ========================================================== */

/**
 * إنشاء تعريف دواء موحد.
 *
 * @param {Object} medication
 * @param {string} medication.name        - الاسم الكامل مع الاسم العلمي
 * @param {string} medication.dose        - الجرعة (مثال: "500 ملغ")
 * @param {string} medication.frequency   - التكرار (مثال: "مرتان يومياً")
 * @param {string} [medication.duration]  - المدة (مثال: "شهر")
 * @param {string} [medication.note]      - ملاحظة سريرية
 * @param {Object} [medication.calc]      - حساب وزني (mgkg/unit/max)
 * @returns {Readonly<Object>}
 */
function medication({
  name,
  dose,
  frequency,
  duration = '',
  note = '',
  calc = null
}) {
  if (!name?.trim()) {
    throw new Error('medication: name is required');
  }
  if (!dose?.trim()) {
    throw new Error(`medication "${name}": dose is required`);
  }
  if (!frequency?.trim()) {
    throw new Error(`medication "${name}": frequency is required`);
  }

  return Object.freeze({
    n: name,
    dose,
    freq: frequency,
    dur: duration,
    note,
    ...(calc ? { calc: Object.freeze(calc) } : {})
  });
}


/**
 * إنشاء تشخيص موحد.
 *
 * @param {Object} diagnosis
 * @param {number} diagnosis.id
 * @param {string} diagnosis.name
 * @param {string} diagnosis.category      - يجب أن يطابق CATEGORIES
 * @param {string} diagnosis.reference     - مرجع طبي (WHO, ADA...)
 * @param {Object[]} [diagnosis.medications]
 * @param {string[]} [diagnosis.supplies]
 * @param {string[]} [diagnosis.labs]
 * @param {string} [diagnosis.advice]
 * @param {string} [diagnosis.alert]
 * @param {string} [diagnosis.clinicalNote]
 * @param {string[]} [diagnosis.procedures] - إجراءات تداخلية (جديد v5.0)
 * @returns {Readonly<Object>}
 */
function diagnosis({
  id,
  name,
  category,
  reference,
  medications = [],
  supplies = [],
  labs = [],
  advice = '',
  alert = '',
  clinicalNote = '',
  procedures = []
}) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid diagnosis ID: ${id}`);
  }
  if (!name?.trim()) {
    throw new Error(`Diagnosis ${id}: name is required`);
  }
  if (!category?.trim()) {
    throw new Error(`Diagnosis ${id}: category is required`);
  }
  if (!CATEGORIES.includes(category)) {
    throw new Error(
      `Diagnosis ${id}: invalid category "${category}"`
    );
  }
  if (!reference?.trim()) {
    throw new Error(`Diagnosis ${id}: reference is required`);
  }
  if (!Array.isArray(medications)) {
    throw new Error(`Diagnosis ${id}: medications must be array`);
  }

  return Object.freeze({
    id,
    name,
    cat: category,
    ref: reference,
    meds: Object.freeze(medications),
    supplies: Object.freeze(supplies),
    labs: Object.freeze(labs),
    advice,
    alert,
    ...(clinicalNote ? { clinicalNote } : {}),
    ...(procedures.length ? { procedures: Object.freeze(procedures) } : {})
  });
}


/* ==========================================================
 * 3) DIAGNOSES
 * ========================================================== */

const DIAGNOSES = [

  /* ═══════════════════════════════════════════════════════
     01-25: التشخيصات الأساسية
     ═══════════════════════════════════════════════════════ */

  diagnosis({
    id: 1,
    name: 'ارتفاع ضغط الدم الأساسي',
    category: 'أمراض القلب والضغط',
    reference: 'WHO/ISH 2021',
    medications: [
      medication({
        name: 'أملوديبين (Amlodipine)',
        dose: '5 ملغ',
        frequency: 'مرة يومياً',
        duration: 'شهر — قابل للتجديد',
        note: 'يعدّل إلى 10 ملغ حسب الاستجابة'
      }),
      medication({
        name: 'لوزارتان (Losartan)',
        dose: '50 ملغ',
        frequency: 'مرة يومياً',
        duration: 'شهر',
        note: 'راقب البوتاسيوم والكرياتينين'
      }),
      medication({
        name: 'هيدروكلوروثيازيد (HCTZ)',
        dose: '25 ملغ',
        frequency: 'مرة يومياً',
        duration: 'شهر',
        note: 'يفضّل صباحاً؛ يتابع البوتاسيوم'
      })
    ],
    supplies: [
      'جهاز قياس ضغط إلكتروني',
      'دفتر متابعة القراءات اليومية'
    ],
    labs: ['يوريا وكرياتينين', 'بوتاسيوم وصوديوم', 'تحليل بول', 'ECG'],
    advice:
      'تقليل الملح < 5غ/يوم، إيقاف التدخين، نشاط بدني 30 دقيقة × 5 أيام أسبوعياً، الالتزام بالدواء حتى لو تحسنت الأعراض.',
    alert:
      'إذا كان الضغط الانقباضي ≥ 180 أو الانبساطي ≥ 120 مع أعراض → إحالة طارئة فوراً.'
  }),

  diagnosis({
    id: 2,
    name: 'داء السكري النوع الثاني',
    category: 'الغدد الصم والسكري',
    reference: 'ADA Standards 2026',
    medications: [
      medication({
        name: 'ميتفورمين (Metformin)',
        dose: '500 ملغ',
        frequency: 'مرتان يومياً مع الطعام',
        duration: 'مستمر',
        note: 'يوقف عند eGFR < 30'
      }),
      medication({
        name: 'جليميبيريد (Glimepiride)',
        dose: '2 ملغ',
        frequency: 'مرة يومياً قبل الفطور',
        duration: 'مستمر',
        note: 'يعدّل حسب قراءات السكر؛ حذر من هبوط السكر'
      }),
      medication({
        name: 'إيمبليفلوزين (Empagliflozin)',
        dose: '10 ملغ',
        frequency: 'مرة يومياً صباحاً',
        duration: 'مستمر',
        note: 'مراقبة للعدوى الفطرية وإلتهاب المجاري البولية'
      })
    ],
    supplies: ['جهاز قياس سكر glucometer', 'شرائط قياس السكر'],
    labs: [
      'HbA1c كل 3 أشهر',
      'وظائف كلى',
      'فحص شبكية العين سنوياً',
      'دهنيات الدم'
    ],
    advice:
      'وجبات صغيرة متكررة قليلة النشويات، مشي 30-45 دقيقة يومياً، فحص القدمين يومياً.',
    alert: 'هبوط السكر: تعرق/رعشة/دوخة → إعطاء 15غ جلوكوز فوراً.'
  }),

  diagnosis({
    id: 3,
    name: 'داء السكري النوع الأول',
    category: 'الغدد الصم والسكري',
    reference: 'ADA / ISPAD 2026',
    medications: [
      medication({
        name: 'أنسولين جلارجين (Glargine)',
        dose: 'حسب الوزن 0.5-1 وحدة/كغ',
        frequency: 'حقن مرة يومياً',
        duration: 'مدى الحياة',
        note: 'جرعة أساسية Basal'
      }),
      medication({
        name: 'أنسولين ليسبرو/أسبارت سريع',
        dose: 'حسب الوزن + الكربوهيدرات',
        frequency: 'قبل الوجبات الثلاث',
        duration: 'مدى الحياة',
        note: 'جرعة بولس'
      })
    ],
    supplies: [
      'أقلام أنسولين',
      'إبر دقيقة',
      'جهاز قياس سكر',
      'كيتونات البول'
    ],
    labs: ['HbA1c كل 3 أشهر', 'بوتاسيوم وكرياتينين', 'فحص الغدة الدرقية'],
    advice:
      'تعليم حساب النسبة التصحيحية والكربوهيدرات، بطاقة تعريف مرضى السكر، حمل مصدر سكر سريع.',
    alert: 'حماض الكيتون: غثيان/قيء/ألم بطن/تنفس عميق → طوارئ.'
  }),

  diagnosis({
    id: 4,
    name: 'فقر الدم بعوز الحديد',
    category: 'أمراض الدم',
    reference: 'WHO 2020',
    medications: [
      medication({
        name: 'كبريتات الحديدوز (Ferrous sulfate)',
        dose: '200 ملغ',
        frequency: 'مرة أو مرتان يومياً',
        duration: '3 أشهر + صيانة',
        note: 'مع فيتامين C'
      }),
      medication({
        name: 'فيتامين C',
        dose: '500 ملغ',
        frequency: 'مرة يومياً',
        duration: '3 أشهر',
        note: 'يرفع امتصاص الحديد'
      })
    ],
    supplies: ['شراب الحديد (للأطفال)'],
    labs: ['CBC', 'فيريتين', 'TIBC', 'براز دموي خفي'],
    advice:
      'الحديد يلوّن البراز أسود (طبيعي)، تجنب الشاي/القهوة/الحليب مع الجرعة.',
    alert: 'إذا فشل الارتفاع خلال 4 أسابيع → ابحث عن نزيف مزمن.'
  }),

  diagnosis({
    id: 5,
    name: 'فقر الدم بعوز الفولات',
    category: 'أمراض الدم',
    reference: 'WHO 2017',
    medications: [
      medication({
        name: 'حمض الفوليك (Folic acid)',
        dose: '5 ملغ',
        frequency: 'مرة يومياً',
        duration: '3-4 أشهر',
        note: 'استبعد عوز B12 أولاً'
      })
    ],
    labs: ['CBC', 'فولات المصل', 'فيتامين B12'],
    advice: 'غني بالخضروات الورقية؛ النساء الحوامل 400مكغ يومياً.',
    alert: 'لا تعطِ الفولات وحده قبل استبعاد عوز B12.'
  }),

  diagnosis({
    id: 6,
    name: 'فقر الدم بعوز فيتامين B12',
    category: 'أمراض الدم',
    reference: 'UpToDate 2026',
    medications: [
      medication({
        name: 'هيدروكسوكوبالامين B12',
        dose: '1000 مكغ',
        frequency: 'حقن عضل 3 مرات أسبوعياً',
        duration: 'أسبوعان + صيانة',
        note: 'للعوز الشديد'
      }),
      medication({
        name: 'سيانوكوبالامين فموي',
        dose: '1000 مكغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر',
        note: 'للعوز الخفيف'
      })
    ],
    supplies: ['محاقن IM'],
    labs: ['B12 المصل', 'Methylmalonic acid', 'CBC'],
    advice: 'مراقبة الأعراض العصبية.',
    alert: 'أي عجز عصبي يستدعي الحقن فوراً.'
  }),

  diagnosis({
    id: 7,
    name: 'الربو القصبي المستقر',
    category: 'الصدرية',
    reference: 'GINA 2026',
    medications: [
      medication({
        name: 'بوديزونيد/فورموتيرول',
        dose: '160/4.5 مكغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'ICS-LABA'
      }),
      medication({
        name: 'سالبيوتامول (Ventolin)',
        dose: '100 مكغ/بخة',
        frequency: 'عند الأعراض',
        duration: 'إنقاذي',
        note: 'الاستخدام اليومي المتكرر = غير متحكم'
      })
    ],
    supplies: ['بخاخة MDI + Spacer', 'قارئ PEFR', 'خطة عمل الربو'],
    labs: ['Spirometry', 'فحص حساسية'],
    advice: 'استخدام Spacer، المضمضة بعد الكورتيزون، تجنب المثيرات.',
    alert: 'SpO₂ < 92% → نيبولايزر + طوارئ.'
  }),

  diagnosis({
    id: 8,
    name: 'داء الانسداد الرئوي المزمن COPD',
    category: 'الصدرية',
    reference: 'GOLD 2026',
    medications: [
      medication({
        name: 'تيوتروبيوم (Spiriva)',
        dose: '18 مكغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر',
        note: 'LAMA'
      }),
      medication({
        name: 'سالميترول/فلوتيكازون',
        dose: '50/500 مكغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'ICS+LABA'
      })
    ],
    supplies: ['جهاز استنشاق', 'Spacer'],
    labs: ['Spirometry', 'SpO₂', 'ECG'],
    advice: 'الإقلاع عن التدخين، التطعيم، تقنيات التنفس.',
    alert: 'تفاقم حاد → مضاد حيوي + ستيرويد فموي.'
  }),

  diagnosis({
    id: 9,
    name: 'التهاب الشعب الهوائية الحاد',
    category: 'الصدرية',
    reference: 'IDSA/ATS — فيروسي غالباً',
    medications: [
      medication({
        name: 'باراسيتامول',
        dose: '1غ',
        frequency: '3-4 مرات يومياً',
        duration: '5 أيام',
        calc: { mgkg: 15, unit: 'ملغ/كغ/جرعة', max: '1غ' }
      }),
      medication({
        name: 'أموكسيسيلين',
        dose: '500 ملغ',
        frequency: '3 مرات يومياً',
        duration: '5-7 أيام',
        note: 'فقط عند اشتباه جرثومي'
      })
    ],
    supplies: ['مقياس حرارة'],
    labs: ['CBC', 'أشعة صدر'],
    advice: 'راحة وسوائل دافئة، عسل دافئ للسعال.',
    alert: 'حمى > 5 أيام أو ضيق نفس → استبعد الالتهاب الرئوي.'
  }),

  diagnosis({
    id: 10,
    name: 'الالتهاب الرئوي المكتسب من المجتمع',
    category: 'الصدرية',
    reference: 'IDSA/ATS 2019',
    medications: [
      medication({
        name: 'أموكسيسيلين/كلافولانيك',
        dose: '625 ملغ',
        frequency: '3 مرات يومياً',
        duration: '7 أيام',
        calc: { mgkg: 25, unit: 'ملغ/كغ 3 مرات', max: '625 ملغ' }
      }),
      medication({
        name: 'أزيتروميسين',
        dose: '500 ملغ',
        frequency: 'مرة يومياً',
        duration: '3-5 أيام',
        calc: { mgkg: 10, unit: 'ملغ/كغ يومياً', max: '500 ملغ' }
      })
    ],
    supplies: ['مقياس SpO₂'],
    labs: ['أشعة صدر', 'CBC + CRP', 'زرع بلغم'],
    advice: 'راحة وترطيب.',
    alert: 'SpO₂ < 92% → مستشفى فوراً.'
  }),

  diagnosis({
    id: 11,
    name: 'التهاب اللوزتين الجرثومي',
    category: 'الأذن والحنجرة',
    reference: 'IDSA/AAP 2025',
    medications: [
      medication({
        name: 'أموكسيسيلين',
        dose: '500 ملغ',
        frequency: 'مرتان يومياً',
        duration: '10 أيام',
        calc: { mgkg: 50, unit: 'ملغ/كغ/يوم مقسمة', max: '1غ/يوم' }
      })
    ],
    labs: ['فحص AST'],
    advice: 'إكمال المدة كاملة، مسكنات.',
    alert: 'التهاب عقيّم فيروسي → لا مضاد.'
  }),

  diagnosis({
    id: 12,
    name: 'التهاب البلعوم الجرثومي',
    category: 'الأذن والحنجرة',
    reference: 'CDC 2025',
    medications: [
      medication({
        name: 'أموكسيسيلين',
        dose: '500 ملغ',
        frequency: 'مرتان يومياً',
        duration: '10 أيام',
        calc: { mgkg: 50, unit: 'ملغ/كغ/يوم', max: '1غ/يوم' }
      })
    ],
    labs: ['AST سريع'],
    advice: 'تجنب البنسلين بلا اختبار.',
    alert: 'صعوبة بلع اللعاب → طوارئ.'
  }),

  diagnosis({
    id: 13,
    name: 'عدوى المسالك البولية غير المعقدة',
    category: 'البولية والتناسلية',
    reference: 'IDSA 2024',
    medications: [
      medication({
        name: 'نيتروفورانتوين',
        dose: '100 ملغ',
        frequency: 'مرتان يومياً',
        duration: '5 أيام'
      }),
      medication({
        name: 'فوسفوميسين',
        dose: '3غ',
        frequency: 'جرعة واحدة',
        duration: 'يوم واحد'
      })
    ],
    labs: ['زرع بول', 'تحليل بول'],
    advice: 'سوائل بوفرة، تبول بعد العلاقة.',
    alert: 'حمى + ألم خاصرة → التهاب حوض كلية.'
  }),

  diagnosis({
    id: 14,
    name: 'التهاب المعدة والأمعاء الحاد',
    category: 'الجهاز الهضمي',
    reference: 'WHO DTC',
    medications: [
      medication({
        name: 'محلول ORS',
        dose: 'كيس بـ1 لتر',
        frequency: 'رشفات متكررة',
        duration: 'حتى التوقف',
        calc: { mgkg: 75, unit: 'مل/كغ خلال 4 ساعات', max: '' }
      }),
      medication({
        name: 'زنك فوماري',
        dose: '10-20 ملغ',
        frequency: 'مرة يومياً',
        duration: '10-14 يوماً',
        note: 'يقلل المدة'
      })
    ],
    supplies: ['أكواب قياس ORS'],
    labs: ['زرع براز عند دم'],
    advice: 'الاستمرار بالرضاعة، غسل اليدين.',
    alert: 'جفاف شديد → سوائل وريدية.'
  }),

  diagnosis({
    id: 15,
    name: 'الإسهال الحاد (دعمي)',
    category: 'الجهاز الهضمي',
    reference: 'WHO ORS+Zinc',
    medications: [
      medication({
        name: 'محلول ORS',
        dose: 'بعد كل إسهالة',
        frequency: 'على مدار اليوم',
        duration: '2-4 أيام'
      }),
      medication({
        name: 'زنك عنصري',
        dose: '20 ملغ',
        frequency: 'مرة يومياً',
        duration: '10-14 يوماً'
      }),
      medication({
        name: 'بروبيوتيك',
        dose: '250 ملغ',
        frequency: 'مرتان يومياً',
        duration: '5 أيام',
        note: 'يخفف المدة'
      })
    ],
    supplies: ['معقمات'],
    labs: ['زرع براز > 7 أيام'],
    advice: 'تجنب مضادات الإسهال مع الحمى.',
    alert: 'براز أسود → مراجعة فورية.'
  }),

  diagnosis({
    id: 16,
    name: 'القرحة الهضمية + جرثومة المعدة',
    category: 'الجهاز الهضمي',
    reference: 'ACG / Maastricht VI',
    medications: [
      medication({
        name: 'أوميبرازول',
        dose: '20 ملغ',
        frequency: 'مرتان يومياً',
        duration: '14 يوماً'
      }),
      medication({
        name: 'أموكسيسيلين',
        dose: '1غ',
        frequency: 'مرتان يومياً',
        duration: '14 يوماً'
      }),
      medication({
        name: 'كلاريثروميسين',
        dose: '500 ملغ',
        frequency: 'مرتان يومياً',
        duration: '14 يوماً'
      })
    ],
    labs: ['اختبار H.pylori بعد 4 أسابيع'],
    advice: 'إيقاف التدخين والمسكنات.',
    alert: 'قيء دم → تنظير عاجل.'
  }),

  diagnosis({
    id: 17,
    name: 'ارتجاع المريء GERD',
    category: 'الجهاز الهضمي',
    reference: 'ACG 2025',
    medications: [
      medication({
        name: 'أوميبرازول',
        dose: '20 ملغ',
        frequency: 'مرة يومياً قبل الفطور',
        duration: '8 أسابيع'
      }),
      medication({
        name: 'ألجينات الصوديوم',
        dose: '10 مل',
        frequency: 'بعد الوجبات',
        duration: 'حسب الأعراض'
      })
    ],
    supplies: ['وسادة رفع'],
    labs: ['تنظير إذا إنذارات'],
    advice: 'تجنب الوجبات قبل النوم بـ3 ساعات.',
    alert: 'عسر بلع تدريجي → تنظير فوري.'
  }),

  diagnosis({
    id: 18,
    name: 'الإمساك المزمن',
    category: 'الجهاز الهضمي',
    reference: 'ACG 2023',
    medications: [
      medication({
        name: 'إيزابغولا',
        dose: '3.5غ',
        frequency: 'مرة-مرتان يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'لاكتيلوز',
        dose: '15-30 مل',
        frequency: 'مساءً',
        duration: 'حتى الانتظام',
        calc: { mgkg: 1, unit: 'مل/كغ/يوم', max: '45 مل' }
      })
    ],
    labs: ['CBC إذا > 45'],
    advice: 'سوائل 2 لتر، نشاط بدني.',
    alert: 'إمساك جديد > 50 سنة → تنظير.'
  }),

  diagnosis({
    id: 19,
    name: 'متلازمة القولون العصبي (IBS)',
    category: 'الجهاز الهضمي',
    reference: 'ACG 2025',
    medications: [
      medication({
        name: 'ميبيفيرين',
        dose: '135 ملغ',
        frequency: '3 مرات يومياً',
        duration: '4-12 أسبوعاً'
      }),
      medication({
        name: 'بروبيوتيك',
        dose: 'كبسولة',
        frequency: 'مرة يومياً',
        duration: '8 أسابيع'
      })
    ],
    labs: ['CBC', 'CRP'],
    advice: 'سجل محفزات، استرخاء.',
    alert: 'التهاب ليلي → استبعد IBD.'
  }),

  diagnosis({
    id: 20,
    name: 'التهاب الكبد B المزمن',
    category: 'الكبد',
    reference: 'WHO 2024',
    medications: [
      medication({
        name: 'تينوفوفير',
        dose: '300 ملغ',
        frequency: 'مرة يومياً',
        duration: 'طويلة',
        note: 'بإشراف متخصص'
      })
    ],
    labs: ['HBeAg', 'Hep B DNA', 'ALT/AST', 'AFP + سونار'],
    advice: 'تجنب الكحول تماماً.',
    alert: 'يرقان متفاقم → إحالة كبد.'
  }),

  diagnosis({
    id: 21,
    name: 'حمى التيفوئيد',
    category: 'الأمراض المعدية',
    reference: 'WHO 2023',
    medications: [
      medication({
        name: 'أزيتروميسين',
        dose: '500 ملغ',
        frequency: 'مرة يومياً',
        duration: '7 أيام'
      }),
      medication({
        name: 'باراسيتامول',
        dose: '1غ',
        frequency: 'عند الحاجة',
        calc: { mgkg: 15, unit: 'ملغ/كغ/جرعة', max: '1غ' }
      })
    ],
    supplies: ['تبريد'],
    labs: ['مزارع دم/براز', 'CBC'],
    advice: 'سوائل وفيرة، نظافة.',
    alert: 'نزف → طوارئ.'
  }),

  diagnosis({
    id: 22,
    name: 'الملاريا غير المعقدة',
    category: 'الأمراض المعدية',
    reference: 'WHO Malaria 2025',
    medications: [
      medication({
        name: 'أرتيميثر/لوميفانترين',
        dose: '4 أقراص',
        frequency: '0-8-24-36-48-60 ساعة',
        duration: '3 أيام',
        calc: { mgkg: 2, unit: 'قرص/10كغ/جرعة', max: '4 أقراص/جرعة' }
      })
    ],
    supplies: ['ناموسية', 'RDT'],
    labs: ['فيلم دم'],
    advice: 'إكمال الجرعات الست.',
    alert: 'نوبات/تشوش → ملاريا شديدة.'
  }),

  diagnosis({
    id: 23,
    name: 'السل الرئوي',
    category: 'الأمراض المعدية',
    reference: 'WHO DOTS',
    medications: [
      medication({
        name: 'HRZE (شهران)',
        dose: 'حسب الوزن',
        frequency: 'مرة يومياً',
        duration: 'شهرين'
      }),
      medication({
        name: 'HR (4 أشهر)',
        dose: 'حسب الوزن',
        frequency: 'مرة يومياً',
        duration: '4 أشهر'
      }),
      medication({
        name: 'بيريدوكسين',
        dose: '10 ملغ',
        frequency: 'مرة يومياً',
        duration: 'طوال العلاج'
      })
    ],
    supplies: ['بطاقة DOTS'],
    labs: ['زرع', 'أشعة', 'وظائف كبد'],
    advice: 'الالتزام الكامل، تهوية.',
    alert: 'يرقان → توقف مؤقت.'
  }),

  diagnosis({
    id: 24,
    name: 'فشل القلب الاحتقاني',
    category: 'أمراض القلب والضغط',
    reference: 'AHA/ACC 2022',
    medications: [
      medication({
        name: 'فوروسيميد',
        dose: '40 ملغ',
        frequency: 'مرة-مرتان يومياً',
        duration: 'مستمر',
        note: 'صباحاً'
      }),
      medication({
        name: 'إينالابريل',
        dose: '5 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'بيسوبرولول',
        dose: '1.25 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'سبيرونولاكتون',
        dose: '25 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      })
    ],
    supplies: ['ميزان', 'جهاز ضغط', 'SpO₂'],
    labs: ['وظائف كلى', 'BNP', 'ECG'],
    advice: 'وزن يومي، تقليل الملح.',
    alert: 'ضيق نفس مستلقٍ → طوارئ.'
  }),

  diagnosis({
    id: 25,
    name: 'الذبحة الصدرية المستقرة',
    category: 'أمراض القلب والضغط',
    reference: 'AHA/ACC 2023',
    medications: [
      medication({
        name: 'أسبرين',
        dose: '75 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مدى الحياة'
      }),
      medication({
        name: 'أتورفاستاتين',
        dose: '40-80 ملغ',
        frequency: 'مساءً',
        duration: 'مستمر'
      }),
      medication({
        name: 'نيتروغليسرين',
        dose: '400 مكغ',
        frequency: 'عند الألم',
        duration: 'إنقاذي'
      })
    ],
    supplies: ['نيترو مع المريض'],
    labs: ['ECG', 'إيكو', 'دهنيات'],
    advice: 'توقف التدخين، لا تمزج مع السيلدينافيل.',
    alert: 'ألم > 20 دقيقة → احتشاء.'
  }),

  /* ═══════════════════════════════════════════════════════
     26-50: التشخيصات المتوسطة
     ═══════════════════════════════════════════════════════ */

  diagnosis({
    id: 26,
    name: 'الرجفان الأذيني (تخثر وقائي)',
    category: 'أمراض القلب والضغط',
    reference: 'ACC/AHA/HRS 2023',
    medications: [
      medication({
        name: 'دابيغاتران',
        dose: '150 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مدى الحياة',
        note: 'NOAC — يخفَّض إلى 110ملغ×2 عند العمر≥80 أو خطر نزف أو CrCl 30-50'
      }),
      medication({
        name: 'ميتوبرولول',
        dose: '50 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر'
      })
    ],
    supplies: ['جهاز نبض'],
    labs: ['وظائف كلى', 'ECG', 'إيكو'],
    advice: 'الالتزام بمضاد التخثر يمنع 66% من الجلطات.',
    alert: 'نزف غير مبرر → طوارئ.'
  }),

  diagnosis({
    id: 27,
    name: 'تسرع القلب الجيبي',
    category: 'أمراض القلب والضغط',
    reference: 'ESC 2022',
    medications: [
      medication({
        name: 'بيسوبرولول',
        dose: '2.5 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      })
    ],
    supplies: ['جهاز نبض'],
    labs: ['ECG', 'TSH', 'Hb'],
    advice: 'تجنب الكافيين، عالج السبب.',
    alert: 'خفقان + إغماء → Holter.'
  }),

  diagnosis({
    id: 28,
    name: 'فرط نشاط الدرق',
    category: 'الغدد الصم والسكري',
    reference: 'ATA/ETA 2025',
    medications: [
      medication({
        name: 'كاربيمازول',
        dose: '20-30 ملغ',
        frequency: '3 مرات يومياً',
        duration: '4-8 أسابيع'
      }),
      medication({
        name: 'بروبرانولول',
        dose: '20-40 ملغ',
        frequency: '3 مرات يومياً',
        duration: 'حتى السيطرة'
      })
    ],
    labs: ['TSH + FT4 + FT3', 'CBC', 'وظائف كبد'],
    advice: 'تجنب اليود الزائد، أبلغ عن الحمى.',
    alert: 'أزمة درقية → طوارئ.'
  }),

  diagnosis({
    id: 29,
    name: 'قصور الدرق',
    category: 'الغدد الصم والسكري',
    reference: 'ATA 2024',
    medications: [
      medication({
        name: 'ليفوثيروكسين',
        dose: '1.6 مكغ/كغ',
        frequency: 'صباحاً صائماً',
        duration: 'مدى الحياة',
        calc: { mgkg: 1.6, unit: 'مكغ/كغ يومياً', max: '200 مكغ' }
      })
    ],
    labs: ['TSH كل 6-8 أسابيع'],
    advice: 'افصل الحديد/الكالسيوم 4 ساعات.',
    alert: 'الحوامل: زيادة 30% فوراً.'
  }),

  diagnosis({
    id: 30,
    name: 'النقرس (نوبة حادة)',
    category: 'المفاصل',
    reference: 'ACR 2020',
    medications: [
      medication({
        name: 'كولشيسين',
        dose: '1.2 ملغ فوراً ثم 0.6 ملغ بعد ساعة واحدة',
        frequency: 'جرعتان فقط (يوم 1)، ثم 0.6 ملغ 1-2 مرة يومياً وقائياً حتى 48 ساعة بعد زوال النوبة',
        duration: '3-5 أيام',
        note: 'صُحّحت: الجرعة القديمة (1ملغ ثم 0.5ملغ كل ساعة) غير موصى بها لزيادة الأعراض الهضمية دون فائدة إضافية (ACR 2020)'
      }),
      medication({
        name: 'نابروكسين',
        dose: '500 ملغ',
        frequency: 'مرتان يومياً',
        duration: '5-7 أيام',
        note: 'خيار أول جيد بديل، فعالية مماثلة وأعراض جانبية أقل من الكولشيسين'
      })
    ],
    supplies: ['كمادات باردة'],
    labs: ['يوريك أسيد', 'وظائف كلى'],
    advice: 'توقف الكحول، خفف اللحوم الحمراء.',
    alert: 'لا تبدأ الألوبيورينول أثناء النوبة؛ إذا كان المريض عليه ألوبيورينول مسبقاً فلا يوقف.'
  }),

  diagnosis({
    id: 31,
    name: 'هشاشة العظام',
    category: 'المفاصل',
    reference: 'IOF/WHO FRAX',
    medications: [
      medication({
        name: 'كالسيوم + D3',
        dose: '600 ملغ + 400 وحدة',
        frequency: 'مرتان يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'أليندرونات',
        dose: '70 ملغ',
        frequency: 'مرة أسبوعياً',
        duration: '5 سنوات',
        note: 'واقفاً 30 دقيقة'
      })
    ],
    labs: ['كالسيوم', 'DXA'],
    advice: 'مشي 30 دقيقة، تمارين مقاومة.',
    alert: 'ألم بالظهر > 50 سنة → أشعة.'
  }),

  diagnosis({
    id: 32,
    name: 'الروماتويدي (مبكر)',
    category: 'المفاصل',
    reference: 'ACR/EULAR 2025',
    medications: [
      medication({
        name: 'ميثوتركسات',
        dose: '10-15 ملغ',
        frequency: 'مرة أسبوعياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'بريدنيزولون',
        dose: '10 ملغ',
        frequency: 'مرة يومياً',
        duration: 'أسبوعان-شهر'
      }),
      medication({
        name: 'فوليك أسيد',
        dose: '5 ملغ',
        frequency: 'أسبوعياً',
        duration: 'مستمر'
      })
    ],
    labs: ['RF + anti-CCP', 'ESR/CRP'],
    advice: 'العلاج المبكر يمنع التشوهات.',
    alert: 'الميثوتركسات ممنوع في الحمل.'
  }),

  diagnosis({
    id: 33,
    name: 'آلام الظهر الحاد',
    category: 'المفاصل',
    reference: 'AAFP/ACP 2025',
    medications: [
      medication({
        name: 'باراسيتامول',
        dose: '1غ',
        frequency: '3-4 مرات يومياً',
        duration: '≤5 أيام'
      }),
      medication({
        name: 'إيبوبروفين',
        dose: '400 ملغ',
        frequency: '3 مرات يومياً',
        duration: '≤5 أيام'
      })
    ],
    supplies: ['حزام ظهر'],
    labs: ['تصوير فقط بإنذارات'],
    advice: 'لا راحة بالفراش > يومين.',
    alert: 'ضعف أطراف/سلس بول → ضغط عصبي.'
  }),

  diagnosis({
    id: 34,
    name: 'الصداع النصفي',
    category: 'الأعصاب',
    reference: 'AHS 2025',
    medications: [
      medication({
        name: 'سوماتريبتان',
        dose: '50 ملغ',
        frequency: 'عند بداية النوبة',
        duration: 'إنقاذي'
      }),
      medication({
        name: 'بروبرانولول',
        dose: '40 ملغ',
        frequency: 'مرتان يومياً',
        duration: '3-6 أشهر'
      })
    ],
    supplies: ['دفتر متابعة'],
    labs: ['MRI إذا نمط جديد'],
    advice: 'حدد المحفزات، نوم منتظم.',
    alert: 'صداع "أشد ما يكون" → نزف تحت العنكبوتية.'
  }),

  diagnosis({
    id: 35,
    name: 'الصداع التوتري',
    category: 'الأعصاب',
    reference: 'EFNS 2024',
    medications: [
      medication({
        name: 'إيبوبروفين',
        dose: '400 ملغ',
        frequency: 'عند الحاجة',
        duration: '≤10 أيام/شهر'
      }),
      medication({
        name: 'أميتريبتيلين',
        dose: '10-25 ملغ',
        frequency: 'مساءً',
        duration: '3 أشهر'
      })
    ],
    advice: 'تمارين استرخاء، تصحيح وضعية.',
    alert: 'نفس إنذارات الصداع الثانوي.'
  }),

  diagnosis({
    id: 36,
    name: 'الأرق',
    category: 'الأعصاب',
    reference: 'AASM 2025',
    medications: [
      medication({
        name: 'ميلاتونين',
        dose: '3-5 ملغ',
        frequency: 'قبل النوم',
        duration: '2-4 أسابيع'
      }),
      medication({
        name: 'هيدروكسيزين',
        dose: '25 ملغ',
        frequency: 'مساءً',
        duration: 'أسبوعان'
      })
    ],
    advice: 'نظافة النوم.',
    alert: 'تجنب البنزوديازيبينات المزمنة.'
  }),

  diagnosis({
    id: 37,
    name: 'اضطراب القلق المعمم',
    category: 'الأعصاب',
    reference: 'NICE 2025',
    medications: [
      medication({
        name: 'سيرترالين',
        dose: '25 ملغ أسبوعاً ثم 50',
        frequency: 'صباحاً',
        duration: '6-12 شهراً'
      }),
      medication({
        name: 'هيدروكسيزين',
        dose: '25 ملغ',
        frequency: 'عند النوبات',
        duration: 'أسبوعان'
      })
    ],
    labs: ['TSH', 'كالسيوم'],
    advice: 'مفعول SSRI بعد 2-4 أسابيع.',
    alert: 'أفكار انتحارية → مراجعة فورية.'
  }),

  diagnosis({
    id: 38,
    name: 'الاكتئاب الخفيف-المتوسط',
    category: 'الأعصاب',
    reference: 'NICE/APA 2025',
    medications: [
      medication({
        name: 'سيرترالين',
        dose: '50 ملغ',
        frequency: 'مرة يومياً',
        duration: '6 أشهر'
      }),
      medication({
        name: 'فلوكستين',
        dose: '20 ملغ',
        frequency: 'صباحاً',
        duration: '6 أشهر'
      })
    ],
    labs: ['TSH', 'فيتامين D'],
    advice: 'نشاط بدني 150 دقيقة أسبوعياً.',
    alert: '< 25 سنة: راقب الاندفاعية.'
  }),

  diagnosis({
    id: 39,
    name: 'فرط كوليسترول الدم',
    category: 'أمراض القلب والضغط',
    reference: 'AHA/ACC 2018 + ESC/EAS',
    medications: [
      medication({
        name: 'أتورفاستاتين',
        dose: '40 ملغ',
        frequency: 'مساءً',
        duration: 'مدى الحياة'
      }),
      medication({
        name: 'إيزيتيميب',
        dose: '10 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      })
    ],
    labs: ['دهنيات', 'CK إذا ألم عضلي'],
    advice: 'تجنب الجريب فروت.',
    alert: 'CK ×5 → توقف الستاتين.'
  }),

  diagnosis({
    id: 40,
    name: 'نقص البوتاسيوم',
    category: 'الأيض',
    reference: 'UpToDate 2026',
    medications: [
      medication({
        name: 'كلوريد البوتاسيوم',
        dose: '20-40 ملغ',
        frequency: '2-3 مرات يومياً',
        duration: 'حتى التصحيح'
      })
    ],
    labs: ['K/Mg/Na', 'ECG'],
    advice: 'راجع المدرات، أغذية غنية.',
    alert: 'K < 3 → إصلاح وريدي.'
  }),

  diagnosis({
    id: 41,
    name: 'الجفاف',
    category: 'الأيض',
    reference: 'WHO/CDC',
    medications: [
      medication({
        name: 'محلول ORS',
        dose: 'رشفات متكررة',
        frequency: 'على مدار 2-4 ساعات',
        duration: 'حتى التحسن'
      })
    ],
    supplies: ['مروحة', 'كمادات'],
    labs: ['Na/K'],
    advice: 'برّد بالماء لا الثلج.',
    alert: 'حرارة > 40 → ضربة حرارة.'
  }),

  diagnosis({
    id: 42,
    name: 'الإنفلونزا الموسمية',
    category: 'الأمراض المعدية',
    reference: 'CDC/WHO 2025-2026',
    medications: [
      medication({
        name: 'أوسيلتاميفير',
        dose: '75 ملغ',
        frequency: 'مرتان يومياً',
        duration: '5 أيام',
        note: 'الجرعة الوزنية للأطفال دقيقة أكثر بالفئات: ≤15كغ=30ملغ×2، 15-23كغ=45ملغ×2، 23-40كغ=60ملغ×2، >40كغ=75ملغ×2 — تقريب 2ملغ/كغ غير دقيق في الأطراف'
      })
    ],
    supplies: ['كمامات'],
    labs: ['RIDT'],
    advice: 'راحة، عزل 5 أيام.',
    alert: 'ضيق نفس → التهاب رئوي.'
  }),

  diagnosis({
    id: 43,
    name: 'كوفيد-19 (خفيف)',
    category: 'الأمراض المعدية',
    reference: 'WHO 2026',
    medications: [
      medication({
        name: 'باراسيتامول',
        dose: '1غ',
        frequency: '3-4 مرات',
        duration: '5-7 أيام',
        calc: { mgkg: 15, unit: 'ملغ/كغ/جرعة', max: '1غ' }
      })
    ],
    supplies: ['SpO₂', 'كمامات'],
    labs: ['SpO₂ يومياً'],
    advice: 'عزل 5 أيام، proning. للمرضى عالي الخطورة (كبار السن/أمراض مزمنة) يُقيَّم نيرماتريلفير/ريتونافير (Paxlovid) خلال 5 أيام من الأعراض إن توفر.',
    alert: 'SpO₂ ≤ 93% → طوارئ.'
  }),

  diagnosis({
    id: 44,
    name: 'الهربس البسيط',
    category: 'الجلدية',
    reference: 'CDC STI 2025',
    medications: [
      medication({
        name: 'أسيكلوفير',
        dose: '400 ملغ',
        frequency: '3 مرات يومياً',
        duration: '7-10 أيام'
      }),
      medication({
        name: 'كريم أسيكلوفير',
        dose: 'دهان',
        frequency: '5 مرات يومياً',
        duration: '5 أيام'
      })
    ],
    supplies: ['فازلين'],
    labs: ['PCR HSV'],
    advice: 'غسل اليدين، لا تشارك المناشف.',
    alert: 'التهاب ملتحمة → طوارئ.'
  }),

  diagnosis({
    id: 45,
    name: 'القوباء الحلقية',
    category: 'الجلدية',
    reference: 'AAFP/BAD',
    medications: [
      medication({
        name: 'تربينافين فموي',
        dose: '250 ملغ',
        frequency: 'مرة يومياً',
        duration: '2-4 أسابيع',
        calc: { mgkg: 5, unit: 'ملغ/كغ يومياً', max: '250 ملغ' }
      })
    ],
    labs: ['UV فحص'],
    advice: 'اغسل الفراش بماء ساخن.',
    alert: 'تقرحات فروة → إحالة.'
  }),

  diagnosis({
    id: 46,
    name: 'التهاب الجلد الفطري',
    category: 'الجلدية',
    reference: 'AAFP 2025',
    medications: [
      medication({
        name: 'تربينافين كريم',
        dose: 'دهان',
        frequency: 'مرتان يومياً',
        duration: '2-4 أسابيع'
      }),
      medication({
        name: 'تربينافين فموي',
        dose: '250 ملغ',
        frequency: 'مرة يومياً',
        duration: '6-12 أسبوع'
      })
    ],
    supplies: ['جوارب قطنية', 'بخاخ أحذية'],
    labs: ['KOH'],
    advice: 'جفف بين الأصابع.',
    alert: 'سكري + عدوى أظافر → عناية قدم.'
  }),

  diagnosis({
    id: 47,
    name: 'الأكزيما التأتبية',
    category: 'الجلدية',
    reference: 'AAAAI/ACAAI 2025',
    medications: [
      medication({
        name: 'مرطبات',
        dose: 'سخي',
        frequency: '3-4 مرات يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'هيدروكورتيزون 1%',
        dose: 'دهان',
        frequency: 'مرتان يومياً',
        duration: '7 أيام'
      }),
      medication({
        name: 'سيتيريزين',
        dose: '10 ملغ',
        frequency: 'مساءً',
        duration: 'حسب الحكة'
      })
    ],
    supplies: ['صابون لا عطري', 'قفازات'],
    labs: ['IgE'],
    advice: 'استحمام فاتر قصير، رطّب خلال 3 دقائق.',
    alert: 'تقرحات مؤلمة → Kaposi.'
  }),

  diagnosis({
    id: 48,
    name: 'التهاب الجلد التماسي',
    category: 'الجلدية',
    reference: 'AAAAI 2025',
    medications: [
      medication({
        name: 'بيتاميثازون 0.05%',
        dose: 'دهان',
        frequency: 'مرة-مرتان',
        duration: '7-14 يوماً'
      }),
      medication({
        name: 'مرطبات كثيفة',
        dose: 'سخي',
        frequency: '4 مرات يومياً',
        duration: 'مستمر'
      })
    ],
    supplies: ['قفازات حماية'],
    labs: ['Patch test'],
    advice: 'حدد المحرض وأزله.',
    alert: 'انتشار + تقيح → التهاب ميكروبي.'
  }),

  diagnosis({
    id: 49,
    name: 'هبوط سكر الدم',
    category: 'الغدد الصم والسكري',
    reference: 'ADA 2026',
    medications: [
      medication({
        name: 'جلوكوز سريع',
        dose: '15-20غ',
        frequency: 'مرة ثم كرر بعد 15 دقيقة',
        duration: 'حتى التجاوز',
        note: 'قاعدة 15'
      }),
      medication({
        name: 'جلوكاجون IM',
        dose: '1 ملغ',
        frequency: 'حقن عضل',
        duration: 'إسعافي',
        note: 'للغائب عن الوعي'
      })
    ],
    supplies: ['أقراص جلوكوز', 'جلوكاجون'],
    labs: ['سكر دم فوري'],
    advice: 'وجبة خفيفة بعد التصحيح.',
    alert: 'غيبوبة → لا شيء فموياً.'
  }),

  diagnosis({
    id: 50,
    name: 'التهاب الأذن الوسطى (أطفال)',
    category: 'الأذن والحنجرة',
    reference: 'AAP 2024',
    medications: [
      medication({
        name: 'أموكسيسيلين',
        dose: '80-90 ملغ/كغ/يوم',
        frequency: 'مرتان يومياً',
        duration: '10 أيام',
        calc: { mgkg: 45, unit: 'ملغ/كغ/جرعة مرتين', max: '875 ملغ/جرعة' }
      }),
      medication({
        name: 'باراسيتامول/إيبوبروفين',
        dose: 'حسب الوزن',
        frequency: 'عند الحاجة',
        duration: '3 أيام',
        calc: { mgkg: 15, unit: 'ملغ/كغ باراسيتامول', max: '' }
      })
    ],
    supplies: ['مقياس حرارة'],
    labs: ['Otoscopy'],
    advice: 'شاهد-انتظر 48-72 ساعة للخفيف.',
    alert: 'تفريغ من الأذن → إحالة.'
  }),

  /* ═══════════════════════════════════════════════════════
     51-100: التشخيصات الموسّعة
     ═══════════════════════════════════════════════════════ */

  diagnosis({
    id: 51,
    name: 'احتشاء عضلة القلب الحاد (STEMI)',
    category: 'أمراض القلب والضغط',
    reference: 'ESC 2023 / AHA 2025',
    medications: [
      medication({
        name: 'أسبرين',
        dose: '300 ملغ',
        frequency: 'جرعة تحميل فوراً',
        duration: 'جرعة واحدة',
        note: 'يُمضغ'
      }),
      medication({
        name: 'كلوبيدوغريل',
        dose: '300-600 ملغ',
        frequency: 'جرعة تحميل',
        duration: 'جرعة واحدة'
      }),
      medication({
        name: 'أتورفاستاتين',
        dose: '80 ملغ',
        frequency: 'مرة واحدة',
        duration: 'مستمر'
      }),
      medication({
        name: 'نيتروغليسرين',
        dose: '400 مكغ',
        frequency: 'تحت اللسان',
        duration: 'إنقاذي'
      }),
      medication({
        name: 'هيبارين (UFH أو LMWH)',
        dose: 'حسب البروتوكول',
        frequency: 'وريدي/تحت جلد',
        duration: 'حتى القسطرة',
        note: 'مضاد تخثر مرافق أساسي — أضيف لأنه ركيزة العلاج قبل PCI ولم يكن مذكوراً'
      })
    ],
    supplies: ['أكسجين', 'ECG', 'جهاز مراقبة'],
    labs: ['Troponin', 'ECG فوري', 'إيكو'],
    advice: 'نقل فوري لمركز قسطرة — كل دقيقة مهمة. الأكسجين فقط إذا SpO₂ < 90%.',
    alert: 'ألم صدر > 20 دقيقة مع تغيرات ECG → PCI خلال 90 دقيقة أو تحلل خثرة إذا لا يتوفر PCI خلال 120 دقيقة.'
  }),

  diagnosis({
    id: 52,
    name: 'قصور القلب مع انخفاض EF',
    category: 'أمراض القلب والضغط',
    reference: 'ACC/AHA/HFSA 2022',
    medications: [
      medication({
        name: 'ساكوبيتريل/فالسارتان',
        dose: '50 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'ARNI'
      }),
      medication({
        name: 'كارفيديلول',
        dose: '3.125 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'بيتا حاصر'
      }),
      medication({
        name: 'سبيرونولاكتون',
        dose: '25 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'داباغليفلوزين',
        dose: '10 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر',
        note: 'SGLT2'
      })
    ],
    supplies: ['ميزان', 'جهاز ضغط'],
    labs: ['BNP', 'كرياتينين', 'K+', 'إيكو'],
    advice: 'الأربعة معاً خفضت الوفيات 73%.',
    alert: 'ضيق نفس شديد → طوارئ.'
  }),

  diagnosis({
    id: 53,
    name: 'ارتفاع ضغط الدم الرئوي',
    category: 'أمراض القلب والضغط',
    reference: 'ESC/ERS 2022',
    medications: [
      medication({
        name: 'سيلدينافيل',
        dose: '20 ملغ',
        frequency: '3 مرات يومياً',
        duration: 'مستمر',
        note: 'PDE5'
      }),
      medication({
        name: 'بوسنتان',
        dose: '62.5-125 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'ERA'
      })
    ],
    supplies: ['مقياس SpO₂'],
    labs: ['إيكو', 'BNP', 'وظائف رئة'],
    advice: 'إحالة لمركز متخصص.',
    alert: 'إغماء عند المجهود → مراجعة فورية.'
  }),

  diagnosis({
    id: 54,
    name: 'ارتفاع الضغط الرئوي المقاوم',
    category: 'أمراض القلب والضغط',
    reference: 'ESC 2023',
    medications: [
      medication({
        name: 'أملوديبين + بيريندوبريل',
        dose: '5/5 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'سبيرونولاكتون',
        dose: '25 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر',
        note: 'الخط الرابع'
      }),
      medication({
        name: 'دوكسازوسين',
        dose: '4 ملغ',
        frequency: 'مساءً',
        duration: 'مستمر'
      })
    ],
    supplies: ['جهاز ضغط', 'مقياس نبض'],
    labs: ['K+', 'كرياتينين', 'ألدوستيرون'],
    advice: 'الالتزام الدوائي، تقليل الملح.',
    alert: 'ضغط ≥ 180/120 → طوارئ.'
  }),

  diagnosis({
    id: 55,
    name: 'تسرب الصمام التاجي',
    category: 'أمراض القلب والضغط',
    reference: 'AHA/ACC 2020',
    medications: [
      medication({
        name: 'ميتوبرولول',
        dose: '25 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'فوروسيميد',
        dose: '20 ملغ',
        frequency: 'مرة يومياً',
        duration: 'حسب الحاجة'
      })
    ],
    supplies: ['إيكو دوري'],
    labs: ['إيكو', 'ECG'],
    advice: 'متابعة سنوية بالإيكو.',
    alert: 'ضيق نفس حاد → قصور قلب.'
  }),

  diagnosis({
    id: 56,
    name: 'تضيق الصمام الأبهري',
    category: 'أمراض القلب والضغط',
    reference: 'ESC/EACTS 2021',
    medications: [
      medication({
        name: 'ميتوبرولول',
        dose: '25 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'بحذر — قد يقلل النتاج القلبي في التضيق الشديد'
      }),
      medication({
        name: 'فوروسيميد',
        dose: '20-40 ملغ',
        frequency: 'مرة-مرتان',
        duration: 'حسب الحاجة'
      })
    ],
    supplies: ['إيكو', 'استشارة قلب'],
    labs: ['إيكو', 'BNP'],
    advice: 'إحالة لجراحة قلب/TAVI عند الأعراض.',
    alert: 'إغماء + ضيق نفس → طوارئ.'
  }),

  diagnosis({
    id: 57,
    name: 'التهاب التامور',
    category: 'أمراض القلب والضغط',
    reference: 'ESC 2015',
    medications: [
      medication({
        name: 'أسبرين عالي الجرعة',
        dose: '750 ملغ',
        frequency: '3 مرات يومياً',
        duration: '1-2 أسبوع'
      }),
      medication({
        name: 'كولشيسين',
        dose: '0.5 ملغ',
        frequency: 'مرتان يومياً',
        duration: '3 أشهر',
        note: 'يمنع التكرار'
      })
    ],
    supplies: ['ECG', 'إيكو'],
    labs: ['CRP', 'ESR', 'Troponin'],
    advice: 'راحة تامة، لا مجهود.',
    alert: 'دكاك قلبي (تامبوناد) → طوارئ.'
  }),

  diagnosis({
    id: 58,
    name: 'قصور الغدة الكظرية',
    category: 'الغدد الصم والسكري',
    reference: 'Endocrine Society 2023',
    medications: [
      medication({
        name: 'هيدروكورتيزون',
        dose: 'إجمالي 15-25 ملغ/يوم مقسّمة (مثلاً 10ملغ صباحاً + 5ملغ ظهراً + 5ملغ عصراً)',
        frequency: '2-3 مرات يومياً — الجرعة الأكبر صباحاً',
        duration: 'مدى الحياة',
        note: 'صُحّح: الرقم 15-25ملغ هو الجرعة اليومية الكلية وليس لكل جرعة، لتفادي تجاوز الجرعة الفسيولوجية'
      }),
      medication({
        name: 'فلودروكورتيزون',
        dose: '0.05-0.2 ملغ',
        frequency: 'مرة يومياً صباحاً',
        duration: 'مدى الحياة',
        note: 'للقصور الأولي فقط'
      })
    ],
    supplies: ['حقن هيدروكورتيزون إسعافي', 'بطاقة قصور كظر'],
    labs: ['كورتيزول صباحي', 'ACTH', 'صوديوم/بوتاسيوم'],
    advice: 'مضاعفة الجرعة عند المرض، حمل بطاقة.',
    alert: 'أزمة كظرية → حقن هيدروكورتيزون 100ملغ IM/IV فوراً.'
  }),

  diagnosis({
    id: 59,
    name: 'متلازمة كوشينغ',
    category: 'الغدد الصم والسكري',
    reference: 'Endocrine Society 2021',
    medications: [
      medication({
        name: 'كيتوكونازول',
        dose: '200 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'حسب الاستجابة',
        note: 'يقلل الكورتيزول؛ راقب وظائف الكبد'
      }),
      medication({
        name: 'ميتيرابون',
        dose: '250-500 ملغ',
        frequency: '3 مرات يومياً',
        duration: 'حسب الاستجابة'
      })
    ],
    labs: [
      'كورتيزول حر بالبول/اللعاب',
      'ACTH',
      'اختبار تثبيط ديكساميثازون',
      'MRI'
    ],
    advice: 'إحالة لغدد متخصصة.',
    alert: 'نقص بوتاسيوم + ضغط مرتفع → مراجعة.'
  }),

  diagnosis({
    id: 60,
    name: 'فرط الألدوستيرونية الأولي',
    category: 'الغدد الصم والسكري',
    reference: 'Endocrine Society 2016',
    medications: [
      medication({
        name: 'سبيرونولاكتون',
        dose: '25-100 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'إبليرينون',
        dose: '25-50 ملغ',
        frequency: 'مرة يومياً',
        duration: 'بديل عند آثار مضادة للأندروجين من السبيرونولاكتون'
      })
    ],
    labs: ['نسبة ألدوستيرون/رينين', 'K+', 'صوديوم'],
    advice: 'إحالة غدد — قد يحتاج جراحة كظر.',
    alert: 'نقص بوتاسيوم شديد → إصلاح وريدي.'
  }),

  diagnosis({
    id: 61,
    name: 'الورم القواتم (Pheochromocytoma)',
    category: 'الغدد الصم والسكري',
    reference: 'Endocrine Society 2014',
    medications: [
      medication({
        name: 'فينوكسي بنزامين',
        dose: '10 ملغ',
        frequency: 'مرتان يومياً',
        duration: '10-14 يوماً قبل الجراحة',
        note: 'يبدأ قبل البيتا حاصر دوماً'
      }),
      medication({
        name: 'بروبرانولول',
        dose: '20 ملغ',
        frequency: '2-3 مرات يومياً',
        duration: 'بعد تحقيق حصار ألفا كامل فقط'
      })
    ],
    supplies: ['جهاز ضغط'],
    labs: ['ميتانيفرينات حرة بالبلازما/البول', 'CT/MRI كظر'],
    advice: 'إحالة جراحة غدد.',
    alert: 'لا يُعطى بيتا حاصر قبل ألفا حاصر أبداً (خطر أزمة ضغط).'
  }),

  diagnosis({
    id: 62,
    name: 'السكري الحملي',
    category: 'الغدد الصم والسكري',
    reference: 'ADA 2026',
    medications: [
      medication({
        name: 'أنسولين NPH',
        dose: 'حسب القراءات',
        frequency: 'مساءً',
        duration: 'حتى الولادة',
        note: 'الخط الأول عند فشل الحمية'
      }),
      medication({
        name: 'أنسولين Lispro',
        dose: 'حسب القراءات',
        frequency: 'قبل الوجبات',
        duration: 'حتى الولادة'
      })
    ],
    supplies: ['جهاز سكر', 'شرائط'],
    labs: ['سكر صائم وبعد الأكل', 'GTT عند التشخيص'],
    advice: 'نظام غذائي + متابعة أسبوعية؛ الميتفورمين خيار بديل مقبول في بعض الإرشاديات.',
    alert: 'سكر صائم > 95 → مضاعفة الأنسولين.'
  }),

  diagnosis({
    id: 63,
    name: 'قصور الغدد جارات الدرق',
    category: 'الغدد الصم والسكري',
    reference: 'Endocrine Society 2016',
    medications: [
      medication({
        name: 'كالسيترول + كالسيوم',
        dose: '0.25-2 مكغ + 1000 ملغ',
        frequency: 'حسب الحاجة',
        duration: 'مدى الحياة'
      })
    ],
    labs: ['كالسيوم', 'فوسفات', 'PTH'],
    advice: 'إحالة غدد.',
    alert: 'تنميل/تكزز → كالسيوم وريدي.'
  }),

  diagnosis({
    id: 64,
    name: 'فرط جارات الدرق الأولي',
    category: 'الغدد الصم والسكري',
    reference: 'Endocrine Society 2022',
    medications: [
      medication({
        name: 'سيناكالسيت',
        dose: '30-90 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر لمن لا يصلح للجراحة'
      })
    ],
    labs: ['كالسيوم', 'PTH', 'فوسفات', 'فيتامين D', 'DXA'],
    advice: 'إحالة جراحة (استئصال الغدة) هو العلاج الشافي عند وجود مؤشرات.',
    alert: 'كالسيوم > 12 → طوارئ.'
  }),

  diagnosis({
    id: 65,
    name: 'مرض الكلى المزمن (CKD)',
    category: 'الكلى والمسالك',
    reference: 'KDIGO 2024',
    medications: [
      medication({
        name: 'إينالابريل',
        dose: '10-20 ملغ',
        frequency: 'مرة-مرتان يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'داباغليفلوزين',
        dose: '10 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر',
        note: 'يبطئ تقدم CKD حتى بلا سكري'
      }),
      medication({
        name: 'كربونات الكالسيوم',
        dose: '500 ملغ',
        frequency: '3 مرات يومياً',
        duration: 'حسب الفوسفات'
      })
    ],
    supplies: ['جهاز ضغط', 'دفتر متابعة'],
    labs: [
      'كرياتينين',
      'eGFR',
      'نسبة الألبومين/كرياتينين بالبول',
      'PTH'
    ],
    advice: 'تقليل الملح، ضبط الضغط، تجنب NSAIDs، تعديل جرعات الأدوية حسب eGFR.',
    alert: 'eGFR < 15 → تحضير للغسيل.'
  }),

  diagnosis({
    id: 66,
    name: 'القصور الكلوي الحاد',
    category: 'الكلى والمسالك',
    reference: 'KDIGO 2012',
    medications: [
      medication({
        name: 'فوروسيميد',
        dose: '40-80 ملغ',
        frequency: 'وريدي',
        duration: 'حسب الحالة',
        note: 'لعلاج زيادة الحجم فقط — لا يحسّن النتائج الكلوية بذاته'
      }),
      medication({
        name: 'بيكربونات الصوديوم',
        dose: '650 ملغ',
        frequency: '3 مرات يومياً',
        duration: 'حسب pH'
      })
    ],
    supplies: ['قسطرة بول', 'مراقبة ورود وسوائل'],
    labs: ['كرياتينين', 'K+', 'بول', 'غازات دم'],
    advice: 'إيقاف الأدوية الكلوية (NSAIDs، بعض المضادات، صبغة التباين).',
    alert: 'K > 6.5 أو حَمض شديد أو زيادة سوائل مقاومة → غسيل عاجل.'
  }),

  diagnosis({
    id: 67,
    name: 'حصاة الكلى',
    category: 'الكلى والمسالك',
    reference: 'EAU 2024',
    medications: [
      medication({
        name: 'ديكلوفيناك',
        dose: '75 ملغ IM',
        frequency: 'مرة',
        duration: 'مرة واحدة',
        note: 'أو نابروكسين فموي — خط أول للألم'
      }),
      medication({
        name: 'تامسولوسين',
        dose: '0.4 ملغ',
        frequency: 'مساءً',
        duration: 'حتى الطرد (للحصى ≤10مم)'
      })
    ],
    supplies: ['مصفاة بول'],
    labs: ['تحليل بول', 'CT بدون صبغة', 'كرياتينين'],
    advice: 'سوائل 2-3 لتر يومياً.',
    alert: 'حمى + حصاة → انسداد + عدوى → طوارئ (تصريف عاجل).'
  }),

  diagnosis({
    id: 68,
    name: 'عدوى المسالك البولية المعقدة',
    category: 'الكلى والمسالك',
    reference: 'IDSA 2024',
    medications: [
      medication({
        name: 'سيبروفلوكساسين',
        dose: '500 ملغ',
        frequency: 'مرتان يومياً',
        duration: '7-14 يوماً',
        note: 'حسب حساسية الزرع محلياً'
      }),
      medication({
        name: 'سيفترياكسون',
        dose: '1غ',
        frequency: 'وريدياً يومياً',
        duration: 'حسب الحالة',
        note: 'للشديد'
      })
    ],
    supplies: ['قسطرة', 'زرع'],
    labs: ['زرع بول', 'CBC', 'كرياتينين'],
    advice: 'شرب ماء كثير.',
    alert: 'حُمى عالية + آلام خاصرة → دخول مستشفى.'
  }),

  diagnosis({
    id: 69,
    name: 'تضخم البروستاتا الحميد',
    category: 'الكلى والمسالك',
    reference: 'EAU 2024',
    medications: [
      medication({
        name: 'تامسولوسين',
        dose: '0.4 ملغ',
        frequency: 'مساءً',
        duration: 'مستمر'
      }),
      medication({
        name: 'فيناسترايد',
        dose: '5 ملغ',
        frequency: 'مرة يومياً',
        duration: '6 أشهر على الأقل',
        note: 'للغدة الكبيرة الحجم'
      })
    ],
    labs: ['PSA', 'سونار', 'تدفق البول'],
    advice: 'تقليل السوائل مساءً.',
    alert: 'احتباس بول → قسطرة.'
  }),

  diagnosis({
    id: 70,
    name: 'الالتهاب البروستاتي الجرثومي',
    category: 'الكلى والمسالك',
    reference: 'EAU 2024',
    medications: [
      medication({
        name: 'سيبروفلوكساسين',
        dose: '500 ملغ',
        frequency: 'مرتان يومياً',
        duration: '4-6 أسابيع'
      }),
      medication({
        name: 'ألفا بلوكر',
        dose: 'تامسولوسين 0.4 ملغ',
        frequency: 'مساءً',
        duration: '4-12 أسبوعاً'
      })
    ],
    labs: ['زرع بول', 'PSA', 'CBC'],
    advice: 'حمامات دافئة.',
    alert: 'حمى عالية → دخول مستشفى.'
  }),

  diagnosis({
    id: 71,
    name: 'التهاب القولون التقرحي',
    category: 'الجهاز الهضمي',
    reference: 'ACG 2024',
    medications: [
      medication({
        name: 'ميسالازين',
        dose: '2.4-4.8غ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'بريدنيزولون',
        dose: '40 ملغ',
        frequency: 'مرة يومياً',
        duration: 'أسبوعان تخفيض',
        note: 'للنوبات'
      }),
      medication({
        name: 'أزاثيوبرين',
        dose: '2 ملغ/كغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      })
    ],
    labs: ['CBC', 'CRP', 'زرع براز', 'تنظير قولون'],
    advice: 'إحالة لجهاز هضمي.',
    alert: 'توسع قولوني → طوارئ جراحية.'
  }),

  diagnosis({
    id: 72,
    name: 'داء كرون',
    category: 'الجهاز الهضمي',
    reference: 'ACG 2024',
    medications: [
      medication({
        name: 'بوديزونيد',
        dose: '9 ملغ',
        frequency: 'مرة يومياً صباحاً',
        duration: '8 أسابيع',
        note: 'للأمعاء الدقيقة'
      }),
      medication({
        name: 'أزاثيوبرين',
        dose: '2-2.5 ملغ/كغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'إنفليكسيماب',
        dose: '5 ملغ/كغ',
        frequency: 'وريدي 0-2-6 أسابيع',
        duration: 'مستمر',
        note: 'بيولوجي'
      })
    ],
    labs: ['CRP', 'Fecal calprotectin', 'تنظير + خزعة'],
    advice: 'إيقاف التدخين ضروري.',
    alert: 'ناسور/انسداد → جراحة.'
  }),

  diagnosis({
    id: 73,
    name: 'التهاب البنكرياس الحاد',
    category: 'الجهاز الهضمي',
    reference: 'AGA 2023',
    medications: [
      medication({
        name: 'سوائل وريدية Ringer Lactate',
        dose: 'إنعاش معتدل، يُعاد تقييمه كل 6 ساعات',
        frequency: 'مستمر',
        duration: 'أول 24-48 ساعة',
        note: 'العلاج الأساسي — تجنب الإفراط بالسوائل'
      }),
      medication({
        name: 'باراسيتامول/أفيون',
        dose: 'حسب الألم',
        frequency: 'عند الحاجة',
        duration: 'حسب الحالة'
      })
    ],
    supplies: ['قسطرة بول'],
    labs: ['أميلاز', 'ليباز', 'كالسيوم', 'دهنيات'],
    advice: 'صُحّح: الإرشاديات الحديثة (AGA) توصي بالتغذية الفموية المبكرة خلال 24 ساعة حسب التحمل بدلاً من الصيام الممتد 24-48 ساعة؛ الصيام لا يُعطى إلا مع غثيان/انسداد.',
    alert: 'نقص كالسيوم + فشل أعضاء → شديد.'
  }),

  diagnosis({
    id: 74,
    name: 'تشمع الكبد',
    category: 'الكبد',
    reference: 'AASLD 2024',
    medications: [
      medication({
        name: 'سبيرونولاكتون',
        dose: '100 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر',
        note: 'للاستسقاء'
      }),
      medication({
        name: 'فوروسيميد',
        dose: '40 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر',
        note: 'يُعطى غالباً بنسبة 100:40 مع السبيرونولاكتون'
      }),
      medication({
        name: 'لاكتيلوز',
        dose: '30 مل',
        frequency: '2-3 مرات يومياً',
        duration: 'مستمر',
        note: 'للاعتلال الدماغي الكبدي'
      })
    ],
    supplies: ['ميزان', 'دفتر'],
    labs: [
      'ALT/AST',
      'بيليروبين',
      'INR',
      'ألبومين',
      'سونار + AFP كل 6 أشهر'
    ],
    advice: 'تجنب الكحول تماماً، تقليل الملح (وليس البروتين — التقييد البروتيني غير موصى به حالياً إلا في حالات نادرة).',
    alert: 'يرقان متزايد + تشوش → طوارئ.'
  }),

  diagnosis({
    id: 75,
    name: 'حصاة المرارة',
    category: 'الكبد',
    reference: 'SAGES 2020',
    medications: [
      medication({
        name: 'ديكلوفيناك',
        dose: '75 ملغ IM',
        frequency: 'مرة',
        duration: 'حسب الألم'
      }),
      medication({
        name: 'هيوسين',
        dose: '10-20 ملغ',
        frequency: 'عند الحاجة',
        duration: 'حسب الألم'
      })
    ],
    labs: ['سونار بطن', 'CBC', 'ALT/AST'],
    advice: 'تقليل الدهون، إنقاص الوزن.',
    alert: 'حمى + يرقان → التهاب مرارة حاد أو التهاب أقنية.'
  }),

  diagnosis({
    id: 76,
    name: 'التهاب المرارة الحاد',
    category: 'الكبد',
    reference: 'Tokyo Guidelines 2018',
    medications: [
      medication({
        name: 'بيبراسيلين/تازوباكتام',
        dose: '4.5غ',
        frequency: 'كل 6-8 ساعات',
        duration: 'حسب الحالة',
        note: 'وريدياً'
      }),
      medication({
        name: 'باراسيتامول',
        dose: '1غ',
        frequency: 'عند الألم',
        duration: 'حسب الحالة'
      })
    ],
    labs: ['CBC', 'CRP', 'بيليروبين', 'سونار'],
    advice: 'استئصال المرارة بالمنظار مبكراً (خلال 72 ساعة) هو المفضل حسب الحالة.',
    alert: 'انثقاب المرارة → طوارئ جراحية.'
  }),

  diagnosis({
    id: 77,
    name: 'الحمى المالطية',
    category: 'الأمراض المعدية',
    reference: 'WHO 2024',
    medications: [
      medication({
        name: 'دوكسيسايكلين',
        dose: '100 ملغ',
        frequency: 'مرتان يومياً',
        duration: '6 أسابيع'
      }),
      medication({
        name: 'ريفامبيسين',
        dose: '600-900 ملغ',
        frequency: 'مرة يومياً',
        duration: '6 أسابيع'
      }),
      medication({
        name: 'ستربتوميسين',
        dose: '1غ IM',
        frequency: 'مرة يومياً',
        duration: '2-3 أسابيع',
        note: 'للشديد'
      })
    ],
    labs: ['Rose Bengal', 'Wright', 'زرع دم'],
    advice: 'تجنب الحليب غير المبستر.',
    alert: 'التهاب شغاف قلبي → إحالة.'
  }),

  diagnosis({
    id: 78,
    name: 'الكزاز (وقائي — إصابة)',
    category: 'الأمراض المعدية',
    reference: 'CDC 2025',
    medications: [
      medication({
        name: 'توكسويد الكزاز',
        dose: '0.5 مل',
        frequency: 'جرعة واحدة',
        duration: 'حسب التغطية'
      }),
      medication({
        name: 'غلوبيولين مناعي للكزاز',
        dose: '250 وحدة',
        frequency: 'جرعة واحدة IM',
        duration: 'جرعة واحدة',
        note: 'للإصابات الخطيرة/الملوثة مع تاريخ تطعيم غير مكتمل'
      })
    ],
    supplies: ['تطعيم كزاز'],
    advice: 'تطعيم أساسي كل 10 سنوات.',
    alert: 'تكزز عضلي → طوارئ.'
  }),

  diagnosis({
    id: 79,
    name: 'داء الكلب (بعد عضّة)',
    category: 'الأمراض المعدية',
    reference: 'WHO 2018',
    medications: [
      medication({
        name: 'لقاح داء الكلب',
        dose: '1 مل',
        frequency: '0-3-7-14-28 يوم',
        duration: '5 جرعات',
        note: 'IM'
      }),
      medication({
        name: 'غلوبيولين مناعي',
        dose: '20 وحدة/كغ',
        frequency: 'جرعة واحدة',
        duration: 'حول الجرح'
      })
    ],
    supplies: ['لقاح', 'غسل الجرح بيد'],
    advice: 'غسل الجرح بالماء والصابون 15 دقيقة فوراً.',
    alert: 'أعراض عصبية → قاتل تقريباً بالكامل بمجرد ظهور الأعراض.'
  }),

  diagnosis({
    id: 80,
    name: 'الجمرة الخبيثة (وقائي — إصابة)',
    category: 'الأمراض المعدية',
    reference: 'CDC 2023',
    medications: [
      medication({
        name: 'سيبروفلوكساسين',
        dose: '500 ملغ',
        frequency: 'مرتان يومياً',
        duration: '60 يوماً'
      }),
      medication({
        name: 'دوكسيسايكلين',
        dose: '100 ملغ',
        frequency: 'مرتان يومياً',
        duration: '60 يوماً',
        note: 'بديل'
      })
    ],
    supplies: ['كمامات N95'],
    labs: ['زرع', 'PCR'],
    advice: 'إحالة طوارئ بيولوجية.',
    alert: 'أعراض تنفسية → عناية مركزة.'
  }),

  diagnosis({
    id: 81,
    name: 'الكزاز الوليدي (وقائي)',
    category: 'الأمراض المعدية',
    reference: 'WHO',
    medications: [
      medication({
        name: 'توكسويد الكزاز',
        dose: '0.5 مل',
        frequency: 'حسب جدول',
        duration: 'حسب الحمل',
        note: 'للحامل'
      })
    ],
    advice: 'تطعيم الحوامل (Td) ضروري.',
    alert: 'تكزز وليدي → عناية مركزة.'
  }),

  diagnosis({
    id: 82,
    name: 'السعال الديكي',
    category: 'الأمراض المعدية',
    reference: 'CDC 2024',
    medications: [
      medication({
        name: 'أزيتروميسين',
        dose: '500 ملغ يوم 1 ثم 250',
        frequency: 'مرة يومياً',
        duration: '5 أيام'
      }),
      medication({
        name: 'كلاريثروميسين',
        dose: '500 ملغ',
        frequency: 'مرتان يومياً',
        duration: '7 أيام',
        note: 'بديل'
      })
    ],
    supplies: ['كمامات'],
    labs: ['PCR', 'زرع ناسوفارنكس'],
    advice: 'عزل 5 أيام من بدء المضاد.',
    alert: 'رضيع < 6 أشهر → دخول مستشفى.'
  }),

  diagnosis({
    id: 83,
    name: 'الحصبة',
    category: 'الأمراض المعدية',
    reference: 'CDC 2023',
    medications: [
      medication({
        name: 'فيتامين A',
        dose: '200,000 وحدة',
        frequency: 'يومان متتاليان',
        duration: 'يومان',
        note: 'للأطفال — تُخفَّض الجرعة حسب العمر < 12 شهراً'
      }),
      medication({
        name: 'باراسيتامول',
        dose: 'حسب العمر',
        frequency: 'عند الحاجة',
        duration: 'حسب الحالة'
      })
    ],
    supplies: ['عزل تنفسي'],
    labs: ['IgM حصبة', 'PCR'],
    advice: 'تطعيم MMR وقائي.',
    alert: 'التهاب رئوي/دماغي → طوارئ.'
  }),

  diagnosis({
    id: 84,
    name: 'النكاف',
    category: 'الأمراض المعدية',
    reference: 'CDC 2023',
    medications: [
      medication({
        name: 'باراسيتامول',
        dose: '1غ',
        frequency: 'عند الحاجة',
        duration: '5-7 أيام'
      }),
      medication({
        name: 'كمادات دافئة على الغدة النكفية',
        dose: 'موضعي',
        frequency: 'حسب الحاجة',
        duration: 'حسب الحالة'
      })
    ],
    labs: ['IgM نكاف'],
    advice: 'عزل 5 أيام من بدء التورم.',
    alert: 'التهاب خصية/خصوبة → إحالة.'
  }),

  diagnosis({
    id: 85,
    name: 'الحصبة الألمانية',
    category: 'الأمراض المعدية',
    reference: 'CDC 2023',
    medications: [
      medication({
        name: 'باراسيتامول',
        dose: '1غ',
        frequency: 'عند الحاجة',
        duration: 'حسب الأعراض'
      })
    ],
    labs: ['IgM'],
    advice: 'خطيرة على الحوامل (تشوهات خلقية).',
    alert: 'الحوامل → إحالة فورية.'
  }),

  diagnosis({
    id: 86,
    name: 'الذئبة الحمامية (SLE)',
    category: 'المفاصل',
    reference: 'EULAR/ACR 2023',
    medications: [
      medication({
        name: 'هيدروكسي كلوروكين',
        dose: '200-400 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مدى الحياة',
        note: 'الأساس؛ فحص شبكية العين سنوياً'
      }),
      medication({
        name: 'بريدنيزولون',
        dose: '0.5-1 ملغ/كغ',
        frequency: 'مرة يومياً',
        duration: 'حسب الشدة'
      }),
      medication({
        name: 'ميكوفينولات موفيتيل',
        dose: '1-2غ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'للأعضاء الحيوية'
      })
    ],
    supplies: ['واقي شمس'],
    labs: ['ANA', 'Anti-dsDNA', 'C3/C4', 'كرياتينين', 'بول'],
    advice: 'تجنب الشمس تماماً، إحالة روماتيزم.',
    alert: 'اعتلال كلى/دماغي → طوارئ.'
  }),

  diagnosis({
    id: 87,
    name: 'التصلب الجهازي',
    category: 'المفاصل',
    reference: 'EULAR 2017',
    medications: [
      medication({
        name: 'ميكوفينولات',
        dose: '1-3غ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'نيفيديبين',
        dose: '30 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر',
        note: 'لظاهرة رينو'
      })
    ],
    labs: ['ANA', 'Anti-Scl-70', 'Anti-centromere', 'وظائف رئة'],
    advice: 'إحالة روماتيزم.',
    alert: 'أزمة كلوية تصلبية → طوارئ.'
  }),

  diagnosis({
    id: 88,
    name: 'التهاب الفقار اللاصق',
    category: 'المفاصل',
    reference: 'ACR 2019',
    medications: [
      medication({
        name: 'نابروكسين',
        dose: '500 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'أداليموماب',
        dose: '40 ملغ',
        frequency: 'كل أسبوعين',
        duration: 'مستمر',
        note: 'بيولوجي عند فشل NSAIDs'
      })
    ],
    labs: ['HLA-B27', 'ESR/CRP', 'أشعة/MRI حوض'],
    advice: 'تمارين مد مستمرة.',
    alert: 'ألم ليلي + تيبس صباحي → إحالة.'
  }),

  diagnosis({
    id: 89,
    name: 'النقرس المزمن (وقائي)',
    category: 'المفاصل',
    reference: 'ACR 2020',
    medications: [
      medication({
        name: 'ألوبيورينول',
        dose: 'يبدأ بـ100 ملغ (أقل في CKD) ثم تدرّج تدريجياً',
        frequency: 'مرة يومياً',
        duration: 'مستمر',
        note: 'الهدف يوريك < 6 ملغ/دل'
      }),
      medication({
        name: 'كولشيسين',
        dose: '0.5-0.6 ملغ',
        frequency: 'مرة يومياً',
        duration: '3-6 أشهر',
        note: 'وقائي عند بدء الألوبيورينول لتقليل خطر نوبة الإطلاق'
      })
    ],
    labs: ['يوريك أسيد دوري'],
    advice: 'قلل اللحوم الحمراء والكحول.',
    alert: 'لا توقف الألوبيورينول عند حدوث نوبة أثناء العلاج المزمن.'
  }),

  diagnosis({
    id: 90,
    name: 'الصرع (نوبة جزئية)',
    category: 'الأعصاب',
    reference: 'ILAE 2022',
    medications: [
      medication({
        name: 'كاربامازيبين',
        dose: '100-200 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'الخط الأول للنوبة البؤرية'
      }),
      medication({
        name: 'ليفيتيراسيتام',
        dose: '500-1000 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'بديل جيد، أقل تفاعلات دوائية'
      })
    ],
    supplies: ['بطاقة صرع'],
    labs: ['EEG', 'MRI دماغ', 'مستويات الدواء'],
    advice: 'لا إيقاف مفاجئ للدواء.',
    alert: 'حالة صرعية > 5 دقائق → طوارئ.'
  }),

  diagnosis({
    id: 91,
    name: 'الصرع المعمم (Tonic-Clonic)',
    category: 'الأعصاب',
    reference: 'ILAE 2022',
    medications: [
      medication({
        name: 'فالبروات',
        dose: '500-1000 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'ممنوع في الحمل — خطر تشوهات جنينية عالٍ'
      }),
      medication({
        name: 'لاموتريجين',
        dose: '50-200 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر',
        note: 'أكثر أماناً في الحمل، يبدأ بتدرج بطيء لتقليل خطر الطفح'
      })
    ],
    supplies: ['بطاقة صرع'],
    labs: ['EEG', 'MRI', 'وظائف كبد'],
    advice: 'إحالة أعصاب.',
    alert: 'حالة صرعية → طوارئ.'
  }),

  diagnosis({
    id: 92,
    name: 'التصلب المتعدد (MS)',
    category: 'الأعصاب',
    reference: 'ECTRIMS 2022',
    medications: [
      medication({
        name: 'إنترفيرون بيتا 1أ',
        dose: '30 مكغ IM',
        frequency: 'مرة أسبوعياً',
        duration: 'مستمر',
        note: 'علاج معدِّل تقليدي — يفضَّل تقييم أدوية أعلى فعالية مبكراً حسب النشاط'
      }),
      medication({
        name: 'غلاتيرامير',
        dose: '20 ملغ SC',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      })
    ],
    labs: ['MRI دماغ/نخاع', 'Oligoclonal bands'],
    advice: 'تجنب الحرارة المرتفعة؛ إحالة عصبية متخصصة لاختيار العلاج الأنسب حسب شدة المرض.',
    alert: 'نوبة حادة → IV ميثيل بريدنيزولون.'
  }),

  diagnosis({
    id: 93,
    name: 'الخرف الألزهايمري',
    category: 'الأعصاب',
    reference: 'AAN 2024',
    medications: [
      medication({
        name: 'دونيبيزيل',
        dose: '5-10 ملغ',
        frequency: 'مساءً',
        duration: 'مستمر'
      }),
      medication({
        name: 'ميمانتين',
        dose: '10-20 ملغ',
        frequency: 'مرة-مرتان يومياً',
        duration: 'مستمر',
        note: 'للمتوسط-الشديد'
      })
    ],
    supplies: ['أنشطة ذهنية'],
    labs: ['MRI', 'B12', 'TSH'],
    advice: 'دعم الأسرة، بيئة آمنة.',
    alert: 'تدهور سريع → مراجعة أسباب قابلة للعلاج.'
  }),

  diagnosis({
    id: 94,
    name: 'داء باركنسون',
    category: 'الأعصاب',
    reference: 'AAN 2024',
    medications: [
      medication({
        name: 'ليفودوبا/كاربيدوبا',
        dose: '100/25 ملغ',
        frequency: '3 مرات يومياً',
        duration: 'مستمر',
        note: 'الأساس'
      }),
      medication({
        name: 'براميبيكسول',
        dose: '0.125-1.5 ملغ',
        frequency: '3 مرات يومياً',
        duration: 'مستمر'
      })
    ],
    labs: ['سريري غالباً', 'MRI استبعادي'],
    advice: 'إحالة أعصاب، تمارين.',
    alert: 'هلوسة/تدهور → مراجعة الجرعة.'
  }),

  diagnosis({
    id: 95,
    name: 'اعتلال الأعصاب السكري',
    category: 'الأعصاب',
    reference: 'ADA 2024',
    medications: [
      medication({
        name: 'بريغابالين',
        dose: '75-300 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'دولوكستين',
        dose: '30-60 ملغ',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'أميتريبتيلين',
        dose: '10-50 ملغ',
        frequency: 'مساءً',
        duration: 'مستمر'
      })
    ],
    supplies: ['عناية قدم'],
    labs: ['HbA1c', 'B12', 'TSH'],
    advice: 'ضبط السكر أساس العلاج.',
    alert: 'قرحة قدم → عناية عاجلة.'
  }),

  diagnosis({
    id: 96,
    name: 'الشقيقة مع الأورة',
    category: 'الأعصاب',
    reference: 'IHS 2023',
    medications: [
      medication({
        name: 'سوماتريبتان',
        dose: '50-100 ملغ',
        frequency: 'عند النوبة',
        duration: 'إنقاذي'
      }),
      medication({
        name: 'توبيراميت',
        dose: '25-100 ملغ',
        frequency: 'مرتان يومياً',
        duration: 'وقائي 6 أشهر'
      })
    ],
    supplies: ['دفتر نوبات'],
    labs: ['MRI إذا إنذارات'],
    advice: 'حدد المحفزات.',
    alert: 'أورة طويلة/مفاجئة → MRI.'
  }),

  diagnosis({
    id: 97,
    name: 'الدوار الدهليزي',
    category: 'الأعصاب',
    reference: 'AAO-HNS 2023',
    medications: [
      medication({
        name: 'بيتاهيستين',
        dose: '16-24 ملغ',
        frequency: '2-3 مرات يومياً',
        duration: 'حسب الأعراض'
      }),
      medication({
        name: 'بروكلوربيرازين',
        dose: '5 ملغ',
        frequency: 'عند الحاجة',
        duration: 'قصير الأمد فقط',
        note: 'لتجنب إبطاء التعافي الدهليزي'
      })
    ],
    labs: ['فحص أذن', 'MRI إذا مستمر'],
    advice: 'تمارين تعويضية.',
    alert: 'دوار + ضعف عصبي → طوارئ.'
  }),

  diagnosis({
    id: 98,
    name: 'حب الشباب الشديد',
    category: 'الجلدية',
    reference: 'AAD 2024',
    medications: [
      medication({
        name: 'دوكسيسايكلين',
        dose: '100 ملغ',
        frequency: 'مرتان يومياً',
        duration: '3 أشهر',
        note: 'صُحّح: التتراسيكلين التقليدي أقل استخداماً حالياً؛ الدوكسيسايكلين/مينوسايكلين هما المفضلان'
      }),
      medication({
        name: 'بنزويل بيروكسيد',
        dose: 'دهان 5%',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'إيزوتريتينوين',
        dose: '0.5-1 ملغ/كغ',
        frequency: 'مرتان يومياً',
        duration: '5-6 أشهر',
        note: 'ممنوع تماماً في الحمل — يتطلب برنامج منع حمل صارم'
      })
    ],
    supplies: ['غسول لطيف'],
    labs: ['وظائف كبد', 'دهنيات', 'اختبار حمل شهرياً'],
    advice: 'غسل مرتين يومياً، تجنب العصر.',
    alert: 'أفكار انتحارية → إحالة نفسية.'
  }),

  diagnosis({
    id: 99,
    name: 'الصدفية',
    category: 'الجلدية',
    reference: 'AAD/NPF 2023',
    medications: [
      medication({
        name: 'بيتاميثازون موضعي',
        dose: 'دهان',
        frequency: 'مرة-مرتان يومياً',
        duration: 'حسب الاستجابة'
      }),
      medication({
        name: 'كالسيبوتريول موضعي',
        dose: 'دهان',
        frequency: 'مرتان يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'ميثوتركسات',
        dose: '7.5-25 ملغ',
        frequency: 'مرة أسبوعياً',
        duration: 'مستمر',
        note: 'للشديد؛ مع فوليك أسيد لتقليل السمية'
      })
    ],
    supplies: ['مرطبات', 'واقي شمس'],
    labs: ['CBC', 'ALT/AST', 'وظائف كلى'],
    advice: 'متابعة جلدية.',
    alert: 'التهاب مفاصل صدفي → إحالة روماتيزم.'
  }),

  diagnosis({
    id: 100,
    name: 'الشرى المزمن (أرتيكاريا)',
    category: 'الجلدية',
    reference: 'EAACI/GA²LEN 2022',
    medications: [
      medication({
        name: 'سيتيريزين',
        dose: '10 ملغ (يمكن رفعها حتى 4 أضعاف الجرعة القياسية حسب الإرشادية عند عدم الاستجابة)',
        frequency: 'مرة يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'لوراتادين',
        dose: '10 ملغ',
        frequency: 'مرة يومياً',
        duration: 'حسب الحاجة'
      }),
      medication({
        name: 'أوماليزوماب',
        dose: '300 ملغ SC',
        frequency: 'كل 4 أسابيع',
        duration: 'حسب الاستجابة',
        note: 'للشديد المقاوم لمضادات الهيستامين'
      })
    ],
    labs: ['CBC', 'ESR', 'TSH', 'وظائف كبد/كلى'],
    advice: 'تجنب المحفزات.',
    alert: 'وذمة وعائية/صعوبة تنفس → طوارئ.'
  }),

  /* ═══════════════════════════════════════════════════════
     101-130: التشخيصات الجلدية الإضافية (v5.0)
     ═══════════════════════════════════════════════════════ */

  diagnosis({
    id: 101,
    name: 'الجرب (Scabies)',
    category: 'الجلدية',
    reference: 'Int J Dermatol 2024 / WHO',
    medications: [
      medication({
        name: 'بيرمثرين 5% (Permethrin)',
        dose: 'كريم 5%',
        frequency: 'يُطبق من الرقبة إلى أسفل الجسم ويُترك 8-14 ساعة ثم يُغسل',
        duration: 'جرعة واحدة وتُكرر بعد 7 أيام حسب الاستجابة',
        note: 'العلاج الأول المفضل — يُعالج المخالطون المقربون في نفس الوقت'
      }),
      medication({
        name: 'إيفرمكتين (Ivermectin)',
        dose: '200 مكغ/كغ',
        frequency: 'جرعة فموية واحدة ثم تكرر بعد 7-14 يوماً',
        duration: 'حسب الحالة',
        calc: { mgkg: 0.2, unit: 'ملغ/كغ/جرعة', max: '12 ملغ' },
        note: 'بديل للإصابات الواسعة أو المقاومة للبيرمثرين؛ يُتجنب في الحمل'
      }),
      medication({
        name: 'بنزيل بنزوات (Benzyl benzoate)',
        dose: 'لوشن 10-25%',
        frequency: 'يُطبق حسب تعليمات المستحضر',
        duration: 'حسب الاستجابة',
        note: 'خيار ثانٍ عند مقاومة البيرمثرين [citation:8]'
      })
    ],
    supplies: [
      'غسل الملابس والمفروشات بماء ساخن',
      'علاج المخالطين المقربين في نفس الوقت'
    ],
    labs: ['كشط جلدي عند الحاجة'],
    advice:
      'الحكة قد تستمر عدة أسابيع بعد نجاح العلاج. يجب معالجة المخالطين المقربين في الوقت نفسه عند ثبوت العدوى.',
    alert:
      'جرب متقشر/قشري شديد أو ضعف مناعة → يحتاج تقييماً طبياً سريعاً لاحتمال الجرب النرويجي.'
  }),

  diagnosis({
    id: 102,
    name: 'القمل (Pediculosis)',
    category: 'الجلدية',
    reference: 'Pediatrics 2022 / Drugs Context 2022',
    medications: [
      medication({
        name: 'بيرمثرين 1% (Permethrin)',
        dose: 'مستحضر موضعي',
        frequency: 'يُطبق حسب تعليمات المستحضر',
        duration: 'إعادة العلاج حسب التعليمات والاستجابة',
        note: 'العلاج الأول المفضل حيث لا توجد مقاومة [citation:2]'
      }),
      medication({
        name: 'مالاثيون 0.5% (Malathion)',
        dose: 'مستحضر موضعي',
        frequency: 'حسب تعليمات المستحضر',
        duration: 'حسب الاستجابة',
        note: 'خيار عند مقاومة البيرمثرين [citation:2]'
      }),
      medication({
        name: 'سبينوساد (Spinosad)',
        dose: '0.9% موضعي',
        frequency: 'حسب تعليمات المستحضر',
        duration: 'حسب الاستجابة',
        note: 'آلية عمل جديدة — فعالة ضد القمل المقاوم [citation:19]'
      }),
      medication({
        name: 'إيفرمكتين فموي',
        dose: '400 مكغ/كغ',
        frequency: 'جرعة واحدة، تُكرر بعد 7 أيام',
        duration: 'جرعتان',
        calc: { mgkg: 0.4, unit: 'ملغ/كغ/جرعة', max: '12 ملغ' },
        note: 'محجوز للحالات المقاومة للعلاج الموضعي [citation:2]'
      })
    ],
    supplies: [
      'مشط إزالة القمل والصئبان',
      'تنظيف الأدوات الشخصية'
    ],
    labs: ['فحص فروة الرأس والشعر'],
    advice:
      'تجنب مشاركة الأمشاط والقبعات. افحص المخالطين عند وجود إصابة مؤكدة. التمشيط الرطب للشعر مفيد خصوصاً للأطفال < سنتين.',
    alert:
      'وجود التهاب أو تقيح في فروة الرأس → تقييم طبي.'
  }),

  diagnosis({
    id: 103,
    name: 'الحزاز المسطح (Lichen Planus)',
    category: 'الجلدية',
    reference: 'StatPearls 2024 / JAAD 2020',
    medications: [
      medication({
        name: 'كورتيكوستيرويد موضعي قوي',
        dose: 'حسب موضع وشدة الإصابة',
        frequency: 'مرة-مرتين يومياً',
        duration: 'حسب الاستجابة وتحت إشراف طبي'
      }),
      medication({
        name: 'تريامسينولون أسيتونيد داخل الأفة',
        dose: 'حسب الحجم والموقع',
        frequency: 'جلسات متكررة',
        duration: 'حسب الخطة العلاجية',
        note: 'العلاج المفضل لحزاز الأظافر [citation:3]'
      }),
      medication({
        name: 'ريتينويدات فموية',
        dose: 'حسب البروتوكول',
        frequency: 'حسب الخطة العلاجية',
        duration: 'حسب الاستجابة',
        note: 'خيار ثانٍ عند فشل الستيرويد [citation:3]'
      })
    ],
    labs: [
      'خزعة جلدية عند عدم وضوح التشخيص',
      'فحص الفم'
    ],
    advice:
      'معظم حالات الحزاز الجلدي تشفى تلقائياً خلال 1-2 سنة [citation:10]. الحزاز الفموي عديم الأعراض لا يُعالج عادة بسبب عبء الآثار الجانبية. تجنب خدش الآفات ومتابعة الآفات الفموية.',
    alert:
      'قرحة فموية مستمرة أو آفة متغيرة → تقييم جلدي/فموي وقد تحتاج خزعة.'
  }),

  diagnosis({
    id: 104,
    name: 'الوردية (Rosacea)',
    category: 'الجلدية',
    reference: 'J Cosmet Dermatol 2022 / Br J Dermatol 2019',
    medications: [
      medication({
        name: 'ميترونيدازول موضعي',
        dose: '0.75% أو 1%',
        frequency: 'مرة-مرتين يومياً',
        duration: 'حسب الاستجابة',
        note: 'العلاج الأول المعتمد [citation:4]'
      }),
      medication({
        name: 'أزيليك أسيد (Azelaic acid)',
        dose: '15-20% موضعي',
        frequency: 'مرة-مرتين يومياً',
        duration: 'حسب الاستجابة',
        note: 'العلاج الأول المعتمد [citation:4]'
      }),
      medication({
        name: 'إيفرمكتين موضعي',
        dose: '1% كريم',
        frequency: 'مرة يومياً',
        duration: 'حسب الاستجابة',
        note: 'العلاج الأول المعتمد للوردية الحطاطية البثرية [citation:4]'
      }),
      medication({
        name: 'دوكسيسايكلين',
        dose: '40 ملغ (جرعة مضادة للالتهاب)',
        frequency: 'مرة يومياً',
        duration: 'حسب الاستجابة',
        note: 'للحالات المتوسطة-الشديدة [citation:4]'
      })
    ],
    supplies: ['واقي شمس واسع الطيف'],
    labs: ['تشخيص سريري غالباً'],
    advice:
      'تجنب محفزات الاحمرار مثل الحرارة الشديدة، المشروبات الساخنة وبعض الأطعمة والكحول عند كونها محفزات شخصية.',
    alert:
      'ألم بالعين أو احمرار شديد أو تشوش رؤية → تقييم عيني عاجل.'
  }),

  diagnosis({
    id: 105,
    name: 'البهاق (Vitiligo)',
    category: 'الجلدية',
    reference: 'Dermatol Pract Concept 2023',
    medications: [
      medication({
        name: 'كورتيكوستيرويد موضعي',
        dose: 'حسب الموضع والعمر',
        frequency: 'حسب الخطة العلاجية',
        duration: 'دورات محدودة تحت إشراف طبي'
      }),
      medication({
        name: 'تاكروليمس موضعي (Tacrolimus)',
        dose: '0.03-0.1%',
        frequency: 'مرة-مرتين يومياً',
        duration: 'حسب الاستجابة',
        note: 'يُستخدم خصوصاً في بعض مناطق الوجه والثنيات'
      })
    ],
    supplies: ['واقي شمس'],
    labs: ['TSH عند الاشتباه بمرض درقي مرافق'],
    advice:
      'استخدام واقي الشمس وتقليل حروق الشمس. العلاج الضوئي (308 nm excimer laser) قد يكون مناسباً للحالات المنتشرة أو الموضعية [citation:11].',
    alert:
      'انتشار سريع جداً أو تشخيص غير واضح → إحالة جلدية.'
  }),

  diagnosis({
    id: 106,
    name: 'الثعلبة البقعية (Alopecia Areata)',
    category: 'الجلدية',
    reference: 'BAD 2024/2025',
    medications: [
      medication({
        name: 'كورتيكوستيرويد موضعي أو داخل الأفة',
        dose: 'حسب العمر والحالة',
        frequency: 'حسب الخطة العلاجية',
        duration: 'حسب الاستجابة',
        note: 'العلاج الأول للبقع الموضعية'
      }),
      medication({
        name: 'مثبطات JAK (Baricitinib / Ritlecitinib)',
        dose: 'حسب البروتوكول المعتمد',
        frequency: 'حسب الخطة العلاجية',
        duration: 'طويل الأمد',
        note: 'أحدثت ثورة في علاج الثعلبة البقعية الشديدة [citation:6][citation:16]'
      })
    ],
    labs: [
      'فحص فروة الرأس',
      'تحاليل الغدة الدرقية عند وجود مؤشرات سريرية'
    ],
    advice:
      'قد يحدث نمو تلقائي للشعر في بعض الحالات. الدعم النفسي مهم نظراً للعبء الاجتماعي الكبير للمرض [citation:16].',
    alert:
      'تساقط شعر منتشر سريع أو ندبات في فروة الرأس → إحالة جلدية.'
  }),

  diagnosis({
    id: 107,
    name: 'التهاب الجلد الدهني (Seborrheic Dermatitis)',
    category: 'الجلدية',
    reference: 'AAD',
    medications: [
      medication({
        name: 'كيتوكونازول موضعي',
        dose: 'شامبو 2% أو كريم',
        frequency: 'حسب المستحضر',
        duration: 'عدة أسابيع ثم صيانة عند الحاجة'
      }),
      medication({
        name: 'كورتيكوستيرويد موضعي خفيف',
        dose: 'حسب الموضع',
        frequency: 'لفترة قصيرة',
        duration: 'حسب الاستجابة'
      })
    ],
    supplies: ['شامبو مضاد للقشرة'],
    labs: ['تشخيص سريري'],
    advice:
      'غسل فروة الرأس بانتظام وتجنب الحك الشديد.',
    alert:
      'إصابة شديدة أو مقاومة للعلاج → استبعاد الصدفية أو الفطريات.'
  }),

  diagnosis({
    id: 108,
    name: 'النخالية المبرقشة (Tinea Versicolor)',
    category: 'الجلدية',
    reference: 'Drugs Context 2022 / Expert Opin Pharmacother 2014',
    medications: [
      medication({
        name: 'كيتوكونازول موضعي',
        dose: 'شامبو 2% أو كريم',
        frequency: 'حسب المستحضر',
        duration: 'حسب الخطة العلاجية',
        note: 'العلاج الأول [citation:7][citation:13]'
      }),
      medication({
        name: 'سيلينيوم سلفايد 2.5%',
        dose: 'شامبو',
        frequency: 'حسب التعليمات',
        duration: 'عدة أيام إلى أسابيع',
        note: 'بديل فعال ومتوفر [citation:13]'
      }),
      medication({
        name: 'فلوكونازول فموي',
        dose: '300 ملغ',
        frequency: 'مرة أسبوعياً لمدة أسبوعين',
        duration: 'أسبوعان',
        note: 'للإصابات الواسعة أو المتكررة [citation:7]'
      }),
      medication({
        name: 'إيتراكونازول فموي',
        dose: '200 ملغ',
        frequency: 'مرة يومياً لمدة 5-7 أيام',
        duration: 'أسبوع',
        note: 'بديل للفلوكونازول [citation:13]'
      })
    ],
    labs: ['KOH عند الحاجة'],
    advice:
      'اختلاف لون الجلد قد يستمر بعد القضاء على الفطر لعدة أشهر. معدلات التكرار عالية بعد العلاج الناجح.',
    alert:
      'تشخيص غير واضح أو إصابة واسعة ومتكررة → إحالة جلدية.'
  }),

  diagnosis({
    id: 109,
    name: 'السعفة الجلدية (Tinea Corporis)',
    category: 'الجلدية',
    reference: 'CDC/AAD',
    medications: [
      medication({
        name: 'تربينافين موضعي',
        dose: 'كريم أو جل 1%',
        frequency: 'مرة-مرتين يومياً',
        duration: 'حسب المستحضر والاستجابة'
      }),
      medication({
        name: 'كلوتريمازول موضعي',
        dose: 'كريم 1%',
        frequency: 'مرتان يومياً',
        duration: 'عدة أسابيع'
      })
    ],
    labs: ['KOH عند الشك'],
    advice:
      'الحفاظ على المنطقة جافة وعدم مشاركة المناشف والملابس.',
    alert:
      'إصابة فروة الرأس أو الأظافر أو انتشار واسع → تحتاج تقييماً مختلفاً وقد تتطلب علاجاً فموياً.'
  }),

  diagnosis({
    id: 110,
    name: 'سعفة القدم (Tinea Pedis)',
    category: 'الجلدية',
    reference: 'Drugs Context 2023',
    medications: [
      medication({
        name: 'تربينافين موضعي',
        dose: 'كريم 1%',
        frequency: 'مرة-مرتين يومياً',
        duration: '2-4 أسابيع',
        note: 'أكثر فعالية من الأزولات [citation:22]'
      }),
      medication({
        name: 'كلوتريمازول',
        dose: 'كريم 1%',
        frequency: 'مرتان يومياً',
        duration: '2-4 أسابيع'
      })
    ],
    supplies: ['جوارب جافة', 'حذاء جيد التهوية'],
    labs: ['KOH عند الحاجة'],
    advice:
      'جفف بين أصابع القدم وغيّر الجوارب بانتظام.',
    alert:
      'مريض سكري مع تشققات أو قرحة أو احمرار منتشر → تقييم طبي سريع.'
  }),

  diagnosis({
    id: 111,
    name: 'سعفة فروة الرأس (Tinea Capitis)',
    category: 'الجلدية',
    reference: 'Int J Dermatol 2012 / Pediatr Dermatol 2010',
    medications: [
      medication({
        name: 'غريزيوفولفين (Griseofulvin)',
        dose: '10-20 ملغ/كغ/يوم',
        frequency: 'مرة-مرتان يومياً مع وجبة دهنية',
        duration: '6-8 أسابيع',
        calc: { mgkg: 15, unit: 'ملغ/كغ/يوم', max: '1غ/يوم' },
        note: 'العلاج الأول المفضل — معدل الشفاء 96% [citation:32]'
      }),
      medication({
        name: 'تربينافين فموي',
        dose: 'حسب الوزن',
        frequency: 'مرة يومياً',
        duration: '4-6 أسابيع',
        calc: {
          mgkg: 5,
          unit: 'ملغ/كغ/يوم',
          max: '250 ملغ',
          categories: [
            { range: '< 20 كغ', dose: '62.5 ملغ' },
            { range: '20-40 كغ', dose: '125 ملغ' },
            { range: '> 40 كغ', dose: '250 ملغ' }
          ]
        },
        note: 'العلاج الثاني — معدل الشفاء 88% [citation:32]'
      })
    ],
    supplies: [
      'شامبو كيتوكونازول 2%',
      'مشط خاص'
    ],
    labs: ['KOH', 'زرع فطري', 'وظائف كبد قبل التربينافين'],
    advice:
      'ضروري علاج المخالطين. المدة تختلف حسب نوع الفطر.',
    alert:
      'كتلة مؤلمة (Kerion) → تقييم جلدي سريع + خزعة.'
  }),

  diagnosis({
    id: 112,
    name: 'فطار الأظافر (Onychomycosis)',
    category: 'الجلدية',
    reference: 'AAD / Drugs Context 2023',
    medications: [
      medication({
        name: 'تربينافين فموي',
        dose: '250 ملغ',
        frequency: 'مرة يومياً',
        duration: '6 أسابيع للأظافر اليدوية، 12 أسبوعاً للقدمية',
        note: 'أكثر فعالية من الإيتراكونازول والغريزيوفولفين [citation:22]'
      }),
      medication({
        name: 'إيتراكونازول فموي',
        dose: '200 ملغ',
        frequency: 'مرة يومياً',
        duration: '6-12 أسبوعاً',
        note: 'بديل عند عدم تحمل التربينافين'
      })
    ],
    labs: ['KOH أو فحص فطري', 'وظائف كبد عند العلاج الجهازي'],
    advice:
      'علاج الفطر قد يحتاج عدة أشهر حتى يظهر تحسن واضح في شكل الظفر.',
    alert:
      'مرض كبدي أو أدوية متعددة → مراجعة التداخلات قبل العلاج الفموي.'
  }),

  diagnosis({
    id: 113,
    name: 'القلاع الجلدي (Candidal Intertrigo)',
    category: 'الجلدية',
    reference: 'Am Fam Physician 2014',
    medications: [
      medication({
        name: 'كلوتريمازول موضعي',
        dose: 'كريم 1%',
        frequency: 'مرتان يومياً',
        duration: '2-4 أسابيع'
      }),
      medication({
        name: 'نيستاتين موضعي',
        dose: 'كريم أو مسحوق',
        frequency: 'حسب المستحضر',
        duration: 'حسب الاستجابة'
      }),
      medication({
        name: 'فلوكونازول فموي',
        dose: '150 ملغ',
        frequency: 'جرعة واحدة أو حسب الحالة',
        duration: 'حسب الاستجابة',
        note: 'للحالات المقاومة [citation:23]'
      })
    ],
    labs: ['KOH عند الحاجة', 'سكر الدم عند التكرار'],
    advice:
      'حافظ على الثنيات جافة وقلل الاحتكاك والرطوبة.',
    alert:
      'ألم شديد أو انتشار سريع أو حرارة عامة → استبعاد عدوى بكتيرية ثانوية.'
  }),

  diagnosis({
    id: 114,
    name: 'القوباء (Impetigo)',
    category: 'الجلدية',
    reference: 'Am Fam Physician 2007/2014',
    medications: [
      medication({
        name: 'ميبيروسين موضعي (Mupirocin)',
        dose: 'مرهم 2%',
        frequency: '3 مرات يومياً',
        duration: '5-7 أيام',
        note: 'العلاج الأول للقوباء غير الفقاعية [citation:24][citation:33]'
      }),
      medication({
        name: 'حمض الفوسيديك موضعي',
        dose: 'كريم 2%',
        frequency: '3 مرات يومياً',
        duration: '5-7 أيام',
        note: 'بديل فعال للميبيروسين [citation:24]'
      }),
      medication({
        name: 'سيفالكسين فموي',
        dose: 'حسب العمر والوزن',
        frequency: 'حسب البروتوكول',
        duration: '7 أيام',
        note: 'للحالات الواسعة [citation:33]'
      })
    ],
    labs: ['زرع من الآفة عند الحالات المتكررة أو الشديدة'],
    advice:
      'تنظيف الآفات وتجنب مشاركة المناشف والحفاظ على نظافة اليدين.',
    alert:
      'انتشار سريع، حرارة، أو إصابة واسعة → تقييم طبي.'
  }),

  diagnosis({
    id: 115,
    name: 'التهاب النسيج الخلوي (Cellulitis)',
    category: 'الجلدية',
    reference: 'IDSA / Am J Med 2010',
    medications: [
      medication({
        name: 'تريميثوبريم/سلفاميثوكسازول (TMP-SMX)',
        dose: '160/800 ملغ',
        frequency: 'مرتان يومياً',
        duration: '5-10 أيام',
        note: 'يُفضل في المناطق ذات معدلات MRSA عالية — تفوق على السيفالكسين [citation:25]'
      }),
      medication({
        name: 'كليندامايسين',
        dose: '300-450 ملغ',
        frequency: '3-4 مرات يومياً',
        duration: '5-10 أيام',
        note: 'بديل فعال ضد MRSA [citation:25]'
      }),
      medication({
        name: 'سيفالكسين',
        dose: '500 ملغ',
        frequency: '4 مرات يومياً',
        duration: '5-10 أيام',
        note: 'فعال للعدوى غير المعقدة غير المرتبطة بـ MRSA [citation:40]'
      })
    ],
    labs: [
      'CBC عند الحالات المتوسطة/الشديدة',
      'زرع دم عند وجود علامات جهازية'
    ],
    advice:
      'رفع الطرف المصاب ومراقبة امتداد الاحمرار.',
    alert:
      'ألم شديد غير متناسب، فقاعات، نخر، سمية جهازية أو انتشار سريع → طوارئ لاحتمال عدوى نخرية.'
  }),

  diagnosis({
    id: 116,
    name: 'التهاب الجريبات (Folliculitis)',
    category: 'الجلدية',
    reference: 'Dermatologie 2025',
    medications: [
      medication({
        name: 'غسول بنزويل بيروكسيد 5-10%',
        dose: 'موضعي',
        frequency: 'مرة يومياً',
        duration: 'حسب الاستجابة',
        note: 'العلاج الأول [citation:26]'
      }),
      medication({
        name: 'ميبيروسين موضعي',
        dose: 'مرهم 2%',
        frequency: '3 مرات يومياً',
        duration: '5-7 أيام',
        note: 'للإصابات البكتيرية'
      })
    ],
    labs: ['زرع عند التكرر أو عدم الاستجابة'],
    advice:
      'تجنب الحلاقة القريبة والاحتكاك والتعرق الزائد.',
    alert:
      'خراجات متكررة أو حرارة عامة → تقييم للعدوى العميقة أو عوامل مهيئة.'
  }),

  diagnosis({
    id: 117,
    name: 'الخراج الجلدي (Skin Abscess)',
    category: 'الجلدية',
    reference: 'BMJ 2018 / Dermatologie 2025',
    medications: [
      medication({
        name: 'تصريف جراحي',
        dose: 'حسب حجم ومكان الخراج',
        frequency: 'إجراء عند الحاجة',
        duration: 'حسب الحالة',
        note: 'التصريف هو التدخل الأساسي والأولي [citation:26][citation:34]'
      }),
      medication({
        name: 'TMP-SMX',
        dose: '160/800 ملغ',
        frequency: 'مرتان يومياً',
        duration: '5-7 أيام',
        note: 'يوصى به بعد التصريف للخراجات غير المعقدة [citation:34]'
      })
    ],
    labs: ['زرع القيح عند الحالات المختارة'],
    advice:
      'لا تعصر الخراج في المنزل ولا تحاول فتحه ذاتياً.',
    alert:
      'خراج بالوجه، حول العين، مع سمية جهازية أو انتشار سريع → تقييم عاجل.'
  }),

  diagnosis({
    id: 118,
    name: 'التهاب الغدد العرقية القيحي (Hidradenitis Suppurativa)',
    category: 'الجلدية',
    reference: 'EADV S2k Guidelines 2024/2025',
    medications: [
      medication({
        name: 'كليندامايسين + ريفامبيسين',
        dose: '300 ملغ + 300 ملغ',
        frequency: 'مرتان يومياً',
        duration: '10-12 أسبوعاً',
        note: 'للحالات المتوسطة [citation:28]'
      }),
      medication({
        name: 'أداليموماب',
        dose: '160 ملغ أسبوع 0، 80 ملغ أسبوع 2، ثم 40 ملغ أسبوعياً',
        frequency: 'حقن تحت الجلد',
        duration: 'طويل الأمد',
        note: 'العلاج البيولوجي الوحيد المعتمد [citation:28]'
      })
    ],
    labs: ['تقييم سريري', 'فحوص إضافية حسب الحالة'],
    advice:
      'تجنب الاحتكاك والتدخين، وتقييم الوزن وعوامل الخطورة المصاحبة.',
    alert:
      'ألم شديد، عدوى منتشرة أو مسارات ناسورية واسعة → إحالة جلدية.'
  }),

  diagnosis({
    id: 119,
    name: 'الشعرانية (Hirsutism)',
    category: 'الجلدية',
    reference: 'Endocrine Society 2018 / Expert Opin Pharmacother 2023',
    medications: [
      medication({
        name: 'حبوب منع الحمل المركبة (OCP)',
        dose: 'حسب المستحضر',
        frequency: 'حسب النظام',
        duration: 'حسب التقييم الطبي',
        note: 'العلاج الأول المفضل [citation:29]'
      }),
      medication({
        name: 'سبيرونولاكتون',
        dose: '50-200 ملغ',
        frequency: 'مرة-مرتان يومياً',
        duration: 'حسب المتابعة',
        note: 'مضاد أندروجين — يُضاف للـ OCP في الحالات الشديدة [citation:29]'
      }),
      medication({
        name: 'فيناسترايد',
        dose: '2.5-5 ملغ',
        frequency: 'مرة يومياً',
        duration: 'حسب المتابعة',
        note: 'مضاد أندروجين بديل — يُتجنب في النساء في سن الإنجاب [citation:29]'
      })
    ],
    labs: ['Total testosterone عند الاشتباه بفرط الأندروجين', '17-OHP عند الحاجة'],
    advice:
      'البحث عن متلازمة تكيس المبايض أو أسباب الغدد عند وجود مؤشرات. العلاج الدوائي غالباً يحتاج 6-12 شهراً لرؤية النتائج.',
    alert:
      'ظهور الشعرانية بسرعة مع خشونة الصوت أو علامات تذكير → تقييم غدي سريع.'
  }),

  diagnosis({
    id: 120,
    name: 'الثعلبة الأندروجينية (Androgenetic Alopecia)',
    category: 'الجلدية',
    reference: 'AAD',
    medications: [
      medication({
        name: 'مينوكسيديل موضعي',
        dose: '5% للرجال، 2% للنساء',
        frequency: 'مرة-مرتين يومياً',
        duration: 'طويل الأمد'
      }),
      medication({
        name: 'فيناسترايد',
        dose: '1 ملغ',
        frequency: 'مرة يومياً',
        duration: 'طويل الأمد',
        note: 'للرجال فقط — لا يُستخدم في النساء'
      })
    ],
    labs: ['فحص فروة الرأس', 'تحاليل إضافية عند وجود مؤشرات'],
    advice:
      'الاستجابة تحتاج عدة أشهر، وقد يعود التساقط عند إيقاف العلاج.',
    alert:
      'تساقط مفاجئ أو ندبي أو مصحوب بالتهاب → البحث عن سبب آخر.'
  }),

  diagnosis({
    id: 121,
    name: 'تساقط الشعر الكربي (Telogen Effluvium)',
    category: 'الجلدية',
    reference: 'AAD / Ann Agric Environ Med 2024',
    medications: [],
    labs: [
      'CBC',
      'Ferritin',
      'TSH',
      'فحوص إضافية حسب التاريخ المرضي'
    ],
    advice:
      'ابحث عن محفز سابق مثل مرض شديد، جراحة، فقدان وزن أو نقص غذائي. غالباً يتحسن بعد معالجة السبب. العلاج بالضوء (LED) قد يساعد في تسريع التعافي [citation:30].',
    alert:
      'تساقط مستمر أو بقعي أو ندبي → إحالة جلدية.'
  }),

  diagnosis({
    id: 122,
    name: 'الكيلويد (Keloid)',
    category: 'الجلدية',
    reference: 'Am Fam Physician 2024',
    medications: [
      medication({
        name: 'حقن كورتيكوستيرويد داخل الآفة',
        dose: 'حسب حجم ومكان الكيلويد',
        frequency: 'جلسات متكررة حسب الاستجابة',
        duration: 'حسب الخطة العلاجية',
        note: 'العلاج الأول [citation:31]'
      }),
      medication({
        name: 'سيليكون جل أو شرائح سيليكون',
        dose: 'موضعي',
        frequency: 'يومياً',
        duration: 'عدة أشهر',
        note: 'قد يساعد في تقليل حجم الندبة وتحسين الأعراض [citation:39]'
      }),
      medication({
        name: 'بوتوكس (OnabotulinumtoxinA)',
        dose: 'حسب حجم الندبة',
        frequency: 'جلسات',
        duration: 'حسب الخطة العلاجية',
        note: 'يبدو أفضل من 5-FU والستيرويد للكيلويد [citation:31]'
      })
    ],
    supplies: ['شرائح سيليكون'],
    labs: ['تشخيص سريري'],
    advice:
      'تجنب الإجراءات الجراحية غير الضرورية لدى الأشخاص ذوي الاستعداد لتكوين الكيلويد.',
    alert:
      'نمو سريع أو تشخيص غير مؤكد → تقييم جلدي.'
  }),

  diagnosis({
    id: 123,
    name: 'الندبة الضخامية (Hypertrophic Scar)',
    category: 'الجلدية',
    reference: 'Dermatol Surg 2017 / Plast Reconstr Surg 2022',
    medications: [
      medication({
        name: 'سيليكون موضعي',
        dose: 'جل أو شرائح',
        frequency: 'يومياً',
        duration: 'عدة أشهر',
        note: 'العلاج الأول [citation:39]'
      }),
      medication({
        name: 'حقن كورتيكوستيرويد داخل الآفة',
        dose: 'حسب حجم الندبة',
        frequency: 'جلسات حسب الاستجابة',
        duration: 'حسب الخطة العلاجية'
      })
    ],
    labs: ['تشخيص سريري'],
    advice:
      'الحماية من الشمس قد تقلل التصبغ بعد الالتهاب. الندبة الضخامية تبقى ضمن حدود الجرح الأصلي بعكس الكيلويد.',
    alert:
      'ندبة مؤلمة جداً أو متقرحة أو متغيرة → تقييم طبي.'
  }),

  diagnosis({
    id: 124,
    name: 'التقران السفعي (Actinic Keratosis)',
    category: 'الجلدية',
    reference: 'AAD',
    medications: [
      medication({
        name: 'فلورويوراسيل موضعي',
        dose: '5% كريم',
        frequency: 'مرتان يومياً',
        duration: '2-4 أسابيع',
        note: 'العلاج الأول [citation:31]'
      }),
      medication({
        name: 'إميكويمود موضعي',
        dose: '5% كريم',
        frequency: '2-3 مرات أسبوعياً',
        duration: '16 أسبوعاً',
        note: 'بديل فعال'
      })
    ],
    supplies: ['واقي شمس واسع الطيف'],
    labs: ['خزعة عند الشك بسرطان حرشفي الخلايا'],
    advice:
      'الحماية المستمرة من الأشعة فوق البنفسجية والمتابعة الجلدية.',
    alert:
      'آفة تنزف أو تتقرح أو تنمو بسرعة أو تصبح مؤلمة → تقييم عاجل وخزعة عند الحاجة.'
  }),

  diagnosis({
    id: 125,
    name: 'سرطان الخلايا القاعدية (Basal Cell Carcinoma)',
    category: 'الجلدية',
    reference: 'AAD/NCCN',
    medications: [],
    procedures: [
      'استئصال جراحي مع هوامش مناسبة',
      'Mohs micrographic surgery للأنواع العدوانية أو المناطق الحساسة',
      'علاج بالتبريد (Cryotherapy) للحالات المختارة',
      'إيميكويمود موضعي للسطحي'
    ],
    supplies: ['واقي شمس'],
    labs: ['خزعة جلدية للتشخيص'],
    advice:
      'العلاج يعتمد على الموقع والحجم والنمط النسيجي، وغالباً يكون الاستئصال الجراحي هو العلاج الأساسي. سرطان الخلايا القاعدية نادراً ما ينتشر لكنه قد يسبب تدميراً موضعياً إذا ترك.',
    alert:
      'أي قرحة جلدية لا تلتئم أو آفة تنزف بشكل متكرر → تقييم جلدية وخزعة.'
  }),

  diagnosis({
    id: 126,
    name: 'سرطان الخلايا الحرشفية الجلدي (Cutaneous SCC)',
    category: 'الجلدية',
    reference: 'AAD/NCCN',
    medications: [],
    procedures: [
      'استئصال جراحي واسع مع تقييم العقد الليمفاوية',
      'علاج إشعاعي مساعد للحالات عالية الخطورة',
      'علاج مناعي (Cemiplimab) للمرحلة المتقدمة'
    ],
    supplies: ['واقي شمس'],
    labs: ['خزعة جلدية'],
    advice:
      'العلاج يعتمد على الخطورة والموقع والحجم، ويحتاج غالباً إلى تدخل جراحي. خطر الانتشار أعلى من الخلايا القاعدية.',
    alert:
      'آفة متقرنة أو متقرحة سريعة النمو، مؤلمة أو نازفة → إحالة جلدية عاجلة.'
  }),

  diagnosis({
    id: 127,
    name: 'الميلانوما (Melanoma)',
    category: 'الجلدية',
    reference: 'AAD/NCCN',
    medications: [],
    procedures: [
      'استئصال واسع مع فحص العقدة الحارسة (Sentinel Lymph Node Biopsy)',
      'علاج مناعي (Pembrolizumab / Nivolumab) للمرحلة III+',
      'علاج موجّه (BRAF/MEK inhibitors) عند وجود طفرة BRAF'
    ],
    supplies: ['واقي شمس'],
    labs: ['فحص جلدي', 'خزعة استئصالية عند الاشتباه'],
    advice:
      'قاعدة ABCDE تساعد في التعرف على الشامات المشبوهة: عدم التماثل، عدم انتظام الحدود، تعدد الألوان، القطر، والتغير. التشخيص المبكر ينقذ الحياة.',
    alert:
      'أي شامة جديدة أو متغيرة في اللون/الحجم/الشكل → تقييم جلدي سريع.'
  }),

  diagnosis({
    id: 128,
    name: 'التهاب الجلد الركودي (Stasis Dermatitis)',
    category: 'الجلدية',
    reference: 'AAD / NICE',
    medications: [
      medication({
        name: 'مرطب كثيف',
        dose: 'موضعي',
        frequency: 'عدة مرات يومياً',
        duration: 'مستمر'
      }),
      medication({
        name: 'كورتيكوستيرويد موضعي متوسط القوة',
        dose: 'حسب شدة الالتهاب',
        frequency: 'مرة-مرتين يومياً',
        duration: 'دورة قصيرة'
      })
    ],
    supplies: ['جوارب ضاغطة عند ملاءمتها'],
    labs: ['تقييم قصور وريدي', 'موجات فوق صوتية عند الاشتباه بخثار'],
    advice:
      'رفع الساقين وعلاج القصور الوريدي وتقليل الوقوف الطويل.',
    alert:
      'تورم مفاجئ أحادي الجانب أو ألم شديد أو ضيق نفس → استبعاد الخثار/الصمة بشكل عاجل.'
  }),

  diagnosis({
    id: 129,
    name: 'قرحة الساق الوريدية (Venous Leg Ulcer)',
    category: 'الجلدية',
    reference: 'NICE',
    medications: [
      medication({
        name: 'عناية موضعية بالجرح',
        dose: 'حسب حالة القرحة',
        frequency: 'وفق خطة العناية بالجرح',
        duration: 'حتى الالتئام'
      })
    ],
    supplies: [
      'ضمادات مناسبة',
      'مواد تنظيف الجروح'
    ],
    labs: [
      'تقييم الدورة الدموية الطرفية',
      'ABI قبل الضغط الضاغط عند الحاجة'
    ],
    advice:
      'العلاج بالضغط قد يكون أساسياً عند تأكد كفاية التروية الشريانية، مع رفع الساق والعناية بالجلد.',
    alert:
      'نخر، التهاب منتشر، ألم شديد أو علامات نقص تروية → تقييم عاجل.'
  }),

  diagnosis({
    id: 130,
    name: 'الفقاع الشائع (Pemphigus Vulgaris)',
    category: 'الجلدية',
    reference: 'AAD',
    medications: [
      medication({
        name: 'كورتيكوستيرويد جهازي',
        dose: 'حسب شدة المرض ووزن المريض',
        frequency: 'حسب الخطة العلاجية',
        duration: 'حسب الاستجابة'
      }),
      medication({
        name: 'ريتوكسيماب (Rituximab)',
        dose: 'وفق البروتوكول المتخصص',
        frequency: 'حسب النظام العلاجي',
        duration: 'حسب الاستجابة',
        note: 'علاج متخصص للحالات المناسبة'
      })
    ],
    labs: [
      'خزعة جلدية',
      'Direct immunofluorescence',
      'أجسام مضادة نوعية عند الحاجة'
    ],
    advice:
      'يحتاج المرض عادة إلى متابعة جلدية متخصصة وعناية بالجلد والأغشية المخاطية.',
    alert:
      'فقاعات واسعة، فقدان سوائل، إصابة فموية شديدة أو علامات عدوى → تقييم عاجل/مستشفى.'
  })

]; // end DIAGNOSES


/* ==========================================================
 * 4) VALIDATION
 * ========================================================== */

/**
 * التحقق من صحة قاعدة البيانات.
 * @param {Object[]} data
 * @returns {string[]} - مصفوفة أخطاء (فارغة إذا سليم)
 */
function validateDiagnoses(data) {
  const errors = [];
  const ids = new Set();

  if (!Array.isArray(data)) {
    errors.push('DIAGNOSES must be an array.');
    return errors;
  }

  data.forEach((item, index) => {
    const position = index + 1;

    if (!item || typeof item !== 'object') {
      errors.push(`Item ${position}: invalid object.`);
      return;
    }

    if (!Number.isInteger(item.id)) {
      errors.push(`Item ${position}: invalid id.`);
    }

    if (ids.has(item.id)) {
      errors.push(`Duplicate diagnosis ID: ${item.id}`);
    }

    ids.add(item.id);

    if (!item.name?.trim()) {
      errors.push(`Diagnosis ${item.id}: missing name.`);
    }

    if (!item.cat?.trim()) {
      errors.push(`Diagnosis ${item.id}: missing category.`);
    } else if (!CATEGORIES.includes(item.cat)) {
      errors.push(
        `Diagnosis ${item.id}: category "${item.cat}" not in CATEGORIES.`
      );
    }

    if (!item.ref?.trim()) {
      errors.push(`Diagnosis ${item.id}: missing reference.`);
    }

    if (!Array.isArray(item.meds)) {
      errors.push(`Diagnosis ${item.id}: meds must be an array.`);
    }

    if (!Array.isArray(item.supplies)) {
      errors.push(`Diagnosis ${item.id}: supplies must be an array.`);
    }

    if (!Array.isArray(item.labs)) {
      errors.push(`Diagnosis ${item.id}: labs must be an array.`);
    }
  });

  return errors;
}

const validationErrors = validateDiagnoses(DIAGNOSES);

if (validationErrors.length > 0) {
  console.error(`❌ data.js v${DATA_VERSION} — أخطاء في قاعدة البيانات:`);
  validationErrors.forEach(error => console.error(`• ${error}`));
  throw new Error(
    `Clinical dataset validation failed: ${validationErrors.length} error(s)`
  );
}


/* ==========================================================
 * 5) INTEGRITY CHECKS
 * ========================================================== */

const EXPECTED_DIAGNOSIS_COUNT = 130;

if (DIAGNOSES.length !== EXPECTED_DIAGNOSIS_COUNT) {
  console.warn(
    `⚠️ عدد التشخيصات ${DIAGNOSES.length} — المتوقع ${EXPECTED_DIAGNOSIS_COUNT}`
  );
}

console.assert(
  new Set(DIAGNOSES.map(d => d.id)).size === DIAGNOSES.length,
  '⚠️ يوجد ID مكرر في التشخيصات'
);

console.log(
  `✅ data.js v${DATA_VERSION} — ` +
  `${DIAGNOSES.length} تشخيصاً — validation passed`
);


/* ==========================================================
 * 6) EXPORT — ES Modules + Browser Globals
 * ========================================================== */

// ES Modules
// export { DATA_VERSION, HOSPITALS, CATEGORIES, DIAGNOSES };

// Browser Globals
if (typeof window !== 'undefined') {
  window.CLINICAL_DATA = Object.freeze({
    DATA_VERSION,
    HOSPITALS,
    CATEGORIES,
    DIAGNOSES
  });

  // التوافق مع الكود القديم
  window.HOSPITALS = HOSPITALS;
  window.DIAGNOSES = DIAGNOSES;
  window.CATEGORIES = CATEGORIES;
     }
