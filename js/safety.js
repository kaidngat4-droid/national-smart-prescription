/* ==========================================================
   MediPrescribe — SafetyCheck v3.0
   ----------------------------------------------------------
   Clinical Decision Support / Medication Safety Engine

   Checks:
   1) Drug–Drug Interactions
   2) Duplicate therapy
   3) Allergy / cross-reactivity review
   4) Pregnancy review
   5) Renal-dose / renal-risk review
   6) Hepatic-risk review
   7) QT-risk combinations
   8) Drug–disease contraindication / caution
   9) Age-related risk
   10) Weight-related dosing prompts
   11) Dose / frequency / route validation prompts
   12) Maximum-dose prompts
   13) Anticoagulation / bleeding risk
   14) Serotonergic / CNS depression risk
   15) Potassium / nephrotoxicity risk
   16) Breastfeeding review prompt
   17) Patient medication history
   18) Structured findings with severity, action, source and evidence note

   IMPORTANT:
   - This is a decision-support framework, NOT an autonomous prescribing engine.
   - Rules are intentionally conservative and should be verified against the
     current local product label / institutional protocol / licensed database.
   - Do not automatically stop medicines based solely on a warning.
   - FDA pregnancy categories A/B/C/D/X are intentionally NOT used.

   Reference sources:
   FDA: https://www.fda.gov/drugs
   Drugs@FDA: https://www.accessdata.fda.gov/scripts/cder/daf/
   DailyMed/NLM: https://dailymed.nlm.nih.gov/dailymed/
   FDA Pregnancy/Lactation: https://www.fda.gov/drugs/labeling-information-drug-products/
   NIH LactMed: https://www.ncbi.nlm.nih.gov/books/NBK501922/
   MotherToBaby: https://mothertobaby.org/fact-sheets/
   CredibleMeds: https://crediblemeds.org/
   KDIGO: https://kdigo.org/
   ========================================================== */

