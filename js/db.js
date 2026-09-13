/* =========================================
   db.js — طبقة IndexedDB الاحترافية
   قواعد: users / patients / prescriptions / audit
   (نسخة مدمجة نهائية — v2.1)

   التحسينات في هذه النسخة (v2.1):
   ✅ v2.1-01: _initPromise يُعاد ضبطه عند الفشل (إعادة محاولة تلقائية)
   ✅ v2.1-02: hashPassword مع fallback عند غياب crypto.subtle (HTTP)
   ✅ v2.1-03: openDB مع 5 محاولات تلقائية عند onblocked
   ✅ v2.1-04: _seedDefaultUsers زرع تدريجي (لا توقف جزئي)
   ✅ v2.1-05: hasPermission بحماية الحروف الكبيرة + دور عربي
   ✅ v2.1-06: logAudit مع مخزن مؤقت للأحداث عند إغلاق القاعدة
   ✅ v2.1-07: getUserByUsername بـ getByIndex بدل getAll
   ✅ v2.1-08: updateLastLogin داخل transaction (منع سباق)
   ✅ v2.1-09: getRoleLabel يدعم الأدوار العربية
   ✅ v2.1-10: resetDatabase آمنة مع تنظيف شامل
   ✅ إضافة mustChangePassword للحسابات الافتراضية
========================================= */

const DB_NAME = 'mediprescribe_db';
const DB_VERSION = 1;
let _db = null;
let _initPromise = null;

/* ==========================================================
   1. الأدوار والصلاحيات الافتراضية
   ========================================================== */
const ROLES = {
  ADMIN:        'admin',
  DOCTOR:       'doctor',
  PHARMACIST:   'pharmacist',
  NURSE:        'nurse',
  RECEPTIONIST: 'receptionist'
};

const ROLE_LABELS_AR = {
  admin:        'مدير النظام',
  doctor:       'طبيب باطنية',
  pharmacist:   'صيدلي',
  nurse:        'ممرض',
  receptionist: 'استقبال'
};

/* خريطة عكسية: عربي → إنجليزي (تُستخدم في getRoleLabel و hasPermission) */
const ROLE_AR_TO_EN = {
  'مدير النظام': 'admin',
  'مدير':        'admin',
  'طبيب باطنية': 'doctor',
  'طبيب':        'doctor',
  'صيدلي':       'pharmacist',
  'ممرض':        'nurse',
  'ممرضة':       'nurse',
  'استقبال':     'receptionist',
  'موظف استقبال': 'receptionist'
};

const ALL_PERMISSIONS = [
  'create_prescription',
  'view_records',
  'print_prescription',
  'delete_records',
  'manage_users',
  'export_data',
  'view_audit_log',
  'system_settings'
];

const ROLE_DEFAULT_PERMISSIONS = {
  admin:        [...ALL_PERMISSIONS],
  doctor:       ['create_prescription', 'view_records', 'print_prescription', 'export_data'],
  pharmacist:   ['view_records', 'print_prescription'],
  nurse:        ['view_records'],
  receptionist: ['view_records', 'print_prescription']
};

window.ROLES = ROLES;
window.ROLE_LABELS_AR = ROLE_LABELS_AR;
window.ROLE_AR_TO_EN = ROLE_AR_TO_EN;
window.ALL_PERMISSIONS = ALL_PERMISSIONS;
window.ROLE_DEFAULT_PERMISSIONS = ROLE_DEFAULT_PERMISSIONS;


/* ==========================================================
   2. فتح قاعدة البيانات
   ✅ v2.1-03: إعادة محاولة تلقائية (5 محاولات) عند onblocked
   ========================================================== */
