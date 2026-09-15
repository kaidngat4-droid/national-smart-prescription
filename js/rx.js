/* ==========================================================
   MediPrescribe Pro — rx.js
   RxSecure v2.0.0

   نظام:
   - رقم الوصفة التسلسلي
   - Verification Code
   - Verification Token
   - Integrity Hash
   - QR Code حقيقي
   - رابط تحقق
   - Audit Log
   - التحقق المحلي من سلامة الوصفة

   ملاحظة أمنية:
   localStorage ليس مصدرًا مركزيًا للعداد في نظام متعدد الأجهزة.
   يجب استخدام DB / Server لتوليد الرقم النهائي في بيئة متعددة
   المستخدمين والأجهزة.

   لا يتم وضع اسم المريض أو التشخيص أو الأدوية داخل QR.
   ========================================================== */

(function (global) {
  'use strict';

  const VERSION = '2.0.0';

  const CONFIG = Object.freeze({
    counterPrefix: 'mediprescribe:rx-counter:',
    tokenPrefix: 'mediprescribe:rx-token:',

    defaultVerificationLength: 8,

    defaultQrSize: 256,
    minQrSize: 96,
    maxQrSize: 1024,
    qrMargin: 2,

    // 0 = لا توجد صلاحية محلية
    verificationTtlMs: 0,

    auditAction: 'rxsecure',

    verifyFile: 'verify.html',

    rxPattern: /^RX-\d{4}-\d{5}$/,

    verificationPattern:
      /^[A-HJ-NP-Z2-9]{8}$/,

    tokenPattern:
      /^[A-HJ-NP-Z2-9]{24,64}$/
  });

  /*
   * تم حذف:
   * I / O / 0 / 1
   * لتقليل أخطاء القراءة والإدخال.
   */
  const ALPHABET =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';


  /* ==========================================================
     BASIC HELPERS
     ========================================================== */

  function safeString(value, fallback = '') {
    if (value === null || value === undefined) {
      return fallback;
    }

    return String(value).trim();
  }


  function isBrowser() {
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined'
    );
  }


  function normalizeYear(year) {
    const n = Number(year);

    if (
      !Number.isInteger(n) ||
      n < 2000 ||
      n > 9999
    ) {
      return new Date().getFullYear();
    }

    return n;
  }


  function normalizeRxNumber(value) {
    return safeString(value).toUpperCase();
  }


  /* ==========================================================
     STORAGE
     ========================================================== */

  function getStorage() {
    try {
      if (
        !isBrowser() ||
        !window.localStorage
      ) {
        return null;
      }

      const testKey =
        '__rxsecure_test__';

      window.localStorage.setItem(
        testKey,
        '1'
      );

      window.localStorage.removeItem(
        testKey
      );

      return window.localStorage;

    } catch (error) {
      console.warn(
        '[RxSecure] localStorage unavailable'
      );

      return null;
    }
  }


  function storageKey(year) {
    return (
      CONFIG.counterPrefix +
      normalizeYear(year)
    );
  }


  function readCounter(year) {
    const storage = getStorage();

    if (!storage) {
      return 0;
    }

    try {
      const raw =
        storage.getItem(
          storageKey(year)
        );

      const n =
        Number.parseInt(
          raw || '0',
          10
        );

      if (
        Number.isSafeInteger(n) &&
        n >= 0
      ) {
        return n;
      }

      return 0;

    } catch (error) {
      return 0;
    }
  }


  function writeCounter(year, value) {
    const storage = getStorage();

    if (!storage) {
      return false;
    }

    try {
      storage.setItem(
        storageKey(year),
        String(value)
      );

      return true;

    } catch (error) {
      return false;
    }
  }


  /* ==========================================================
     CRYPTO
     ========================================================== */

  function getCrypto() {

    if (
      global.crypto &&
      typeof global.crypto.getRandomValues ===
        'function'
    ) {
      return global.crypto;
    }

    if (
      isBrowser() &&
      window.crypto &&
      typeof window.crypto.getRandomValues ===
        'function'
    ) {
      return window.crypto;
    }

    return null;
  }


  function randomBytes(length) {
    const cryptoApi =
      getCrypto();

    if (!cryptoApi) {
      throw new Error(
        'Web Crypto API غير متوفرة'
      );
    }

    const bytes =
      new Uint8Array(length);

    cryptoApi.getRandomValues(
      bytes
    );

    return bytes;
  }


  function randomCode(
    length =
      CONFIG.defaultVerificationLength
  ) {

    if (
      !Number.isInteger(length) ||
      length < 4 ||
      length > 64
    ) {
      throw new Error(
        'طول رمز التحقق غير صالح'
      );
    }

    const bytes =
      randomBytes(length * 2);

    let result = '';

    for (
      let i = 0;
      i < length;
      i++
    ) {
      result +=
        ALPHABET[
          bytes[i] %
          ALPHABET.length
        ];
    }

    return result;
  }


  function randomToken(length = 32) {
    return randomCode(length);
  }


  function uuid() {

    try {

      if (
        global.crypto &&
        typeof global.crypto.randomUUID ===
          'function'
      ) {
        return global.crypto.randomUUID();
      }

      if (
        isBrowser() &&
        window.crypto &&
        typeof window.crypto.randomUUID ===
          'function'
      ) {
        return window.crypto.randomUUID();
      }

    } catch (error) {
      // fallback below
    }


    const bytes =
      randomBytes(16);

    /*
     * UUID v4
     */
    bytes[6] =
      (bytes[6] & 0x0f) | 0x40;

    bytes[8] =
      (bytes[8] & 0x3f) | 0x80;


    const hex =
      Array.from(
        bytes,
        byte =>
          byte
            .toString(16)
            .padStart(2, '0')
      ).join('');


    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20)
    ].join('-');
  }


  async function sha256(text) {

    if (
      !global.crypto ||
      !global.crypto.subtle
    ) {
      throw new Error(
        'Web Crypto SubtleCrypto غير متوفرة'
      );
    }

    const data =
      new TextEncoder().encode(
        String(text)
      );

    const digest =
      await global.crypto.subtle.digest(
        'SHA-256',
        data
      );


    return Array.from(
      new Uint8Array(digest)
    )
      .map(
        byte =>
          byte
            .toString(16)
            .padStart(2, '0')
      )
      .join('');
  }


  /* ==========================================================
     CANONICAL DATA
     ========================================================== */

  function canonicalize(value) {

    if (
      value === null ||
      value === undefined
    ) {
      return null;
    }


    if (
      typeof value === 'string'
    ) {
      return value
        .trim()
        .replace(/\s+/g, ' ');
    }


    if (
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }


    if (Array.isArray(value)) {
      return value.map(
        canonicalize
      );
    }


    if (
      typeof value === 'object'
    ) {

      const output = {};

      Object.keys(value)
        .sort()
        .forEach(key => {
          output[key] =
            canonicalize(
              value[key]
            );
        });

      return output;
    }


    return String(value);
  }


  function canonicalJson(value) {
    return JSON.stringify(
      canonicalize(value)
    );
  }


  /* ==========================================================
     RX NUMBER
     ========================================================== */

  function formatRxNumber(
    year,
    counter
  ) {

    return (
      'RX-' +
      normalizeYear(year) +
      '-' +
      String(counter)
        .padStart(5, '0')
    );
  }


  function isValidRxNumber(value) {

    return CONFIG.rxPattern.test(
      normalizeRxNumber(value)
    );
  }


  function isValidVerificationCode(
    value
  ) {

    return CONFIG.verificationPattern.test(
      safeString(value)
        .toUpperCase()
    );
  }


  function isValidToken(value) {

    return CONFIG.tokenPattern.test(
      safeString(value)
        .toUpperCase()
    );
  }


  /* ==========================================================
     COUNTER LOCK
     ========================================================== */

  async function withCounterLock(
    year,
    worker
  ) {

    if (
      typeof navigator !==
        'undefined' &&
      navigator.locks &&
      typeof navigator.locks.request ===
        'function'
    ) {

      return navigator.locks.request(
        'mediprescribe-rx-counter-' +
          year,
        {
          mode: 'exclusive'
        },
        worker
      );
    }

    return worker();
  }


  /* ==========================================================
     NEXT RX NUMBER
     ========================================================== */

  async function nextNumber(
    options = {}
  ) {

    const year =
      normalizeYear(
        options.year ||
        new Date().getFullYear()
      );


    /*
     * المصدر المركزي الاختياري.
     *
     * في النظام متعدد الأجهزة:
     *
     * await RxSecure.nextNumber({
     *   nextRxNumber: async year => {
     *      return await API.nextRxNumber(year);
     *   }
     * });
     */
    if (
      typeof options.nextRxNumber ===
        'function'
    ) {

      const remote =
        await options.nextRxNumber(
          year
        );

      const normalized =
        normalizeRxNumber(
          remote
        );

      if (
        !isValidRxNumber(
          normalized
        )
      ) {
        throw new Error(
          'المصدر المركزي أعاد رقم وصفة غير صالح'
        );
      }

      return normalized;
    }


    /*
     * fallback محلي.
     */
    return withCounterLock(
      year,
      async () => {

        let counter =
          readCounter(year);


        if (counter >= 99999) {
          throw new Error(
            'تم الوصول إلى الحد الأقصى لعداد الوصفات لسنة ' +
            year
          );
        }


        counter++;


        const saved =
          writeCounter(
            year,
            counter
          );


        if (!saved) {
          throw new Error(
            'تعذر حفظ عداد الوصفة محليًا'
          );
        }


        return formatRxNumber(
          year,
          counter
        );
      }
    );
  }


  /* ==========================================================
     INTEGRITY HASH
     ========================================================== */

  async function createIntegrityHash(
    record
  ) {

    if (
      !record ||
      typeof record !== 'object'
    ) {
      throw new Error(
        'بيانات الوصفة غير صالحة'
      );
    }


    const source = {

      rxNumber:
        normalizeRxNumber(
          record.rxNumber
        ),

      issuedAt:
        record.issuedAt ||
        null,

      verificationToken:
        safeString(
          record.verificationToken
        ).toUpperCase(),

      patientId:
        safeString(
          record.patientId ||
          record.patientID
        ),

      prescriptionVersion:
        Number(
          record.prescriptionVersion
        ) || 1
    };


    return sha256(
      canonicalJson(source)
    );
  }


  /* ==========================================================
     VERIFY URL
     ========================================================== */

  function verifyURL(
    params = {}
  ) {

    if (!isBrowser()) {
      return null;
    }


    const rx =
      normalizeRxNumber(
        params.rxNumber
      );

    const code =
      safeString(
        params.verificationCode
      ).toUpperCase();

    const token =
      safeString(
        params.verificationToken
      ).toUpperCase();


    if (!isValidRxNumber(rx)) {
      throw new Error(
        'رقم الوصفة غير صالح'
      );
    }


    const query =
      new URLSearchParams();

    query.set(
      'rx',
      rx
    );


    /*
     * الأفضل استخدام token.
     * لا يتم وضع البيانات الطبية في الرابط.
     */
    if (
      isValidToken(token)
    ) {

      query.set(
        't',
        token
      );

    } else if (
      isValidVerificationCode(code)
    ) {

      /*
       * للتوافق مع الأنظمة القديمة.
       */
      query.set(
        'c',
        code
      );

    } else {

      throw new Error(
        'يجب توفير رمز تحقق أو token صالح'
      );
    }


    const base =
      new URL(
        CONFIG.verifyFile,
        document.baseURI
      );


    base.search =
      query.toString();


    return base.href;
  }


  /* ==========================================================
     QR CODE
     ========================================================== */

  async function qrDataURL(
    text,
    size =
      CONFIG.defaultQrSize
  ) {

    const value =
      safeString(text);


    if (!value) {
      throw new Error(
        'نص QR فارغ'
      );
    }


    let qrSize =
      Number(size);


    if (
      !Number.isFinite(qrSize)
    ) {
      qrSize =
        CONFIG.defaultQrSize;
    }


    qrSize =
      Math.max(
        CONFIG.minQrSize,
        Math.min(
          CONFIG.maxQrSize,
          Math.round(qrSize)
        )
      );


    if (!isBrowser()) {
      throw new Error(
        'توليد QR يحتاج إلى متصفح'
      );
    }


    /*
     * ========================================================
     * API:
     * QRCode.toCanvas(...)
     * ========================================================
     */

    if (
      global.QRCode &&
      typeof global.QRCode.toCanvas ===
        'function'
    ) {

      return new Promise(
        (resolve, reject) => {

          const canvas =
            document.createElement(
              'canvas'
            );


          try {

            global.QRCode.toCanvas(
              canvas,
              value,
              {
                width: qrSize,
                height: qrSize,
                margin:
                  CONFIG.qrMargin,
                errorCorrectionLevel:
                  'M'
              },
              error => {

                if (error) {
                  reject(error);
                  return;
                }


                try {

                  resolve(
                    canvas.toDataURL(
                      'image/png'
                    )
                  );

                } catch (e) {

                  reject(e);
                }
              }
            );

          } catch (e) {

            reject(e);
          }
        }
      );
    }


    /*
     * ========================================================
     * qrcode.js:
     * new QRCode(element, options)
     * ========================================================
     */

    if (
      typeof global.QRCode ===
        'function'
    ) {

      const holder =
        document.createElement(
          'div'
        );


      holder.style.position =
        'fixed';

      holder.style.left =
        '-100000px';

      holder.style.top =
        '-100000px';

      holder.style.width =
        qrSize + 'px';

      holder.style.height =
        qrSize + 'px';


      document.body.appendChild(
        holder
      );


      try {

        return await new Promise(
          (resolve, reject) => {

            try {

              new global.QRCode(
                holder,
                {
                  text: value,
                  width: qrSize,
                  height: qrSize,

                  correctLevel:
                    global.QRCode.CorrectLevel
                      ? global.QRCode
                          .CorrectLevel.M
                      : undefined
                }
              );


              const started =
                Date.now();


              const wait =
                () => {

                  const canvas =
                    holder.querySelector(
                      'canvas'
                    );


                  if (canvas) {

                    try {

                      resolve(
                        canvas.toDataURL(
                          'image/png'
                        )
                      );

                    } catch (e) {

                      reject(e);
                    }

                    return;
                  }


                  const img =
                    holder.querySelector(
                      'img'
                    );


                  if (
                    img &&
                    img.src
                  ) {

                    resolve(
                      img.src
                    );

                    return;
                  }


                  if (
                    Date.now() -
                      started >
                    3000
                  ) {

                    reject(
                      new Error(
                        'انتهت مهلة توليد QR'
                      )
                    );

                    return;
                  }


                  setTimeout(
                    wait,
                    50
                  );
                };


              wait();

            } catch (e) {

              reject(e);
            }
          }
        );

      } finally {

        holder.remove();
      }
    }


    /*
     * مهم:
     * لا ننشئ QR مزيفًا.
     */
    throw new Error(
      'مكتبة QR حقيقية غير محملة. ' +
      'أضف مكتبة تدعم QRCode.toCanvas أو qrcode.js.'
    );
  }


  /* ==========================================================
     ASSIGN NEW PRESCRIPTION ID
     ========================================================== */

  async function assign(
    patientName = '',
    options = {}
  ) {

    const rxNumber =
      await nextNumber(
        options
      );


    const verificationCode =
      randomCode(
        options.verificationLength ||
        CONFIG.defaultVerificationLength
      );


    const verificationToken =
      randomToken(32);


    const issuedAt =
      Date.now();


    const result = {

      rxNumber,

      verificationCode,

      verificationToken,

      patientName:
        safeString(
          patientName
        ),

      issuedAt,

      expiresAt:
        CONFIG.verificationTtlMs > 0
          ? issuedAt +
            CONFIG.verificationTtlMs
          : null,

      prescriptionVersion: 1,

      recordId:
        uuid()
    };


    result.integrityHash =
      await createIntegrityHash(
        result
      );


    return result;
  }


  /* ==========================================================
     ASSIGN + LOCAL STORAGE + AUDIT
     ========================================================== */

  async function assignAndStore(
    patientName = '',
    options = {}
  ) {

    const result =
      await assign(
        patientName,
        options
      );


    storeTokenReference(
      result
    );


    await audit(
      'ASSIGN',
      result
    );


    return result;
  }


  /* ==========================================================
     PREPARE PRESCRIPTION
     ========================================================== */

  async function prepare(
    record,
    options = {}
  ) {

    if (
      !record ||
      typeof record !==
        'object'
    ) {

      throw new Error(
        'بيانات الوصفة غير صالحة'
      );
    }


    const rxNumber =
      normalizeRxNumber(
        record.rxNumber
      );


    if (
      !isValidRxNumber(
        rxNumber
      )
    ) {

      throw new Error(
        'الوصفة لا تحتوي على rxNumber صالح'
      );
    }


    const verificationCode =
      safeString(
        record.verificationCode
      ).toUpperCase();


    const verificationToken =
      safeString(
        record.verificationToken
      ).toUpperCase();


    if (
      !isValidVerificationCode(
        verificationCode
      )
    ) {

      throw new Error(
        'verificationCode غير صالح أو غير موجود'
      );
    }


    if (
      !isValidToken(
        verificationToken
      )
    ) {

      throw new Error(
        'verificationToken غير صالح أو غير موجود'
      );
    }


    const secured = {

      ...record,

      rxNumber,

      verificationCode,

      verificationToken,

      prescriptionVersion:
        Number(
          record.prescriptionVersion
        ) || 1
    };


    secured.integrityHash =
      await createIntegrityHash(
        secured
      );


    const verifyURL =
      verifyURLFunction({
        rxNumber,
        verificationToken
      });


    let qrDataURLValue =
      null;


    if (
      options.generateQR !== false
    ) {

      try {

        qrDataURLValue =
          await qrDataURL(
            verifyURL,
            options.qrSize ||
            CONFIG.defaultQrSize
          );

      } catch (error) {

        if (
          options.requireQR
        ) {

          throw error;
        }


        console.warn(
          '[RxSecure] QR unavailable:',
          error.message
        );
      }
    }


    return Object.freeze({

      ...secured,

      verifyURL,

      qrDataURL:
        qrDataURLValue
    });
  }


  /*
   * alias داخلي لمنع أي تعارض في اسم الدالة.
   */
  const verifyURLFunction =
    verifyURL;


  /* ==========================================================
     LOCAL VERIFICATION
     ========================================================== */

  async function verifyLocal(
    record,
    options = {}
  ) {

    if (
      !record ||
      typeof record !==
        'object'
    ) {

      return {

        valid: false,

        reason:
          'INVALID_RECORD',

        message:
          'بيانات الوصفة غير صالحة'
      };
    }


    const rxNumber =
      normalizeRxNumber(
        record.rxNumber
      );


    const token =
      safeString(
        record.verificationToken
      ).toUpperCase();


    const code =
      safeString(
        record.verificationCode
      ).toUpperCase();


    if (
      !isValidRxNumber(
        rxNumber
      )
    ) {

      return {

        valid: false,

        reason:
          'INVALID_RX',

        message:
          'رقم الوصفة غير صالح'
      };
    }


    if (
      !isValidToken(
        token
      )
    ) {

      return {

        valid: false,

        reason:
          'INVALID_TOKEN',

        message:
          'رمز التحقق الداخلي غير صالح'
      };
    }


    if (
      !isValidVerificationCode(
        code
      )
    ) {

      return {

        valid: false,

        reason:
          'INVALID_CODE',

        message:
          'كود التحقق غير صالح'
      };
    }


    /*
     * انتهاء الصلاحية.
     */
    if (
      record.expiresAt &&
      Number(record.expiresAt) > 0 &&
      Date.now() >
        Number(record.expiresAt)
    ) {

      return {

        valid: false,

        reason:
          'EXPIRED',

        message:
          'انتهت صلاحية التحقق من الوصفة'
      };
    }


    /*
     * فحص Integrity.
     */
    const expected =
      await createIntegrityHash(
        record
      );


    const actual =
      safeString(
        record.integrityHash
      ).toLowerCase();


    if (
      !actual ||
      actual !==
        expected.toLowerCase()
    ) {

      return {

        valid: false,

        reason:
          'INTEGRITY_MISMATCH',

        message:
          'فشل التحقق من سلامة بيانات الوصفة'
      };
    }


    /*
     * تحقق مركزي اختياري.
     *
     * مثال:
     *
     * lookup: async ({ rxNumber, verificationToken }) => {
     *    return await API.verifyPrescription(...);
     * }
     */
    if (
      typeof options.lookup ===
        'function'
    ) {

      const remote =
        await options.lookup({

          rxNumber,

          verificationToken:
            token,

          verificationCode:
            code
        });


      return {

        valid: true,

        localIntegrity:
          true,

        remote
      };
    }


    return {

      valid: true,

      localIntegrity:
        true,

      reason:
        'VALID',

      message:
        'تم اجتياز التحقق المحلي'
    };
  }


  /* ==========================================================
     AUDIT
     ========================================================== */

  async function audit(
    action,
    payload = {}
  ) {

    try {

      if (
        global.DB &&
        typeof global.DB.add ===
          'function'
      ) {

        await global.DB.add(
          'audit',
          {

            module:
              CONFIG.auditAction,

            action:
              safeString(
                action
              ),

            rxNumber:
              normalizeRxNumber(
                payload.rxNumber
              ),

            timestamp:
              Date.now()
          }
        );


        return true;
      }


      if (
        typeof global.logAudit ===
          'function'
      ) {

        await global.logAudit({

          module:
            CONFIG.auditAction,

          action:
            safeString(
              action
            ),

          rxNumber:
            normalizeRxNumber(
              payload.rxNumber
            ),

          timestamp:
            Date.now()
        });


        return true;
      }

    } catch (error) {

      console.warn(
        '[RxSecure] audit failed:',
        error
      );
    }


    return false;
  }


  /* ==========================================================
     LOCAL TOKEN STORAGE
     ========================================================== */

  function storeTokenReference(
    record
  ) {

    const storage =
      getStorage();


    if (!storage) {
      return false;
    }


    try {

      const rxNumber =
        normalizeRxNumber(
          record.rxNumber
        );


      if (
        !isValidRxNumber(
          rxNumber
        )
      ) {
        return false;
      }


      const token =
        safeString(
          record.verificationToken
        ).toUpperCase();


      if (
        !isValidToken(
          token
        )
      ) {
        return false;
      }


      const key =
        CONFIG.tokenPrefix +
        rxNumber;


      storage.setItem(

        key,

        JSON.stringify({

          token,

          createdAt:
            Number(
              record.issuedAt
            ) ||
            Date.now()
        })
      );


      return true;

    } catch (error) {

      console.warn(
        '[RxSecure] token storage failed:',
        error
      );

      return false;
    }
  }


  function getStoredToken(
    rxNumber
  ) {

    const storage =
      getStorage();


    if (!storage) {
      return null;
    }


    try {

      const normalized =
        normalizeRxNumber(
          rxNumber
        );


      if (
        !isValidRxNumber(
          normalized
        )
      ) {
        return null;
      }


      const raw =
        storage.getItem(

          CONFIG.tokenPrefix +
          normalized

        );


      if (!raw) {
        return null;
      }


      const parsed =
        JSON.parse(raw);


      if (
        isValidToken(
          parsed.token
        )
      ) {

        return parsed.token;
      }


      return null;

    } catch (error) {

      return null;
    }
  }


  function removeStoredToken(
    rxNumber
  ) {

    const storage =
      getStorage();


    if (!storage) {
      return false;
    }


    try {

      storage.removeItem(

        CONFIG.tokenPrefix +
        normalizeRxNumber(
          rxNumber
        )

      );


      return true;

    } catch (error) {

      return false;
    }
  }


  /* ==========================================================
     QR FOR EXISTING RECORD
     ========================================================== */

  async function generateQRForRecord(
    record,
    options = {}
  ) {

    if (
      !record ||
      typeof record !==
        'object'
    ) {

      throw new Error(
        'بيانات الوصفة غير صالحة'
      );
    }


    const rxNumber =
      normalizeRxNumber(
        record.rxNumber
      );


    const token =
      safeString(
        record.verificationToken
      ).toUpperCase();


    if (
      !isValidRxNumber(
        rxNumber
      )
    ) {

      throw new Error(
        'رقم الوصفة غير صالح'
      );
    }


    if (
      !isValidToken(
        token
      )
    ) {

      throw new Error(
        'Verification Token غير صالح'
      );
    }


    const url =
      verifyURLFunction({

        rxNumber,

        verificationToken:
          token
      });


    return {

      rxNumber,

      verifyURL:
        url,

      qrDataURL:
        await qrDataURL(
          url,
          options.qrSize ||
          CONFIG.defaultQrSize
        )
    };
  }


  /* ==========================================================
     PUBLIC VERIFICATION DATA
     ========================================================== */

  function getPublicVerificationData(
    record
  ) {

    if (
      !record ||
      typeof record !==
        'object'
    ) {

      throw new Error(
        'بيانات الوصفة غير صالحة'
      );
    }


    const rxNumber =
      normalizeRxNumber(
        record.rxNumber
      );


    const token =
      safeString(
        record.verificationToken
      ).toUpperCase();


    if (
      !isValidRxNumber(
        rxNumber
      )
    ) {

      throw new Error(
        'رقم الوصفة غير صالح'
      );
    }


    if (
      !isValidToken(
        token
      )
    ) {

      throw new Error(
        'Verification Token غير صالح'
      );
    }


    return Object.freeze({

      rxNumber,

      verificationToken:
        token,

      verifyURL:
        verifyURLFunction({

          rxNumber,

          verificationToken:
            token
        })
    });
  }


  /* ==========================================================
     HTML ESCAPE
     ========================================================== */

  function escapeHtml(value) {

    return safeString(value)

      .replace(
        /&/g,
        '&amp;'
      )

      .replace(
        /</g,
        '&lt;'
      )

      .replace(
        />/g,
        '&gt;'
      )

      .replace(
        /"/g,
        '&quot;'
      )

      .replace(
        /'/g,
        '&#039;'
      );
  }


  /* ==========================================================
     API
     ========================================================== */

  const RxSecure = Object.freeze({

    VERSION,

    CONFIG,

    /*
     * RX
     */
    nextNumber,

    isValidRxNumber,

    /*
     * Crypto
     */
    generateCode:
      randomCode,

    generateToken:
      randomToken,

    /*
     * Prescription identity
     */
    assign,

    assignAndStore,

    prepare,

    /*
     * Integrity
     */
    createIntegrityHash,

    verifyLocal,

    /*
     * Verification
     */
    verifyURL:
      verifyURLFunction,

    isValidVerificationCode,

    isValidToken,

    getPublicVerificationData,

    /*
     * QR
     */
    qrDataURL,

    generateQRForRecord,

    /*
     * Storage
     */
    storeTokenReference,

    getStoredToken,

    removeStoredToken,

    /*
     * Audit
     */
    audit,

    /*
     * Utility
     */
    escapeHtml
  });


  global.RxSecure =
    RxSecure;


  if (isBrowser()) {

    console.info(
      '✅ MediPrescribe RxSecure v' +
      VERSION +
      ' جاهز'
    );
  }


})(typeof window !== 'undefined'
    ? window
    : globalThis);
