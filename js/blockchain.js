/* ==========================================================
   MediPrescribe — blockchain.js v3.1  (Medical Edition · Fixed)
   سجل وصفات طبي موثّق — Hash Chain محلي مُحكَم
   ----------------------------------------------------------
   ⚠️ تنويه معماري:
   - ليس blockchain لامركزياً — سلسلة تجزئة محلية عبر localStorage
   - يحقق: عدم التلاعب، تسلسل زمني موثوق، تحقق أصالة، أثر تدقيق
   - لا يحقق: منع الحذف الكامل للجهاز، إجماع موزّع
   - للإنتاج الحقيقي: خادم موثوق + توقيع غير متماثل (RSA/ECDSA)
   ----------------------------------------------------------
   إصلاحات v3.1 عن v3.0:
   [FIX-1]  init() ينتظر saveQueue قبل الإعلان عن الجاهزية
   [FIX-2]  فهرس patientIndex → O(1) لكشف العلاج المتراكب
   [FIX-3]  canonicalize() يتعامل بأمان مع undefined/NaN/Infinity
   [FIX-4]  verifyPrescription() يفصل authentic / dispensable
   [FIX-5]  recordLifecycle() يمنع الإجراءات المتكررة
   [FIX-6]  parseAllergies() يقبل سلسلة أو مصفوفة
   [FIX-7]  rxBlocks[rxNumber] تهيئة تلقائية
   [FIX-8]  Block._serialize() يستخدم canonicalize
   [FIX-9]  importChain() يُنشئ checkpoints للسلاسل الكبيرة
   [NEW]    getSnapshot() — نسخة سريعة للعرض دون تعديل
   [NEW]    onMutation() — خطاف للأحداث (اختياري)
   [NEW]    clearQuarantine() — إدارة الحجر الصحي
========================================================== */