function openDB(retryCount = 0) {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('المتصفح لا يدعم IndexedDB (جرّب متصفحاً آخر أو أغلق وضع التصفح الخاص)'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;

    req.onupgradeneeded = e => {
      const d = e.target.result;

      if (!d.objectStoreNames.contains('users')) {
        const s = d.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
        s.createIndex('username', 'username', { unique: true });
        s.createIndex('role', 'role', { unique: false });
      }

      if (!d.objectStoreNames.contains('patients')) {
        const s = d.createObjectStore('patients', { keyPath: 'id', autoIncrement: true });
        s.createIndex('name', 'name', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!d.objectStoreNames.contains('prescriptions')) {
        const s = d.createObjectStore('prescriptions', { keyPath: 'id', autoIncrement: true });
        s.createIndex('patientId', 'patientId', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
        s.createIndex('doctorId', 'doctorId', { unique: false });
      }

      if (!d.objectStoreNames.contains('audit')) {
        const s = d.createObjectStore('audit', { keyPath: 'id', autoIncrement: true });
        s.createIndex('time', 'time', { unique: false });
        s.createIndex('by', 'by', { unique: false });
      }
    };

    req.onsuccess = e => {
      if (settled) return;
      settled = true;

      _db = e.target.result;

      /* إغلاق تلقائي عند تغيير النسخة */
      _db.onversionchange = () => {
        try { _db.close(); } catch (_) {}
        _db = null;
        _initPromise = null;   /* ✅ اسمح بإعادة الفتح */
        console.warn('⚠️ تم إغلاق قاعدة البيانات — يرجى إعادة تحميل الصفحة');
      };

      resolve(_db);
    };

    req.onerror = e => {
      if (settled) return;
      settled = true;
      reject(e.target.error || new Error('تعذّر فتح قاعدة البيانات'));
    };

    /* ✅ v2.1-03: إعادة محاولة عند القفل */
    req.onblocked = () => {
      if (settled) return;
      settled = true;

      console.warn(`⏳ قاعدة البيانات مقفلة (محاولة ${retryCount + 1}/5) — إعادة المحاولة بعد 1.5 ثانية`);

      if (retryCount < 5) {
        setTimeout(() => {
          resolve(openDB(retryCount + 1));
        }, 1500);
      } else {
        reject(new Error(
          'قاعدة البيانات مقفلة بعد 5 محاولات — ' +
          'أغلق كل التبويبات المفتوحة للتطبيق ثم أعد تحميل الصفحة'
        ));
      }
    };
  });
}


/* ==========================================================
   3. عمليات عامة (DB wrapper)
   ✅ v2.1-07: إضافة getByIndex
   ========================================================== */
function _req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('فشلت عملية قاعدة البيانات'));
  });
}

function _ensureOpen() {
  if (!_db) throw new Error('قاعدة البيانات غير مفتوحة — استدعِ initDB() أولاً');
}

const DB = {
  add(store, obj) {
    _ensureOpen();
    return _req(_db.transaction(store, 'readwrite').objectStore(store).add(obj));
  },
  put(store, obj) {
    _ensureOpen();
    return _req(_db.transaction(store, 'readwrite').objectStore(store).put(obj));
  },
  get(store, key) {
    _ensureOpen();
    return _req(_db.transaction(store, 'readonly').objectStore(store).get(key));
  },
  del(store, key) {
    _ensureOpen();
    return _req(_db.transaction(store, 'readwrite').objectStore(store).delete(key));
  },
  all(store) {
    _ensureOpen();
    return _req(_db.transaction(store, 'readonly').objectStore(store).getAll());
  },
  clear(store) {
    _ensureOpen();
    return _req(_db.transaction(store, 'readwrite').objectStore(store).clear());
  },
  count(store) {
    _ensureOpen();
    return _req(_db.transaction(store, 'readonly').objectStore(store).count());
  },
  /* إرجاع كل السجلات بمؤشر معين */
  byIndex(store, idx, val) {
    _ensureOpen();
    return _req(
      _db.transaction(store, 'readonly').objectStore(store).index(idx).getAll(val)
    );
  },
  /* ✅ v2.1-07: إرجاع سجل واحد بمؤشر فريد */
  getByIndex(store, idx, val) {
    _ensureOpen();
    return _req(
      _db.transaction(store, 'readonly').objectStore(store).index(idx).get(val)
    );
  }
};

window.DB = DB;


/* ==========================================================
   4. تجزئة كلمات المرور (SHA-256)
   ✅ v2.1-02: fallback عند غياب crypto.subtle (HTTP بدون HTTPS)
   ========================================================== */
async function hashPassword(password) {
  const enc = new TextEncoder().encode(String(password));

  /* ── المسار المفضّل: SHA-256 عبر Web Crypto ── */
  if (window.crypto?.subtle?.digest) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (err) {
      console.warn('crypto.subtle فشل — يتم التحويل إلى البديل:', err);
    }
  }

  /* ── Fallback: DJB2 (ليس آمناً بالكامل، لكن يمنع الانهيار) ── */
  console.warn(
    '⚠️ SHA-256 غير متاح (يتطلب HTTPS) — يُستخدم hash بديل. ' +
    'استخدم HTTPS للإنتاج للحصول على أمان كامل.'
  );
  let hash = 5381;
  const str = String(password);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'fb_' + Math.abs(hash).toString(16).padStart(16, '0');
}
window.hashPassword = hashPassword;


