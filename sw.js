/* ==========================================================
   MediPrescribe — Professional Service Worker
   Version:5.0.0
   ----------------------------------------------------------
   PWA / GitHub Pages Compatible
   ----------------------------------------------------------
   ✅ يعمل من root أو repository subdirectory
   ✅ Cache-first للأصول الثابتة
   ✅ Network-first لصفحات HTML
   ✅ Cache-first للصور
   ✅ Cache-first للترجمات
   ✅ Stale-while-revalidate للموارد الخارجية
   ✅ Network-only للبيانات الحساسة
   ✅ تنظيف Cache القديمة تلقائياً
   ✅ Offline fallback
   ✅ Push Notifications
   ✅ Skip Waiting
   ✅ Update Check
   ✅ Clear Cache
   ✅ حماية من تخزين responses غير صالحة
   ========================================================== */

'use strict';


/* ═══════════════════════════════════════════════════════
   1. VERSION & CACHE CONFIGURATION
   ═══════════════════════════════════════════════════════ */

const CACHE_VERSION = 'v5.0.0';

const CACHE_PREFIX = 'mediprescribe';

const STATIC_CACHE =
  `${CACHE_PREFIX}-static-${CACHE_VERSION}`;

const DYNAMIC_CACHE =
  `${CACHE_PREFIX}-dynamic-${CACHE_VERSION}`;

const IMAGE_CACHE =
  `${CACHE_PREFIX}-images-${CACHE_VERSION}`;

const LOCALE_CACHE =
  `${CACHE_PREFIX}-locales-${CACHE_VERSION}`;

const MAX_DYNAMIC_ITEMS = 50;

const MAX_IMAGE_ITEMS = 100;


/* ═══════════════════════════════════════════════════════
   2. BASE PATH
   -------------------------------------------------------
   مهم لـ GitHub Pages.
   إذا كان الموقع:
   https://user.github.io/mediprescribe/
   فسيكون BASE_PATH = /mediprescribe/
   وإذا كان:
   https://user.github.io/
   فسيكون BASE_PATH = /
   ═══════════════════════════════════════════════════════ */

const BASE_PATH =
  self.location.pathname.replace(
    /\/sw\.js$/,
    '/'
  );


/* ═══════════════════════════════════════════════════════
   3. URL HELPER
   ═══════════════════════════════════════════════════════ */