const PrescriptionChain = (() => {
  'use strict';

  const VERSION = '3.1';
  const SCHEMA_VERSION = 3;

  const CHAIN_KEY = 'mp_blockchain_v3';
  const CHAIN_TMP = 'mp_blockchain_v3_tmp';
  const INDEX_KEY = 'mp_blockchain_index_v3';
  const EVENTS_KEY = 'mp_blockchain_events_v3';
  const JOURNAL_KEY = 'mp_blockchain_journal_v3';
  const QUARANTINE_KEY = 'mp_blockchain_quarantine_v3';

  /* ⚙️ الإعدادات الطبية */
  const CONFIG = {
    difficulty: 0,
    miningEnabled: false,
    checkpointEvery: 10,
    strictMode: true,
    autoRepair: true,
    overlapWindowDays: 30,
    maxEvents: 500,
    maxMedsPerRx: 15,
    hmacSecret: 'MP-CHAIN-2026-V3-DEV-ONLY',
    signatureSecret: 'MP-SIGN-2026-V3-DEV-ONLY',
    legacyMacKeys: []
  };

  /* ═══════════════════════════════════════════════════════
     1. قواعد طبية مدمجة
     ═══════════════════════════════════════════════════════ */
  const CONTROLLED_MEDS = [
    'ترامادول', 'مورفين', 'كودايين', 'اوكسيكودون', 'فينتانيل',
    'ديازيبام', 'البرازولام', 'لورازيبام', 'كولونازيبام', 'ميثادون',
    'امفيتامين', 'ميثيل فينيديت', 'زولبيديم', 'بريجابالين'
  ];

  const INTERACTIONS = [
    { a: 'وارفارين',     b: 'اسبرين',         severity: 'high',   msg: 'نزيف مضاد تجلط مزدوج — يمنع الإصدار إلا بتبرير سريري موثق' },
    { a: 'وارفارين',     b: 'ابوبروفين',      severity: 'high',   msg: 'خطر نزيف مرتفع مع مضادات الالتهاب' },
    { a: 'كلوبيدوجريل',  b: 'اسبرين',         severity: 'medium', msg: 'ازدواجية مضادات الصفائح — راجع الضرورة' },
    { a: 'سيمفاستاتين',  b: 'كلاريثروميسين', severity: 'high',   msg: 'خطر رابدوميوليز — يمنع الإصدار' },
    { a: 'ميثوتريكسيت',  b: 'ابوبروفين',      severity: 'medium', msg: 'ارتفاع سمية الميثوتريكسيت' },
    { a: 'ليثيوم',       b: 'ابوبروفين',      severity: 'high',   msg: 'ارتفاع مستوى الليثيوم السام' },
    { a: 'اسبرين',       b: 'ابوبروفين',      severity: 'low',    msg: 'تنافس على مستقبلات — افصل التوقيت' },
    { a: 'ميتفورمين',    b: 'كونتراست',       severity: 'medium', msg: 'حماض لبني محتمل مع صبغة الأشعة' }
  ];

  /* ═══════════════════════════════════════════════════════
     2. أدوات تجزئة وتوقيع
     ═══════════════════════════════════════════════════════ */
  async function sha256(message) {
    try {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        const buf = new TextEncoder().encode(message);
        const hashBuf = await window.crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hashBuf))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }
    } catch (_) { /* fallback */ }
    return fnv1aDouble(message);
  }

  function fnv1aDouble(str) {
    let h1 = 0x811c9dc5, h2 = 0xcbf29ce4;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 ^= c; h1 = (h1 * 0x01000193) >>> 0;
      h2 ^= c; h2 = (h2 * 0x01000197) >>> 0;
    }
    return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'))
      .repeat(4).slice(0, 64);
  }

  function normalizeMed(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[أإآ]/g, 'ا')
      .replace(/[ة]/g, 'ه')
      .replace(/[ً-ْ]/g, '')
      .replace(/[^\u0600-\u06FFa-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function hmacWith(key, message) {
    return await sha256(`${key}|${message}`);
  }

  async function macKeys() {
    return [CONFIG.hmacSecret, ...CONFIG.legacyMacKeys];
  }

  async function doctorKey(username) {
    return (await sha256(
      `SIG|${CONFIG.signatureSecret}|${String(username).toLowerCase().trim()}`
    )).slice(0, 32);
  }

  async function signPayload(username, payload) {
    const key = await doctorKey(username);
    return (await sha256(key + '|' + canonicalize(payload))).slice(0, 40);
  }

  async function verifySignature(username, payloadWithSig) {
    const { sig, ...payload } = payloadWithSig;
    if (!sig) return { valid: false, reason: 'no_signature' };
    const expected = await signPayload(username, payload);
    return { valid: expected === sig, reason: expected === sig ? null : 'signature_mismatch' };
  }

  /* ═══════════════════════════════════════════════════════
     3. [FIX-3] canonicalize — تعامل آمن مع undefined/NaN
     ═══════════════════════════════════════════════════════ */
  function canonicalize(value) {
    /* undefined → 'null' (JSON-consistent) */
    if (value === undefined) return 'null';

    /* NaN / Infinity → 'null' (JSON-consistent) */
    if (typeof value === 'number' && !Number.isFinite(value)) return 'null';

    if (value === null) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);

    if (Array.isArray(value)) {
      return '[' + value.map(canonicalize).join(',') + ']';
    }

    /* كائن: مفاتيح مرتبة أبجدياً */
    const keys = Object.keys(value).sort();
    return '{' + keys
      .map(k => JSON.stringify(k) + ':' + canonicalize(value[k]))
      .join(',') + '}';
  }

  /* ═══════════════════════════════════════════════════════
     4. نموذج الكتلة
     ═══════════════════════════════════════════════════════ */
  class Block {
    constructor(index, timestamp, data, previousHash = '', nonce = 0) {
      this.index = index;
      this.timestamp = timestamp;
      this.data = data;
      this.previousHash = previousHash;
      this.nonce = nonce;
      this.merkleRoot = null;
      this.hash = '';
    }

    /* [FIX-8] استخدام canonicalize بدل JSON.stringify */
    _serialize() {
      return canonicalize({
        sv: SCHEMA_VERSION,
        i: this.index,
        t: this.timestamp,
        d: this.data,
        p: this.previousHash,
        n: this.nonce
      });
    }

    async calculateHash() {
      return await sha256(this._serialize());
    }

    async mineBlock() {
      if (!CONFIG.miningEnabled || CONFIG.difficulty === 0) {
        this.hash = await this.calculateHash();
        return;
      }
      const target = '0'.repeat(CONFIG.difficulty);
      const maxTries = 50000;
      let tries = 0;
      while (tries++ < maxTries) {
        this.hash = await this.calculateHash();
        if (this.hash.startsWith(target)) return;
        this.nonce++;
      }
      console.warn(`⚠️ لم يتحقق difficulty=${CONFIG.difficulty} بعد ${maxTries} محاولة`);
    }

    toJSON() {
      return {
        index: this.index,
        timestamp: this.timestamp,
        data: this.data,
        previousHash: this.previousHash,
        nonce: this.nonce,
        merkleRoot: this.merkleRoot,
        hash: this.hash
      };
    }

    static fromJSON(obj) {
      const b = new Block(
        obj.index, obj.timestamp, obj.data,
        obj.previousHash, obj.nonce
      );
      b.merkleRoot = obj.merkleRoot || null;
      b.hash = obj.hash || '';
      return b;
    }
  }

  /* ═══════════════════════════════════════════════════════
     5. الحالة الداخلية
     ═══════════════════════════════════════════════════════ */
  let chain = [];
  let blockIndex = {};        /* rxNumber → آخر index */
  let rxBlocks = {};          /* rxNumber → [indices] */
  let patientIndex = {};      /* [FIX-2] patientHash → [indices] */
  let events = [];
  let isInitialized = false;
  let initPromise = null;
  let saveQueue = Promise.resolve();

  /* [NEW] خطافات أحداث */
  const mutationHooks = [];
  function onMutation(fn) {
    if (typeof fn === 'function') mutationHooks.push(fn);
  }
  function emitMutation(type, payload) {
    for (const hook of mutationHooks) {
      try { hook({ type, payload, timestamp: Date.now() }); }
      catch (e) { console.warn('mutation hook error:', e); }
    }
  }

  function enqueueSave() {
    saveQueue = saveQueue.then(() => atomicSave()).catch(err => {
      console.error('❌ فشل حفظ:', err);
      throw err;
    });
    return saveQueue;
  }

  /* ═══════════════════════════════════════════════════════
     6. سجل الأحداث
     ═══════════════════════════════════════════════════════ */
  async function logEvent(type, details = {}) {
    events.push({ type, details, timestamp: Date.now() });
    if (events.length > CONFIG.maxEvents) events = events.slice(-CONFIG.maxEvents);
    try {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
    } catch (_) { /* تجاهل */ }
  }

  function getEvents(filterType = null) {
    const list = filterType ? events.filter(e => e.type === filterType) : [...events];
    return list.sort((a, b) => a.timestamp - b.timestamp);
  }

  /* ═══════════════════════════════════════════════════════
     7. الكتابة الذرّية
     ═══════════════════════════════════════════════════════ */
  async function atomicSave() {
    const payload = chain.map(b => b.toJSON());
    const payloadStr = JSON.stringify(payload);
    const mac = await hmacWith(CONFIG.hmacSecret, payloadStr);
    const envelope = {
      schemaVersion: SCHEMA_VERSION,
      payload,
      mac,
      length: payload.length,
      savedAt: Date.now()
    };

    localStorage.setItem(JOURNAL_KEY, JSON.stringify({ phase: 'begin', at: Date.now() }));

    const tmpStr = JSON.stringify(envelope);
    localStorage.setItem(CHAIN_TMP, tmpStr);

    const readBack = localStorage.getItem(CHAIN_TMP);
    if (readBack !== tmpStr) {
      throw new Error('فشلت الكتابة الذرّية: النسخة المؤقتة غير مطابقة عند إعادة القراءة');
    }

    localStorage.setItem(CHAIN_KEY, tmpStr);
    localStorage.removeItem(CHAIN_TMP);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify({
      phase: 'done', at: Date.now(), length: payload.length
    }));
    localStorage.setItem(INDEX_KEY, JSON.stringify({ blockIndex, rxBlocks, patientIndex }));
    return true;
  }

  /* ═══════════════════════════════════════════════════════
     8. التحميل + الاسترداد
     ═══════════════════════════════════════════════════════ */
  async function loadChain() {
    /* ── أ. استكمال كتابة منقطعة ── */
    try {
      const journal = JSON.parse(localStorage.getItem(JOURNAL_KEY) || 'null');
      if (journal && journal.phase === 'begin') {
        const tmp = localStorage.getItem(CHAIN_TMP);
        if (tmp) {
          localStorage.setItem(CHAIN_KEY, tmp);
          localStorage.removeItem(CHAIN_TMP);
          localStorage.setItem(JOURNAL_KEY, JSON.stringify({
            phase: 'done', at: Date.now(), recovered: true
          }));
          await logEvent('write_recovered', {});
        }
      }
    } catch (_) { /* تجاهل */ }

    const stored = localStorage.getItem(CHAIN_KEY);
    if (!stored) return { status: 'empty' };

    let parsed;
    try {
      parsed = JSON.parse(stored);
    } catch (_) {
      return { status: 'corrupt_unrecoverable', reason: 'parse_error' };
    }

    const payloadStr = JSON.stringify(parsed.payload);
    const keys = await macKeys();
    let macOk = false, usedLegacy = false;
    for (const key of keys) {
      if (await hmacWith(key, payloadStr) === parsed.mac) {
        macOk = true;
        usedLegacy = key !== CONFIG.hmacSecret;
        break;
      }
    }

    if (!macOk) {
      await logEvent('tampering_detected', {
        reason: 'hmac_mismatch',
        found: (parsed.mac || '').substring(0, 16)
      });
      return { status: 'tampered', reason: 'hmac_mismatch' };
    }

    if ((parsed.schemaVersion || 2) < SCHEMA_VERSION) {
      parsed.payload = migratePayload(parsed.payload, parsed.schemaVersion || 2);
    }

    chain = parsed.payload.map(obj => Block.fromJSON(obj));

    const firstBad = await findFirstInvalidIndex();
    if (firstBad === 0) {
      if (CONFIG.autoRepair && !CONFIG.strictMode) {
        chain = [];
        return { status: 'empty' };
      }
      return { status: 'corrupt_unrecoverable', reason: 'genesis_invalid' };
    }

    if (firstBad !== -1) {
      if (!CONFIG.autoRepair) {
        return { status: 'corrupt', firstInvalidIndex: firstBad };
      }
      const quarantined = chain.slice(firstBad).map(b => b.toJSON());
      try {
        localStorage.setItem(QUARANTINE_KEY, JSON.stringify({
          quarantinedAt: Date.now(),
          fromIndex: firstBad,
          blocks: quarantined
        }));
      } catch (_) { /* تجاهل */ }
      chain = chain.slice(0, firstBad);
      await rebuildIndex();
      await enqueueSave();
      await logEvent('chain_repaired', {
        truncatedFrom: firstBad,
        quarantinedCount: quarantined.length
      });
      return { status: 'repaired', truncatedFrom: firstBad };
    }

    try {
      const idx = JSON.parse(localStorage.getItem(INDEX_KEY) || '{}');
      blockIndex = idx.blockIndex || {};
      rxBlocks = idx.rxBlocks || {};
      patientIndex = idx.patientIndex || {};
      if (Object.keys(blockIndex).length && !sanityCheckIndex()) {
        await rebuildIndex();
      }
    } catch (_) {
      await rebuildIndex();
    }

    try {
      events = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
    } catch (_) {
      events = [];
    }

    if (usedLegacy) {
      await enqueueSave();
      await logEvent('mac_key_rotated', {});
    }

    console.log(`⛓️ تم تحميل blockchain — ${chain.length} كتلة`);
    return { status: 'ok' };
  }

  function sanityCheckIndex() {
    for (const [rx, idx] of Object.entries(blockIndex)) {
      const b = chain[idx];
      if (!b || b.data.rxNumber !== rx) return false;
    }
    return true;
  }

  async function findFirstInvalidIndex() {
    for (let i = 0; i < chain.length; i++) {
      const cur = chain[i];
      const recalc = await cur.calculateHash();
      if (cur.hash !== recalc) return i;
      if (i === 0) {
        if (cur.previousHash !== '0'.repeat(64)) return 0;
      } else {
        if (cur.previousHash !== chain[i - 1].hash) return i;
        if (cur.timestamp < chain[i - 1].timestamp) return i;
      }
    }
    return -1;
  }

  function migratePayload(payload, fromVersion) {
    /* v2 → v3: لا تغيير جوهري */
    return payload;
  }

  /* [FIX-2] rebuildIndex يشمل patientIndex */
  async function rebuildIndex() {
    blockIndex = {};
    rxBlocks = {};
    patientIndex = {};

    for (const block of chain) {
      const rx = block.data && block.data.rxNumber;
      if (!rx) continue;

      if (!rxBlocks[rx]) rxBlocks[rx] = [];
      rxBlocks[rx].push(block.index);

      if (block.data.type === 'prescription') {
        blockIndex[rx] = block.index;

        const ph = block.data.patientHash;
        if (ph) {
          if (!patientIndex[ph]) patientIndex[ph] = [];
          patientIndex[ph].push(block.index);
        }
      }
    }
  }

  /* ═══════════════════════════════════════════════════════
     9. Genesis + التهيئة [FIX-1]
     ═══════════════════════════════════════════════════════ */
  async function createGenesisBlock() {
    const block = new Block(
      0, Date.now(),
      {
        type: 'genesis',
        schemaVersion: SCHEMA_VERSION,
        message: 'MediPrescribe Medical Chain — النواة الأولى',
        createdAt: new Date().toISOString()
      },
      '0'.repeat(64)
    );
    await block.mineBlock();
    return block;
  }

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const result = await loadChain();

      if (result.status === 'empty') {
        const genesis = await createGenesisBlock();
        chain = [genesis];
        await rebuildIndex();
        await enqueueSave();
        await logEvent('genesis_created', { hash: genesis.hash.substring(0, 16) });
        console.log('🎉 blockchain طبية جديدة — Genesis:', genesis.hash.substring(0, 16));

      } else if (result.status === 'tampered') {
        const err = new Error(
          '🚨 السلسلة تعرضت للتعديل الخارجي (MAC غير مطابق) — راجع الحجر الصحي'
        );
        await logEvent('init_blocked', { reason: result.reason });
        throw err;

      } else if (result.status === 'corrupt' || result.status === 'corrupt_unrecoverable') {
        const err = new Error(`السلسلة معطوبة بشكل غير قابل للإصلاح (${result.reason})`);
        await logEvent('init_blocked', { reason: result.reason });
        if (CONFIG.strictMode) throw err;
        console.warn('⚠️ strictMode=false — إنشاء سلسلة جديدة');
        const genesis = await createGenesisBlock();
        chain = [genesis];
        await rebuildIndex();
        await enqueueSave();

      } else if (result.status === 'repaired') {
        console.warn('🔧 السلسلة أُصلحت تلقائياً');
      }

      /* [FIX-1] انتظر اكتمال كل عمليات الحفظ المعلّقة */
      await saveQueue;

      isInitialized = true;
      return true;
    })();

    return initPromise;
  }

  async function ensureInit() {
    if (!isInitialized) await init();
  }

  /* ═══════════════════════════════════════════════════════
     10. الفحص السريري قبل الإصدار
     ═══════════════════════════════════════════════════════ */
  /* [FIX-6] parseAllergies يقبل سلسلة أو مصفوفة */
  function parseAllergies(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      return input.map(normalizeMed).filter(Boolean);
    }
    return String(input)
      .split(/[،,؛;\s]+/)
      .map(normalizeMed)
      .filter(Boolean);
  }

  function validateMedical(rx) {
    const errors = [];
    const warnings = [];

    if (!rx.rxNumber || !String(rx.rxNumber).trim())
      errors.push('رقم الوصفة مطلوب');
    if (!rx.patientName || !String(rx.patientName).trim())
      errors.push('اسم المريض مطلوب');
    if (!rx.diagnosis && !rx.diagnosisId)
      errors.push('التشخيص مطلوب');
    if (!rx.doctor && !rx.doctorUsername)
      errors.push('هوية الطبيب مطلوبة للتوقيع');
    if (rx.age != null && (isNaN(Number(rx.age)) || rx.age < 0 || rx.age > 120))
      errors.push('العمر خارج النطاق الطبيعي (0–120)');

    const meds = Array.isArray(rx.meds) ? rx.meds : [];
    if (!meds.length) {
      errors.push('قائمة الأدوية فارغة');
    } else {
      if (meds.length > CONFIG.maxMedsPerRx)
        warnings.push(`عدد أدوية مرتفع (${meds.length}) — راجع ضرورة كل دواء`);

      const seen = new Set();
      meds.forEach((m, i) => {
        if (!m.n || !String(m.n).trim()) {
          errors.push(`دواء #${i + 1}: الاسم مطلوب`);
          return;
        }
        const key = normalizeMed(m.n);
        if (seen.has(key)) errors.push(`تكرار دواء في نفس الوصفة: ${m.n}`);
        seen.add(key);
        if (!m.dose) warnings.push(`دواء «${m.n}»: الجرعة غير محددة`);
        if (!m.freq) warnings.push(`دواء «${m.n}»: التكرار غير محدد`);
      });

      /* تداخلات دوائية */
      const keys = meds.map(m => normalizeMed(m.n));
      for (const pair of INTERACTIONS) {
        const hasA = keys.includes(normalizeMed(pair.a));
        const hasB = keys.includes(normalizeMed(pair.b));
        if (hasA && hasB) {
          const text = `تداخل دوائي [${pair.severity}]: ${pair.a} + ${pair.b} — ${pair.msg}`;
          if (pair.severity === 'high') errors.push(text);
          else warnings.push(text);
        }
      }

      /* أدوية خاضعة للرقابة */
      const controlled = meds.filter(m =>
        CONTROLLED_MEDS.some(c => normalizeMed(m.n).includes(normalizeMed(c)))
      );
      if (controlled.length) {
        warnings.push(`أدوية خاضعة للرقابة: ${controlled.map(m => m.n).join('، ')}`);
      }
    }

    /* تعارض حساسية [FIX-6] */
    const allergies = parseAllergies(rx.allergies);
    if (allergies.length && meds.length) {
      for (const m of meds) {
        const mk = normalizeMed(m.n);
        for (const a of allergies) {
          if (mk.includes(a) || a.includes(mk)) {
            errors.push(`تعارض تحسسي: ${m.n} مع حساسية مسجّلة (${a})`);
          }
        }
      }
    }

    return { errors, warnings };
  }

  /* [FIX-2] detectOverlappingTherapy — O(1) عبر patientIndex */
  async function detectOverlappingTherapy(patientHash, meds) {
    if (!patientHash || !meds || !meds.length) return [];

    const now = Date.now();
    const windowMs = CONFIG.overlapWindowDays * 24 * 3600 * 1000;
    const warnings = [];

    const indices = patientIndex[patientHash] || [];

    for (const idx of indices) {
      const block = chain[idx];
      if (!block || !block.data) continue;
      const d = block.data;
      if (d.type !== 'prescription') continue;
      if (now - d.createdAt > windowMs) continue;

      const existing = new Set(
        (d.medications || []).map(m => normalizeMed(m.n))
      );
      for (const m of meds) {
        if (existing.has(normalizeMed(m.n))) {
          warnings.push(
            `علاج متراكب محتمل: ${m.n} وُصف مسبقاً في ${d.rxNumber} (كشف "طبيب متعدد")`
          );
        }
      }
    }
    return warnings;
  }

  /* ═══════════════════════════════════════════════════════
     11. إصدار وصفة
     ═══════════════════════════════════════════════════════ */
  async function addPrescription(prescription) {
    await ensureInit();

    if (!prescription || typeof prescription !== 'object') {
      throw new Error('بيانات الوصفة غير صالحة');
    }
    if (blockIndex[prescription.rxNumber] !== undefined) {
      throw new Error(`الوصفة ${prescription.rxNumber} موجودة مسبقاً في السلسلة`);
    }

    /* الفحص السريري */
    const check = validateMedical(prescription);
    if (check.errors.length) {
      await logEvent('issuance_blocked', {
        rxNumber: prescription.rxNumber || 'unknown',
        errors: check.errors
      });
      const err = new Error(
        `الفحص السريري رفض الإصدار:\n• ${check.errors.join('\n• ')}`
      );
      err.clinicalErrors = check.errors;
      throw err;
    }

    const latest = chain[chain.length - 1];
    const patientHash = await hashField(prescription.patientName);
    const doctorUsername = prescription.doctorUsername
      || prescription.doctor || 'unknown';

    const blockData = {
      type: 'prescription',
      schemaVersion: SCHEMA_VERSION,
      rxNumber: prescription.rxNumber,
      patientHash,
      patientInitials: getInitials(prescription.patientName),
      age: prescription.age != null ? Number(prescription.age) : null,
      gender: prescription.gender || null,
      diagnosis: prescription.diagnosis || '',
      diagnosisId: prescription.diagnosisId || null,
      medications: (prescription.meds || []).map(m => ({
        n: m.n,
        dose: m.dose || '',
        freq: m.freq || '',
        dur: m.dur || ''
      })),
      clinicalWarnings: check.warnings,
      controlledMeds: (prescription.meds || [])
        .filter(m => CONTROLLED_MEDS.some(c =>
          normalizeMed(m.n).includes(normalizeMed(c))
        ))
        .map(m => m.n),
      doctorHash: await hashField(doctorUsername),
      doctorName: prescription.doctor || '',
      signedBy: doctorUsername,
      hospital: prescription.hospital || '',
      verificationCode: (prescription.verificationCode || '').toUpperCase() || null,
      createdAt: prescription.createdAt || Date.now(),
      addedAt: Date.now()
    };

    /* كشف العلاج المتراكب */
    const overlap = await detectOverlappingTherapy(
      patientHash, prescription.meds
    );
    if (overlap.length) {
      blockData.clinicalWarnings = [
        ...(blockData.clinicalWarnings || []),
        ...overlap
      ];
    }

    /* Merkle root */
    const medHashes = await Promise.all(
      blockData.medications.map(m => sha256(canonicalize(m)))
    );
    blockData.medicationsMerkleRoot = await computeMerkleRoot(medHashes);

    /* التوقيع */
    blockData.sig = await signPayload(doctorUsername, blockData);

    /* الكتلة */
    const block = new Block(chain.length, Date.now(), blockData, latest.hash);
    await block.mineBlock();
    chain.push(block);

    blockIndex[prescription.rxNumber] = block.index;
    /* [FIX-7] تهيئة تلقائية */
    if (!rxBlocks[prescription.rxNumber]) rxBlocks[prescription.rxNumber] = [];
    rxBlocks[prescription.rxNumber].push(block.index);

    if (patientHash) {
      if (!patientIndex[patientHash]) patientIndex[patientHash] = [];
      patientIndex[patientHash].push(block.index);
    }

    await enqueueSave();
    await logEvent('prescription_issued', {
      rxNumber: prescription.rxNumber,
      blockIndex: block.index,
      hash: block.hash.substring(0, 16),
      warnings: check.warnings.length
    });

    /* Checkpoint دوري */
    const rxCount = chain.filter(b => b.data.type === 'prescription').length;
    if (CONFIG.checkpointEvery > 0 && rxCount % CONFIG.checkpointEvery === 0) {
      await createCheckpoint();
    }

    emitMutation('issued', {
      rxNumber: prescription.rxNumber,
      blockIndex: block.index
    });

    console.log(`📜 وصفة موقعة — كتلة #${block.index} (${block.hash.substring(0, 12)}...)`);

    return {
      index: block.index,
      hash: block.hash,
      previousHash: block.previousHash,
      timestamp: block.timestamp,
      merkleRoot: blockData.medicationsMerkleRoot,
      signature: blockData.sig,
      clinicalWarnings: blockData.clinicalWarnings
    };
  }

  /* ═══════════════════════════════════════════════════════
     12. دورة الحياة [FIX-5]
     ═══════════════════════════════════════════════════════ */
  async function recordLifecycle(rxNumber, action, meta = {}) {
    await ensureInit();

    const found = await findPrescription(rxNumber);
    if (!found) throw new Error(`الوصفة ${rxNumber} غير موجودة`);

    const VALID = ['dispensed', 'cancelled', 'amended', 'verified'];
    if (!VALID.includes(action)) {
      throw new Error(`إجراء غير معروف: ${action}`);
    }

    const current = await getStatus(rxNumber);

    /* منع الإجراءات المتكررة */
    if (current.status === 'cancelled' && action !== 'verified') {
      throw new Error('وصفة ملغاة لا تقبل إجراءات جديدة');
    }
    if (action === 'dispensed' && current.status === 'dispensed') {
      throw new Error('الوصفة مصروفة بالفعل — لا تكرر الإجراء');
    }
    if (action === 'cancelled' && current.status === 'cancelled') {
      throw new Error('الوصفة ملغاة بالفعل');
    }

    const latest = chain[chain.length - 1];
    const block = new Block(chain.length, Date.now(), {
      type: 'lifecycle',
      schemaVersion: SCHEMA_VERSION,
      rxNumber,
      action,
      reason: meta.reason || null,
      by: meta.by || meta.pharmacy || null,
      location: meta.location || null,
      refHash: found.block.hash
    }, latest.hash);

    await block.mineBlock();
    chain.push(block);

    if (!rxBlocks[rxNumber]) rxBlocks[rxNumber] = [];
    rxBlocks[rxNumber].push(block.index);

    await enqueueSave();
    await logEvent(`prescription_${action}`, {
      rxNumber,
      by: meta.by || null
    });

    emitMutation(action, { rxNumber, blockIndex: block.index });

    return { index: block.index, hash: block.hash, action, rxNumber };
  }

  async function getStatus(rxNumber) {
    await ensureInit();
    const indices = rxBlocks[rxNumber] || [];
    let status = 'issued';
    let lastEvent = null;
    const seen = new Set();

    for (const idx of indices) {
      const b = chain[idx];
      if (!b) continue;
      if (b.data.type === 'lifecycle') {
        /* تجاهل التكرارات المتتالية */
        const key = `${b.data.action}@${b.timestamp}`;
        if (seen.has(key)) continue;
        seen.add(key);

        status = b.data.action;
        lastEvent = {
          action: b.data.action,
          at: b.timestamp,
          by: b.data.by,
          reason: b.data.reason
        };
      }
    }
    return { status, lastEvent, rxNumber };
  }

  /* ═══════════════════════════════════════════════════════
     13. نقاط التحقق
     ═══════════════════════════════════════════════════════ */
  async function createCheckpoint() {
    const latest = chain[chain.length - 1];
    const block = new Block(chain.length, Date.now(), {
      type: 'checkpoint',
      schemaVersion: SCHEMA_VERSION,
      coversUpTo: latest.index,
      rootHash: latest.hash,
      recordCount: chain.filter(b => b.data.type === 'prescription').length,
      at: new Date().toISOString()
    }, latest.hash);
    await block.mineBlock();
    chain.push(block);
    await enqueueSave();
    await logEvent('checkpoint_created', {
      index: block.index,
      coversUpTo: latest.index
    });
    console.log(`✅ Checkpoint عند كتلة #${latest.index}`);
    return block;
  }

  /* ═══════════════════════════════════════════════════════
     14. Merkle root
     ═══════════════════════════════════════════════════════ */
  async function computeMerkleRoot(hashes) {
    if (!hashes.length) return '0'.repeat(64);
    let level = [...hashes];
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const a = level[i];
        const b = level[i + 1] || a;
        next.push(await sha256(a + b));
      }
      level = next;
    }
    return level[0];
  }

  /* ═══════════════════════════════════════════════════════
     15. التحقق من السلسلة
     ═══════════════════════════════════════════════════════ */
  async function validateChain(options = {}) {
    await ensureInit();
    const { fast = false } = options;
    const errors = [];

    if (!fast) {
      for (let i = 0; i < chain.length; i++) {
        const cur = chain[i];
        const recalc = await cur.calculateHash();
        if (cur.hash !== recalc) {
          errors.push({
            index: i,
            type: 'hash_mismatch',
            message: `كتلة #${i}: التجزئة لا تطابق المحتوى`
          });
        }
        if (i > 0) {
          if (cur.previousHash !== chain[i - 1].hash) {
            errors.push({
              index: i,
              type: 'broken_link',
              message: `كتلة #${i}: ارتباط مكسور`
            });
          }
          if (cur.timestamp < chain[i - 1].timestamp) {
            errors.push({
              index: i,
              type: 'timestamp_anomaly',
              message: `كتلة #${i}: تسلسل زمني معكوس`
            });
          }
        } else if (cur.previousHash !== '0'.repeat(64)) {
          errors.push({
            index: 0,
            type: 'invalid_genesis',
            message: 'Genesis غير صالحة'
          });
        }
      }
    } else {
      /* فحص سريع عبر checkpoints */
      const checkpoints = chain.filter(b => b.data.type === 'checkpoint');
      let from = 1;
      for (const cp of checkpoints) {
        const covered = chain[cp.data.coversUpTo];
        if (!covered || covered.hash !== cp.data.rootHash) {
          errors.push({
            index: cp.index,
            type: 'checkpoint_mismatch',
            message: `Checkpoint عند #${cp.data.coversUpTo} لا يطابق الجذر`
          });
        }
        from = cp.data.coversUpTo + 1;
      }
      for (let i = from; i < chain.length; i++) {
        const cur = chain[i];
        const recalc = await cur.calculateHash();
        if (cur.hash !== recalc) {
          errors.push({
            index: i,
            type: 'hash_mismatch',
            message: `كتلة #${i}: تجزئة غير مطابقة`
          });
        }
        if (cur.previousHash !== chain[i - 1].hash) {
          errors.push({
            index: i,
            type: 'broken_link',
            message: `كتلة #${i}: ارتباط مكسور`
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      length: chain.length,
      errors,
      mode: fast ? 'fast' : 'full',
      checkedAt: Date.now()
    };
  }

  /* ═══════════════════════════════════════════════════════
     16. البحث والتحقق
     ═══════════════════════════════════════════════════════ */
  async function findPrescription(rxNumber) {
    await ensureInit();

    const idx = blockIndex[rxNumber];
    if (idx !== undefined) {
      const block = chain[idx];
      if (block && block.data.rxNumber === rxNumber) {
        return formatFound(block, idx);
      }
    }

    for (let i = 0; i < chain.length; i++) {
      const b = chain[i];
      if (b.data && b.data.type === 'prescription'
          && b.data.rxNumber === rxNumber) {
        await rebuildIndex();
        return formatFound(b, i);
      }
    }
    return null;
  }

  function formatFound(block, idx) {
    return {
      block: {
        index: block.index,
        hash: block.hash,
        previousHash: block.previousHash,
        timestamp: block.timestamp,
        merkleRoot: block.data.medicationsMerkleRoot
      },
      data: block.data,
      isImmutable: idx < chain.length - 2
    };
  }

  /* [FIX-4] verifyPrescription يفصل authentic/dispensable */
  async function verifyPrescription(rxNumber, verificationCode, options = {}) {
    await ensureInit();
    const { fastChain = false } = options;

    const found = await findPrescription(rxNumber);
    if (!found) {
      await logEvent('verify_failed', { rxNumber, reason: 'not_found' });
      return {
        valid: false,
        authentic: false,
        dispensable: false,
        reason: 'prescription_not_found',
        message: 'الوصفة غير موجودة في السلسلة'
      };
    }

    /* 1. كود التحقق */
    if (verificationCode) {
      const stored = (found.data.verificationCode || '').toUpperCase();
      const provided = String(verificationCode).trim().toUpperCase();
      if (stored && stored !== provided) {
        await logEvent('verify_failed', { rxNumber, reason: 'invalid_code' });
        return {
          valid: false,
          authentic: false,
          dispensable: false,
          reason: 'invalid_code',
          message: 'كود التحقق غير مطابق'
        };
      }
    }

    /* 2. سلامة السلسلة */
    const chainCheck = await validateChain({ fast: fastChain });
    if (!chainCheck.valid) {
      await logEvent('verify_failed', { rxNumber, reason: 'chain_corrupted' });
      return {
        valid: false,
        authentic: false,
        dispensable: false,
        reason: 'chain_corrupted',
        message: 'السلسلة معطوبة — لا يمكن ضمان الأصالة',
        errors: chainCheck.errors
      };
    }

    /* 3. Merkle للأدوية */
    if (found.data.medications && found.data.medicationsMerkleRoot) {
      const medHashes = await Promise.all(
        found.data.medications.map(m => sha256(canonicalize(m)))
      );
      const computed = await computeMerkleRoot(medHashes);
      if (computed !== found.data.medicationsMerkleRoot) {
        await logEvent('verify_failed', { rxNumber, reason: 'merkle_mismatch' });
        return {
          valid: false,
          authentic: false,
          dispensable: false,
          reason: 'merkle_mismatch',
          message: 'قائمة الأدوية تعرضت للتعديل'
        };
      }
    }

    /* 4. التوقيع الرقمي */
    const sigCheck = await verifySignature(found.data.signedBy, found.data);
    if (!sigCheck.valid) {
      await logEvent('verify_failed', { rxNumber, reason: sigCheck.reason });
      return {
        valid: false,
        authentic: false,
        dispensable: false,
        reason: sigCheck.reason,
        message: 'التوقيع الرقمي غير صالح — الوصفة مرفوضة'
      };
    }

    /* 5. الحالة الحالية */
    const status = await getStatus(rxNumber);
    const dispensable = status.status === 'issued';

    await logEvent('verify_success', { rxNumber });

    let message;
    if (status.status === 'cancelled') {
      message = '⚠️ وصفة أصلية موقعة لكنها ملغاة — لا تصرف';
    } else if (status.status === 'dispensed') {
      message = '✅ وصفة أصلية موقعة ومصروفة';
    } else {
      message = '✅ وصفة أصلية موقعة — جاهزة للصرف';
    }

    return {
      valid: true,
      authentic: true,
      dispensable,
      block: found.block,
      data: found.data,
      status: status.status,
      statusHistory: status,
      isImmutable: found.isImmutable,
      signatureValid: true,
      message
    };
  }

  /* ═══════════════════════════════════════════════════════
     17. تقرير التدقيق الكامل
     ═══════════════════════════════════════════════════════ */
  async function getAuditTrail(rxNumber) {
    await ensureInit();
    const found = await findPrescription(rxNumber);
    if (!found) return null;

    const indices = rxBlocks[rxNumber] || [];
    const entries = [];

    for (const idx of indices) {
      const b = chain[idx];
      if (!b) continue;
      entries.push({
        blockIndex: b.index,
        hash: b.hash,
        timestamp: b.timestamp,
        type: b.data.type,
        summary: b.data.type === 'prescription'
          ? `إصدار — ${b.data.medications.length} دواء — التشخيص: ${b.data.diagnosis || '—'}`
          : `${b.data.action}${b.data.reason ? ' — السبب: ' + b.data.reason : ''}` +
            `${b.data.by ? ' — بواسطة: ' + b.data.by : ''}`
      });
    }

    const relatedEvents = getEvents().filter(e =>
      e.details && e.details.rxNumber === rxNumber
    );

    const verify = await verifyPrescription(rxNumber, null, {
      fastChain: true
    });

    return {
      rxNumber,
      createdAt: found.data.createdAt,
      issuedBy: found.data.signedBy,
      signature: found.data.sig,
      status: (await getStatus(rxNumber)).status,
      entries,
      events: relatedEvents,
      verified: verify.valid && verify.authentic
    };
  }

  /* ═══════════════════════════════════════════════════════
     18. معلومات السلسلة
     ═══════════════════════════════════════════════════════ */
  async function getChainInfo() {
    await ensureInit();
    if (!chain.length) return null;

    const latest = chain[chain.length - 1];
    const prescriptionCount = chain.filter(
      b => b.data.type === 'prescription'
    ).length;
    const checkpointCount = chain.filter(
      b => b.data.type === 'checkpoint'
    ).length;

    return {
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      length: chain.length,
      prescriptionCount,
      checkpointCount,
      latestBlock: {
        index: latest.index,
        hash: latest.hash,
        timestamp: latest.timestamp
      },
      genesis: {
        hash: chain[0].hash,
        timestamp: chain[0].timestamp
      },
      config: {
        difficulty: CONFIG.difficulty,
        miningEnabled: CONFIG.miningEnabled,
        checkpointEvery: CONFIG.checkpointEvery,
        strictMode: CONFIG.strictMode,
        overlapWindowDays: CONFIG.overlapWindowDays
      },
      eventCount: events.length
    };
  }

  /* [NEW] نسخة سريعة للعرض بدون تعديل */
  async function getSnapshot() {
    await ensureInit();
    return {
      length: chain.length,
      blockIndex: { ...blockIndex },
      rxBlocks: { ...rxBlocks },
      patientIndexSize: Object.keys(patientIndex).length,
      latest: chain.length
        ? {
            index: chain[chain.length - 1].index,
            hash: chain[chain.length - 1].hash
          }
        : null,
      isInitialized
    };
  }

  /* ═══════════════════════════════════════════════════════
     19. التصدير والاستيراد [FIX-9]
     ═══════════════════════════════════════════════════════ */
  async function exportChain() {
    await ensureInit();
    const payload = chain.map(b => b.toJSON());
    return {
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      length: chain.length,
      chain: payload,
      manifest: {
        mac: await hmacWith(CONFIG.hmacSecret, JSON.stringify(payload)),
        lastHash: chain.length ? chain[chain.length - 1].hash : null,
        prescriptionCount: chain.filter(
          b => b.data.type === 'prescription'
        ).length
      },
      info: await getChainInfo()
    };
  }

  async function importChain(data, options = {}) {
    if (!data || !Array.isArray(data.chain))
      throw new Error('بيانات blockchain غير صالحة');

    const { merge = false, verifySignatures = true } = options;

    /* 1. تحقق بنيوي */
    const newChain = [];
    for (const obj of data.chain) {
      const block = Block.fromJSON(obj);
      if (await block.calculateHash() !== block.hash) {
        throw new Error(`كتلة #${block.index} معطوبة (تجزئة غير مطابقة)`);
      }
      newChain.push(block);
    }
    for (let i = 1; i < newChain.length; i++) {
      if (newChain[i].previousHash !== newChain[i - 1].hash) {
        throw new Error(`كتلة #${i} غير مرتبطة بالسابقة`);
      }
    }

    /* 2. تحقق التواقيع (عينة 10) */
    if (verifySignatures) {
      const rxList = newChain.filter(b => b.data.type === 'prescription');
      const step = Math.max(1, Math.floor(rxList.length / 10));
      for (let i = 0; i < rxList.length; i += step) {
        const b = rxList[i];
        const check = await verifySignature(b.data.signedBy, b.data);
        if (!check.valid) {
          throw new Error(`توقيع غير صالح في كتلة #${b.index} — الاستيراد مرفوض`);
        }
      }
    }

    /* 3. دمج أو استبدال */
    if (merge && chain.length > 0) {
      const lastLocal = chain[chain.length - 1];
      const imported = newChain.filter(b =>
        b.index > lastLocal.index && b.previousHash === lastLocal.hash
      );
      if (!imported.length) return { merged: 0 };
      chain.push(...imported);
      await rebuildIndex();
      await enqueueSave();
      await logEvent('chain_merged', { count: imported.length });
      emitMutation('imported', { merged: imported.length });
      return { merged: imported.length };
    }

    chain = newChain;
    await rebuildIndex();
    await enqueueSave();

    /* [FIX-9] إنشاء Checkpoint للسلاسل الكبيرة */
    const rxCount = chain.filter(b => b.data.type === 'prescription').length;
    if (rxCount >= CONFIG.checkpointEvery) {
      await createCheckpoint();
    }

    await logEvent('chain_replaced', { length: chain.length });
    emitMutation('imported', { replaced: true, length: chain.length });
    return { replaced: true, length: chain.length };
  }

  /* ═══════════════════════════════════════════════════════
     20. أدوات مساعدة
     ═══════════════════════════════════════════════════════ */
  async function hashField(text) {
    if (!text) return null;
    return (await sha256(String(text))).substring(0, 16);
  }

  function getInitials(name) {
    if (!name) return '—';
    return String(name).split(' ').filter(Boolean).slice(0, 2)
      .map(w => w[0]).join('').toUpperCase();
  }

  /* [NEW] إدارة الحجر الصحي */
  async function getQuarantine() {
    try {
      return JSON.parse(localStorage.getItem(QUARANTINE_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  async function clearQuarantine() {
    try {
      localStorage.removeItem(QUARANTINE_KEY);
      await logEvent('quarantine_cleared', {});
      return true;
    } catch (_) {
      return false;
    }
  }

  async function resetChain() {
    chain = [];
    blockIndex = {};
    rxBlocks = {};
    patientIndex = {};
    events = [];
    isInitialized = false;
    initPromise = null;
    saveQueue = Promise.resolve();

    for (const key of [
      CHAIN_KEY, CHAIN_TMP, INDEX_KEY,
      EVENTS_KEY, JOURNAL_KEY, QUARANTINE_KEY
    ]) {
      try { localStorage.removeItem(key); } catch (_) { /* تجاهل */ }
    }
    console.log('🗑️ تم حذف blockchain الطبية');
    await init();
  }

  /* ═══════════════════════════════════════════════════════
     21. الواجهة العامة
     ═══════════════════════════════════════════════════════ */
  return {
    VERSION,
    SCHEMA_VERSION,
    CONFIG,

    /* التهيئة */
    init,
    ensureInit,

    /* الإصدار والدورة الحياتية */
    addPrescription,
    recordLifecycle,
    getStatus,
    getAuditTrail,

    /* الفحص السريري */
    validateMedical,

    /* القراءة والتحقق */
    findPrescription,
    verifyPrescription,
    getChainInfo,
    getSnapshot,
    getChain: () => [...chain],
    getEvents,

    /* سلامة السلسلة */
    validateChain,
    getQuarantine,
    clearQuarantine,

    /* الخطافات */
    onMutation,

    /* التصدير/الاستيراد */
    exportChain,
    importChain,

    /* الأدوات */
    resetChain,
    sha256,
    canonicalize,
    computeMerkleRoot,
    signPayload,
    verifySignature
  };
})();

if (typeof window !== 'undefined') {
  window.PrescriptionChain = PrescriptionChain;
}

console.log(
  `✅ blockchain.js v${PrescriptionChain.VERSION} ` +
  `(Medical Edition · Fixed) — PrescriptionChain متاح`
);