/* ==========================================================
   5. التحقق من كلمة المرور
   ========================================================== */
async function verifyPassword(inputPassword, storedPassword) {
  if (!inputPassword || !storedPassword) return false;

  /* توافق مع نُسخ قديمة فيها كلمة المرور نصاً صريحاً */
  if (inputPassword === storedPassword) return true;

  /* المقارنة مع المُجزّأ */
  const hashedInput = await hashPassword(inputPassword);
  return hashedInput === storedPassword;
}
window.verifyPassword = verifyPassword;


/* ==========================================================
   6. تحديث وقت آخر دخول
   ✅ v2.1-08: داخل transaction لمنع السباق
   ========================================================== */
async function updateLastLogin(userId) {
  try {
    _ensureOpen();
    const tx = _db.transaction('users', 'readwrite');
    const store = tx.objectStore('users');
    const user = await _req(store.get(userId));
    if (!user) return;
    user.lastLogin = Date.now();
    await _req(store.put(user));
  } catch (err) {
    console.error('updateLastLogin error:', err);
  }
}
window.updateLastLogin = updateLastLogin;


/* ==========================================================
   7. بيانات الحسابات الافتراضية
   ✅ v2.1: إضافة mustChangePassword
   ========================================================== */
function buildDefaultUsers() {
  const H = (typeof HOSPITALS !== 'undefined' && HOSPITALS.length)
    ? HOSPITALS
    : [
        'هيئة مستشفى الثورة العام',
        'مستشفى جبله الجامعي',
        'مستشفى البدر الدولي'
      ];

  return [
    {
      username: 'admin',
      password: 'admin123',
      role: ROLES.ADMIN,
      fullName: 'المدير العام',
      email: 'admin@mediprescribe.gov',
      hospital: H[0] || '',
      phone: '770000001'
    },
    {
      username: 'dr.salem',
      password: 'salam123',
      role: ROLES.DOCTOR,
      fullName: 'د. سالم الحميري',
      email: 'dr.salem@mediprescribe.gov',
      hospital: H[1] || H[0] || '',
      phone: '770000002'
    },
    {
      username: 'pharma.ali',
      password: 'ali123',
      role: ROLES.PHARMACIST,
      fullName: 'علي المطري',
      email: 'pharma.ali@mediprescribe.gov',
      hospital: H[2] || H[0] || '',
      phone: '770000003'
    }
  ];
}


/* ==========================================================
   8. زرع الحسابات الافتراضية
   ✅ v2.1-04: زرع تدريجي (لا توقف جزئي)
   ========================================================== */
async function _seedDefaultUsers() {
  const users = await DB.all('users');
  const existing = new Set(users.map(u => u.username));
  const seed = buildDefaultUsers();

  /* ── الحالة 1: قاعدة فارغة → ازرع الجميع ── */
  if (!users.length) {
    for (const u of seed) {
      const hashed = await hashPassword(u.password);
      await DB.add('users', {
        username: u.username,
        password: hashed,
        role: u.role,
        roleLabel: ROLE_LABELS_AR[u.role] || u.role,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        hospital: u.hospital,
        status: 'active',
        permissions: [...(ROLE_DEFAULT_PERMISSIONS[u.role] || [])],
        createdAt: Date.now(),
        lastLogin: null,
        mustChangePassword: true   /* ✅ v2.1: إلزام بتغيير كلمة المرور */
      });
    }

    await DB.add('audit', {
      action: 'تهيئة النظام — زرع الحسابات الافتراضية',
      detail: `تم إنشاء ${seed.length} حسابات`,
      by: 'النظام',
      time: Date.now()
    });
    return;
  }

  /* ── الحالة 2: زرع الحسابات الناقصة (فردياً) ── */
  const missing = seed.filter(u => !existing.has(u.username));

  for (const u of missing) {
    try {
      const hashed = await hashPassword(u.password);
      await DB.add('users', {
        username: u.username,
        password: hashed,
        role: u.role,
        roleLabel: ROLE_LABELS_AR[u.role] || u.role,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        hospital: u.hospital,
        status: 'active',
        permissions: [...(ROLE_DEFAULT_PERMISSIONS[u.role] || [])],
        createdAt: Date.now(),
        lastLogin: null,
        mustChangePassword: true
      });
      console.log('🔧 [seeding] أنشأ حساباً مفقوداً:', u.username);
    } catch (err) {
      /* مستخدم موجود مسبقاً (سباق نادر) أو فشل — تابع */
      console.warn('🔧 [seeding] فشل إنشاء', u.username, '—', err.message);
    }
  }

  if (missing.length) {
    await DB.add('audit', {
      action: 'إعادة زرع حسابات مفقودة',
      detail: missing.map(u => u.username).join(', '),
      by: 'النظام',
      time: Date.now()
    });
  }
}