function asset(path) {

  return new URL(
    path.replace(/^\.?\//, ''),
    self.location.origin + BASE_PATH
  ).href;

}


/* ═══════════════════════════════════════════════════════
   4. STATIC ASSETS
   ═══════════════════════════════════════════════════════ */

const STATIC_ASSETS = [

  '',

  'index.html',
  'login.html',
  'dashboard.html',
  'users.html',
  'audit-log.html',
  'verify.html',
  'offline.html',

  'manifest.json',
  'browserconfig.xml',

  /* CSS */
  'css/style.css',

  /* JavaScript */
  'js/data.js',
  'js/db.js',
  'js/i18n.js',
  'js/app.js',
  'js/public.js',
  'js/users.js',
  'js/audit.js',
  'js/safety.js',
  'js/rx.js',
  'js/summary.js',
  'js/blockchain.js',
  'js/local-ai.js',
  'js/bluetooth-vitals.js',

  /* Images */
  'images/logo-yemen.png',
  'images/logo-health.png',
  'images/logo-mediprescribe.png',
  'images/favicon.ico',
  'images/icon-192.png',
  'images/icon-512.png',
  'images/apple-touch-icon.png',
  'images/maskable-icon-512.png'

].map(asset);


/* ═══════════════════════════════════════════════════════
   5. IMAGE ASSETS
   ═══════════════════════════════════════════════════════ */

const IMAGE_ASSETS = [

  'images/care.jpg',
  'images/internal.jpg',
  'images/cardio.jpg',
  'images/pediatrics.jpg',
  'images/derma.jpg',
  'images/eyes.jpg',
  'images/ortho.jpg',
  'images/placeholder.png'

].map(asset);


/* ═══════════════════════════════════════════════════════
   6. EXTERNAL DOMAINS
   ═══════════════════════════════════════════════════════ */

const EXTERNAL_DOMAINS = [

  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net'

];


/* ═══════════════════════════════════════════════════════
   7. NEVER CACHE
   -------------------------------------------------------
   يمنع Service Worker من تخزين بيانات حساسة.
   ═══════════════════════════════════════════════════════ */

const NEVER_CACHE = [

  /\/api\//i,
  /\/auth\//i,
  /\/patient\//i,
  /\/patients\//i,
  /\/prescription\//i,
  /\/prescriptions\//i,
  /\/medical-record/i,
  /\/medical-records/i,
  /\/token/i,
  /\/session/i,
  /\/logout/i

];


/* ═══════════════════════════════════════════════════════
   8. INSTALL
   ═══════════════════════════════════════════════════════ */

self.addEventListener(
  'install',
  event => {

    console.log(
      `[SW] 📦 Installing ${CACHE_VERSION}`
    );

    event.waitUntil(

      (async () => {

        try {

          const staticCache =
            await caches.open(STATIC_CACHE);

          const imageCache =
            await caches.open(IMAGE_CACHE);

          const localeCache =
            await caches.open(LOCALE_CACHE);


          /* ─────────────────────────────────────────────
             Static files
             ───────────────────────────────────────────── */

          await Promise.allSettled(

            STATIC_ASSETS.map(
              url =>
                cacheAsset(
                  staticCache,
                  url
                )
            )

          );


          /* ─────────────────────────────────────────────
             Images
             ───────────────────────────────────────────── */

          await Promise.allSettled(

            IMAGE_ASSETS.map(
              url =>
                cacheAsset(
                  imageCache,
                  url
                )
            )

          );


          /* ─────────────────────────────────────────────
             Locales
             ───────────────────────────────────────────── */

          await Promise.allSettled([

            cacheAsset(
              localeCache,
              asset('js/locales/ar.json')
            ),

            cacheAsset(
              localeCache,
              asset('js/locales/en.json')
            )

          ]);


          console.log(
            `[SW] ✅ Installation completed: ${CACHE_VERSION}`
          );


          /*
           * التفعيل الفوري.
           * هذا يجعل الإصدار الجديد ينتقل مباشرة إلى activate.
           */

          await self.skipWaiting();

        }

        catch (error) {

          console.error(
            '[SW] ❌ Installation failed:',
            error
          );

        }

      })()

    );

  }
);


/* ═══════════════════════════════════════════════════════
   9. CACHE ASSET
   ═══════════════════════════════════════════════════════ */

async function cacheAsset(cache, url) {

  try {

    const request =
      new Request(
        url,
        {
          cache: 'reload'
        }
      );

    const response =
      await fetch(request);

    if (
      response &&
      response.ok
    ) {

      await cache.put(
        request,
        response
      );

    }

    else {

      console.warn(
        '[SW] ⚠️ Asset unavailable:',
        url
      );

    }

  }

  catch (error) {

    console.warn(
      '[SW] ⚠️ Failed:',
      url
    );

  }

}


/* ═══════════════════════════════════════════════════════
   10. ACTIVATE
   ═══════════════════════════════════════════════════════ */

self.addEventListener(
  'activate',
  event => {

    console.log(
      `[SW] 🚀 Activating ${CACHE_VERSION}`
    );

    event.waitUntil(

      (async () => {

        try {

          const cacheNames =
            await caches.keys();


          /*
           * حذف الإصدارات القديمة فقط.
           */

          const oldCaches =
            cacheNames.filter(
              name =>
                name.startsWith(
                  CACHE_PREFIX + '-'
                ) &&
                !name.endsWith(
                  CACHE_VERSION
                )
            );


          await Promise.all(

            oldCaches.map(
              name => {

                console.log(
                  '[SW] 🗑️ Removing:',
                  name
                );

                return caches.delete(name);

              }
            )

          );


          /*
           * السيطرة على الصفحات المفتوحة.
           */

          await self.clients.claim();


          /*
           * إعلام الصفحات بأن SW الجديد نشط.
           */

          const clients =
            await self.clients.matchAll({
              type: 'window'
            });


          clients.forEach(
            client => {

              client.postMessage({

                type: 'SW_ACTIVATED',

                version:
                  CACHE_VERSION

              });

            }
          );


          console.log(
            `[SW] ✅ Activated ${CACHE_VERSION}`
          );

        }

        catch (error) {

          console.error(
            '[SW] ❌ Activation failed:',
            error
          );

        }

      })()

    );

  }
);


/* ═══════════════════════════════════════════════════════
   11. FETCH HANDLER
   ═══════════════════════════════════════════════════════ */

self.addEventListener(
  'fetch',
  event => {

    const request =
      event.request;

    if (
      request.method !== 'GET'
    ) {

      return;

    }


    const url =
      new URL(request.url);


    /*
     * السماح فقط بـ HTTP/HTTPS.
     */

    if (
      url.protocol !== 'http:' &&
      url.protocol !== 'https:'
    ) {

      return;

    }


    /*
     * الطلبات الحساسة:
     * Network-only
     */

    if (
      NEVER_CACHE.some(
        pattern =>
          pattern.test(
            url.pathname
          )
      )
    ) {

      event.respondWith(
        fetch(request)
      );

      return;

    }


    /*
     * الموارد الخارجية.
     */

    if (
      url.origin !==
      self.location.origin
    ) {

      if (
        EXTERNAL_DOMAINS.some(
          domain =>
            url.hostname === domain ||
            url.hostname.endsWith(
              '.' + domain
            )
        )
      ) {

        event.respondWith(
          staleWhileRevalidate(
            request
          )
        );

      }

      return;

    }


    /*
     * HTML / Navigation
     */

    if (
      request.mode === 'navigate' ||
      (
        request.headers
          .get('accept') || ''
      ).includes('text/html')
    ) {

      event.respondWith(
        networkFirstHTML(
          request
        )
      );

      return;

    }


    /*
     * Locales
     */

    if (
      url.pathname.includes(
        '/locales/'
      ) &&
      url.pathname.endsWith(
        '.json'
      )
    ) {

      event.respondWith(
        localeStrategy(
          request
        )
      );

      return;

    }


    /*
     * Images
     */

    if (
      request.destination ===
      'image'
    ) {

      event.respondWith(
        imageStrategy(
          request
        )
      );

      return;

    }


    /*
     * CSS / JS / Fonts
     */

    if (

      request.destination === 'style' ||

      request.destination === 'script' ||

      request.destination === 'font'

    ) {

      event.respondWith(
        cacheFirst(
          request
        )
      );

      return;

    }


    /*
     * باقي الملفات.
     */

    event.respondWith(
      cacheFirst(
        request
      )
    );

  }
);


/* ═══════════════════════════════════════════════════════
   12. CACHE-FIRST
   ═══════════════════════════════════════════════════════ */

async function cacheFirst(request) {

  try {

    const cached =
      await caches.match(
        request
      );

    if (cached) {

      return cached;

    }


    const response =
      await fetch(request);


    if (
      isCacheableResponse(
        response
      )
    ) {

      const cache =
        await caches.open(
          DYNAMIC_CACHE
        );

      await cache.put(
        request,
        response.clone()
      );

      await trimCache(
        DYNAMIC_CACHE,
        MAX_DYNAMIC_ITEMS
      );

    }


    return response;

  }

  catch (error) {

    const cached =
      await caches.match(
        request
      );

    if (cached) {

      return cached;

    }


    if (
      request.destination ===
      'image'
    ) {

      const placeholder =
        await caches.match(
          asset(
            'images/placeholder.png'
          )
        );

      if (placeholder) {

        return placeholder;

      }

    }


    return new Response(
      '',
      {
        status: 503,
        statusText: 'Service Unavailable'
      }
    );

  }

}


/* ═══════════════════════════════════════════════════════
   13. NETWORK-FIRST HTML
   ═══════════════════════════════════════════════════════ */

async function networkFirstHTML(
  request
) {

  try {

    const response =
      await fetch(
        request,
        {
          cache: 'no-cache'
        }
      );


    if (
      response &&
      response.ok
    ) {

      const cache =
        await caches.open(
          DYNAMIC_CACHE
        );

      await cache.put(
        request,
        response.clone()
      );

      await trimCache(
        DYNAMIC_CACHE,
        MAX_DYNAMIC_ITEMS
      );

    }


    return response;

  }

  catch (error) {

    console.log(
      '[SW] 📴 Offline:',
      request.url
    );


    /*
     * حاول الصفحة المطلوبة.
     */

    const cached =
      await caches.match(
        request
      );

    if (cached) {

      return cached;

    }


    /*
     * ثم offline.html.
     */

    const offline =
      await caches.match(
        asset('offline.html')
      );

    if (offline) {

      return offline;

    }


    /*
     * آخر fallback.
     */

    return offlineResponse();

  }

}


/* ═══════════════════════════════════════════════════════
   14. IMAGE STRATEGY
   ═══════════════════════════════════════════════════════ */

async function imageStrategy(
  request
) {

  try {

    const cached =
      await caches.match(
        request
      );

    if (cached) {

      return cached;

    }


    const response =
      await fetch(
        request
      );


    if (
      isCacheableResponse(
        response
      )
    ) {

      const cache =
        await caches.open(
          IMAGE_CACHE
        );

      await cache.put(
        request,
        response.clone()
      );

      await trimCache(
        IMAGE_CACHE,
        MAX_IMAGE_ITEMS
      );

    }


    return response;

  }

  catch (error) {

    const placeholder =
      await caches.match(
        asset(
          'images/placeholder.png'
        )
      );

    if (placeholder) {

      return placeholder;

    }


    return new Response(
      '',
      {
        status: 404
      }
    );

  }

}


/* ═══════════════════════════════════════════════════════
   15. LOCALE STRATEGY
   ═══════════════════════════════════════════════════════ */

async function localeStrategy(
  request
) {

  try {

    /*
     * Cache أولاً للسرعة.
     */

    const cached =
      await caches.match(
        request
      );

    if (cached) {

      return cached;

    }


    /*
     * إذا لم توجد في Cache
     * احصل عليها من الشبكة.
     */

    const response =
      await fetch(
        request
      );


    if (
      isCacheableResponse(
        response
      )
    ) {

      const cache =
        await caches.open(
          LOCALE_CACHE
        );

      await cache.put(
        request,
        response.clone()
      );

    }


    return response;

  }

  catch (error) {

    /*
     * fallback للعربية.
     */

    const arabic =
      await caches.match(
        asset(
          'js/locales/ar.json'
        )
      );

    if (arabic) {

      return arabic;

    }


    return new Response(
      '{}',
      {
        status: 503,
        headers: {
          'Content-Type':
            'application/json'
        }
      }
    );

  }

}


/* ═══════════════════════════════════════════════════════
   16. STALE-WHILE-REVALIDATE
   ═══════════════════════════════════════════════════════ */

async function staleWhileRevalidate(
  request
) {

  const cached =
    await caches.match(
      request
    );


  const networkPromise =
    fetch(request)
      .then(async response => {

        if (
          isCacheableResponse(
            response
          )
        ) {

          const cache =
            await caches.open(
              DYNAMIC_CACHE
            );

          await cache.put(
            request,
            response.clone()
          );

          await trimCache(
            DYNAMIC_CACHE,
            MAX_DYNAMIC_ITEMS
          );

        }

        return response;

      })
      .catch(
        () => cached
      );


  return cached ||
         networkPromise;

}


/* ═══════════════════════════════════════════════════════
   17. RESPONSE VALIDATION
   ═══════════════════════════════════════════════════════ */

function isCacheableResponse(
  response
) {

  return !!(
    response &&
    response.status === 200 &&
    (
      response.type === 'basic' ||
      response.type === 'cors'
    )
  );

}


/* ═══════════════════════════════════════════════════════
   18. TRIM CACHE
   ═══════════════════════════════════════════════════════ */

async function trimCache(
  cacheName,
  maxItems
) {

  try {

    const cache =
      await caches.open(
        cacheName
      );

    const keys =
      await cache.keys();


    if (
      keys.length <= maxItems
    ) {

      return;

    }


    const deleteCount =
      keys.length - maxItems;


    for (
      let i = 0;
      i < deleteCount;
      i++
    ) {

      await cache.delete(
        keys[i]
      );

    }


    console.log(
      `[SW] 🧹 Removed ${deleteCount} items from ${cacheName}`
    );

  }

  catch (error) {

    console.warn(
      '[SW] Trim failed:',
      error
    );

  }

}


/* ═══════════════════════════════════════════════════════
   19. OFFLINE RESPONSE
   ═══════════════════════════════════════════════════════ */

function offlineResponse() {

  return new Response(

    `<!DOCTYPE html>

<html lang="ar" dir="rtl">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>MediPrescribe — غير متصل</title>

<style>

* {
  box-sizing: border-box;
}

body {

  margin: 0;

  min-height: 100vh;

  display: flex;

  align-items: center;

  justify-content: center;

  padding: 24px;

  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  background:
    linear-gradient(
      180deg,
      #0a1628,
      #0f2138
    );

  color: #eef3f8;

  text-align: center;

}

.box {

  width: 100%;

  max-width: 480px;

  padding: 42px 28px;

  border-radius: 22px;

  background:
    rgba(14,28,55,.96);

  border:
    1px solid
    rgba(212,175,55,.3);

  box-shadow:
    0 20px 60px
    rgba(0,0,0,.25);

}

.icon {

  font-size: 4.5rem;

  margin-bottom: 20px;

}

h1 {

  margin: 0 0 14px;

  font-size: 1.6rem;

  color: #f1d878;

}

p {

  margin: 0 0 26px;

  line-height: 1.9;

  color:
    rgba(220,230,245,.78);

}

button {

  border: 0;

  border-radius: 12px;

  padding:
    14px 28px;

  font: inherit;

  font-weight: 800;

  cursor: pointer;

  color: #0a1628;

  background:
    linear-gradient(
      135deg,
      #d4af37,
      #f1d878
    );

}

</style>

</head>

<body>

<div class="box">

  <div class="icon">📴</div>

  <h1>
    لا يوجد اتصال بالإنترنت
  </h1>

  <p>
    MediPrescribe يعمل حاليًا دون اتصال.
    تأكد من اتصالك بالإنترنت ثم أعد المحاولة.
  </p>

  <button
    onclick="location.reload()"
  >
    🔄 إعادة المحاولة
  </button>

</div>

</body>

</html>`,

    {
      status: 200,

      headers: {
        'Content-Type':
          'text/html; charset=utf-8'
      }

    }

  );

}


/* ═══════════════════════════════════════════════════════
   20. MESSAGE HANDLER
   ═══════════════════════════════════════════════════════ */

self.addEventListener(
  'message',
  event => {

    const data =
      event.data;

    if (!data) {

      return;

    }


    const port =
      event.ports &&
      event.ports[0];


    /* ─────────────────────────────────────────────
       SKIP WAITING
       ───────────────────────────────────────────── */

    if (
      data.type ===
      'SKIP_WAITING'
    ) {

      event.waitUntil(
        self.skipWaiting()
      );

      return;

    }


    /* ─────────────────────────────────────────────
       GET VERSION
       ───────────────────────────────────────────── */

    if (
      data.type ===
      'GET_VERSION'
    ) {

      if (port) {

        port.postMessage({

          success: true,

          version:
            CACHE_VERSION

        });

      }

      return;

    }


    /* ─────────────────────────────────────────────
       CLEAR CACHE
       ───────────────────────────────────────────── */

    if (
      data.type ===
      'CLEAR_CACHE'
    ) {

      event.waitUntil(

        (async () => {

          const keys =
            await caches.keys();

          const targets =
            keys.filter(
              key =>
                key.startsWith(
                  CACHE_PREFIX + '-'
                )
            );


          await Promise.all(
            targets.map(
              key =>
                caches.delete(
                  key
                )
            )
          );


          if (port) {

            port.postMessage({

              success: true

            });

          }

        })()

      );

      return;

    }


    /* ─────────────────────────────────────────────
       CLEAR LOCALE CACHE
       ───────────────────────────────────────────── */

    if (
      data.type ===
      'CLEAR_LOCALE_CACHE'
    ) {

      event.waitUntil(

        (async () => {

          await caches.delete(
            LOCALE_CACHE
          );


          if (port) {

            port.postMessage({

              success: true

            });

          }

        })()

      );

      return;

    }


    /* ─────────────────────────────────────────────
       CHECK UPDATE
       ───────────────────────────────────────────── */

    if (
      data.type ===
      'CHECK_FOR_UPDATE'
    ) {

      event.waitUntil(

        (async () => {

          try {

            await self.registration.update();

            if (port) {

              port.postMessage({

                success: true,

                version:
                  CACHE_VERSION

              });

            }

          }

          catch (error) {

            if (port) {

              port.postMessage({

                success: false,

                error:
                  error.message

              });

            }

          }

        })()

      );

    }

  }
);


/* ═══════════════════════════════════════════════════════
   21. PUSH NOTIFICATIONS
   ═══════════════════════════════════════════════════════ */

self.addEventListener(
  'push',
  event => {

    let data = {};


    try {

      data =
        event.data
          ? event.data.json()
          : {};

    }

    catch (error) {

      data = {

        title:
          'MediPrescribe',

        body:
          event.data
            ? event.data.text()
            : ''

      };

    }


    const title =
      data.title ||
      'MediPrescribe';


    const options = {

      body:
        data.body ||
        'لديك إشعار جديد',

      icon:
        asset(
          'images/icon-192.png'
        ),

      badge:
        asset(
          'images/icon-192.png'
        ),

      vibrate:
        [200, 100, 200],

      tag:
        data.tag ||
        'mediprescribe',

      requireInteraction:
        Boolean(
          data.requireInteraction
        ),

      data: {

        url:
          data.url ||
          asset(
            'dashboard.html'
          ),

        dateOfArrival:
          Date.now()

      },

      actions: [

        {
          action: 'open',
          title: 'فتح'
        },

        {
          action: 'close',
          title: 'إغلاق'
        }

      ]

    };


    event.waitUntil(

      self.registration
        .showNotification(
          title,
          options
        )

    );

  }
);


/* ═══════════════════════════════════════════════════════
   22. NOTIFICATION CLICK
   ═══════════════════════════════════════════════════════ */

self.addEventListener(
  'notificationclick',
  event => {

    event.notification.close();


    if (
      event.action ===
      'close'
    ) {

      return;

    }


    const targetUrl =
      event.notification
        .data?.url ||
      asset(
        'dashboard.html'
      );


    event.waitUntil(

      (async () => {

        const windowClients =
          await self.clients.matchAll({

            type: 'window',

            includeUncontrolled:
              true

          });


        /*
         * إذا كانت الصفحة مفتوحة،
         * استخدمها بدلاً من فتح نافذة جديدة.
         */

        for (
          const client
          of windowClients
        ) {

          if (
            client.url ===
            targetUrl
          ) {

            if (
              'focus' in client
            ) {

              return client.focus();

            }

          }

        }


        /*
         * البحث عن نفس origin.
         */

        for (
          const client
          of windowClients
        ) {

          if (
            new URL(
              client.url
            ).origin ===
            self.location.origin
          ) {

            if (
              'focus' in client
            ) {

              await client.focus();

            }

            if (
              'navigate' in client
            ) {

              return client.navigate(
                targetUrl
              );

            }

          }

        }


        /*
         * فتح نافذة جديدة.
         */

        if (
          self.clients.openWindow
        ) {

          return self.clients.openWindow(
            targetUrl
          );

        }

      })()

    );

  }
);


/* ═══════════════════════════════════════════════════════
   23. OPTIONAL BACKGROUND SYNC
   -------------------------------------------------------
   لا يتم تشغيل مزامنة فعلية للمرضى هنا.
   يجب ربطها بواجهة API آمنة ومصادقة قبل استخدامها.
   ═══════════════════════════════════════════════════════ */

self.addEventListener(
  'sync',
  event => {

    if (
      event.tag ===
      'sync-prescriptions'
    ) {

      event.waitUntil(
        syncPrescriptions()
      );

    }

  }
);


async function syncPrescriptions() {

  /*
   * لا ترسل بيانات مرضى تلقائياً
   * حتى يتم تعريف API ومصادقة آمنة.
   */

  console.log(
    '[SW] 🔄 Prescription sync requested'
  );

}


/* ═══════════════════════════════════════════════════════
   24. READY
   ═══════════════════════════════════════════════════════ */

console.log(
  `[SW] ✅ MediPrescribe Service Worker ${CACHE_VERSION} ready`
);

console.log(
  `[SW] 📁 Base path: ${BASE_PATH}`
);
