/* =========================================================
 * MediPrescribe - Public Portal
 * public.js v2.2.0
 *
 * الوظائف:
 * - الأقسام والخدمات
 * - البحث العربي/الإنجليزي
 * - الحجز عبر WhatsApp
 * - اختيار الاستقبال
 * - رقم حجز محلي
 * - حفظ الحجز محليًا
 * - تكامل اختياري مع API
 * - Audit Log اختياري
 * - المساعد الصحي الآمن
 * - عداد الزوار
 * - المشاركة الاجتماعية
 * - Toast notifications
 * - Smooth scrolling
 * - Welcome modal
 * - Quick actions
 * - حماية XSS
 * - تطبيع الأرقام العربية/اليمنية
 *
 * ملاحظة:
 * هذا الملف واجهة عامة وليس نظامًا طبيًا تشخيصيًا.
 * لا يقدم جرعات دوائية شخصية.
 * ========================================================= */

(() => {
  'use strict';

  /* =========================================================
   * 1. CONFIGURATION
   * ========================================================= */

  const PUBLIC_CONFIG = Object.freeze({

    version: '2.2.0',

    /* -----------------------------------------
     * WhatsApp reception numbers
     * Yemen country code = 967
     * ----------------------------------------- */
    receptionWhatsApp: Object.freeze([
      '967711129611',
      '9677765722227',
      '967711402227'
    ]),

    receptionLabels: Object.freeze([
      'الاستقبال 1',
      'الاستقبال 2',
      'الاستقبال 3'
    ]),

    /* -----------------------------------------
     * Optional backend
     *
     * اتركه فارغًا إذا كان الحجز WhatsApp فقط.
     *
     * مثال:
     * bookingEndpoint: '/api/bookings'
     * ----------------------------------------- */
    bookingEndpoint: '',

    visitorEndpoint: '',

    /* -----------------------------------------
     * Local storage
     * ----------------------------------------- */
    bookingStorageKey: 'mp_public_bookings_v2',
    visitorStorageKey: 'mp_public_visitors_v2',
    visitorSessionKey: 'mp_public_visited_v2',
    welcomeStorageKey: 'mp_public_welcome_v2',

    /* -----------------------------------------
     * Visitor counter
     * ----------------------------------------- */
    visitorInitialCount: 1240,

    /* -----------------------------------------
     * UI
     * ----------------------------------------- */
    welcomeIntervalMs: 24 * 60 * 60 * 1000,
    requestTimeoutMs: 10000,

    /* -----------------------------------------
     * Input limits
     * ----------------------------------------- */
    maxNameLength: 100,
    maxPhoneLength: 30,
    maxMessageLength: 500,

    /* -----------------------------------------
     * Emergency
     *
     * اتركه فارغًا إذا لم يكن رقم الطوارئ
     * محددًا رسميًا في بلد المنشأة.
     * ----------------------------------------- */
    defaultEmergencyNumber: '',

    /* -----------------------------------------
     * Local fallback
     * ----------------------------------------- */
    allowLocalBookingFallback: true,

    /* -----------------------------------------
     * Booking behavior
     * ----------------------------------------- */
    openWhatsAppAfterLocalSave: true,

    /* -----------------------------------------
     * Debug
     * ----------------------------------------- */
    debug: false

  });


  /* =========================================================
   * 2. DEPARTMENTS
   * ========================================================= */

  const DEPARTMENTS = Object.freeze([

    {
      id: 'general',
      name: 'الطب العام',
      nameEn: 'General Medicine',
      icon: '🩺',
      description: 'استشارات وفحوصات الحالات العامة'
    },

    {
      id: 'internal',
      name: 'الباطنية',
      nameEn: 'Internal Medicine',
      icon: '❤️',
      description: 'تشخيص ومتابعة الأمراض الباطنية والمزمنة'
    },

    {
      id: 'pediatrics',
      name: 'طب الأطفال',
      nameEn: 'Pediatrics',
      icon: '👶',
      description: 'رعاية الأطفال ومتابعة نموهم وصحتهم'
    },

    {
      id: 'gynecology',
      name: 'النساء والولادة',
      nameEn: 'Obstetrics & Gynecology',
      icon: '🤰',
      description: 'رعاية صحة المرأة والحمل والولادة'
    },

    {
      id: 'dentistry',
      name: 'طب الأسنان',
      nameEn: 'Dentistry',
      icon: '🦷',
      description: 'خدمات وتشخيص وعلاج الأسنان'
    },

    {
      id: 'pharmacy',
      name: 'الصيدلية',
      nameEn: 'Pharmacy',
      icon: '💊',
      description: 'خدمات صرف ومراجعة الأدوية'
    }

  ]);


  /* =========================================================
   * 3. SAFE LOGGING
   * ========================================================= */

  function debugLog(...args) {
    if (!PUBLIC_CONFIG.debug) return;

    try {
      console.log('[MediPrescribe Public]', ...args);
    } catch (_) {
      /* ignore */
    }
  }


  function errorLog(...args) {
    try {
      console.error('[MediPrescribe Public]', ...args);
    } catch (_) {
      /* ignore */
    }
  }


  /* =========================================================
   * 4. SECURITY HELPERS
   * ========================================================= */

  function escapeHTML(value) {

    const text = String(value ?? '');

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  }


  function cleanText(value, maxLength = 500) {

    let text = String(value ?? '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > maxLength) {
      text = text.slice(0, maxLength);
    }

    return text;

  }


  function normalizeDigits(value) {

    return String(value ?? '')
      .replace(/[٠-٩]/g, d =>
        String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      )
      .replace(/[۰-۹]/g, d =>
        String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      );

  }


  function normalizeArabic(value) {

    return cleanText(
      String(value ?? '')
        .toLowerCase()
        .replace(/[إأآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ـ/g, '')
        .replace(/[ًٌٍَُِّْ]/g, '')
    );

  }


  function normalizePhone(value) {

    let phone = normalizeDigits(value);

    phone = phone
      .replace(/[^\d+]/g, '')
      .replace(/^00/, '+')
      .replace(/^\+967/, '967')
      .replace(/^00967/, '967');

    if (phone.startsWith('7')) {
      phone = '967' + phone;
    }

    return phone.replace(/\D/g, '');

  }


  function maskPhone(value) {

    const phone = normalizePhone(value);

    if (!phone) return '';

    if (phone.length <= 6) {
      return '******';
    }

    return phone.slice(0, 4) +
      '*****' +
      phone.slice(-3);

  }


  function isValidName(value) {

    const name = cleanText(
      value,
      PUBLIC_CONFIG.maxNameLength
    );

    if (!name) return false;

    if (name.length < 2) return false;

    return true;

  }


  function isValidPhone(value) {

    const phone = normalizePhone(value);

    /*
     * Yemen mobile numbers are normally represented
     * internationally as 9677XXXXXXXX.
     *
     * We keep validation slightly tolerant because
     * reception may serve different formats.
     */
    return /^9677\d{7,9}$/.test(phone);

  }


  function isValidFutureDate(value) {

    if (!value) return false;

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return false;
    }

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    return date >= today;

  }


  function getLocalDateISO() {

    const now = new Date();

    const year = now.getFullYear();

    const month = String(
      now.getMonth() + 1
    ).padStart(2, '0');

    const day = String(
      now.getDate()
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;

  }


  /* =========================================================
   * 5. ID GENERATION
   * ========================================================= */

  function randomHex(length = 16) {

    try {

      if (
        window.crypto &&
        window.crypto.getRandomValues
      ) {

        const bytes = new Uint8Array(
          Math.ceil(length / 2)
        );

        window.crypto.getRandomValues(bytes);

        return Array.from(bytes)
          .map(b =>
            b.toString(16).padStart(2, '0')
          )
          .join('')
          .slice(0, length);

      }

    } catch (_) {
      /* fallback */
    }

    return Math.random()
      .toString(16)
      .slice(2)
      .padEnd(length, '0')
      .slice(0, length);

  }


  function createId(prefix = 'ID') {

    return `${prefix}-${Date.now()}-${randomHex(10)}`;

  }


  /* =========================================================
   * 6. STORAGE HELPERS
   * ========================================================= */

  function readJSON(key, fallback) {

    try {

      const raw = localStorage.getItem(key);

      if (!raw) return fallback;

      const parsed = JSON.parse(raw);

      return parsed ?? fallback;

    } catch (error) {

      debugLog('readJSON failed', error);

      return fallback;

    }

  }


  function writeJSON(key, value) {

    try {

      localStorage.setItem(
        key,
        JSON.stringify(value)
      );

      return true;

    } catch (error) {

      debugLog('writeJSON failed', error);

      return false;

    }

  }


  /* =========================================================
   * 7. TOAST SYSTEM
   * ========================================================= */

  let toastTimer = null;


  function ensureToastContainer() {

    let container =
      document.getElementById('mpToastContainer');

    if (container) return container;

    container = document.createElement('div');

    container.id = 'mpToastContainer';

    container.setAttribute(
      'aria-live',
      'polite'
    );

    container.setAttribute(
      'aria-atomic',
      'true'
    );

    container.style.position = 'fixed';
    container.style.left = '20px';
    container.style.bottom = '20px';
    container.style.zIndex = '99999';
    container.style.maxWidth = 'calc(100vw - 40px)';

    document.body.appendChild(container);

    return container;

  }


  function showToast(
    message,
    type = 'info',
    duration = 4500
  ) {

    const container =
      ensureToastContainer();

    container.innerHTML = '';

    const toast = document.createElement('div');

    toast.setAttribute('role', 'status');

    toast.style.padding = '12px 16px';
    toast.style.marginTop = '8px';
    toast.style.borderRadius = '10px';
    toast.style.background = '#ffffff';
    toast.style.color = '#222';
    toast.style.boxShadow =
      '0 6px 25px rgba(0,0,0,.15)';
    toast.style.fontSize = '14px';
    toast.style.lineHeight = '1.6';
    toast.style.direction = 'rtl';
    toast.style.border = '1px solid #ddd';

    if (type === 'success') {
      toast.style.borderColor = '#28a745';
    }

    if (type === 'error') {
      toast.style.borderColor = '#dc3545';
    }

    if (type === 'warning') {
      toast.style.borderColor = '#ffc107';
    }

    toast.textContent = String(message ?? '');

    container.appendChild(toast);

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {

      try {
        toast.remove();
      } catch (_) {
        /* ignore */
      }

    }, duration);

  }


  /* =========================================================
   * 8. DEPARTMENT HELPERS
   * ========================================================= */

  function getDepartmentById(id) {

    return DEPARTMENTS.find(
      department => department.id === id
    ) || null;

  }


  function getDepartmentName(id) {

    const department =
      getDepartmentById(id);

    return department
      ? department.name
      : cleanText(id, 100);

  }


  /* =========================================================
   * 9. DEPARTMENT RENDERING
   * ========================================================= */

  function renderDepartments(
    containerSelector = '#departments'
  ) {

    const container =
      document.querySelector(containerSelector);

    if (!container) {
      debugLog(
        `Department container "${containerSelector}" not found`
      );
      return false;
    }

    while (container.firstChild) {
      container.removeChild(
        container.firstChild
      );
    }

    const fragment =
      document.createDocumentFragment();

    DEPARTMENTS.forEach(department => {

      const card =
        document.createElement('article');

      card.className =
        'department-card';

      card.dataset.departmentId =
        department.id;

      card.tabIndex = 0;

      const icon =
        document.createElement('div');

      icon.className =
        'department-icon';

      icon.textContent =
        department.icon;

      const title =
        document.createElement('h3');

      title.textContent =
        department.name;

      const english =
        document.createElement('small');

      english.textContent =
        department.nameEn;

      const description =
        document.createElement('p');

      description.textContent =
        department.description;

      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(english);
      card.appendChild(description);

      card.addEventListener(
        'click',
        () => {

          const select =
            document.getElementById(
              'bookingDepartment'
            );

          if (select) {

            select.value =
              department.id;

            select.dispatchEvent(
              new Event(
                'change',
                {
                  bubbles: true
                }
              )
            );

          }

          const form =
            document.getElementById(
              'bookingForm'
            );

          if (form) {

            form.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });

          }

        }
      );

      card.addEventListener(
        'keydown',
        event => {

          if (
            event.key === 'Enter' ||
            event.key === ' '
          ) {

            event.preventDefault();

            card.click();

          }

        }
      );

      fragment.appendChild(card);

    });

    container.appendChild(fragment);

    return true;

  }


  /* =========================================================
   * 10. SEARCH
   * ========================================================= */

  function setupSearch() {

    const input =
      document.querySelector(
        '#departmentSearch, #searchInput, [data-department-search]'
      );

    if (!input) return false;

    const cards = () =>
      Array.from(
        document.querySelectorAll(
          '.department-card'
        )
      );

    function performSearch() {

      const query =
        normalizeArabic(input.value);

      cards().forEach(card => {

        const text =
          normalizeArabic(
            card.textContent
          );

        const visible =
          !query ||
          text.includes(query);

        card.hidden = !visible;

      });

    }

    input.addEventListener(
      'input',
      performSearch
    );

    performSearch();

    return true;

  }


  /* =========================================================
   * 11. BOOKING NUMBER
   *
   * ملاحظة:
   * الرقم المحلي ليس بديلًا عن رقم مركزي من الخادم
   * إذا أصبح النظام متعدد الأجهزة.
   * ========================================================= */

  function nextLocalBookingNumber() {

    const year =
      new Date().getFullYear();

    const key =
      `mp_booking_counter_${year}`;

    let counter = 0;

    try {

      counter =
        Number(
          localStorage.getItem(key)
        ) || 0;

      counter += 1;

      localStorage.setItem(
        key,
        String(counter)
      );

    } catch (_) {

      counter =
        Math.floor(
          Math.random() * 90000
        ) + 10000;

    }

    return `BK-${year}-${String(counter).padStart(5, '0')}`;

  }


  /* =========================================================
   * 12. RECEPTION SELECTOR
   * ========================================================= */

  function ensureReceptionSelector() {

    const form =
      document.getElementById(
        'bookingForm'
      );

    if (!form) return null;

    let select =
      document.getElementById(
        'bookingReception'
      );

    if (select) return select;

    /*
     * إذا كان المستخدم قد وضع select باسم receptionIndex
     * نستخدمه بدل إنشاء عنصر جديد.
     */
    select =
      form.querySelector(
        'select[name="receptionIndex"]'
      );

    if (select) {

      select.id =
        'bookingReception';

      return select;

    }

    const wrapper =
      document.createElement('div');

    wrapper.className =
      'booking-reception-wrapper';

    const label =
      document.createElement('label');

    label.htmlFor =
      'bookingReception';

    label.textContent =
      'اختر جهة الاستقبال';

    select =
      document.createElement('select');

    select.id =
      'bookingReception';

    select.name =
      'receptionIndex';

    select.required = true;

    PUBLIC_CONFIG.receptionLabels
      .forEach((labelText, index) => {

        const option =
          document.createElement('option');

        option.value =
          String(index);

        option.textContent =
          labelText;

        select.appendChild(option);

      });

    wrapper.appendChild(label);
    wrapper.appendChild(select);

    const submitButton =
      form.querySelector(
        'button[type="submit"], input[type="submit"]'
      );

    if (submitButton) {

      form.insertBefore(
        wrapper,
        submitButton
      );

    } else {

      form.appendChild(wrapper);

    }

    return select;

  }


  /* =========================================================
   * 13. GET FORM DATA
   * ========================================================= */

  function getBookingFormData(form) {

    const formData =
      new FormData(form);

    const name =
      cleanText(
        formData.get('name') ||
        document.getElementById(
          'bookingName'
        )?.value ||
        '',
        PUBLIC_CONFIG.maxNameLength
      );

    const phone =
      normalizePhone(
        formData.get('phone') ||
        document.getElementById(
          'bookingPhone'
        )?.value ||
        ''
      );

    const department =
      cleanText(
        formData.get('department') ||
        document.getElementById(
          'bookingDepartment'
        )?.value ||
        '',
        100
      );

    const date =
      cleanText(
        formData.get('date') ||
        document.getElementById(
          'bookingDate'
        )?.value ||
        '',
        20
      );

    const time =
      cleanText(
        formData.get('time') ||
        document.getElementById(
          'bookingTime'
        )?.value ||
        '',
        20
      );

    const message =
      cleanText(
        formData.get('message') ||
        formData.get('notes') ||
        document.getElementById(
          'bookingMessage'
        )?.value ||
        '',
        PUBLIC_CONFIG.maxMessageLength
      );

    let receptionIndex =
      formData.get('receptionIndex');

    if (
      receptionIndex === null ||
      receptionIndex === ''
    ) {

      receptionIndex =
        document.getElementById(
          'bookingReception'
        )?.value ?? '0';

    }

    receptionIndex =
      Number(receptionIndex);

    if (
      !Number.isInteger(receptionIndex) ||
      receptionIndex < 0 ||
      receptionIndex >=
        PUBLIC_CONFIG.receptionWhatsApp.length
    ) {

      receptionIndex = 0;

    }

    return {

      name,
      phone,
      department,
      date,
      time,
      message,
      receptionIndex

    };

  }


  /* =========================================================
   * 14. BOOKING VALIDATION
   * ========================================================= */

  function validateBooking(data) {

    const errors = [];

    if (!isValidName(data.name)) {

      errors.push(
        'يرجى إدخال اسم صحيح.'
      );

    }

    if (!isValidPhone(data.phone)) {

      errors.push(
        'يرجى إدخال رقم جوال يمني صحيح.'
      );

    }

    if (!data.department) {

      errors.push(
        'يرجى اختيار القسم.'
      );

    } else {

      const department =
        getDepartmentById(
          data.department
        );

      /*
       * نسمح بقيم أخرى إذا كانت الصفحة
       * تحتوي أقسامًا ديناميكية.
       */
      if (
        !department &&
        data.department.length < 2
      ) {

        errors.push(
          'القسم المحدد غير صالح.'
        );

      }

    }

    if (!isValidFutureDate(data.date)) {

      errors.push(
        'يرجى اختيار تاريخ صحيح اليوم أو بعده.'
      );

    }

    if (!/^\d{2}:\d{2}$/.test(data.time)) {

      errors.push(
        'يرجى اختيار وقت صحيح.'
      );

    }

    if (
      !Number.isInteger(
        data.receptionIndex
      )
    ) {

      errors.push(
        'يرجى اختيار جهة الاستقبال.'
      );

    }

    return {

      valid: errors.length === 0,
      errors

    };

  }


  /* =========================================================
   * 15. BUILD BOOKING RECORD
   * ========================================================= */

  function createBookingRecord(data) {

    const bookingNumber =
      nextLocalBookingNumber();

    const receptionNumber =
      PUBLIC_CONFIG.receptionWhatsApp[
        data.receptionIndex
      ];

    const receptionLabel =
      PUBLIC_CONFIG.receptionLabels[
        data.receptionIndex
      ];

    return {

      id: createId('BOOK'),

      bookingNumber,

      createdAt:
        new Date().toISOString(),

      status: 'pending',

      name: data.name,

      phone: data.phone,

      phoneMasked:
        maskPhone(data.phone),

      department:
        data.department,

      departmentName:
        getDepartmentName(
          data.department
        ),

      date: data.date,

      time: data.time,

      message: data.message,

      receptionIndex:
        data.receptionIndex,

      receptionLabel,

      receptionWhatsApp:
        receptionNumber,

      source: 'public-whatsapp',

      version:
        PUBLIC_CONFIG.version

    };

  }


  /* =========================================================
   * 16. SAVE LOCAL BOOKING
   * ========================================================= */

  function saveBookingLocally(record) {

    if (
      !PUBLIC_CONFIG.allowLocalBookingFallback
    ) {

      return false;

    }

    try {

      const bookings =
        readJSON(
          PUBLIC_CONFIG.bookingStorageKey,
          []
        );

      const safeBookings =
        Array.isArray(bookings)
          ? bookings
          : [];

      safeBookings.push(record);

      /*
       * الاحتفاظ بآخر 500 حجز محليًا فقط.
       */
      const trimmed =
        safeBookings.slice(-500);

      return writeJSON(
        PUBLIC_CONFIG.bookingStorageKey,
        trimmed
      );

    } catch (error) {

      errorLog(
        'Unable to save booking locally',
        error
      );

      return false;

    }

  }


  /* =========================================================
   * 17. AUDIT
   * ========================================================= */

  async function writeAudit(
    action,
    details = {}
  ) {

    try {

      if (
        window.DB &&
        typeof window.DB.add === 'function'
      ) {

        await window.DB.add(
          'audit',
          {

            action,

            timestamp:
              new Date().toISOString(),

            source:
              'public',

            details

          }
        );

        return true;

      }

    } catch (error) {

      debugLog(
        'DB audit failed',
        error
      );

    }

    try {

      if (
        typeof window.logAudit === 'function'
      ) {

        await window.logAudit(
          action,
          details
        );

        return true;

      }

    } catch (error) {

      debugLog(
        'logAudit failed',
        error
      );

    }

    return false;

  }


  /* =========================================================
   * 18. FETCH WITH TIMEOUT
   * ========================================================= */

  async function fetchWithTimeout(
    url,
    options = {},
    timeout =
      PUBLIC_CONFIG.requestTimeoutMs
  ) {

    if (!url) {
      throw new Error(
        'No endpoint configured'
      );
    }

    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () => controller.abort(),
        timeout
      );

    try {

      const response =
        await fetch(
          url,
          {
            ...options,
            signal:
              controller.signal
          }
        );

      return response;

    } finally {

      clearTimeout(timer);

    }

  }


  /* =========================================================
   * 19. OPTIONAL BACKEND BOOKING
   * ========================================================= */

  async function sendBookingToAPI(
    record
  ) {

    if (
      !PUBLIC_CONFIG.bookingEndpoint
    ) {

      return {

        attempted: false,
        success: false

      };

    }

    const payload = {

      clientRequestId:
        record.id,

      bookingNumber:
        record.bookingNumber,

      name:
        record.name,

      phone:
        record.phone,

      department:
        record.department,

      departmentName:
        record.departmentName,

      date:
        record.date,

      time:
        record.time,

      message:
        record.message,

      receptionIndex:
        record.receptionIndex,

      source:
        record.source

    };

    try {

      const response =
        await fetchWithTimeout(
          PUBLIC_CONFIG.bookingEndpoint,
          {

            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
              'Accept':
                'application/json'
            },

            body:
              JSON.stringify(payload)

          }
        );

      if (!response.ok) {

        throw new Error(
          `Booking API HTTP ${response.status}`
        );

      }

      let result = null;

      try {
        result =
          await response.json();
      } catch (_) {
        /* response may be empty */
      }

      return {

        attempted: true,
        success: true,
        result

      };

    } catch (error) {

      debugLog(
        'Booking API failed',
        error
      );

      return {

        attempted: true,
        success: false,
        error

      };

    }

  }


  /* =========================================================
   * 20. WHATSAPP MESSAGE
   * ========================================================= */

  function buildWhatsAppMessage(
    record
  ) {

    const lines = [

      '🏥 *MediPrescribe*',

      '',

      '📋 *طلب حجز موعد*',

      '',

      `🔢 رقم الطلب: ${record.bookingNumber}`,

      `👤 الاسم: ${record.name}`,

      `📱 الهاتف: ${record.phone}`,

      `🏥 القسم: ${record.departmentName}`,

      `📅 التاريخ: ${record.date}`,

      `⏰ الوقت: ${record.time}`,

      `👥 الاستقبال: ${record.receptionLabel}`

    ];

    if (record.message) {

      lines.push(
        '',
        `📝 ملاحظات: ${record.message}`
      );

    }

    lines.push(

      '',

      '⚠️ هذا طلب حجز وليس تأكيدًا نهائيًا للموعد.',

      'يرجى تأكيد الموعد مع الاستقبال.',

      '',

      `معرّف الطلب: ${record.id}`

    );

    return lines.join('\n');

  }


  /* =========================================================
   * 21. WHATSAPP URL
   * ========================================================= */

  function buildWhatsAppURL(
    record
  ) {

    const number =
      normalizePhone(
        record.receptionWhatsApp
      );

    if (!number) {
      throw new Error(
        'رقم WhatsApp للاستقبال غير صالح.'
      );
    }

    const message =
      buildWhatsAppMessage(record);

    return (
      `https://wa.me/${number}` +
      `?text=${encodeURIComponent(message)}`
    );

  }


  /* =========================================================
   * 22. OPEN WHATSAPP
   * ========================================================= */

  function openWhatsApp(
    record
  ) {

    let url;

    try {

      url =
        buildWhatsAppURL(record);

    } catch (error) {

      showToast(
        error.message ||
        'تعذر إنشاء رابط WhatsApp.',
        'error'
      );

      return false;

    }

    /*
     * window.open قد يفشل إذا لم يكن الاستدعاء
     * ناتجًا مباشرة عن user gesture.
     */
    let opened = null;

    try {

      opened =
        window.open(
          url,
          '_blank',
          'noopener,noreferrer'
        );

    } catch (error) {

      debugLog(
        'window.open failed',
        error
      );

    }

    /*
     * بعض المتصفحات تعيد null عند منع popup.
     * نحاول التنقل في نفس الصفحة كخيار احتياطي.
     */
    if (!opened) {

      try {

        window.location.href = url;

      } catch (_) {

        showToast(
          'تعذر فتح WhatsApp. يمكنك نسخ بيانات الحجز والتواصل مع الاستقبال.',
          'warning'
        );

        return false;

      }

    }

    return true;

  }


  /* =========================================================
   * 23. BOOKING SUBMIT LOCK
   * ========================================================= */

  let bookingSubmitting = false;


  function setBookingButtonState(
    form,
    loading
  ) {

    const buttons =
      form.querySelectorAll(
        'button[type="submit"], input[type="submit"]'
      );

    buttons.forEach(button => {

      if (loading) {

        if (
          !button.dataset.originalText
        ) {

          button.dataset.originalText =
            button.textContent ||
            button.value ||
            '';

        }

        if (
          button.tagName === 'INPUT'
        ) {

          button.value =
            'جاري تجهيز الحجز...';

        } else {

          button.textContent =
            'جاري تجهيز الحجز...';

        }

        button.disabled = true;

      } else {

        if (
          button.dataset.originalText
        ) {

          if (
            button.tagName === 'INPUT'
          ) {

            button.value =
              button.dataset.originalText;

          } else {

            button.textContent =
              button.dataset.originalText;

          }

        }

        button.disabled = false;

      }

    });

  }


  /* =========================================================
   * 24. BOOKING FLOW
   * ========================================================= */

  async function processBooking(
    form
  ) {

    if (bookingSubmitting) {

      showToast(
        'يرجى الانتظار حتى تكتمل عملية الحجز الحالية.',
        'warning'
      );

      return null;

    }

    bookingSubmitting = true;

    setBookingButtonState(
      form,
      true
    );

    try {

      const data =
        getBookingFormData(form);

      const validation =
        validateBooking(data);

      if (!validation.valid) {

        showToast(
          validation.errors.join(' '),
          'error',
          6000
        );

        return null;

      }

      const record =
        createBookingRecord(data);

      /*
       * حفظ محلي أولًا.
       */
      const savedLocally =
        saveBookingLocally(record);

      /*
       * Audit بدون تعطيل الحجز.
       */
      writeAudit(
        'PUBLIC_BOOKING_CREATED',
        {

          bookingNumber:
            record.bookingNumber,

          department:
            record.department,

          date:
            record.date,

          time:
            record.time,

          reception:
            record.receptionLabel

        }
      ).catch(() => {});


      /*
       * API اختياري.
       */
      const apiResult =
        await sendBookingToAPI(record);

      /*
       * نفتح WhatsApp سواء كان API غير موجود
       * أو نجح، لأن هذا هو مسار الحجز الأساسي.
       */
      const whatsappOpened =
        openWhatsApp(record);

      if (whatsappOpened) {

        showToast(
          `تم تجهيز طلب الحجز رقم ${record.bookingNumber}. أكمل الإرسال داخل WhatsApp.`,
          'success',
          7000
        );

      } else if (savedLocally) {

        showToast(
          `تم حفظ طلب الحجز محليًا برقم ${record.bookingNumber}.`,
          'warning',
          7000
        );

      }

      /*
       * إذا كان API مفعّلًا وفشل، لا نعتبر WhatsApp فاشلًا.
       */
      if (
        apiResult.attempted &&
        !apiResult.success
      ) {

        debugLog(
          'API unavailable; WhatsApp remains available'
        );

      }

      return {

        record,

        savedLocally,

        apiResult,

        whatsappOpened

      };

    } catch (error) {

      errorLog(
        'Booking process failed',
        error
      );

      showToast(
        'حدث خطأ غير متوقع أثناء تجهيز الحجز.',
        'error'
      );

      return null;

    } finally {

      bookingSubmitting = false;

      setBookingButtonState(
        form,
        false
      );

    }

  }


  /* =========================================================
   * 25. BOOKING FORM SETUP
   * ========================================================= */

  function setupBookingForm() {

    const form =
      document.getElementById(
        'bookingForm'
      );

    if (!form) {

      debugLog(
        'bookingForm not found'
      );

      return false;

    }

    /*
     * إضافة select الاستقبال إذا لم يكن موجودًا.
     */
    ensureReceptionSelector();

    /*
     * تعبئة الأقسام تلقائيًا إذا كان select فارغًا.
     */
    const departmentSelect =
      document.getElementById(
        'bookingDepartment'
      );

    if (departmentSelect) {

      const hasOptions =
        departmentSelect.options.length > 0;

      if (!hasOptions) {

        const placeholder =
          document.createElement('option');

        placeholder.value = '';

        placeholder.textContent =
          'اختر القسم';

        placeholder.disabled = true;

        placeholder.selected = true;

        departmentSelect.appendChild(
          placeholder
        );

        DEPARTMENTS.forEach(
          department => {

            const option =
              document.createElement('option');

            option.value =
              department.id;

            option.textContent =
              department.name;

            departmentSelect.appendChild(
              option
            );

          }
        );

      }

    }


    /*
     * منع اختيار تاريخ قديم.
     */
    const dateInput =
      document.getElementById(
        'bookingDate'
      );

    if (dateInput) {

      dateInput.min =
        getLocalDateISO();

    }


    /*
     * Submit.
     */
    form.addEventListener(
      'submit',
      event => {

        event.preventDefault();

        processBooking(form);

      }
    );

    return true;

  }


  /* =========================================================
   * 26. HEALTH ASSISTANT
   * ========================================================= */

  const EMERGENCY_PATTERNS = Object.freeze([

    'ألم صدر شديد',
    'الم صدر شديد',
    'ضيق تنفس شديد',
    'ضيق نفس شديد',
    'فقدان الوعي',
    'اغماء',
    'إغماء',
    'تشنج',
    'نزيف شديد',
    'نزيف لا يتوقف',
    'ضعف مفاجئ',
    'شلل مفاجئ',
    'اضطراب الكلام',
    'زرقة'

  ]);


  function containsEmergencySymptom(
    message
  ) {

    const normalized =
      normalizeArabic(message);

    return EMERGENCY_PATTERNS.some(
      pattern =>
        normalized.includes(
          normalizeArabic(pattern)
        )
    );

  }


  function healthAssistantReply(
    message
  ) {

    const text =
      cleanText(
        message,
        PUBLIC_CONFIG.maxMessageLength
      );

    if (!text) {

      return {
        type: 'info',
        text:
          'اكتب سؤالك الصحي وسأساعدك بمعلومات عامة.'
      };

    }


    if (
      containsEmergencySymptom(text)
    ) {

      let emergencyText =
        'الأعراض المذكورة قد تستدعي تقييمًا طبيًا عاجلًا. إذا كانت شديدة أو مفاجئة، توجّه إلى أقرب قسم طوارئ أو اتصل برقم الطوارئ المحلي.';

      if (
        PUBLIC_CONFIG.defaultEmergencyNumber
      ) {

        emergencyText +=
          ` رقم الطوارئ: ${PUBLIC_CONFIG.defaultEmergencyNumber}.`;

      }

      return {

        type: 'emergency',

        text: emergencyText

      };

    }


    /*
     * لا نعطي جرعات شخصية من واجهة عامة.
     */
    const medicationKeywords = [

      'جرعة',
      'جرعات',
      'dose',
      'dosage',
      'كم حبة',
      'كم قرص',
      'كم مل',
      'milligram',
      'mg'

    ];

    const asksDose =
      medicationKeywords.some(
        keyword =>
          normalizeArabic(text)
            .includes(
              normalizeArabic(keyword)
            )
      );

    if (asksDose) {

      return {

        type: 'warning',

        text:
          'لا يمكن تحديد جرعة دواء شخصية بأمان من خلال المساعد العام وحده. الجرعة تعتمد على الدواء، العمر، الوزن، وظائف الكلى والكبد، التشخيص، والأدوية الأخرى. يُفضّل مراجعة الطبيب أو الصيدلي مع اسم الدواء وتركيزه وحالة المريض.'

      };

    }


    return {

      type: 'info',

      text:
        'يمكنني تقديم معلومات صحية عامة، لكن لا أستطيع استبدال تقييم الطبيب أو الصيدلي. إذا ذكرت الأعراض ومدتها والعمر والأدوية المستخدمة، يمكنني مساعدتك في تحديد المعلومات التي ينبغي مناقشتها مع المختص.'

    };

  }


  function setupHealthAssistant() {

    const form =
      document.querySelector(
        '#aiChatForm, #healthAssistantForm, [data-health-assistant]'
      );

    if (!form) return false;

    const input =
      form.querySelector(
        'input, textarea'
      );

    const output =
      document.querySelector(
        '#aiChatMessages, #aiChatOutput, [data-ai-output]'
      );

    if (!input || !output) {
      return false;
    }

    form.addEventListener(
      'submit',
      event => {

        event.preventDefault();

        const userMessage =
          cleanText(
            input.value,
            PUBLIC_CONFIG.maxMessageLength
          );

        if (!userMessage) return;

        const userBubble =
          document.createElement('div');

        userBubble.className =
          'ai-message ai-user';

        userBubble.textContent =
          userMessage;

        output.appendChild(
          userBubble
        );


        const reply =
          healthAssistantReply(
            userMessage
          );

        const assistantBubble =
          document.createElement('div');

        assistantBubble.className =
          `ai-message ai-assistant ai-${reply.type}`;

        assistantBubble.textContent =
          reply.text;

        output.appendChild(
          assistantBubble
        );

        input.value = '';

        output.scrollTop =
          output.scrollHeight;

      }
    );

    return true;

  }


  /* =========================================================
   * 27. VISITOR COUNTER
   * ========================================================= */

  function getLocalVisitorCount() {

    const value =
      Number(
        localStorage.getItem(
          PUBLIC_CONFIG.visitorStorageKey
        )
      );

    if (
      Number.isFinite(value) &&
      value >= 0
    ) {

      return Math.floor(value);

    }

    return PUBLIC_CONFIG.visitorInitialCount;

  }


  function setLocalVisitorCount(
    value
  ) {

    try {

      localStorage.setItem(
        PUBLIC_CONFIG.visitorStorageKey,
        String(Math.max(0, Math.floor(value)))
      );

    } catch (_) {
      /* ignore */
    }

  }


  function animateCounter(
    element,
    from,
    to,
    duration = 900
  ) {

    if (!element) return;

    const start =
      performance.now();

    function frame(now) {

      const progress =
        Math.min(
          1,
          (now - start) / duration
        );

      const eased =
        1 - Math.pow(
          1 - progress,
          3
        );

      const value =
        Math.round(
          from +
          (to - from) * eased
        );

      element.textContent =
        value.toLocaleString('ar');

      if (progress < 1) {

        requestAnimationFrame(frame);

      }

    }

    requestAnimationFrame(frame);

  }


  async function fetchRemoteVisitorCount() {

    if (
      !PUBLIC_CONFIG.visitorEndpoint
    ) {

      return null;

    }

    try {

      const response =
        await fetchWithTimeout(
          PUBLIC_CONFIG.visitorEndpoint,
          {
            method: 'GET',
            headers: {
              'Accept':
                'application/json'
            }
          }
        );

      if (!response.ok) {
        return null;
      }

      const data =
        await response.json();

      const count =
        Number(
          data.count ??
          data.visitors ??
          data.total
        );

      if (
        !Number.isFinite(count) ||
        count < 0
      ) {

        return null;

      }

      return Math.floor(count);

    } catch (error) {

      debugLog(
        'Remote visitor counter unavailable',
        error
      );

      return null;

    }

  }


  async function setupVisitorCounter() {

    const elements =
      document.querySelectorAll(
        '#visitorCount, [data-visitor-count]'
      );

    if (!elements.length) {
      return false;
    }

    let count =
      getLocalVisitorCount();

    /*
     * الزيادة المحلية تحدث مرة واحدة لكل متصفح/جلسة.
     */
    let alreadyVisited = false;

    try {

      alreadyVisited =
        sessionStorage.getItem(
          PUBLIC_CONFIG.visitorSessionKey
        ) === '1';

    } catch (_) {
      /* ignore */
    }


    if (!alreadyVisited) {

      count += 1;

      setLocalVisitorCount(
        count
      );

      try {

        sessionStorage.setItem(
          PUBLIC_CONFIG.visitorSessionKey,
          '1'
        );

      } catch (_) {
        /* ignore */
      }

    }


    const remoteCount =
      await fetchRemoteVisitorCount();

    if (
      Number.isFinite(remoteCount)
    ) {

      count = remoteCount;

      setLocalVisitorCount(
        count
      );

    }


    elements.forEach(
      element => {

        const previous =
          Number(
            element.textContent
              .replace(/[^\d]/g, '')
          ) || 0;

        animateCounter(
          element,
          previous,
          count
        );

      }
    );

    return true;

  }


  /* =========================================================
   * 28. SOCIAL SHARING
   * ========================================================= */

  function getShareData() {

    return {

      title:
        document.title ||
        'MediPrescribe',

      text:
        'MediPrescribe - الخدمات الطبية والحجز',

      url:
        window.location.href

    };

  }


  async function sharePage() {

    const data =
      getShareData();

    if (
      navigator.share
    ) {

      try {

        await navigator.share(
          data
        );

        return true;

      } catch (error) {

        /*
         * AbortError يعني أن المستخدم أغلق
         * نافذة المشاركة.
         */
        if (
          error &&
          error.name === 'AbortError'
        ) {

          return false;

        }

        debugLog(
          'Native share failed',
          error
        );

      }

    }


    return sharePageFallback(data);

  }


  function sharePageFallback(data) {

    const url =
      encodeURIComponent(
        data.url
      );

    const text =
      encodeURIComponent(
        `${data.title}\n${data.text}`
      );

    const links = {

      whatsapp:
        `https://wa.me/?text=${text}%20${url}`,

      facebook:
        `https://www.facebook.com/sharer/sharer.php?u=${url}`,

      telegram:
        `https://t.me/share/url?url=${url}&text=${text}`

    };

    /*
     * إن كان هناك أزرار مخصصة للمشاركة،
     * نعطيها الروابط المناسبة.
     */
    document
      .querySelectorAll(
        '[data-share]'
      )
      .forEach(button => {

        const type =
          button.dataset.share;

        if (!links[type]) return;

        button.dataset.shareURL =
          links[type];

        button.addEventListener(
          'click',
          () => {

            window.open(
              links[type],
              '_blank',
              'noopener,noreferrer'
            );

          },
          {
            once: true
          }
        );

      });


    /*
     * في حال لم يكن هناك Web Share API،
     * نحاول نسخ الرابط.
     */
    if (
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {

      navigator.clipboard
        .writeText(data.url)
        .then(() => {

          showToast(
            'تم نسخ رابط الصفحة للمشاركة.',
            'success'
          );

        })
        .catch(() => {

          showToast(
            'يمكنك نسخ رابط الصفحة يدويًا للمشاركة.',
            'info'
          );

        });

    } else {

      showToast(
        'يمكنك نسخ رابط الصفحة يدويًا للمشاركة.',
        'info'
      );

    }

    return false;

  }


  function setupSocialSharing() {

    const shareButtons =
      document.querySelectorAll(
        '[data-action="share"], #sharePage, .share-page'
      );

    shareButtons.forEach(
      button => {

        button.addEventListener(
          'click',
          event => {

            event.preventDefault();

            sharePage();

          }
        );

      }
    );

    /*
     * روابط مشاركة مباشرة.
     */
    document
      .querySelectorAll(
        '[data-share]'
      )
      .forEach(button => {

        const type =
          button.dataset.share;

        const data =
          getShareData();

        const url =
          encodeURIComponent(
            data.url
          );

        const text =
          encodeURIComponent(
            `${data.title}\n${data.text}`
          );

        let shareURL = '';

        if (type === 'whatsapp') {

          shareURL =
            `https://wa.me/?text=${text}%20${url}`;

        }

        if (type === 'facebook') {

          shareURL =
            `https://www.facebook.com/sharer/sharer.php?u=${url}`;

        }

        if (type === 'telegram') {

          shareURL =
            `https://t.me/share/url?url=${url}&text=${text}`;

        }

        if (!shareURL) return;

        button.addEventListener(
          'click',
          event => {

            event.preventDefault();

            window.open(
              shareURL,
              '_blank',
              'noopener,noreferrer'
            );

          }
        );

      });

  }


  /* =========================================================
   * 29. COPY TO CLIPBOARD
   * ========================================================= */

  async function copyText(
    text
  ) {

    const value =
      String(text ?? '');

    if (!value) return false;


    if (
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {

      try {

        await navigator.clipboard.writeText(
          value
        );

        return true;

      } catch (_) {
        /* fallback */
      }

    }


    /*
     * Legacy fallback.
     */
    try {

      const textarea =
        document.createElement(
          'textarea'
        );

      textarea.value =
        value;

      textarea.setAttribute(
        'readonly',
        ''
      );

      textarea.style.position =
        'fixed';

      textarea.style.left =
        '-9999px';

      document.body.appendChild(
        textarea
      );

      textarea.select();

      const success =
        document.execCommand(
          'copy'
        );

      textarea.remove();

      return success;

    } catch (error) {

      debugLog(
        'copyText failed',
        error
      );

      return false;

    }

  }


  function setupCopyButtons() {

    document
      .querySelectorAll(
        '[data-copy-target]'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          async event => {

            event.preventDefault();

            const selector =
              button.dataset.copyTarget;

            const target =
              document.querySelector(
                selector
              );

            if (!target) return;

            const text =
              target.value ??
              target.textContent ??
              '';

            const success =
              await copyText(text);

            showToast(
              success
                ? 'تم النسخ بنجاح.'
                : 'تعذر النسخ تلقائيًا.',
              success
                ? 'success'
                : 'warning'
            );

          }
        );

      });

  }


  /* =========================================================
   * 30. SMOOTH SCROLL
   * ========================================================= */

  function setupSmoothScroll() {

    document
      .querySelectorAll(
        'a[href^="#"]'
      )
      .forEach(link => {

        link.addEventListener(
          'click',
          event => {

            const href =
              link.getAttribute(
                'href'
              );

            if (
              !href ||
              href === '#'
            ) {

              return;

            }

            const target =
              document.querySelector(
                href
              );

            if (!target) return;

            event.preventDefault();

            target.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });

            /*
             * تحديث history دون قفزة.
             */
            try {

              history.pushState(
                null,
                '',
                href
              );

            } catch (_) {
              /* ignore */
            }

          }
        );

      });

  }


  /* =========================================================
   * 31. WELCOME MODAL
   * ========================================================= */

  function getWelcomeTimestamp() {

    try {

      return Number(
        localStorage.getItem(
          PUBLIC_CONFIG.welcomeStorageKey
        )
      ) || 0;

    } catch (_) {

      return 0;

    }

  }


  function setWelcomeTimestamp() {

    try {

      localStorage.setItem(
        PUBLIC_CONFIG.welcomeStorageKey,
        String(Date.now())
      );

    } catch (_) {
      /* ignore */
    }

  }


  function findWelcomeModal() {

    return document.querySelector(
      '#welcomeModal, [data-welcome-modal]'
    );

  }


  function closeWelcomeModal() {

    const modal =
      findWelcomeModal();

    if (!modal) return;

    modal.hidden = true;

    modal.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.classList.remove(
      'modal-open'
    );

    setWelcomeTimestamp();

  }


  function openWelcomeModal() {

    const modal =
      findWelcomeModal();

    if (!modal) return;

    modal.hidden = false;

    modal.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.classList.add(
      'modal-open'
    );

    const closeButton =
      modal.querySelector(
        '[data-close-modal], .modal-close, button'
      );

    if (closeButton) {

      setTimeout(() => {

        try {
          closeButton.focus();
        } catch (_) {
          /* ignore */
        }

      }, 50);

    }

  }


  function setupWelcomeModal() {

    const modal =
      findWelcomeModal();

    if (!modal) return false;

    modal.setAttribute(
      'role',
      'dialog'
    );

    modal.setAttribute(
      'aria-modal',
      'true'
    );

    modal.setAttribute(
      'aria-hidden',
      modal.hidden
        ? 'true'
        : 'false'
    );


    modal
      .querySelectorAll(
        '[data-close-modal], .modal-close'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          closeWelcomeModal
        );

      });


    modal.addEventListener(
      'click',
      event => {

        if (
          event.target === modal
        ) {

          closeWelcomeModal();

        }

      }
    );


    document.addEventListener(
      'keydown',
      event => {

        if (
          event.key === 'Escape' &&
          !modal.hidden
        ) {

          closeWelcomeModal();

        }

      }
    );


    /*
     * لا تظهر النافذة في كل زيارة.
     */
    const lastShown =
      getWelcomeTimestamp();

    const shouldShow =
      !lastShown ||
      (
        Date.now() -
        lastShown >=
        PUBLIC_CONFIG.welcomeIntervalMs
      );

    if (shouldShow) {

      setTimeout(
        openWelcomeModal,
        700
      );

    }

    return true;

  }


  /* =========================================================
   * 32. QUICK ACTIONS
   * ========================================================= */

  function setupQuickActions() {

    /*
     * زر الحجز.
     */
    document
      .querySelectorAll(
        '[data-action="booking"], #quickBooking'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          event => {

            event.preventDefault();

            const form =
              document.getElementById(
                'bookingForm'
              );

            if (form) {

              form.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });

              const firstInput =
                form.querySelector(
                  'input, select, textarea'
                );

              if (firstInput) {

                setTimeout(
                  () => {

                    try {
                      firstInput.focus();
                    } catch (_) {
                      /* ignore */
                    }

                  },
                  500
                );

              }

            }

          }
        );

      });


    /*
     * زر الطوارئ.
     */
    document
      .querySelectorAll(
        '[data-action="emergency"], #emergencyButton'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          event => {

            event.preventDefault();

            const number =
              PUBLIC_CONFIG.defaultEmergencyNumber;

            if (!number) {

              showToast(
                'يرجى استخدام رقم الطوارئ المحلي المعتمد في بلدك.',
                'warning',
                6000
              );

              return;

            }

            const normalized =
              normalizePhone(number);

            window.location.href =
              `tel:${normalized}`;

          }
        );

      });

  }


  /* =========================================================
   * 33. BOOKING FORM UX
   * ========================================================= */

  function setupBookingUX() {

    const form =
      document.getElementById(
        'bookingForm'
      );

    if (!form) return;

    const phoneInput =
      document.getElementById(
        'bookingPhone'
      );

    if (phoneInput) {

      phoneInput.addEventListener(
        'blur',
        () => {

          if (
            phoneInput.value
          ) {

            phoneInput.value =
              normalizePhone(
                phoneInput.value
              );

          }

        }
      );

    }


    const nameInput =
      document.getElementById(
        'bookingName'
      );

    if (nameInput) {

      nameInput.maxLength =
        PUBLIC_CONFIG.maxNameLength;

    }


    if (phoneInput) {

      phoneInput.maxLength =
        PUBLIC_CONFIG.maxPhoneLength;

      phoneInput.inputMode =
        'tel';

    }


    const messageInput =
      document.getElementById(
        'bookingMessage'
      );

    if (messageInput) {

      messageInput.maxLength =
        PUBLIC_CONFIG.maxMessageLength;

    }

  }


  /* =========================================================
   * 34. EXTERNAL LINKS SECURITY
   * ========================================================= */

  function secureExternalLinks() {

    document
      .querySelectorAll(
        'a[target="_blank"]'
      )
      .forEach(link => {

        const rel =
          new Set(
            (link.getAttribute('rel') || '')
              .split(/\s+/)
              .filter(Boolean)
          );

        rel.add('noopener');
        rel.add('noreferrer');

        link.setAttribute(
          'rel',
          Array.from(rel).join(' ')
        );

      });

  }


  /* =========================================================
   * 35. FORM VALIDATION UX
   * ========================================================= */

  function setupNativeValidationMessages() {

    const form =
      document.getElementById(
        'bookingForm'
      );

    if (!form) return;

    const dateInput =
      document.getElementById(
        'bookingDate'
      );

    if (dateInput) {

      dateInput.min =
        getLocalDateISO();

    }

    /*
     * منع إرسال HTML5 غير صالح مع رسالة مفهومة.
     */
    form.addEventListener(
      'invalid',
      event => {

        const element =
          event.target;

        if (
          element instanceof
          HTMLInputElement ||
          element instanceof
          HTMLSelectElement ||
          element instanceof
          HTMLTextAreaElement
        ) {

          if (
            element.validity.valueMissing
          ) {

            element.setCustomValidity(
              'هذا الحقل مطلوب.'
            );

          }

        }

      },
      true
    );


    form.addEventListener(
      'input',
      event => {

        const element =
          event.target;

        if (
          element instanceof
          HTMLInputElement ||
          element instanceof
          HTMLSelectElement ||
          element instanceof
          HTMLTextAreaElement
        ) {

          element.setCustomValidity('');

        }

      },
      true
    );

  }


  /* =========================================================
   * 36. LEGACY BOOKING BUTTON SUPPORT
   * ========================================================= */

  function setupLegacyBookingButtons() {

    document
      .querySelectorAll(
        '[data-book-department]'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          event => {

            event.preventDefault();

            const department =
              button.dataset.bookDepartment;

            const select =
              document.getElementById(
                'bookingDepartment'
              );

            if (select) {

              select.value =
                department;

            }

            const form =
              document.getElementById(
                'bookingForm'
              );

            if (form) {

              form.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });

            }

          }
        );

      });

  }


  /* =========================================================
   * 37. GLOBAL DATE/TIME SAFETY
   * ========================================================= */

  function setupDateTimeRestrictions() {

    const date =
      document.getElementById(
        'bookingDate'
      );

    if (date) {

      date.min =
        getLocalDateISO();

    }


    const time =
      document.getElementById(
        'bookingTime'
      );

    if (time) {

      /*
       * لا نفرض ساعات عمل لأن أوقات العمل
       * يجب أن تأتي من إعدادات المنشأة.
       */

      time.step = '900';

    }

  }


  /* =========================================================
   * 38. FORM RESET AFTER SUCCESS
   * ========================================================= */

  function setupBookingSuccessReset() {

    const form =
      document.getElementById(
        'bookingForm'
      );

    if (!form) return;

    /*
     * لا نقوم بالمسح التلقائي هنا.
     * لأن المستخدم قد يحتاج مراجعة البيانات.
     */

  }


  /* =========================================================
   * 39. PUBLIC BOOKING LOOKUP
   * ========================================================= */

  function getLocalBookings() {

    const bookings =
      readJSON(
        PUBLIC_CONFIG.bookingStorageKey,
        []
      );

    return Array.isArray(bookings)
      ? bookings
      : [];

  }


  function getLocalBookingByNumber(
    bookingNumber
  ) {

    const target =
      cleanText(
        bookingNumber,
        50
      );

    return getLocalBookings()
      .find(
        booking =>
          booking.bookingNumber === target
      ) || null;

  }


  /* =========================================================
   * 40. DELETE LOCAL BOOKING
   *
   * للاستخدام الإداري فقط، وليس زرًا عامًا.
   * ========================================================= */

  function removeLocalBooking(
    bookingNumber
  ) {

    const bookings =
      getLocalBookings();

    const filtered =
      bookings.filter(
        booking =>
          booking.bookingNumber !==
          bookingNumber
      );

    return writeJSON(
      PUBLIC_CONFIG.bookingStorageKey,
      filtered
    );

  }


  /* =========================================================
   * 41. EXPORT BOOKING DATA
   * ========================================================= */

  function exportLocalBookings() {

    const bookings =
      getLocalBookings();

    return JSON.stringify(
      bookings,
      null,
      2
    );

  }


  /* =========================================================
   * 42. AUTO-INIT
   * ========================================================= */

  let initialized = false;


  async function init() {

    if (initialized) {

      return {
        success: true,
        alreadyInitialized: true
      };

    }

    initialized = true;


    try {

      renderDepartments();

    } catch (error) {

      errorLog(
        'renderDepartments failed',
        error
      );

    }


    try {

      setupSearch();

    } catch (error) {

      errorLog(
        'setupSearch failed',
        error
      );

    }


    try {

      setupBookingForm();

    } catch (error) {

      errorLog(
        'setupBookingForm failed',
        error
      );

    }


    try {

      setupBookingUX();

    } catch (error) {

      errorLog(
        'setupBookingUX failed',
        error
      );

    }


    try {

      setupNativeValidationMessages();

    } catch (error) {

      errorLog(
        'setupNativeValidationMessages failed',
        error
      );

    }


    try {

      setupDateTimeRestrictions();

    } catch (error) {

      errorLog(
        'setupDateTimeRestrictions failed',
        error
      );

    }


    try {

      setupHealthAssistant();

    } catch (error) {

      errorLog(
        'setupHealthAssistant failed',
        error
      );

    }


    try {

      await setupVisitorCounter();

    } catch (error) {

      errorLog(
        'setupVisitorCounter failed',
        error
      );

    }


    try {

      setupSocialSharing();

    } catch (error) {

      errorLog(
        'setupSocialSharing failed',
        error
      );

    }


    try {

      setupCopyButtons();

    } catch (error) {

      errorLog(
        'setupCopyButtons failed',
        error
      );

    }


    try {

      setupSmoothScroll();

    } catch (error) {

      errorLog(
        'setupSmoothScroll failed',
        error
      );

    }


    try {

      setupWelcomeModal();

    } catch (error) {

      errorLog(
        'setupWelcomeModal failed',
        error
      );

    }


    try {

      setupQuickActions();

    } catch (error) {

      errorLog(
        'setupQuickActions failed',
        error
      );

    }


    try {

      setupLegacyBookingButtons();

    } catch (error) {

      errorLog(
        'setupLegacyBookingButtons failed',
        error
      );

    }


    try {

      setupBookingSuccessReset();

    } catch (error) {

      errorLog(
        'setupBookingSuccessReset failed',
        error
      );

    }


    try {

      secureExternalLinks();

    } catch (error) {

      errorLog(
        'secureExternalLinks failed',
        error
      );

    }


    debugLog(
      `MediPrescribe Public v${PUBLIC_CONFIG.version} initialized`
    );


    return {

      success: true,

      version:
        PUBLIC_CONFIG.version

    };

  }


  /* =========================================================
   * 43. PUBLIC API
   * ========================================================= */

  const API = {

    version:
      PUBLIC_CONFIG.version,

    config:
      PUBLIC_CONFIG,

    departments:
      DEPARTMENTS,

    init,

    renderDepartments,

    setupSearch,

    setupBookingForm,

    processBooking,

    validateBooking,

    createBookingRecord,

    buildWhatsAppMessage,

    buildWhatsAppURL,

    openWhatsApp,

    getLocalBookings,

    getLocalBookingByNumber,

    removeLocalBooking,

    exportLocalBookings,

    sharePage,

    copyText,

    healthAssistantReply,

    showToast,

    normalizePhone,

    normalizeArabic,

    normalizeDigits,

    escapeHTML,

    cleanText

  };


  /* =========================================================
   * 44. GLOBAL EXPORT
   * ========================================================= */

  window.MediPrescribePublic =
    API;

  /*
   * الحفاظ على أسماء قديمة محتملة.
   */
  window.PUBLIC_CONFIG =
    PUBLIC_CONFIG;

  window.DEPARTMENTS =
    DEPARTMENTS;


  /* =========================================================
   * 45. INITIALIZE
   * ========================================================= */

  if (
    document.readyState === 'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      () => {
        init();
      },
      {
        once: true
      }
    );

  } else {

    init();

  }


})();
