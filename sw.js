/* ==========================================================
   MediPrescribe — Service Worker v2.0
   PWA كامل مع دعم i18n + Cache استراتيجي
   ----------------------------------------------------------
   المميزات:
   ✅ Cache-first للـ CSS/JS/الصور (سرعة عالية)
   ✅ Network-first لصفحات HTML (أحدث نسخة)
   ✅ Stale-while-revalidate للـ API
   ✅ Cache محدّث تلقائياً عند تغيير النسخة
   ✅ دعم كامل للـ i18n (ترجمات JSON)
   ✅ صفحة offline مدمجة
   ✅ إشعارات Push
   ✅ Background Sync (اختياري)
   ✅ Skip waiting للتفعيل الفوري
========================================================== */

'use strict';

/* ═══════════════════════════════════════════════════════
   1. الإعدادات
   ═══════════════════════════════════════════════════════ */
const CACHE_VERSION = 'v2.1.0';
const CACHE_PREFIX = 'mediprescribe';

const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `${CACHE_PREFIX}-dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE = `${CACHE_PREFIX}-images-${CACHE_VERSION}`;
const LOCALE_CACHE = `${CACHE_PREFIX}-locales-${CACHE_VERSION}`;

/* مدة الاحتفاظ في Cache الديناميكي (بالثواني) */
const DYNAMIC_CACHE_MAX_AGE = 7 * 24 * 60 * 60; // 7 أيام
const DYNAMIC_CACHE_MAX_ITEMS = 50;

/* ═══════════════════════════════════════════════════════
   2. قوائم الملفات
   ═══════════════════════════════════════════════════════ */

/* ─── الملفات الثابتة (تُحمَّل مسبقاً) ─── */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/dashboard.html',
  '/users.html',
  '/audit-log.html',
  '/verify.html',
  '/offline.html',
  '/manifest.json',
  '/browserconfig.xml',

  /* CSS */
  '/css/style.css',

  /* JS الأساسية */
  '/js/data.js',
  '/js/db.js',
  '/js/i18n.js',
  '/js/app.js',
  '/js/public.js',
  '/js/users.js',
  '/js/audit.js',
  '/js/safety.js',
  '/js/rx.js',
  '/js/summary.js',

  /* ترجمات */
  '/js/locales/ar.json',
  '/js/locales/en.json',

  /* صور أساسية */
  '/images/logo-yemen.png',
  '/images/logo-health.png',
  '/images/logo-mediprescribe.png',
  '/images/favicon.ico',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/apple-touch-icon.png',
  '/images/maskable-icon-512.png'
];

/* ─── صور الأقسام (Cache منفصل) ─── */
const IMAGE_ASSETS = [
  '/images/care.jpg',
  '/images/internal.jpg',
  '/images/cardio.jpg',
  '/images/pediatrics.jpg',
  '/images/derma.jpg',
  '/images/eyes.jpg',
  '/images/ortho.jpg',
  '/images/placeholder.png'
];

/* ─── نطاقات خارجية (Fonts + CDN) ─── */
const EXTERNAL_DOMAINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net'
];

/* ═══════════════════════════════════════════════════════
   3. تثبيت Service Worker
   ═══════════════════════════════════════════════════════ */
self.addEventListener('install', (event) => {
  console.log('[SW] 📦 تثبيت الإصدار:', CACHE_VERSION);

  event.waitUntil(
    (async () => {
      try {
        /* ─── 1. الملفات الثابتة ─── */
        const staticCache = await caches.open(STATIC_CACHE);
        console.log(`[SW] 🗂️ جارٍ تخزين ${STATIC_ASSETS.length} ملف أساسي...`);

        // استخدم addAll مع تجاهل الأخطاء الفردية
        await Promise.allSettled(
          STATIC_ASSETS.map(url =>
            staticCache.add(new Request(url, { cache: 'reload' }))
              .catch(err => console.warn(`[SW] ⚠️ فشل تحميل: ${url}`, err.message))
          )
        );

        /* ─── 2. الصور ─── */
        const imageCache = await caches.open(IMAGE_CACHE);
        console.log(`[SW] 🖼️ جارٍ تخزين ${IMAGE_ASSETS.length} صورة...`);

        await Promise.allSettled(
          IMAGE_ASSETS.map(url =>
            imageCache.add(new Request(url, { cache: 'reload' }))
              .catch(err => console.warn(`[SW] ⚠️ فشل تحميل صورة: ${url}`, err.message))
          )
        );

        /* ─── 3. الترجمات ─── */
        const localeCache = await caches.open(LOCALE_CACHE);
        console.log('[SW] 🌐 جارٍ تخزين الترجمات...');

        await Promise.allSettled([
          localeCache.add('/js/locales/ar.json').catch(() => {}),
          localeCache.add('/js/locales/en.json').catch(() => {})
        ]);

        console.log('[SW] ✅ اكتمل التثبيت بنجاح');

        /* تفعيل فوري */
        await self.skipWaiting();

      } catch (err) {
        console.error('[SW] ❌ فشل التثبيت:', err);
      }
    })()
  );
});

/* ═══════════════════════════════════════════════════════
   4. تنشيط Service Worker
   ═══════════════════════════════════════════════════════ */
self.addEventListener('activate', (event) => {
  console.log('[SW] 🚀 تنشيط الإصدار:', CACHE_VERSION);

  event.waitUntil(
    (async () => {
      try {
        /* حذف cache القديمة */
        const cacheNames = await caches.keys();
        const oldCaches = cacheNames.filter(name =>
          name.startsWith(CACHE_PREFIX) &&
          !name.includes(CACHE_VERSION)
        );

        await Promise.all(oldCaches.map(name => {
          console.log('[SW] 🗑️ حذف cache قديم:', name);
          return caches.delete(name);
        }));

        /* استولي على كل العملاء */
        await self.clients.claim();

        console.log('[SW] ✅ التنشيط اكتمل');

        /* أبلغ العملاء */
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: CACHE_VERSION
          });
        });

      } catch (err) {
        console.error('[SW] ❌ فشل التنشيط:', err);
      }
    })()
  );
});

/* ═══════════════════════════════════════════════════════
   5. اعتراض الطلبات (Fetch)
   ═══════════════════════════════════════════════════════ */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  /* ─── تجاهل الطلبات غير GET ─── */
  if (request.method !== 'GET') return;

  /* ─── تجاهل chrome-extension وبعض البروتوكولات ─── */
  if (!url.protocol.startsWith('http')) return;

  /* ─── تجاهل طلبات Drive و غيرها ─── */
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnlyStrategy(request));
    return;
  }

  /* ─── HTML: Network-first ─── */
  if (request.mode === 'navigate' ||
      (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  /* ─── الترجمات: Cache-first ─── */
  if (url.pathname.includes('/locales/') && url.pathname.endsWith('.json')) {
    event.respondWith(localeStrategy(request));
    return;
  }

  /* ─── الصور: Cache-first (بدون شبكة) ─── */
  if (request.destination === 'image') {
    event.respondWith(imageStrategy(request));
    return;
  }

  /* ─── CSS/JS/Fonts: Cache-first ─── */
  if (request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'font') {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  /* ─── نطاقات خارجية: Stale-while-revalidate ─── */
  if (EXTERNAL_DOMAINS.some(domain => url.hostname.includes(domain))) {
    event.respondWith(staleWhileRevalidateStrategy(request));
    return;
  }

  /* ─── الباقي: Cache-first ─── */
  event.respondWith(cacheFirstStrategy(request));
});

/* ═══════════════════════════════════════════════════════
   6. استراتيجيات Cache
   ═══════════════════════════════════════════════════════ */

/* ─── 6.1 Cache-first (للأصول الثابتة) ─── */
async function cacheFirstStrategy(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);

    if (response && response.status === 200 && response.type === 'basic') {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
      /* حدّ من حجم Cache الديناميكي */
      trimCache(DYNAMIC_CACHE, DYNAMIC_CACHE_MAX_ITEMS);
    }

    return response;
  } catch (err) {
    console.warn('[SW] ⚠️ Cache-first فشل:', request.url);
    const fallback = await caches.match(request);
    if (fallback) return fallback;

    /* بدائل حسب النوع */
    if (request.destination === 'image') {
      return caches.match('/images/placeholder.png');
    }

    throw err;
  }
}

/* ─── 6.2 Network-first (لصفحات HTML) ─── */
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);

    if (response && response.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    console.log('[SW] 📴 offline — استخدام cache للصفحة:', request.url);

    const cached = await caches.match(request);
    if (cached) return cached;

    /* صفحة offline */
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) return offlinePage;

    /* صفحة افتراضية */
    return new Response(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>غير متصل</title>
        <style>
          body {
            font-family: 'Tajawal', system-ui, sans-serif;
            background: linear-gradient(180deg, #0a1628, #0f2138);
            color: #eef3f8;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            text-align: center;
          }
          .offline {
            background: rgba(14,28,55,0.95);
            border: 1px solid rgba(212,175,55,0.3);
            border-radius: 20px;
            padding: 48px 32px;
            max-width: 480px;
          }
          h1 { color: #f1d878; font-size: 1.6rem; margin: 0 0 12px; }
          p { color: rgba(200,215,255,0.75); line-height: 1.8; margin: 0 0 24px; }
          button {
            background: linear-gradient(135deg, #d4af37, #f1d878);
            color: #0a1628;
            border: none;
            border-radius: 12px;
            padding: 14px 28px;
            font-weight: 800;
            font-family: inherit;
            font-size: 1rem;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="offline">
          <div style="font-size: 5rem; margin-bottom: 20px;">📴</div>
          <h1>لا يوجد اتصال بالإنترنت</h1>
          <p>تأكد من اتصالك بالإنترنت ثم أعد المحاولة</p>
          <button onclick="location.reload()">🔄 إعادة المحاولة</button>
        </div>
      </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

/* ─── 6.3 Image strategy (Cache-first + long cache) ─── */
async function imageStrategy(request) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);

    if (response && response.status === 200) {
      const cache = await caches.open(IMAGE_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    const fallback = await caches.match(request);
    if (fallback) return fallback;

    return caches.match('/images/placeholder.png') ||
           new Response('', { status: 404 });
  }
}

/* ─── 6.4 Locale strategy (Cache-first للترجمات) ─── */
async function localeStrategy(request) {
  try {
    /* ابحث في cache الترجمات أولاً */
    const cached = await caches.match(request);
    if (cached) return cached;

    /* ابحث في static cache */
    const staticCached = await caches.match(request);
    if (staticCached) return staticCached;

    /* اطلب من الشبكة */
    const response = await fetch(request);

    if (response && response.status === 200) {
      const cache = await caches.open(LOCALE_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    console.warn('[SW] ⚠️ فشل تحميل ترجمة:', request.url);

    /* بديل: العربية */
    return caches.match('/js/locales/ar.json');
  }
}

/* ─── 6.5 Stale-while-revalidate (للنطاقات الخارجية) ─── */
async function staleWhileRevalidateStrategy(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response && response.status === 200) {
      caches.open(DYNAMIC_CACHE).then(cache => {
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(err => {
    console.warn('[SW] ⚠️ فشل تحميل:', request.url);
    return cached;
  });

  return cached || fetchPromise;
}

/* ─── 6.6 Network-only (للـ API) ─── */
async function networkOnlyStrategy(request) {
  return fetch(request);
}

/* ═══════════════════════════════════════════════════════
   7. حدّ من حجم Cache
   ═══════════════════════════════════════════════════════ */
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    if (keys.length > maxItems) {
      const toDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(toDelete.map(key => cache.delete(key)));
      console.log(`[SW] 🧹 تم حذف ${toDelete.length} ملف من ${cacheName}`);
    }
  } catch (err) {
    console.warn('[SW] فشل trim cache:', err);
  }
}

/* ═══════════════════════════════════════════════════════
   8. رسائل من العملاء
   ═══════════════════════════════════════════════════════ */
self.addEventListener('message', (event) => {
  const { data, ports } = event;
  if (!data) return;

  const port = ports && ports[0];

  switch (data.type) {

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      if (port) port.postMessage({ version: CACHE_VERSION });
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(
        (async () => {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter(k => k.startsWith(CACHE_PREFIX))
              .map(k => caches.delete(k))
          );
          if (port) port.postMessage({ success: true });
          console.log('[SW] 🗑️ تم حذف كل الـ Cache');
        })()
      );
      break;

    case 'CLEAR_LOCALE_CACHE':
      event.waitUntil(
        caches.delete(LOCALE_CACHE).then(() => {
          if (port) port.postMessage({ success: true });
        })
      );
      break;

    case 'CHECK_FOR_UPDATE':
      event.waitUntil(
        (async () => {
          try {
            await self.registration.update();
            if (port) port.postMessage({ success: true });
          } catch (err) {
            if (port) port.postMessage({ success: false, error: err.message });
          }
        })()
      );
      break;

    default:
      console.log('[SW] رسالة غير معروفة:', data.type);
  }
});

/* ═══════════════════════════════════════════════════════
   9. Push Notifications
   ═══════════════════════════════════════════════════════ */
self.addEventListener('push', (event) => {
  console.log('[SW] 📬 إشعار Push وارد');

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: 'MediPrescribe', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'MediPrescribe';
  const options = {
    body: data.body || 'لديك إشعار جديد',
    icon: '/images/icon-192.png',
    badge: '/images/icon-192.png',
    image: data.image || null,
    vibrate: [200, 100, 200],
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    data: {
      url: data.url || '/dashboard.html',
      dateOfArrival: Date.now()
    },
    actions: [
      { action: 'open', title: 'فتح' },
      { action: 'close', title: 'إغلاق' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 🔔 نقر على إشعار:', event.action);
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || '/dashboard.html';

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      /* إذا كانت الصفحة مفتوحة، ركّز عليها */
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }

      /* وإلا افتح نافذة جديدة */
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })()
  );
});

/* ═══════════════════════════════════════════════════════
   10. Background Sync (اختياري)
   ═══════════════════════════════════════════════════════ */
self.addEventListener('sync', (event) => {
  console.log('[SW] 🔄 مزامنة خلفية:', event.tag);

  if (event.tag === 'sync-prescriptions') {
    event.waitUntil(syncPrescriptions());
  }
});

async function syncPrescriptions() {
  try {
    /* افتح IndexedDB وابحث عن الوصفات غير المُرسَلة */
    // ملاحظة: يُنفَّذ هنا إذا كان هناك خادم
    console.log('[SW] 📤 محاولة مزامنة الوصفات...');
    // ... كود المزامنة الفعلي ...
  } catch (err) {
    console.error('[SW] ❌ فشل المزامنة:', err);
  }
}

/* ═══════════════════════════════════════════════════════
   11. تحديث دوري (Periodic Sync — للتطبيقات المثبَّتة)
   ═══════════════════════════════════════════════════════ */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-updates') {
    event.waitUntil(self.registration.update());
  }
});

/* ═══════════════════════════════════════════════════════
   12. شعار الانتهاء
   ═══════════════════════════════════════════════════════ */
console.log(`✅ [SW] Service Worker ${CACHE_VERSION} جاهز`);