const SafetyCheck = (() => {
  'use strict';

  const VERSION = '3.0.0';

  const SEVERITY_RANK = {
    info: 1,
    moderate: 2,
    high: 3,
    critical: 4
  };

  const SOURCES = {
    FDA: {
      name: 'U.S. FDA',
      url: 'https://www.fda.gov/drugs'
    },
    DRUGS_FDA: {
      name: 'Drugs@FDA',
      url: 'https://www.accessdata.fda.gov/scripts/cder/daf/'
    },
    DAILYMED: {
      name: 'DailyMed / NLM',
      url: 'https://dailymed.nlm.nih.gov/dailymed/'
    },
    FDA_PLR: {
      name: 'FDA Pregnancy & Lactation Labeling',
      url: 'https://www.fda.gov/drugs/labeling-information-drug-products/'
    },
    LACTMED: {
      name: 'NIH LactMed',
      url: 'https://www.ncbi.nlm.nih.gov/books/NBK501922/'
    },
    MOTHERTOBABY: {
      name: 'MotherToBaby',
      url: 'https://mothertobaby.org/fact-sheets/'
    },
    CREDIBLEMEDS: {
      name: 'CredibleMeds',
      url: 'https://crediblemeds.org/'
    },
    KDIGO: {
      name: 'KDIGO',
      url: 'https://kdigo.org/'
    }
  };

  /* ==========================================================
     1. NORMALIZATION
     ========================================================== */

  const ARABIC_DIGITS = {
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

  function normalizeText(value) {
    if (value === null || value === undefined) return '';

    let s = String(value)
      .trim()
      .toLowerCase();

    s = s.replace(/[٠-٩]/g, d => ARABIC_DIGITS[d]);

    s = s
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي');

    s = s.replace(/[._/\\-]+/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();

    return s;
  }

  function canonical(value) {
    const n = normalizeText(value);

    const aliases = {
      /* antibiotics */
      'amoxicillin': 'amoxicillin',
      'amoxycillin': 'amoxicillin',
      'اموكسيسيلين': 'amoxicillin',
      'اموكسيسيلين': 'amoxicillin',

      'ampicillin': 'ampicillin',
      'امبيسيلين': 'ampicillin',

      'penicillin': 'penicillin',
      'penicillin v': 'penicillin',
      'penicillin g': 'penicillin',
      'بنسلين': 'penicillin',

      'cephalexin': 'cephalexin',
      'cefalexin': 'cephalexin',
      'سيفالكسين': 'cephalexin',

      'cefixime': 'cefixime',
      'سيفيكسيم': 'cefixime',

      'ceftriaxone': 'ceftriaxone',
      'سيفترياكسون': 'ceftriaxone',

      'cefuroxime': 'cefuroxime',
      'سيفوروكسيم': 'cefuroxime',

      'azithromycin': 'azithromycin',
      'azithro': 'azithromycin',
      'ازيثرومايسين': 'azithromycin',
      'أزيثروميسين': 'azithromycin',

      'clarithromycin': 'clarithromycin',
      'كلاريثروميسين': 'clarithromycin',

      'erythromycin': 'erythromycin',
      'اريثرومايسين': 'erythromycin',

      'ciprofloxacin': 'ciprofloxacin',
      'سيبروفلوكساسين': 'ciprofloxacin',

      'levofloxacin': 'levofloxacin',
      'ليفوفلوكساسين': 'levofloxacin',

      'moxifloxacin': 'moxifloxacin',
      'موكسيفلوكساسين': 'moxifloxacin',

      'doxycycline': 'doxycycline',
      'دوكسيسيكلين': 'doxycycline',

      'tetracycline': 'tetracycline',
      'تتراسيكلين': 'tetracycline',

      'metronidazole': 'metronidazole',
      'مترونيدازول': 'metronidazole',

      'trimethoprim': 'trimethoprim',
      'تريميثوبريم': 'trimethoprim',

      'sulfamethoxazole': 'sulfamethoxazole',
      'sulphamethoxazole': 'sulfamethoxazole',
      'سلفاميثوكسازول': 'sulfamethoxazole',

      /* anticoagulants / antiplatelets */
      'warfarin': 'warfarin',
      'وارفارين': 'warfarin',

      'apixaban': 'apixaban',
      'ابيكسابان': 'apixaban',

      'rivaroxaban': 'rivaroxaban',
      'ريفاروكسابان': 'rivaroxaban',

      'dabigatran': 'dabigatran',
      'دابيغاتران': 'dabigatran',

      'heparin': 'heparin',
      'هيبارين': 'heparin',

      'enoxaparin': 'enoxaparin',
      'انوكسابارين': 'enoxaparin',

      'aspirin': 'aspirin',
      'acetylsalicylic acid': 'aspirin',
      'اسبرين': 'aspirin',
      'اسيتيل ساليسيليك': 'aspirin',

      'clopidogrel': 'clopidogrel',
      'كلوبيدوغريل': 'clopidogrel',

      /* analgesics / CNS */
      'ibuprofen': 'ibuprofen',
      'ايبوبروفين': 'ibuprofen',
      'إيبوبروفين': 'ibuprofen',

      'naproxen': 'naproxen',
      'نابروكسين': 'naproxen',

      'diclofenac': 'diclofenac',
      'ديكلوفيناك': 'diclofenac',

      'ketorolac': 'ketorolac',
      'كيتورولاك': 'ketorolac',

      'paracetamol': 'paracetamol',
      'acetaminophen': 'paracetamol',
      'باراسيتامول': 'paracetamol',
      'اسيتامينوفين': 'paracetamol',

      'tramadol': 'tramadol',
      'ترامادول': 'tramadol',

      'codeine': 'codeine',
      'كودايين': 'codeine',

      'morphine': 'morphine',
      'مورفين': 'morphine',

      'oxycodone': 'oxycodone',
      'اوكسیکودون': 'oxycodone',

      'fentanyl': 'fentanyl',
      'فنتانيل': 'fentanyl',

      'diazepam': 'diazepam',
      'ديازيبام': 'diazepam',

      'lorazepam': 'lorazepam',
      'لورازيبام': 'lorazepam',

      'alprazolam': 'alprazolam',
      'البرازولام': 'alprazolam',

      'clonazepam': 'clonazepam',
      'كلونازيبام': 'clonazepam',

      'gabapentin': 'gabapentin',
      'جابابنتين': 'gabapentin',

      'pregabalin': 'pregabalin',
      'بريجابالين': 'pregabalin',

      /* antidepressants */
      'fluoxetine': 'fluoxetine',
      'فلوكسيتين': 'fluoxetine',

      'sertraline': 'sertraline',
      'سيرترالين': 'sertraline',

      'citalopram': 'citalopram',
      'سيتالوبرام': 'citalopram',

      'escitalopram': 'escitalopram',
      'اسيتالوبرام': 'escitalopram',

      'paroxetine': 'paroxetine',
      'باروكسيتين': 'paroxetine',

      'venlafaxine': 'venlafaxine',
      'فينلافاكسين': 'venlafaxine',

      'duloxetine': 'duloxetine',
      'دولوكستين': 'duloxetine',

      'amitriptyline': 'amitriptyline',
      'اميترِبتيلين': 'amitriptyline',

      'mirtazapine': 'mirtazapine',
      'ميرتازابين': 'mirtazapine',

      /* cardiovascular */
      'amlodipine': 'amlodipine',
      'املوديبين': 'amlodipine',

      'lisinopril': 'lisinopril',
      'ليزينوبريل': 'lisinopril',

      'enalapril': 'enalapril',
      'انالابريل': 'enalapril',

      'losartan': 'losartan',
      'لوسارتان': 'losartan',

      'valsartan': 'valsartan',
      'فالسارتان': 'valsartan',

      'telmisartan': 'telmisartan',
      'تلميسارتان': 'telmisartan',

      'candesartan': 'candesartan',
      'كانديسارتان': 'candesartan',

      'spironolactone': 'spironolactone',
      'سبيرونولاكتون': 'spironolactone',

      'furosemide': 'furosemide',
      'فوروسيميد': 'furosemide',

      'hydrochlorothiazide': 'hydrochlorothiazide',
      'هيدروكلوروثيازيد': 'hydrochlorothiazide',

      'digoxin': 'digoxin',
      'ديجوكسين': 'digoxin',

      'amiodarone': 'amiodarone',
      'اميودارون': 'amiodarone',

      'sotalol': 'sotalol',
      'سوتالول': 'sotalol',

      'verapamil': 'verapamil',
      'فيراباميل': 'verapamil',

      'diltiazem': 'diltiazem',
      'ديلتيازيم': 'diltiazem',

      'metoprolol': 'metoprolol',
      'ميتوبرولول': 'metoprolol',

      'propranolol': 'propranolol',
      'بروبرانولول': 'propranolol',

      /* diabetes */
      'metformin': 'metformin',
      'ميتفورمين': 'metformin',

      'glibenclamide': 'glyburide',
      'glyburide': 'glyburide',
      'جليبنكلاميد': 'glyburide',

      'glimepiride': 'glimepiride',
      'جليميبرايد': 'glimepiride',

      'insulin': 'insulin',
      'انسولين': 'insulin',

      /* GI */
      'omeprazole': 'omeprazole',
      'اوميبرازول': 'omeprazole',

      'esomeprazole': 'esomeprazole',
      'ايسوميبرازول': 'esomeprazole',

      'pantoprazole': 'pantoprazole',
      'بانتوبرازول': 'pantoprazole',

      /* lipid */
      'simvastatin': 'simvastatin',
      'سيمفاستاتين': 'simvastatin',

      'atorvastatin': 'atorvastatin',
      'اتورفاستاتين': 'atorvastatin',

      'rosuvastatin': 'rosuvastatin',
      'روسوفاستاتين': 'rosuvastatin'
    };

    return aliases[n] || n;
  }

  function medicationName(med) {
    if (med === null || med === undefined) return '';

    if (typeof med === 'string') return med;

    return (
      med.genericName ||
      med.generic ||
      med.activeIngredient ||
      med.name ||
      med.drugName ||
      med.medication ||
      ''
    );
  }

  function getDrug(med) {
    return canonical(medicationName(med));
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const n = Number(
      String(value)
        .replace(/,/g, '')
        .replace(/[٠-٩]/g, d => ARABIC_DIGITS[d])
    );

    return Number.isFinite(n) ? n : null;
  }

  function numberFromObject(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;

    for (const key of keys) {
      const n = toNumber(obj[key]);
      if (n !== null) return n;
    }

    return null;
  }

  function normalizeMeds(meds) {
    if (!Array.isArray(meds)) return [];

    return meds
      .filter(Boolean)
      .map((med, index) => {
        const rawName = medicationName(med);
        const drug = canonical(rawName);

        return {
          ...(
            typeof med === 'object'
              ? med
              : { name: med }
          ),
          _index: index,
          _rawName: rawName,
          _drug: drug
        };
      })
      .filter(m => m._drug);
  }

  /* ==========================================================
     2. FINDING FACTORY
     ========================================================== */

  function finding({
    severity = 'info',
    category = 'general',
    title = '',
    message = '',
    action = '',
    drugs = [],
    source = null,
    evidence = ''
  }) {
    return {
      severity,
      category,
      title,
      message,
      action,
      drugs: Array.isArray(drugs) ? drugs : [],
      source,
      evidence,
      timestamp: new Date().toISOString()
    };
  }

  function uniqueFindings(findings) {
    const seen = new Set();

    return findings.filter(item => {
      const key = [
        item.category,
        item.severity,
        item.title,
        item.message,
        ...(item.drugs || []).map(canonical).sort()
      ].join('|');

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }

  /* ==========================================================
     3. DRUG–DRUG INTERACTIONS
     ========================================================== */

  const INTERACTIONS = [
    {
      drugs: ['warfarin', 'trimethoprim'],
      severity: 'high',
      title: 'Warfarin + Trimethoprim',
      message:
        'قد يزداد خطر النزيف وارتفاع تأثير الوارفارين مع هذا الجمع.',
      action:
        'مراجعة INR والتداخل الدوائي والجرعات وفق النشرة/البروتوكول المحلي.',
      source: SOURCES.DAILYMED,
      evidence: 'Product labeling / established anticoagulant interaction'
    },
    {
      drugs: ['warfarin', 'metronidazole'],
      severity: 'high',
      title: 'Warfarin + Metronidazole',
      message:
        'قد يزداد تأثير الوارفارين وخطر النزيف.',
      action:
        'مراجعة INR والمتابعة السريرية وتقييم الحاجة للجمع.',
      source: SOURCES.DAILYMED,
      evidence: 'Product labeling'
    },
    {
      drugs: ['warfarin', 'ibuprofen'],
      severity: 'high',
      title: 'Warfarin + NSAID',
      message:
        'يزداد خطر النزيف مع الجمع بين مضاد التخثر ومضاد الالتهاب غير الستيرويدي.',
      action:
        'تجنب الجمع قدر الإمكان أو استخدم بديلًا مناسبًا مع تقييم خطر النزيف.',
      source: SOURCES.DAILYMED,
      evidence: 'Anticoagulant/NSAID bleeding risk'
    },
    {
      drugs: ['warfarin', 'naproxen'],
      severity: 'high',
      title: 'Warfarin + Naproxen',
      message:
        'قد يرتفع خطر النزيف الهضمي وغيره.',
      action:
        'مراجعة ضرورة الجمع وخطر النزيف.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['warfarin', 'diclofenac'],
      severity: 'high',
      title: 'Warfarin + Diclofenac',
      message:
        'قد يزداد خطر النزيف عند الجمع.',
      action:
        'تجنب الجمع متى أمكن ومراجعة البدائل.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['warfarin', 'aspirin'],
      severity: 'high',
      title: 'Warfarin + Aspirin',
      message:
        'الجمع قد يزيد خطر النزيف.',
      action:
        'التأكد من وجود استطباب واضح للجمع ومراقبة المريض.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['apixaban', 'ibuprofen'],
      severity: 'high',
      title: 'Apixaban + NSAID',
      message:
        'قد يزيد الجمع خطر النزيف.',
      action:
        'تقييم الحاجة إلى NSAID والبحث عن بديل أكثر أمانًا.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['rivaroxaban', 'ibuprofen'],
      severity: 'high',
      title: 'Rivaroxaban + NSAID',
      message:
        'قد يزيد الجمع خطر النزيف.',
      action:
        'تقييم الحاجة للجمع وخطر النزيف.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['dabigatran', 'ibuprofen'],
      severity: 'high',
      title: 'Dabigatran + NSAID',
      message:
        'قد يزيد خطر النزيف.',
      action:
        'تقييم البدائل ومخاطر النزيف.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['clopidogrel', 'omeprazole'],
      severity: 'moderate',
      title: 'Clopidogrel + Omeprazole',
      message:
        'قد يؤدي تثبيط CYP2C19 إلى تقليل تكوين المستقلب الفعال لكلوبيدوغريل.',
      action:
        'مراجعة الحاجة إلى أوميبرازول والنظر في بديل مناسب وفق النشرة.',
      source: SOURCES.DAILYMED,
      evidence: 'Clopidogrel labeling'
    },
    {
      drugs: ['clopidogrel', 'esomeprazole'],
      severity: 'moderate',
      title: 'Clopidogrel + Esomeprazole',
      message:
        'قد يحدث تداخل دوائي يؤثر في تنشيط كلوبيدوغريل.',
      action:
        'مراجعة بدائل مثبط مضخة البروتون عند الحاجة.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['simvastatin', 'clarithromycin'],
      severity: 'critical',
      title: 'Simvastatin + Clarithromycin',
      message:
        'تثبيط CYP3A4 قد يؤدي إلى ارتفاع التعرض للسيمفاستاتين وخطر اعتلال العضلات/انحلال الربيدات.',
      action:
        'تجنب الجمع وفق النشرة الحالية أو اتبع بروتوكولًا معتمدًا.',
      source: SOURCES.DAILYMED,
      evidence: 'Simvastatin labeling'
    },
    {
      drugs: ['simvastatin', 'erythromycin'],
      severity: 'critical',
      title: 'Simvastatin + Erythromycin',
      message:
        'قد يرتفع التعرض للسيمفاستاتين وخطر السمية العضلية.',
      action:
        'تجنب الجمع وفق النشرة أو راجع بديلًا مناسبًا.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['simvastatin', 'itraconazole'],
      severity: 'critical',
      title: 'Simvastatin + Itraconazole',
      message:
        'قد يؤدي التداخل إلى ارتفاع كبير في التعرض للسيمفاستاتين.',
      action:
        'يجب تجنب الجمع وفق معلومات المنتج.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['digoxin', 'amiodarone'],
      severity: 'high',
      title: 'Digoxin + Amiodarone',
      message:
        'قد ترتفع تراكيز الديجوكسين مع الأميودارون، مع خطر السمية.',
      action:
        'مراجعة الجرعة والمراقبة السريرية ومستوى الدواء عند الحاجة.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['digoxin', 'verapamil'],
      severity: 'high',
      title: 'Digoxin + Verapamil',
      message:
        'قد ترتفع مستويات الديجوكسين وقد يزيد خطر بطء القلب/السمية.',
      action:
        'مراجعة الجرعات ومراقبة النبض ومستوى الديجوكسين حسب الحالة.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['digoxin', 'diltiazem'],
      severity: 'moderate',
      title: 'Digoxin + Diltiazem',
      message:
        'قد يرتفع التعرض للديجوكسين مع زيادة خطر السمية.',
      action:
        'مراقبة الاستجابة والمستوى عند الحاجة.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['amiodarone', 'sotalol'],
      severity: 'critical',
      title: 'Amiodarone + Sotalol',
      message:
        'كلا الدواءين قد يطيل QT، وقد يزيد الجمع خطر اضطراب النظم البطيني.',
      action:
        'تجنب الجمع عادةً إلا تحت إشراف اختصاصي وبروتوكول واضح.',
      source: SOURCES.CREDIBLEMEDS
    },
    {
      drugs: ['amiodarone', 'moxifloxacin'],
      severity: 'high',
      title: 'Amiodarone + Moxifloxacin',
      message:
        'قد يزداد خطر إطالة QT واضطراب النظم.',
      action:
        'مراجعة البديل ومخاطر QT وتصحيح الشوارد.',
      source: SOURCES.CREDIBLEMEDS
    },
    {
      drugs: ['citalopram', 'amiodarone'],
      severity: 'high',
      title: 'Citalopram + Amiodarone',
      message:
        'قد يزيد الجمع خطر إطالة QT.',
      action:
        'مراجعة الأدوية وعوامل خطر QT والتخطيط عند الحاجة.',
      source: SOURCES.CREDIBLEMEDS
    },
    {
      drugs: ['escitalopram', 'amiodarone'],
      severity: 'high',
      title: 'Escitalopram + Amiodarone',
      message:
        'قد يزيد الجمع خطر إطالة QT.',
      action:
        'مراجعة البدائل ومخاطر QT.',
      source: SOURCES.CREDIBLEMEDS
    },
    {
      drugs: ['tramadol', 'sertraline'],
      severity: 'high',
      title: 'Tramadol + Sertraline',
      message:
        'قد يزيد الجمع خطر متلازمة السيروتونين والتشنجات.',
      action:
        'مراجعة الحاجة للجمع ومراقبة أعراض السمية السيروتونينية.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['tramadol', 'fluoxetine'],
      severity: 'high',
      title: 'Tramadol + Fluoxetine',
      message:
        'قد يزيد الجمع خطر متلازمة السيروتونين والتشنجات، وقد يؤثر فلوكسيتين في استقلاب ترامادول.',
      action:
        'مراجعة البديل ومراقبة المريض بعناية.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['tramadol', 'paroxetine'],
      severity: 'high',
      title: 'Tramadol + Paroxetine',
      message:
        'قد يزيد خطر متلازمة السيروتونين والتشنجات مع احتمال تقليل فعالية ترامادول.',
      action:
        'مراجعة الحاجة للجمع واختيار بديل عند الإمكان.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['tramadol', 'venlafaxine'],
      severity: 'high',
      title: 'Tramadol + Venlafaxine',
      message:
        'قد يزيد خطر متلازمة السيروتونين والتشنجات.',
      action:
        'مراجعة العلاج ومراقبة أعراض السمية السيروتونينية.',
      source: SOURCES.DAILYMED
    },
    {
      drugs: ['opioid', 'benzodiazepine'],
      severity: 'critical',
      title: 'Opioid + Benzodiazepine',
      message:
        'الجمع بين الأفيونات والبنزوديازيبينات قد يسبب تثبيطًا تنفسيًا ونعاسًا شديدًا وزيادة خطر الوفاة.',
      action:
        'تجنب الجمع قدر الإمكان، وإن كان ضروريًا فلابد من تقييم ومراقبة دقيقة.',
      source: SOURCES.FDA
    }
  ];

  /* ==========================================================
     4. INTERACTION GROUPS
     ========================================================== */

  const GROUPS = {
    opioids: new Set([
      'tramadol',
      'codeine',
      'morphine',
      'oxycodone',
      'fentanyl'
    ]),

    benzodiazepines: new Set([
      'diazepam',
      'lorazepam',
      'alprazolam',
      'clonazepam'
    ]),

    nsaids: new Set([
      'ibuprofen',
      'naproxen',
      'diclofenac',
      'ketorolac'
    ]),

    anticoagulants: new Set([
      'warfarin',
      'apixaban',
      'rivaroxaban',
      'dabigatran',
      'heparin',
      'enoxaparin'
    ]),

    antiplatelets: new Set([
      'aspirin',
      'clopidogrel'
    ]),

    serotonergic: new Set([
      'tramadol',
      'fluoxetine',
      'sertraline',
      'citalopram',
      'escitalopram',
      'paroxetine',
      'venlafaxine',
      'duloxetine',
      'amitriptyline',
      'mirtazapine'
    ]),

    qtRisk: new Set([
      'amiodarone',
      'sotalol',
      'moxifloxacin',
      'ciprofloxacin',
      'citalopram',
      'escitalopram',
      'azithromycin',
      'clarithromycin',
      'erythromycin'
    ]),

    acei: new Set([
      'lisinopril',
      'enalapril'
    ]),

    arb: new Set([
      'losartan',
      'valsartan',
      'telmisartan',
      'candesartan'
    ]),

    potassiumRaising: new Set([
      'lisinopril',
      'enalapril',
      'losartan',
      'valsartan',
      'telmisartan',
      'candesartan',
      'spironolactone'
    ]),

    nephrotoxicRisk: new Set([
      'ibuprofen',
      'naproxen',
      'diclofenac',
      'ketorolac'
    ])
  };

  /* ==========================================================
     5. INTERACTION ENGINE
     ========================================================== */

  function pairKey(a, b) {
    return [canonical(a), canonical(b)].sort().join('|');
  }

  function interactionRuleMap() {
    const map = new Map();

    for (const rule of INTERACTIONS) {
      if (!rule.drugs || rule.drugs.length !== 2) continue;

      map.set(
        pairKey(rule.drugs[0], rule.drugs[1]),
        rule
      );
    }

    return map;
  }

  const INTERACTION_MAP = interactionRuleMap();

  function interactions(meds) {
    const list = normalizeMeds(meds);
    const results = [];

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];

        const exact = INTERACTION_MAP.get(
          pairKey(a._drug, b._drug)
        );

        if (exact) {
          results.push(
            finding({
              severity: exact.severity,
              category: 'drug-drug',
              title: exact.title,
              message: exact.message,
              action: exact.action,
              drugs: [a._rawName, b._rawName],
              source: exact.source,
              evidence: exact.evidence || ''
            })
          );
        }

        /* Opioid + benzodiazepine */
        if (
          (GROUPS.opioids.has(a._drug) &&
            GROUPS.benzodiazepines.has(b._drug)) ||
          (GROUPS.opioids.has(b._drug) &&
            GROUPS.benzodiazepines.has(a._drug))
        ) {
          results.push(
            finding({
              severity: 'critical',
              category: 'drug-drug',
              title: 'Opioid + Benzodiazepine',
              message:
                'الجمع بين الأفيونات والبنزوديازيبينات قد يسبب تثبيطًا تنفسيًا ونعاسًا شديدًا.',
              action:
                'تجنب الجمع قدر الإمكان أو استخدمه فقط بعد تقييم سريري ومراقبة مناسبة.',
              drugs: [a._rawName, b._rawName],
              source: SOURCES.FDA,
              evidence:
                'FDA opioid/benzodiazepine safety communication'
            })
          );
        }

        /* Anticoagulant + NSAID */
        if (
          (GROUPS.anticoagulants.has(a._drug) &&
            GROUPS.nsaids.has(b._drug)) ||
          (GROUPS.anticoagulants.has(b._drug) &&
            GROUPS.nsaids.has(a._drug))
        ) {
          results.push(
            finding({
              severity: 'high',
              category: 'bleeding',
              title: 'Anticoagulant + NSAID',
              message:
                'الجمع قد يزيد خطر النزيف، خصوصًا النزيف الهضمي.',
              action:
                'تقييم الحاجة إلى NSAID واختيار بديل عند الإمكان.',
              drugs: [a._rawName, b._rawName],
              source: SOURCES.DAILYMED
            })
          );
        }

        /* Anticoagulant + antiplatelet */
        if (
          (GROUPS.anticoagulants.has(a._drug) &&
            GROUPS.antiplatelets.has(b._drug)) ||
          (GROUPS.anticoagulants.has(b._drug) &&
            GROUPS.antiplatelets.has(a._drug))
        ) {
          results.push(
            finding({
              severity: 'high',
              category: 'bleeding',
              title: 'Anticoagulant + Antiplatelet',
              message:
                'الجمع بين مضاد التخثر ومضاد الصفيحات قد يرفع خطر النزيف.',
              action:
                'التأكد من وجود استطباب واضح ومراجعة مدة العلاج.',
              drugs: [a._rawName, b._rawName],
              source: SOURCES.DAILYMED
            })
          );
        }

        /* Serotonergic combination */
        if (
          GROUPS.serotonergic.has(a._drug) &&
          GROUPS.serotonergic.has(b._drug) &&
          (a._drug === 'tramadol' || b._drug === 'tramadol')
        ) {
          results.push(
            finding({
              severity: 'high',
              category: 'serotonin',
              title: 'Serotonergic Combination',
              message:
                'وجود ترامادول مع دواء سيروتونيني قد يزيد خطر متلازمة السيروتونين.',
              action:
                'مراجعة ضرورة الجمع ومراقبة الهياج، التعرق، الرجفان، فرط المنعكسات والحمى.',
              drugs: [a._rawName, b._rawName],
              source: SOURCES.DAILYMED
            })
          );
        }

        /* QT combination */
        if (
          GROUPS.qtRisk.has(a._drug) &&
          GROUPS.qtRisk.has(b._drug)
        ) {
          results.push(
            finding({
              severity: 'high',
              category: 'qt',
              title: 'Multiple QT-Risk Medicines',
              message:
                'وجود دواءين قد يطيلان QT قد يزيد خطر اضطراب النظم البطيني.',
              action:
                'مراجعة عوامل خطر QT والشوارد والأدوية البديلة، والنظر في ECG عند الحاجة.',
              drugs: [a._rawName, b._rawName],
              source: SOURCES.CREDIBLEMEDS
            })
          );
        }

        /* ACEI/ARB + spironolactone */
        if (
          (
            (GROUPS.acei.has(a._drug) || GROUPS.arb.has(a._drug)) &&
            b._drug === 'spironolactone'
          ) ||
          (
            (GROUPS.acei.has(b._drug) || GROUPS.arb.has(b._drug)) &&
            a._drug === 'spironolactone'
          )
        ) {
          results.push(
            finding({
              severity: 'high',
              category: 'potassium',
              title: 'RAAS Inhibitor + Spironolactone',
              message:
                'الجمع قد يزيد خطر فرط بوتاسيوم الدم وتدهور وظائف الكلى.',
              action:
                'مراجعة البوتاسيوم ووظائف الكلى ومراقبة المريض وفق البروتوكول.',
              drugs: [a._rawName, b._rawName],
              source: SOURCES.KDIGO
            })
          );
        }
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     6. DUPLICATE THERAPY
     ========================================================== */

  const THERAPEUTIC_CLASSES = {
    nsaid: new Set([
      'ibuprofen',
      'naproxen',
      'diclofenac',
      'ketorolac'
    ]),

    acei: new Set([
      'lisinopril',
      'enalapril'
    ]),

    arb: new Set([
      'losartan',
      'valsartan',
      'telmisartan',
      'candesartan'
    ]),

    ssri: new Set([
      'fluoxetine',
      'sertraline',
      'citalopram',
      'escitalopram',
      'paroxetine'
    ]),

    opioid: new Set([
      'tramadol',
      'codeine',
      'morphine',
      'oxycodone',
      'fentanyl'
    ]),

    ppi: new Set([
      'omeprazole',
      'esomeprazole',
      'pantoprazole'
    ]),

    statin: new Set([
      'simvastatin',
      'atorvastatin',
      'rosuvastatin'
    ])
  };

  function duplicates(meds) {
    const list = normalizeMeds(meds);
    const results = [];

    /* Exact duplicate active ingredient */
    const byDrug = new Map();

    for (const med of list) {
      if (!byDrug.has(med._drug)) {
        byDrug.set(med._drug, []);
      }

      byDrug.get(med._drug).push(med);
    }

    for (const [drug, items] of byDrug.entries()) {
      if (items.length > 1) {
        results.push(
          finding({
            severity: 'high',
            category: 'duplicate',
            title: 'Duplicate Active Ingredient',
            message:
              `تم العثور على تكرار للمادة الفعالة: ${drug}.`,
            action:
              'تحقق من أن التكرار مقصود وليس نتيجة تكرار الوصفة أو اختلاف الاسم التجاري.',
            drugs: items.map(x => x._rawName),
            source: SOURCES.DAILYMED
          })
        );
      }
    }

    /* Same therapeutic class */
    for (const [className, members] of Object.entries(
      THERAPEUTIC_CLASSES
    )) {
      const matches = list.filter(m => members.has(m._drug));

      if (matches.length > 1) {
        results.push(
          finding({
            severity: className === 'nsaid' ? 'high' : 'moderate',
            category: 'duplicate-therapy',
            title: `Duplicate Therapy: ${className}`,
            message:
              `يوجد أكثر من دواء من نفس الفئة العلاجية (${className}).`,
            action:
              'راجع وجود استطباب واضح للجمع وتجنب التكرار غير المقصود.',
            drugs: matches.map(x => x._rawName),
            source: SOURCES.DAILYMED
          })
        );
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     7. ALLERGY
     ========================================================== */

  /*
   * Allergy cross-reactivity is intentionally conservative.
   * Do NOT assume all drugs in a broad class are cross-reactive.
   */

  const ALLERGY_RULES = [
    {
      allergen: 'penicillin',
      drugs: new Set([
        'penicillin',
        'amoxicillin',
        'ampicillin'
      ]),
      severity: 'critical',
      title: 'Penicillin Allergy',
      message:
        'يوجد دواء من البنسلين لدى مريض لديه حساسية مسجلة للبنسلين.',
      action:
        'تحقق من نوع وشدة التفاعل التحسسي وتجنب إعادة التعرض في الحساسية الفورية الشديدة.'
    },
    {
      allergen: 'amoxicillin',
      drugs: new Set([
        'amoxicillin'
      ]),
      severity: 'critical',
      title: 'Amoxicillin Allergy',
      message:
        'المريض لديه حساسية مسجلة للأموكسيسيلين.',
      action:
        'تجنب الدواء حتى يتم تقييم الحساسية سريريًا.'
    },
    {
      allergen: 'ampicillin',
      drugs: new Set([
        'ampicillin'
      ]),
      severity: 'critical',
      title: 'Ampicillin Allergy',
      message:
        'المريض لديه حساسية مسجلة للأمبيسيلين.',
      action:
        'تجنب الدواء حتى يتم تقييم الحساسية.'
    },
    {
      allergen: 'sulfonamide antibiotic',
      drugs: new Set([
        'sulfamethoxazole'
      ]),
      severity: 'high',
      title: 'Sulfonamide Antibiotic Allergy',
      message:
        'المريض لديه حساسية مسجلة من سلفوناميد مضاد للجراثيم.',
      action:
        'تحقق من الدواء ونوع الحساسية قبل الاستخدام.'
    }
  ];

  function normalizeAllergies(allergies) {
    if (!Array.isArray(allergies)) return [];

    return allergies
      .map(a => {
        if (typeof a === 'string') return a;

        return (
          a.name ||
          a.allergen ||
          a.drug ||
          a.substance ||
          ''
        );
      })
      .filter(Boolean);
  }

  function allergy(meds, allergies) {
    const list = normalizeMeds(meds);
    const allergyList = normalizeAllergies(allergies)
      .map(canonical);

    const results = [];

    for (const med of list) {
      for (const allergen of allergyList) {
        /* Exact active ingredient allergy */
        if (med._drug === allergen) {
          results.push(
            finding({
              severity: 'critical',
              category: 'allergy',
              title: 'Known Drug Allergy',
              message:
                `المريض لديه حساسية مسجلة تجاه ${med._rawName}.`,
              action:
                'لا تستخدم الدواء قبل تقييم الحساسية والتأكد من البديل المناسب.',
              drugs: [med._rawName],
              source: SOURCES.DAILYMED
            })
          );

          continue;
        }

        /* Specific conservative cross-reactivity rules */
        for (const rule of ALLERGY_RULES) {
          if (
            canonical(rule.allergen) === allergen &&
            rule.drugs.has(med._drug)
          ) {
            results.push(
              finding({
                severity: rule.severity,
                category: 'allergy',
                title: rule.title,
                message: rule.message,
                action: rule.action,
                drugs: [med._rawName],
                source: SOURCES.DAILYMED
              })
            );
          }
        }
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     8. PREGNANCY
     ========================================================== */

  /*
   * We intentionally use "review" language rather than the old
   * FDA A/B/C/D/X categories.
   */

  const PREGNANCY_REVIEW = {
    'lisinopril': {
      severity: 'high',
      message:
        'مثبطات ACE مرتبطة بمخاطر جنينية، خصوصًا في الثلثين الثاني والثالث.',
      action:
        'مراجعة العلاج فورًا مع الطبيب واختيار بديل مناسب للحمل عند الحاجة.',
      source: SOURCES.FDA_PLR
    },

    'enalapril': {
      severity: 'high',
      message:
        'مثبطات ACE قد تسبب أذى جنينيًا/وليديًا، ويزداد القلق مع تقدم الحمل.',
      action:
        'مراجعة العلاج مع الطبيب وعدم الاستمرار دون تقييم.',
      source: SOURCES.FDA_PLR
    },

    'losartan': {
      severity: 'high',
      message:
        'حاصرات مستقبل الأنجيوتنسين مرتبطة بمخاطر جنينية، خاصة في الثلثين الثاني والثالث.',
      action:
        'مراجعة العلاج واختيار بديل مناسب للحمل.',
      source: SOURCES.FDA_PLR
    },

    'valsartan': {
      severity: 'high',
      message:
        'ARB قد يسبب أذى جنينيًا/وليديًا، خصوصًا مع استمرار التعرض أثناء الحمل.',
      action:
        'مراجعة العلاج مع الطبيب.',
      source: SOURCES.FDA_PLR
    },

    'telmisartan': {
      severity: 'high',
      message:
        'ARB مرتبط بمخاطر جنينية.',
      action:
        'مراجعة العلاج والبديل المناسب.',
      source: SOURCES.FDA_PLR
    },

    'candesartan': {
      severity: 'high',
      message:
        'ARB مرتبط بمخاطر جنينية.',
      action:
        'مراجعة العلاج والبديل المناسب.',
      source: SOURCES.FDA_PLR
    },

    'warfarin': {
      severity: 'high',
      message:
        'الوارفارين يرتبط بمخاطر جنينية ونزف جنيني/مشيمي في ظروف معينة.',
      action:
        'يتطلب تقييمًا متخصصًا لموازنة خطر الأم والجنين.',
      source: SOURCES.FDA_PLR
    },

    'valproate': {
      severity: 'high',
      message:
        'فالبروات مرتبط بمخاطر مهمة على الجنين، بما فيها التشوهات ومخاطر النمو العصبي.',
      action:
        'يجب إجراء مراجعة متخصصة للعلاج قبل الاستمرار أو التغيير.',
      source: SOURCES.FDA_PLR
    },

    'methotrexate': {
      severity: 'critical',
      message:
        'الميثوتركسات دواء ذو مخاطر جنينية مهمة ويحتاج إلى تقييم متخصص.',
      action:
        'أوقف أي قرار علاجي ذاتي واطلب تقييمًا طبيًا متخصصًا.',
      source: SOURCES.FDA_PLR
    },

    'isotretinoin': {
      severity: 'critical',
      message:
        'الإيزوتريتينوين شديد الخطورة على الجنين.',
      action:
        'يجب التعامل معه وفق برنامج وإرشادات منع الحمل والمراقبة المعتمدة.',
      source: SOURCES.FDA_PLR
    },

    'spironolactone': {
      severity: 'moderate',
      message:
        'هناك اعتبارات خاصة لاستخدام سبيرونولاكتون أثناء الحمل.',
      action:
        'مراجعة الاستطباب والبدائل مع الطبيب.',
      source: SOURCES.FDA_PLR
    },

    'doxycycline': {
      severity: 'moderate',
      message:
        'استخدام التتراسيكلينات أثناء الحمل يحتاج إلى تقييم خاص حسب مرحلة الحمل والاستطباب.',
      action:
        'مراجعة البدائل ومرحلة الحمل مع الطبيب.',
      source: SOURCES.FDA_PLR
    },

    'tetracycline': {
      severity: 'moderate',
      message:
        'التتراسيكلينات تحتاج إلى تقييم خاص أثناء الحمل.',
      action:
        'مراجعة البدائل ومرحلة الحمل.',
      source: SOURCES.FDA_PLR
    }
  };

  function pregnancy(meds, patient = {}) {
    const list = normalizeMeds(meds);
    const pregnant =
      patient.pregnant === true ||
      patient.isPregnant === true ||
      patient.pregnancy === true;

    if (!pregnant) return [];

    const trimester =
      patient.trimester ??
      patient.pregnancyTrimester ??
      null;

    const results = [];

    for (const med of list) {
      const rule = PREGNANCY_REVIEW[med._drug];

      if (!rule) continue;

      let message = rule.message;

      if (trimester !== null && trimester !== undefined) {
        message += ` مرحلة الحمل المسجلة: ${trimester}.`;
      }

      results.push(
        finding({
          severity: rule.severity,
          category: 'pregnancy',
          title: `Pregnancy Review: ${med._rawName}`,
          message,
          action: rule.action,
          drugs: [med._rawName],
          source: rule.source
        })
      );
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     9. BREASTFEEDING
     ========================================================== */

  const LACTATION_REVIEW = new Set([
    'warfarin',
    'amiodarone',
    'diazepam',
    'codeine',
    'tramadol',
    'morphine',
    'oxycodone',
    'fentanyl',
    'fluoxetine',
    'lithium',
    'methotrexate'
  ]);

  function breastfeeding(meds, patient = {}) {
    const lactating =
      patient.breastfeeding === true ||
      patient.isBreastfeeding === true ||
      patient.lactating === true;

    if (!lactating) return [];

    const list = normalizeMeds(meds);
    const results = [];

    for (const med of list) {
      if (!LACTATION_REVIEW.has(med._drug)) continue;

      results.push(
        finding({
          severity: 'moderate',
          category: 'breastfeeding',
          title: `Breastfeeding Review: ${med._rawName}`,
          message:
            'هذا الدواء يحتاج إلى مراجعة معلومات الرضاعة الطبيعية قبل الاستخدام أو الاستمرار.',
          action:
            'راجع LactMed ومعلومات المنتج الحالية، مع مراعاة عمر الرضيع وجرعة الأم.',
          drugs: [med._rawName],
          source: SOURCES.LACTMED,
          evidence: 'NIH LactMed review recommended'
        })
      );
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     10. RENAL FUNCTION
     ========================================================== */

  const RENAL_RULES = {
    'metformin': {
      thresholds: [
        {
          max: 30,
          severity: 'high',
          message:
            'وظيفة الكلى المسجلة منخفضة جدًا لاستخدام الميتفورمين وفق الإرشادات الشائعة.',
          action:
            'تحقق من eGFR الحالي والنشرة المحلية قبل الاستمرار.'
        },
        {
          max: 45,
          severity: 'moderate',
          message:
            'انخفاض eGFR قد يتطلب مراجعة استخدام وجرعة الميتفورمين.',
          action:
            'راجع eGFR ومعلومات المنتج الحالية.'
        }
      ]
    },

    'enoxaparin': {
      thresholds: [
        {
          max: 30,
          severity: 'high',
          message:
            'القصور الكلوي الشديد قد يؤدي إلى تراكم الإينوكسابارين.',
          action:
            'تحقق من الجرعة المناسبة حسب الاستطباب ووظيفة الكلى.'
        }
      ]
    },

    'gabapentin': {
      thresholds: [
        {
          max: 60,
          severity: 'moderate',
          message:
            'جابابنتين يُطرح كلويًا وقد يحتاج إلى تعديل الجرعة مع انخفاض eGFR/CrCl.',
          action:
            'راجع الجرعة وفق وظيفة الكلى والاستطباب.'
        }
      ]
    },

    'pregabalin': {
      thresholds: [
        {
          max: 60,
          severity: 'moderate',
          message:
            'بريجابالين يحتاج عادةً إلى تعديل الجرعة مع انخفاض وظيفة الكلى.',
          action:
            'راجع الجرعة وفق CrCl/eGFR.'
        }
      ]
    },

    'digoxin': {
      thresholds: [
        {
          max: 60,
          severity: 'moderate',
          message:
            'الديجوكسين يتطلب حذرًا خاصًا مع القصور الكلوي بسبب خطر التراكم والسمية.',
          action:
            'راجع الجرعة ومستوى الدواء ووظائف الكلى.'
        }
      ]
    }
  };

  function getEGFR(patient) {
    return numberFromObject(patient, [
      'eGFR',
      'egfr',
      'estimatedGFR',
      'estimatedGlomerularFiltrationRate'
    ]);
  }

  function renal(meds, patient = {}) {
    const egfr = getEGFR(patient);

    if (egfr === null) return [];

    const list = normalizeMeds(meds);
    const results = [];

    for (const med of list) {
      const rule = RENAL_RULES[med._drug];

      if (!rule) continue;

      for (const threshold of rule.thresholds) {
        if (egfr <= threshold.max) {
          results.push(
            finding({
              severity: threshold.severity,
              category: 'renal',
              title: `Renal Review: ${med._rawName}`,
              message:
                `${threshold.message} eGFR المسجل: ${egfr} mL/min/1.73m².`,
              action: threshold.action,
              drugs: [med._rawName],
              source: SOURCES.KDIGO
            })
          );

          break;
        }
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     11. HEPATIC REVIEW
     ========================================================== */

  const HEPATIC_RISK = new Set([
    'acetaminophen',
    'paracetamol',
    'amiodarone',
    'simvastatin',
    'atorvastatin',
    'rosuvastatin',
    'warfarin',
    'valproate',
    'methotrexate'
  ]);

  function hepatic(meds, patient = {}) {
    const hasLiverDisease =
      patient.liverDisease === true ||
      patient.hepaticImpairment === true ||
      patient.cirrhosis === true ||
      patient.chronicLiverDisease === true;

    if (!hasLiverDisease) return [];

    const list = normalizeMeds(meds);
    const results = [];

    for (const med of list) {
      if (!HEPATIC_RISK.has(med._drug)) continue;

      results.push(
        finding({
          severity: 'moderate',
          category: 'hepatic',
          title: `Hepatic Review: ${med._rawName}`,
          message:
            'وجود مرض كبدي مسجل يستدعي مراجعة ملاءمة الدواء والجرعة ووظائف الكبد.',
          action:
            'راجع النشرة الحالية ووظائف الكبد والاستطباب قبل اعتماد العلاج.',
          drugs: [med._rawName],
          source: SOURCES.DAILYMED
        })
      );
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     12. QT / ECG
     ========================================================== */

  function qtRisk(meds, patient = {}) {
    const list = normalizeMeds(meds);
    const results = [];

    const qtMeds = list.filter(m => GROUPS.qtRisk.has(m._drug));

    if (qtMeds.length >= 2) {
      results.push(
        finding({
          severity: 'high',
          category: 'qt',
          title: 'Multiple QT-Risk Medicines',
          message:
            'يوجد أكثر من دواء ذي قابلية لإطالة QT ضمن قائمة العلاج.',
          action:
            'راجع الأدوية البديلة، ECG عند الحاجة، والبوتاسيوم والمغنيسيوم وعوامل الخطر الأخرى.',
          drugs: qtMeds.map(m => m._rawName),
          source: SOURCES.CREDIBLEMEDS
        })
      );
    }

    const qtc = numberFromObject(patient, [
      'QTc',
      'qtc',
      'QTcMs'
    ]);

    if (qtc !== null) {
      if (qtc >= 500) {
        results.push(
          finding({
            severity: 'high',
            category: 'qt',
            title: 'QTc ≥ 500 ms',
            message:
              `QTc المسجل ${qtc} ms، وهو مستوى يستدعي تقييمًا سريريًا لخطر اضطراب النظم.`,
            action:
              'راجع الأدوية المسببة لإطالة QT والشوارد والحالة السريرية بصورة عاجلة.',
            source: SOURCES.CREDIBLEMEDS
          })
        );
      } else if (qtc >= 450) {
        results.push(
          finding({
            severity: 'moderate',
            category: 'qt',
            title: 'Prolonged QTc Review',
            message:
              `QTc المسجل ${qtc} ms ويحتاج إلى وضعه ضمن السياق السريري وعوامل الخطر.`,
            action:
              'راجع الأدوية والشوارد وعوامل الخطر حسب الحالة.',
            source: SOURCES.CREDIBLEMEDS
          })
        );
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     13. DISEASE INTERACTIONS
     ========================================================== */

  function diseases(patient) {
    if (!patient || typeof patient !== 'object') return {};

    return {
      asthma:
        patient.asthma === true ||
        patient.hasAsthma === true,

      heartFailure:
        patient.heartFailure === true ||
        patient.hasHeartFailure === true,

      bradycardia:
        patient.bradycardia === true,

      hypotension:
        patient.hypotension === true,

      pepticUlcer:
        patient.pepticUlcer === true ||
        patient.pud === true,

      bleeding:
        patient.activeBleeding === true ||
        patient.bleedingDisorder === true,

      kidneyDisease:
        patient.kidneyDisease === true ||
        patient.renalDisease === true ||
        patient.ckd === true,

      liverDisease:
        patient.liverDisease === true ||
        patient.hepaticImpairment === true,

      epilepsy:
        patient.epilepsy === true ||
        patient.seizureDisorder === true,

      diabetes:
        patient.diabetes === true,

      hypertension:
        patient.hypertension === true
    };
  }

  function diseaseInteractions(meds, patient = {}) {
    const list = normalizeMeds(meds);
    const d = diseases(patient);
    const results = [];

    for (const med of list) {
      if (
        d.pepticUlcer &&
        GROUPS.nsaids.has(med._drug)
      ) {
        results.push(
          finding({
            severity: 'high',
            category: 'disease',
            title: 'NSAID + Peptic Ulcer Disease',
            message:
              'مضادات الالتهاب غير الستيرويدية قد تزيد خطر النزيف/تفاقم القرحة.',
            action:
              'راجع البدائل والحاجة إلى حماية المعدة وتقييم خطر النزيف.',
            drugs: [med._rawName],
            source: SOURCES.DAILYMED
          })
        );
      }

      if (
        d.activeBleeding &&
        (
          GROUPS.anticoagulants.has(med._drug) ||
          GROUPS.antiplatelets.has(med._drug)
        )
      ) {
        results.push(
          finding({
            severity: 'critical',
            category: 'disease',
            title: 'Antithrombotic + Active Bleeding',
            message:
              'وجود نزيف فعال مع دواء مضاد للتخثر/الصفيحات يحتاج إلى تقييم طبي عاجل.',
            action:
              'يجب تقييم النزيف والعلاج المضاد للتخثر بصورة عاجلة.',
            drugs: [med._rawName],
            source: SOURCES.DAILYMED
          })
        );
      }

      if (
        d.epilepsy &&
        med._drug === 'tramadol'
      ) {
        results.push(
          finding({
            severity: 'high',
            category: 'disease',
            title: 'Tramadol + Seizure Disorder',
            message:
              'ترامادول قد يزيد خطر التشنجات، خاصة لدى المرضى ذوي عوامل الخطر.',
            action:
              'راجع البدائل وخطر التشنجات.',
            drugs: [med._rawName],
            source: SOURCES.DAILYMED
          })
        );
      }

      if (
        d.heartFailure &&
        med._drug === 'ibuprofen'
      ) {
        results.push(
          finding({
            severity: 'moderate',
            category: 'disease',
            title: 'NSAID + Heart Failure',
            message:
              'NSAIDs قد تسبب احتباس السوائل وتفاقم قصور القلب لدى بعض المرضى.',
            action:
              'راجع الحاجة للدواء وراقب الحالة القلبية والكلوية.',
            drugs: [med._rawName],
            source: SOURCES.DAILYMED
          })
        );
      }

      if (
        d.kidneyDisease &&
        GROUPS.nsaids.has(med._drug)
      ) {
        results.push(
          finding({
            severity: 'high',
            category: 'disease',
            title: 'NSAID + Kidney Disease',
            message:
              'NSAIDs قد تؤدي إلى تدهور وظائف الكلى، خصوصًا لدى المرضى المعرضين للخطر.',
            action:
              'تجنب الاستخدام غير الضروري وراجع وظائف الكلى.',
            drugs: [med._rawName],
            source: SOURCES.KDIGO
          })
        );
      }

      if (
        d.asthma &&
        med._drug === 'ibuprofen'
      ) {
        results.push(
          finding({
            severity: 'moderate',
            category: 'disease',
            title: 'NSAID + Asthma',
            message:
              'بعض مرضى الربو قد يعانون من تفاقم الأعراض مع NSAIDs.',
            action:
              'تحقق من تاريخ تفاعل المريض مع NSAIDs.',
            drugs: [med._rawName],
            source: SOURCES.DAILYMED
          })
        );
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     14. AGE-RELATED RISK
     ========================================================== */

  function getAge(patient) {
    return numberFromObject(patient, [
      'age',
      'ageYears',
      'years'
    ]);
  }

  function ageRisk(meds, patient = {}) {
    const age = getAge(patient);

    if (age === null) return [];

    const list = normalizeMeds(meds);
    const results = [];

    if (age >= 65) {
      for (const med of list) {
        if (
          med._drug === 'diazepam' ||
          med._drug === 'alprazolam' ||
          med._drug === 'clonazepam' ||
          med._drug === 'lorazepam'
        ) {
          results.push(
            finding({
              severity: 'moderate',
              category: 'age',
              title: 'Older Adult + Benzodiazepine',
              message:
                'البنزوديازيبينات قد تزيد خطر السقوط والارتباك والنعاس لدى كبار السن.',
              action:
                'راجع الحاجة والجرعة والمدة ومخاطر السقوط.',
              drugs: [med._rawName],
              source: SOURCES.DAILYMED
            })
          );
        }

        if (med._drug === 'ketorolac') {
          results.push(
            finding({
              severity: 'high',
              category: 'age',
              title: 'Older Adult + Ketorolac',
              message:
                'كيتورولاك يحتاج إلى حذر شديد لدى كبار السن بسبب مخاطر النزيف والكلية.',
              action:
                'راجع الجرعة والمدة ووظائف الكلى وخطر النزيف.',
              drugs: [med._rawName],
              source: SOURCES.DAILYMED
            })
          );
        }
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     15. WEIGHT / DOSE / FREQUENCY / ROUTE
     ========================================================== */

  function doseChecks(meds, patient = {}) {
    const list = normalizeMeds(meds);
    const weight = numberFromObject(patient, [
      'weight',
      'weightKg',
      'bodyWeight'
    ]);

    const results = [];

    for (const med of list) {
      const dose = numberFromObject(med, [
        'dose',
        'doseMg',
        'amount'
      ]);

      const frequency =
        med.frequency ||
        med.freq ||
        med.dosingFrequency ||
        '';

      const route =
        med.route ||
        med.administrationRoute ||
        '';

      /* Missing essential prescription information */
      if (!dose && !med.doseText) {
        results.push(
          finding({
            severity: 'info',
            category: 'dose',
            title: `Dose Review: ${med._rawName}`,
            message:
              'لم يتم العثور على جرعة رقمية واضحة لهذا الدواء.',
            action:
              'تحقق من الجرعة والوحدة قبل اعتماد الوصفة.',
            drugs: [med._rawName],
            source: SOURCES.DAILYMED
          })
        );
      }

      if (!frequency) {
        results.push(
          finding({
            severity: 'info',
            category: 'dose',
            title: `Frequency Review: ${med._rawName}`,
            message:
              'لم يتم العثور على تكرار/جدول جرعات واضح.',
            action:
              'تحقق من frequency قبل اعتماد الوصفة.',
            drugs: [med._rawName],
            source: SOURCES.DAILYMED
          })
        );
      }

      if (!route) {
        results.push(
          finding({
            severity: 'info',
            category: 'dose',
            title: `Route Review: ${med._rawName}`,
            message:
              'لم يتم تحديد طريق إعطاء واضح.',
            action:
              'حدد route المناسب قبل اعتماد الوصفة.',
            drugs: [med._rawName],
            source: SOURCES.DAILYMED
          })
        );
      }

      if (
        med.weightBased === true &&
        weight === null
      ) {
        results.push(
          finding({
            severity: 'moderate',
            category: 'weight',
            title: `Weight Required: ${med._rawName}`,
            message:
              'الدواء موسوم بأنه يعتمد على الوزن، لكن وزن المريض غير متوفر.',
            action:
              'أدخل الوزن بالكيلوغرام قبل حساب/اعتماد الجرعة.',
            drugs: [med._rawName],
            source: SOURCES.DAILYMED
          })
        );
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     16. MAXIMUM DOSE PROMPTS
     ========================================================== */

  /*
   * These are deliberately prompts, not automatic prescribing rules.
   * Maximum dose can differ by indication, formulation, population and
   * local product label.
   */

  const MAX_DOSE_PROMPTS = {
    paracetamol: {
      maxMgPerDay: 4000,
      severity: 'high',
      message:
        'الجرعة اليومية الإجمالية من الباراسيتامول تحتاج إلى مراجعة مقابل الحد الأقصى المعتمد وحالة الكبد.',
      source: SOURCES.DAILYMED
    },

    ibuprofen: {
      maxMgPerDay: 3200,
      severity: 'moderate',
      message:
        'تحقق من إجمالي جرعة الإيبوبروفين اليومية وفق الاستطباب والعمر ووظائف الكلى.',
      source: SOURCES.DAILYMED
    }
  };

  function frequencyToPerDay(frequency) {
    if (!frequency) return null;

    const f = normalizeText(frequency);

    const numeric = f.match(
      /(?:x|times|مرات|مرة)\s*(\d+)/
    );

    if (numeric) {
      return Number(numeric[1]);
    }

    if (
      /once daily|once a day|qd|od|مره يوميا|مرة يوميا/.test(f)
    ) {
      return 1;
    }

    if (
      /twice daily|twice a day|bid|مرتين يوميا|مرتين يومياً/.test(f)
    ) {
      return 2;
    }

    if (
      /three times|tid|ثلاث مرات/.test(f)
    ) {
      return 3;
    }

    if (
      /four times|qid|اربع مرات|أربع مرات/.test(f)
    ) {
      return 4;
    }

    return null;
  }

  function maximumDose(meds) {
    const list = normalizeMeds(meds);
    const results = [];

    for (const med of list) {
      const rule = MAX_DOSE_PROMPTS[med._drug];

      if (!rule) continue;

      const dose = numberFromObject(med, [
        'doseMg',
        'dose',
        'amount'
      ]);

      const frequency = frequencyToPerDay(
        med.frequency ||
        med.freq ||
        med.dosingFrequency
      );

      if (
        dose !== null &&
        frequency !== null
      ) {
        const daily = dose * frequency;

        if (daily > rule.maxMgPerDay) {
          results.push(
            finding({
              severity: rule.severity,
              category: 'maximum-dose',
              title: `Possible Maximum Dose Exceeded: ${med._rawName}`,
              message:
                `${rule.message} الجرعة المحسوبة: ${daily} mg/day.`,
              action:
                'تحقق من الجرعة والوحدة والاستطباب والنشرة المحلية قبل اعتماد الوصفة.',
              drugs: [med._rawName],
              source: rule.source
            })
          );
        }
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     17. BLEEDING RISK
     ========================================================== */

  function bleedingRisk(meds, patient = {}) {
    const list = normalizeMeds(meds);
    const results = [];

    const antithrombotics = list.filter(
      m =>
        GROUPS.anticoagulants.has(m._drug) ||
        GROUPS.antiplatelets.has(m._drug)
    );

    const nsaids = list.filter(
      m => GROUPS.nsaids.has(m._drug)
    );

    if (
      antithrombotics.length >= 2
    ) {
      results.push(
        finding({
          severity: 'high',
          category: 'bleeding',
          title: 'Multiple Antithrombotic Medicines',
          message:
            'يوجد أكثر من دواء مضاد للتخثر/الصفيحات.',
          action:
            'تحقق من الاستطباب، الجرعات، المدة وخطر النزيف.',
          drugs: antithrombotics.map(m => m._rawName),
          source: SOURCES.DAILYMED
        })
      );
    }

    if (
      antithrombotics.length > 0 &&
      nsaids.length > 0
    ) {
      results.push(
        finding({
          severity: 'high',
          category: 'bleeding',
          title: 'Antithrombotic + NSAID',
          message:
            'وجود مضاد للتخثر/الصفيحات مع NSAID يزيد خطر النزيف.',
          action:
            'راجع الحاجة إلى NSAID والبدائل الممكنة.',
          drugs: [
            ...antithrombotics,
            ...nsaids
          ].map(m => m._rawName),
          source: SOURCES.DAILYMED
        })
      );
    }

    if (patient.historyOfGI === true) {
      if (nsaids.length > 0) {
        results.push(
          finding({
            severity: 'high',
            category: 'bleeding',
            title: 'NSAID + GI Bleeding History',
            message:
              'تاريخ النزيف الهضمي يزيد خطورة استخدام NSAIDs.',
            action:
              'راجع البدائل وعوامل الحماية وخطر النزيف.',
            drugs: nsaids.map(m => m._rawName),
            source: SOURCES.DAILYMED
          })
        );
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     18. POTASSIUM / NEPHROTOXICITY
     ========================================================== */

  function potassiumAndKidney(meds, patient = {}) {
    const list = normalizeMeds(meds);
    const results = [];

    const potassiumDrugs = list.filter(
      m => GROUPS.potassiumRaising.has(m._drug)
    );

    const nsaids = list.filter(
      m => GROUPS.nephrotoxicRisk.has(m._drug)
    );

    const aceOrArb = list.filter(
      m =>
        GROUPS.acei.has(m._drug) ||
        GROUPS.arb.has(m._drug)
    );

    if (
      potassiumDrugs.length >= 2
    ) {
      results.push(
        finding({
          severity: 'high',
          category: 'potassium',
          title: 'Multiple Potassium-Raising Medicines',
          message:
            'قد يزيد الجمع خطر فرط بوتاسيوم الدم.',
          action:
            'راجع K+ ووظائف الكلى والجرعات.',
          drugs: potassiumDrugs.map(m => m._rawName),
          source: SOURCES.KDIGO
        })
      );
    }

    if (
      aceOrArb.length > 0 &&
      nsaids.length > 0
    ) {
      results.push(
        finding({
          severity: 'high',
          category: 'renal',
          title: 'RAAS Inhibitor + NSAID',
          message:
            'الجمع قد يزيد خطر تدهور وظائف الكلى، خصوصًا مع نقص حجم الدم أو مدرات البول.',
          action:
            'راجع وظائف الكلى والضغط والحالة الحجمية وتجنب الاستخدام غير الضروري.',
          drugs: [
            ...aceOrArb,
            ...nsaids
          ].map(m => m._rawName),
          source: SOURCES.KDIGO
        })
      );
    }

    const potassium = numberFromObject(patient, [
      'potassium',
      'K',
      'k'
    ]);

    if (
      potassium !== null &&
      potassium >= 5.5
    ) {
      results.push(
        finding({
          severity: 'high',
          category: 'potassium',
          title: 'Elevated Potassium',
          message:
            `البوتاسيوم المسجل ${potassium} mmol/L مرتفع ويحتاج إلى تقييم حسب السياق السريري.`,
          action:
            'راجع الأدوية التي قد ترفع البوتاسيوم ووظائف الكلى وإعادة القياس حسب الحالة.',
          source: SOURCES.KDIGO
        })
      );
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     19. CNS DEPRESSION
     ========================================================== */

  function cnsDepression(meds) {
    const list = normalizeMeds(meds);
    const results = [];

    const opioids = list.filter(
      m => GROUPS.opioids.has(m._drug)
    );

    const benzos = list.filter(
      m => GROUPS.benzodiazepines.has(m._drug)
    );

    const gabapentinoids = list.filter(
      m =>
        m._drug === 'gabapentin' ||
        m._drug === 'pregabalin'
    );

    if (
      opioids.length > 0 &&
      benzos.length > 0
    ) {
      results.push(
        finding({
          severity: 'critical',
          category: 'cns',
          title: 'Opioid + Benzodiazepine CNS Depression',
          message:
            'الجمع قد يسبب تثبيطًا شديدًا للجهاز العصبي المركزي والتنفس.',
          action:
            'تجنب الجمع قدر الإمكان، وإن كان ضروريًا فمع تقييم ومراقبة دقيقة.',
          drugs: [
            ...opioids,
            ...benzos
          ].map(m => m._rawName),
          source: SOURCES.FDA
        })
      );
    }

    if (
      opioids.length > 0 &&
      gabapentinoids.length > 0
    ) {
      results.push(
        finding({
          severity: 'high',
          category: 'cns',
          title: 'Opioid + Gabapentinoid',
          message:
            'قد يزيد الجمع خطر النعاس وتثبيط التنفس.',
          action:
            'راجع الجرعات وعوامل خطر تثبيط التنفس والمراقبة المناسبة.',
          drugs: [
            ...opioids,
            ...gabapentinoids
          ].map(m => m._rawName),
          source: SOURCES.FDA
        })
      );
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     20. SEROTONIN SYNDROME
     ========================================================== */

  function serotoninRisk(meds) {
    const list = normalizeMeds(meds);

    const serotonergic = list.filter(
      m => GROUPS.serotonergic.has(m._drug)
    );

    if (serotonergic.length < 2) return [];

    const includesTramadol = serotonergic.some(
      m => m._drug === 'tramadol'
    );

    if (!includesTramadol) {
      return [];
    }

    return [
      finding({
        severity: 'high',
        category: 'serotonin',
        title: 'Serotonin Syndrome Risk',
        message:
          'يوجد ترامادول مع دواء/أدوية سيروتونينية أخرى، مما قد يزيد خطر متلازمة السيروتونين.',
        action:
          'مراجعة ضرورة الجمع ومراقبة الأعراض العصبية والذاتية والعضلية.',
        drugs: serotonergic.map(m => m._rawName),
        source: SOURCES.DAILYMED
      })
    ];
  }

  /* ==========================================================
     21. PATIENT HISTORY
     ========================================================== */

  async function patientHistory(patientId = null) {
    try {
      if (
        typeof window !== 'undefined' &&
        window.DB &&
        typeof window.DB.all === 'function'
      ) {
        const records = await window.DB.all(
          'prescriptions'
        );

        if (!Array.isArray(records)) {
          return [];
        }

        if (
          patientId === null ||
          patientId === undefined
        ) {
          return records;
        }

        return records.filter(record => {
          const id =
            record.patientId ??
            record.patient_id ??
            record.patientID;

          return String(id) === String(patientId);
        });
      }

      if (
        typeof window !== 'undefined' &&
        Array.isArray(window.allRecords)
      ) {
        if (
          patientId === null ||
          patientId === undefined
        ) {
          return window.allRecords;
        }

        return window.allRecords.filter(record => {
          const id =
            record.patientId ??
            record.patient_id ??
            record.patientID;

          return String(id) === String(patientId);
        });
      }
    } catch (error) {
      return [];
    }

    return [];
  }

  /* ==========================================================
     22. HISTORY DUPLICATE CHECK
     ========================================================== */

  function historyCheck(currentMeds, historyRecords) {
    if (!Array.isArray(historyRecords)) return [];

    const current = normalizeMeds(currentMeds);

    const historicalNames = [];

    for (const record of historyRecords) {
      const medications =
        record.medications ||
        record.medicines ||
        record.prescriptions ||
        record.items ||
        [];

      if (Array.isArray(medications)) {
        for (const med of medications) {
          const name = medicationName(med);

          if (name) {
            historicalNames.push({
              name,
              drug: canonical(name)
            });
          }
        }
      } else {
        const name = medicationName(record);

        if (name) {
          historicalNames.push({
            name,
            drug: canonical(name)
          });
        }
      }
    }

    const results = [];

    for (const med of current) {
      const matches = historicalNames.filter(
        h => h.drug === med._drug
      );

      if (matches.length > 0) {
        results.push(
          finding({
            severity: 'info',
            category: 'history',
            title: `Medication Appears in History: ${med._rawName}`,
            message:
              'هذا الدواء موجود أيضًا في سجل وصفات المريض.',
            action:
              'تحقق من أن الوصفة الحالية تجديد مقصود وليست وصفة مكررة.',
            drugs: [
              med._rawName,
              ...matches.map(x => x.name)
            ],
            source: SOURCES.DAILYMED
          })
        );
      }
    }

    return uniqueFindings(results);
  }

  /* ==========================================================
     23. SORTING
     ========================================================== */

  function sortFindings(findings) {
    return [...findings].sort(
      (a, b) =>
        (SEVERITY_RANK[b.severity] || 0) -
        (SEVERITY_RANK[a.severity] || 0)
    );
  }

  /* ==========================================================
     24. RUN ALL CHECKS
     ========================================================== */

  async function runAll(
    meds = [],
    patient = {},
    options = {}
  ) {
    const list = normalizeMeds(meds);

    let all = [];

    all.push(...interactions(list));
    all.push(...duplicates(list));
    all.push(
      ...allergy(
        list,
        patient.allergies ||
        patient.drugAllergies ||
        []
      )
    );
    all.push(...pregnancy(list, patient));
    all.push(...breastfeeding(list, patient));
    all.push(...renal(list, patient));
    all.push(...hepatic(list, patient));
    all.push(...qtRisk(list, patient));
    all.push(...diseaseInteractions(list, patient));
    all.push(...ageRisk(list, patient));
    all.push(...doseChecks(list, patient));
    all.push(...maximumDose(list));
    all.push(...bleedingRisk(list, patient));
    all.push(...potassiumAndKidney(list, patient));
    all.push(...cnsDepression(list));
    all.push(...serotoninRisk(list));

    if (
      options.includeHistory !== false &&
      (
        options.patientId !== undefined ||
        patient.id !== undefined ||
        patient.patientId !== undefined
      )
    ) {
      const id =
        options.patientId ??
        patient.patientId ??
        patient.id;

      const history = await patientHistory(id);

      all.push(
        ...historyCheck(
          list,
          history
        )
      );
    }

    all = uniqueFindings(all);
    all = sortFindings(all);

    const blocking = all.filter(
      x =>
        x.severity === 'critical' ||
        x.severity === 'high'
    );

    const warnings = all.filter(
      x =>
        x.severity === 'moderate' ||
        x.severity === 'info'
    );

    return {
      version: VERSION,
      all,
      findings: all,
      blocking,
      warnings,
      hasBlocking: blocking.length > 0,
      count: all.length,
      criticalCount: all.filter(
        x => x.severity === 'critical'
      ).length,
      highCount: all.filter(
        x => x.severity === 'high'
      ).length,
      moderateCount: all.filter(
        x => x.severity === 'moderate'
      ).length,
      infoCount: all.filter(
        x => x.severity === 'info'
      ).length
    };
  }

  /* ==========================================================
     25. SAFE HTML ESCAPING
     ========================================================== */

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function severityLabel(severity) {
    switch (severity) {
      case 'critical':
        return 'حرج';
      case 'high':
        return 'مرتفع';
      case 'moderate':
        return 'متوسط';
      case 'info':
        return 'معلومة';
      default:
        return severity;
    }
  }

  function renderWarnings(
    findings,
    container,
    options = {}
  ) {
    if (!container) return;

    const items = Array.isArray(findings)
      ? findings
      : [];

    if (items.length === 0) {
      container.innerHTML =
        options.emptyMessage ||
        '<div class="safety-ok">لم يتم العثور على تحذيرات وفق القواعد الحالية.</div>';

      return;
    }

    container.innerHTML = items
      .map(item => {
        const severity =
          escapeHtml(item.severity);

        const title =
          escapeHtml(item.title);

        const message =
          escapeHtml(item.message);

        const action =
          escapeHtml(item.action);

        const sourceName =
          item.source &&
          item.source.name
            ? escapeHtml(item.source.name)
            : '';

        const sourceUrl =
          item.source &&
          item.source.url
            ? escapeHtml(item.source.url)
            : '';

        const drugs =
          Array.isArray(item.drugs)
            ? item.drugs
                .map(escapeHtml)
                .join(' + ')
            : '';

        const sourceHtml =
          sourceUrl
            ? `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">${sourceName}</a>`
            : sourceName;

        return `
          <article
            class="safety-warning safety-${severity}"
            data-severity="${severity}"
          >
            <div class="safety-warning-header">
              <strong>${title}</strong>
              <span class="safety-severity">
                ${escapeHtml(severityLabel(item.severity))}
              </span>
            </div>

            ${
              drugs
                ? `<div class="safety-drugs">${drugs}</div>`
                : ''
            }

            <div class="safety-message">
              ${message}
            </div>

            ${
              action
                ? `
                  <div class="safety-action">
                    <strong>الإجراء المقترح:</strong>
                    ${action}
                  </div>
                `
                : ''
            }

            ${
              sourceHtml
                ? `
                  <div class="safety-source">
                    المصدر: ${sourceHtml}
                  </div>
                `
                : ''
            }
          </article>
        `;
      })
      .join('');
  }

  /* ==========================================================
     26. QUICK HELPERS
     ========================================================== */

  function hasCritical(findings) {
    return (findings || []).some(
      x => x.severity === 'critical'
    );
  }

  function hasHigh(findings) {
    return (findings || []).some(
      x => x.severity === 'high'
    );
  }

  function getHighestSeverity(findings) {
    if (!Array.isArray(findings) || findings.length === 0) {
      return null;
    }

    return sortFindings(findings)[0].severity;
  }

  function summary(result) {
    if (!result) {
      return {
        version: VERSION,
        count: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        info: 0
      };
    }

    return {
      version: result.version || VERSION,
      count: result.count || 0,
      critical: result.criticalCount || 0,
      high: result.highCount || 0,
      moderate: result.moderateCount || 0,
      info: result.infoCount || 0,
      highestSeverity:
        getHighestSeverity(result.all || [])
    };
  }

  /* ==========================================================
     27. PUBLIC API
     ========================================================== */

  return {
    VERSION,

    SOURCES,

    INTERACTIONS,

    GROUPS,

    THERAPEUTIC_CLASSES,

    ALLERGY_RULES,

    PREGNANCY_REVIEW,

    normalizeText,

    canonical,

    medicationName,

    normalizeMeds,

    interactions,

    duplicates,

    allergy,

    pregnancy,

    breastfeeding,

    renal,

    hepatic,

    qtRisk,

    diseaseInteractions,

    ageRisk,

    doseChecks,

    maximumDose,

    bleedingRisk,

    potassiumAndKidney,

    cnsDepression,

    serotoninRisk,

    patientHistory,

    historyCheck,

    runAll,

    renderWarnings,

    escapeHtml,

    sortFindings,

    hasCritical,

    hasHigh,

    getHighestSeverity,

    summary
  };
})();

/* ==========================================================
   Browser export
   ========================================================== */

if (typeof window !== 'undefined') {
  window.SafetyCheck = SafetyCheck;
}

/* ==========================================================
   CommonJS export
   ========================================================== */

if (
  typeof module !== 'undefined' &&
  module.exports
) {
  module.exports = SafetyCheck;
}