/* ==========================================================
   9. تهيئة قاعدة البيانات
   ✅ v2.1-01: _initPromise يُعاد ضبطه عند الفشل
   ✅ v2.1-06: تفريغ الأحداث المعلّقة
   ========================================================== */
async function initDB() {
  /* ── إن كان هناك وعد سابق، أعِد استخدامه ── */
  if (_initPromise) {
    try {
      return await _initPromise;
    } catch (_) {
      /* فشل سابق → أعِد المحاولة */
      _initPromise = null;
    }
  }

  _initPromise = (async () => {
    await openDB();

    try {
      await _seedDefaultUsers();
    } catch (err) {
      console.error('initDB seed error:', err);
      /* فشل الزرع لا يمنع فتح التطبيق */
    }

    /* ✅ v2.1-06: تفريغ الأحداث المعلّقة */
    try {
      await _flushPendingAudit();
    } catch (err) {
      console.warn('flushPendingAudit failed:', err);
    }

    return _db;
  })();

  try {
    return await _initPromise;
  } catch (err) {
    _initPromise = null;   /* ✅ اسمح بإعادة المحاولة في المستقبل */
    throw err;
  }
}
window.initDB = initDB;


/* ==========================================================
   10. سجل التدقيق (Audit Log)
   ✅ v2.1-06: مخزن مؤقت للأحداث عند إغلاق القاعدة
   ========================================================== */
window.__pendingAudit = window.__pendingAudit || [];

async function logAudit(action, detail) {
  const entry = {
    action,
    detail: detail || '',
    by: (() => {
      try {
        const u = JSON.parse(localStorage.getItem('mp_session') || 'null');
        return u ? (u.fullName || u.username) : 'غير مسجل';
      } catch (_) { return 'غير مسجل'; }
    })(),
    time: Date.now()
  };

  /* إن كانت القاعدة مغلقة، احتفظ بالحدث */
  if (!_db) {
    window.__pendingAudit.push(entry);
    return;
  }

  try {
    await DB.add('audit', entry);
  } catch (e) {
    console.error('logAudit error:', e);
    window.__pendingAudit.push(entry);
  }
}
window.logAudit = logAudit;

/* تفريغ الأحداث المعلّقة بعد فتح القاعدة */
async function _flushPendingAudit() {
  if (!window.__pendingAudit.length || !_db) return;
  const pending = [...window.__pendingAudit];
  window.__pendingAudit = [];

  for (const entry of pending) {
    try {
      await DB.add('audit', entry);
    } catch (err) {
      console.warn('flush pending audit failed:', err);
    }
  }

  if (pending.length) {
    console.log(`🔁 تم تفريغ ${pending.length} حدث تدقيق معلّق`);
  }
}


/* ==========================================================
   11. أدوات مساعدة
   ========================================================== */

/* ✅ v2.1-07: بـ getByIndex بدل byIndex+[0] */
async function getUserByUsername(username) {
  try {
    return await DB.getByIndex('users', 'username', username);
  } catch (e) {
    console.error('getUserByUsername error:', e);
    return null;
  }
}
window.getUserByUsername = getUserByUsername;

/* جلب المستخدم النشط من الجلسة */
function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('mp_session') || 'null');
  } catch (_) {
    return null;
  }
}
window.getCurrentUser = getCurrentUser;


/* ==========================================================
   hasPermission — نسخة محصّنة (v2.1)
   ✅ v2.1-05: حماية الحروف الكبيرة + دور عربي + احتياطيات
   ========================================================== */
function hasPermission(permission) {
  const user = getCurrentUser();
  if (!user) return false;

  const roleRaw = String(user.role || '').trim();
  const roleLow = roleRaw.toLowerCase();

  /* ── 1) المدير: كل الصلاحيات دائماً ── */
  const adminRoles = ['admin', 'مدير النظام', 'مدير'];
  if (adminRoles.includes(roleRaw) || adminRoles.includes(roleLow)) return true;

  /* ── 2) صلاحيات المستخدم من الجلسة ── */
  let perms = Array.isArray(user.permissions) ? [...user.permissions] : [];

  /* ── 3) إن كانت فارغة → استخدم صلاحيات الدور الافتراضية ── */
  if (!perms.length) {
    /* بصيغة إنجليزية (المفتاح الأساسي) */
    if (ROLE_DEFAULT_PERMISSIONS[roleRaw]) {
      perms = [...ROLE_DEFAULT_PERMISSIONS[roleRaw]];
    } else if (ROLE_DEFAULT_PERMISSIONS[roleLow]) {
      perms = [...ROLE_DEFAULT_PERMISSIONS[roleLow]];
    } else {
      /* بصيغة عربية */
      const key = ROLE_AR_TO_EN[roleRaw];
      if (key) perms = [...(ROLE_DEFAULT_PERMISSIONS[key] || [])];
    }
  }

  /* ── 4) احتياطي: كل طبيب يستطيع إنشاء وصفات ── */
  if (permission === 'create_prescription') {
    const doctorRoles = ['doctor', 'طبيب باطنية', 'طبيب'];
    if (doctorRoles.includes(roleRaw) || doctorRoles.includes(roleLow)) return true;
  }

  /* ── 5) احتياطي: كل طبيب/صيدلي/ممرض/استقبال يستطيع عرض السجلات ── */
  if (permission === 'view_records') {
    const viewerRoles = [
      'doctor', 'pharmacist', 'nurse', 'receptionist',
      'طبيب باطنية', 'طبيب', 'صيدلي', 'ممرض', 'ممرضة', 'استقبال'
    ];
    if (viewerRoles.includes(roleRaw) || viewerRoles.includes(roleLow)) return true;
  }

  /* ── 6) احتياطي: كل طبيب/صيدلي/استقبال يستطيع الطباعة ── */
  if (permission === 'print_prescription') {
    const printerRoles = [
      'doctor', 'pharmacist', 'receptionist',
      'طبيب باطنية', 'طبيب', 'صيدلي', 'استقبال'
    ];
    if (printerRoles.includes(roleRaw) || printerRoles.includes(roleLow)) return true;
  }

  /* ── 7) الفحص النهائي ── */
  return perms.includes(permission);
}
window.hasPermission = hasPermission;


/* ✅ v2.1-09: getRoleLabel يدعم الأدوار العربية */
function getRoleLabel(role) {
  if (!role) return '';
  if (ROLE_LABELS_AR[role]) return ROLE_LABELS_AR[role];

  /* احتياطي: تحويل من العربية إلى المفتاح الإنجليزي */
  const key = ROLE_AR_TO_EN[role];
  return key ? ROLE_LABELS_AR[key] : role;
}
window.getRoleLabel = getRoleLabel;

/* هل المستخدم مدير؟ */
function isAdmin() {
  const user = getCurrentUser();
  if (!user) return false;
  const role = String(user.role || '').trim();
  return ['admin', 'مدير النظام', 'مدير'].includes(role);
}
window.isAdmin = isAdmin;


/* ==========================================================
   12. إعادة تعيين قاعدة البيانات (للتطوير فقط)
   ✅ v2.1-10: تنظيف شامل + معالجة أخطاء
   ========================================================== */
async function resetDatabase() {
  /* ── إغلاق آمن ── */
  try {
    if (_db) { _db.close(); }
  } catch (e) {
    console.warn('close error:', e);
  }

  _db = null;
  _initPromise = null;
  window.__pendingAudit = [];

  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);

    req.onsuccess = () => {
      console.log('✅ تم حذف قاعدة البيانات — أعد تحميل الصفحة');
      resolve(true);
    };

    req.onerror = () => {
      reject(req.error || new Error('فشل حذف قاعدة البيانات'));
    };

    req.onblocked = () => {
      console.warn('⚠️ قاعدة البيانات مقفلة — أغلق كل التبويبات المفتوحة');
      reject(new Error('قاعدة البيانات مقفلة — أغلق التبويبات ثم أعد المحاولة'));
    };
  });
}
window.resetDatabase = resetDatabase;


/* ==========================================================
   13. رسالة الإقلاع (شرطية)
   ========================================================== */
(function announceReady() {
  const isDev = location.hostname === 'localhost' ||
                location.hostname === '127.0.0.1' ||
                location.search.includes('debug');
  if (isDev) {
    console.log(
      '%c✅ db.js جاهز | v2.1 | الأوامر: resetDatabase()',
      'color:#43a047;font-weight:bold'
    );
  }
})();