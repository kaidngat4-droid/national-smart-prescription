/* ==========================================================
   MediPrescribe — bluetooth-vitals.js v2.0
   قراءة العلامات الحيوية عبر Web Bluetooth API
   ----------------------------------------------------------
   يدعم:
   - أجهزة قياس الضغط Blood Pressure Monitor (0x1810)
   - مقاييس الحرارة Health Thermometer (0x1809)
   - مقاييس الأكسجين Pulse Oximeter (0x1822)
   - موازين الوزن Weight Scale (0x181D)
   - مقاييس السكر Glucose Meter (0x1808)
   - مراقبة نبض القلب Heart Rate (0x180D)
   ----------------------------------------------------------
   ⚠️ متطلبات:
   - HTTPS (أو localhost)
   - Chrome/Edge 56+ / Android WebView
   - يجب استدعاء الدوال من تفاعل مستخدم (زر/نقرة)
     وإلا سيرفض المتصفح الطلب (SecurityError)
   ----------------------------------------------------------
   v2.0:
   [FIX] إكمال readWeight + تحويل lb→kg الدقيق + BMI/الطول
   [FIX] فك ترميز PLX عبر parseSFLOAT (كان getUint16 خاطئاً)
   [FIX] تنظيف Listeners والمؤقتات — لا تسريب ذاكرة
   [FIX] رفض الوعد فوراً عند انقطاع BLE أثناء الانتظار
   [NEW] فحص نطاقات طبية + quality flag لكل قراءة
   [NEW] readGlucose + readHeartRate + readMeasurement الموحّد
   [NEW] أحداث vitals-reading / vitals-error + خطّاف MPAudit
========================================================== */

const VitalsReader = (() => {
  'use strict';

  /* ═══════════════ 1. الثوابت — خدمات SIG القياسية ═══════════════ */
  const SERVICES = {
    BLOOD_PRESSURE:      0x1810,
    HEALTH_THERMOMETER:  0x1809,
    PULSE_OXIMETER:      0x1822,
    WEIGHT_SCALE:        0x181D,
    GLUCOSE:             0x1808,
    HEART_RATE:          0x180D
  };

  const CHARACTERISTICS = {
    BP_MEASUREMENT:           0x2A35,
    TEMPERATURE_MEASUREMENT:  0x2A1C,
    PLX_SPOT_CHECK:           0x2A5E,
    PLX_CONTINUOUS:           0x2A5F,
    WEIGHT_MEASUREMENT:       0x2A9D,
    GLUCOSE_MEASUREMENT:      0x2A18,
    HEART_RATE_MEASUREMENT:   0x2A37
  };

  /* خريطة الجهاز → الخدمة والخصائص البديلة وجهاز التحليل */
  const DEVICE_PROFILES = {
    BLOOD_PRESSURE: {
      service: SERVICES.BLOOD_PRESSURE,
      characteristics: [CHARACTERISTICS.BP_MEASUREMENT],
      parser: parseBloodPressure
    },
    TEMPERATURE: {
      service: SERVICES.HEALTH_THERMOMETER,
      characteristics: [CHARACTERISTICS.TEMPERATURE_MEASUREMENT],
      parser: parseTemperature
    },
    SPO2: {
      service: SERVICES.PULSE_OXIMETER,
      characteristics: [CHARACTERISTICS.PLX_SPOT_CHECK, CHARACTERISTICS.PLX_CONTINUOUS],
      parser: parsePulseOximeter
    },
    WEIGHT: {
      service: SERVICES.WEIGHT_SCALE,
      characteristics: [CHARACTERISTICS.WEIGHT_MEASUREMENT],
      parser: parseWeight
    },
    GLUCOSE: {
      service: SERVICES.GLUCOSE,
      characteristics: [CHARACTERISTICS.GLUCOSE_MEASUREMENT],
      parser: parseGlucose
    },
    HEART_RATE: {
      service: SERVICES.HEART_RATE,
      characteristics: [CHARACTERISTICS.HEART_RATE_MEASUREMENT],
      parser: parseHeartRate
    }
  };

  /* النطاقات الطبية المقبولة — أي قراءة خارجها تُعلَّم suspect */
  const VALID_RANGES = {
    systolic:  [20, 300],
    diastolic: [10, 200],
    mean:      [15, 250],
    pulse:     [20, 250],
    temperature: [25, 45],
    spo2:      [50, 100],
    weight:    [2, 500],
    glucose_mmol: [0.5, 60],
    heartRate: [20, 250]
  };

  const TIMEOUT_MS = 30000;

  let activeDevice = null;
  let activeServer = null;

  /* ═══════════════ 2. أدوات مساعدة ═══════════════ */
  const round = (n, d = 1) => Number(Number(n).toFixed(d));

  function inRange(value, [min, max]) {
    return Number.isFinite(value) && value >= min && value <= max;
  }

  function qualityOf(value, range) {
    return inRange(value, range) ? 'ok' : 'suspect';
  }

  /* ─── فك ترميز SFLOAT (IEEE 11073-20601 §7) ─── */
  function parseSFLOAT(dataView, offset) {
    const raw = dataView.getUint16(offset, true);

    /* القيم الخاصة: NaN / NRes / ±INF */
    if (raw === 0x07FF || raw === 0x0800) return NaN;   // NaN / NRes
    if (raw === 0x07FE) return Infinity;                 // +INFINITY
    if (raw === 0x0802) return -Infinity;                // -INFINITY

    const mantissa   = raw & 0x0FFF;           // 12 بت
    const exponent   = raw >> 12;              // 4 بت
    const signedExp  = exponent >= 8 ? exponent - 16 : exponent;   // تكملة للثنائي
    const signedMant = mantissa >= 0x0800 ? mantissa - 0x1000 : mantissa;

    return signedMant * Math.pow(10, signedExp);
  }

  /* ─── فك ترميز FLOAT (IEEE 11073) 8بت أس + 24بت قيمة ─── */
  function parseFLOAT(dataView, offset) {
    const raw = dataView.getUint32(offset, true);
    if (raw === 0x007FFFFF || raw === 0x00800000) return NaN;
    if (raw === 0x007FFFFE) return Infinity;
    if (raw === 0x00800002) return -Infinity;

    const mantissa   = raw & 0x00FFFFFF;
    let   exponent   = (raw >> 24) & 0xFF;
    if (exponent >= 128) exponent -= 256;                // تكملة للثنائي
    const signedMant = mantissa >= 0x00800000 ? mantissa - 0x01000000 : mantissa;

    return signedMant * Math.pow(10, exponent);
  }

  /* ─── فك ترميز حقل الوقت (7 بايتات) ─── */
  function parseBaseTime(dataView, offset) {
    try {
      const year    = dataView.getUint16(offset, true);
      const month   = dataView.getUint8(offset + 2);
      const day     = dataView.getUint8(offset + 3);
      const hours   = dataView.getUint8(offset + 4);
      const minutes = dataView.getUint8(offset + 5);
      const seconds = dataView.getUint8(offset + 6);
      const d = new Date(year, month - 1, day, hours, minutes, seconds);
      return isNaN(d) ? null : d;
    } catch (_) {
      return null;
    }
  }

  function normalizeError(err) {
    if (!err) return new Error('خطأ غير معروف');
    if (typeof err === 'string') return new Error(err);
    if (err.message && err.message.startsWith('⚠️')) return err;
    switch (err.name) {
      case 'NotFoundError':        return new Error('⚠️ لم يتم اختيار أي جهاز');
      case 'SecurityError':        return new Error('⚠️ يتطلب Web Bluetooth بروتوكول HTTPS');
      case 'NotSupportedError':    return new Error('⚠️ الجهاز لا يدعم هذه الخدمة');
      case 'NetworkError':         return new Error('⚠️ انقطع الاتصال بالجهاز');
      case 'InvalidStateError':    return new Error('⚠️ الجهاز غير متصل');
      case 'AbortError':           return new Error('⚠️ تم إلغاء العملية');
      default:                     return new Error(err.message || '⚠️ خطأ في الاتصال بالجهاز');
    }
  }

  /* ─── تسجيل في سجل التدقيق إن توفر MPAudit ─── */
  function audit(action, detail) {
    try {
      if (window.MPAudit && typeof window.MPAudit.log === 'function') {
        window.MPAudit.log(action, detail);
      }
    } catch (_) { /* التدقيق اختياري */ }
  }

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /* ═══════════════ 3. الاتصال الأساسي ═══════════════ */
  function isSupported() {
    return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  function isConnected() {
    return !!(activeDevice && activeDevice.gatt && activeDevice.gatt.connected);
  }

  function requestDevice(type) {
    return _requestDevice(type); // للتوافق مع v1.0
  }

  async function _requestDevice(type) {
    if (!isSupported()) {
      throw new Error('⚠️ المتصفح لا يدعم Web Bluetooth — استخدم Chrome أو Edge عبر HTTPS');
    }
    const profile = DEVICE_PROFILES[type];
    if (!profile) {
      throw new Error(`⚠️ نوع الجهاز غير مدعوم: ${type}`);
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [profile.service] }],
        optionalServices: Object.values(SERVICES)
      });
      activeDevice = device;
      device.addEventListener('gattserverdisconnected', onDisconnected);
      return device;
    } catch (err) {
      throw normalizeError(err);
    }
  }

  async function connect(device) {
    const target = device || activeDevice;
    if (!target || !target.gatt) throw new Error('⚠️ لا يوجد جهاز للاتصال به');
    try {
      activeServer = await target.gatt.connect();
      return activeServer;
    } catch (err) {
      throw normalizeError(err);
    }
  }

  function disconnect() {
    try {
      if (activeDevice && activeDevice.gatt && activeDevice.gatt.connected) {
        activeDevice.gatt.disconnect();
      }
    } catch (_) { /* تجاهل */ }
    activeServer = null;
    activeDevice = null;
  }

  function onDisconnected() {
    emit('vitals-disconnected', { timestamp: new Date() });
  }

  /* ═══════════════ 4. قارئ القياس الموحّد ═══════════════
     يدير: الاتصال + تجربة الخصائص البديلة + المهلة +
     تنظيف الـ listeners + الأحداث + التدقيق + الأخطاء */
  async function readMeasurement(type, options = {}) {
    const profile = DEVICE_PROFILES[type];
    if (!profile) throw new Error(`⚠️ نوع الجهاز غير مدعوم: ${type}`);

    const timeoutMs = options.timeout || TIMEOUT_MS;
    let device = null;

    try {
      device = await _requestDevice(type);
      const server = await connect(device);
      const service = await server.getPrimaryService(profile.service);

      /* تجربة الخصائص بالترتيب — بعض الأجهزة تدعم واحدة فقط */
      let characteristic = null;
      for (const uuid of profile.characteristics) {
        try {
          characteristic = await service.getCharacteristic(uuid);
          break;
        } catch (_) { /* جرّب التالية */ }
      }
      if (!characteristic) {
        throw new Error('⚠️ خصائص القياس غير مدعومة على هذا الجهاز');
      }

      /* بعض الأجهزة تخزن آخر قياس وتدعم readValue */
      if (options.useCachedRead && characteristic.properties.read) {
        try {
          const cached = await characteristic.readValue();
          const r = profile.parser(cached, device);
          if (r && r.quality === 'ok') {
            _finalize(type, r);
            return r;
          }
        } catch (_) { /* ننتظر إشعاراً حياً */ }
      }

      if (!characteristic.properties.notify) {
        throw new Error('⚠️ الجهاز لا يدعم الإشعارات المباشرة');
      }

      /* الانتظار على أول إشعار حي */
      return await new Promise((resolve, reject) => {
        let settled = false;

        const finish = (err, result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          characteristic.removeEventListener('characteristicvaluechanged', handler);
          disconnect();
          if (err) { emit('vitals-error', { type, error: err.message }); reject(err); }
          else     { _finalize(type, result); resolve(result); }
        };

        const handler = (event) => {
          try {
            const reading = profile.parser(event.target.value, device);
            if (!reading) throw new Error('⚠️ تعذّر فك ترميز القراءة');
            finish(null, reading);
          } catch (e) {
            finish(normalizeError(e));
          }
        };

        const onDrop = () => finish(new Error('⚠️ انقطع الاتصال بالجهاز أثناء القراءة'));

        const timer = setTimeout(
          () => finish(new Error('⚠️ انتهت مهلة القراءة (30 ثانية) — أعد المحاولة')),
          timeoutMs
        );

        device.addEventListener('gattserverdisconnected', onDrop, { once: true });

        characteristic.addEventListener('characteristicvaluechanged', handler);
        characteristic.startNotifications().catch(e => finish(normalizeError(e)));
      });

    } catch (err) {
      disconnect();
      const e = normalizeError(err);
      emit('vitals-error', { type, error: e.message });
      throw e;
    }
  }

  function _finalize(type, reading) {
    reading.deviceType = type;
    reading.receivedAt = new Date();
    emit('vitals-reading', reading);
    audit('VITALS_READ', { type, reading });
    if (reading.quality === 'suspect') {
      console.warn('⚠️ قراءة خارج النطاق الطبيعي — تحقق يدوياً:', reading);
    }
  }

  /* ═══════════════ 5. محللات القراءات (Parsers) ═══════════════ */

  /* ─── ضغط الدم (0x2A35) ─── */
  function parseBloodPressure(dataView, device) {
    if (dataView.byteLength < 7) throw new Error('بيانات ضغط الدم ناقصة');

    const flags = dataView.getUint8(0);
    const unitKpa = (flags & 0x01) !== 0;
    let offset = 1;

    let sys = parseSFLOAT(dataView, offset);       offset += 2;
    let dia = parseSFLOAT(dataView, offset);       offset += 2;
    let mean = parseSFLOAT(dataView, offset);      offset += 2;

    if (unitKpa) {           /* kPa → mmHg */
      sys  = round(sys  * 7.50062, 0);
      dia  = round(dia  * 7.50062, 0);
      mean = round(mean * 7.50062, 0);
    } else {
      sys = round(sys, 0); dia = round(dia, 0); mean = round(mean, 0);
    }

    let timestamp = null;
    if ((flags & 0x02) !== 0 && dataView.byteLength >= offset + 7) {
      timestamp = parseBaseTime(dataView, offset);
      offset += 7;
    }

    let pulse = null;
    if ((flags & 0x04) !== 0 && dataView.byteLength >= offset + 2) {
      pulse = round(parseSFLOAT(dataView, offset), 0);
    }

    /* ترتيب التحقق: النبض أولاً لأنه يُستخدم في حكم الجودة */
    const qPulse = pulse === null ? 'ok' : qualityOf(pulse, VALID_RANGES.pulse);

    return {
      type: 'blood_pressure',
      systolic: sys,
      diastolic: dia,
      mean: mean,
      pulse: pulse,
      unit: 'mmHg',
      timestamp: timestamp || new Date(),
      quality: qualityOf(sys, VALID_RANGES.systolic) === 'ok' &&
               qualityOf(dia, VALID_RANGES.diastolic) === 'ok' &&
               qualityOf(mean, VALID_RANGES.mean) === 'ok' &&
               qPulse === 'ok' ? 'ok' : 'suspect',
      source: device ? (device.name || 'جهاز قياس الضغط') : 'جهاز قياس الضغط'
    };
  }

  /* ─── الحرارة (0x2A1C) — FLOAT بنظام IEEE 11073 ─── */
  function parseTemperature(dataView, device) {
    if (dataView.byteLength < 5) throw new Error('بيانات الحرارة ناقصة');

    const flags = dataView.getUint8(0);
    const fahrenheit = (flags & 0x01) !== 0;

    let value = parseFLOAT(dataView, 1);
    if (!Number.isFinite(value)) throw new Error('قراءة حرارة غير صالحة');

    let celsius = fahrenheit ? (value - 32) * 5 / 9 : value;
    celsius = round(celsius, 1);

    let timestamp = null;
    if ((flags & 0x02) !== 0 && dataView.byteLength >= 12) {
      timestamp = parseBaseTime(dataView, 5);
    }

    return {
      type: 'temperature',
      value: celsius,
      unit: '°C',
      timestamp: timestamp || new Date(),
      quality: qualityOf(celsius, VALID_RANGES.temperature) ? 'ok' : 'suspect',
      source: device ? (device.name || 'مقياس حرارة') : 'مقياس حرارة'
    };
  }

  /* ─── الأكسجين / النبض (0x2A5E Spot-check أو 0x2A5F Continuous)
         [FIX v2.0]: القيمتان SFLOAT وليسا Uint16 ─── */
  function parsePulseOximeter(dataView, device) {
    if (dataView.byteLength < 5) throw new Error('بيانات الأكسجين ناقصة');

    const flags = dataView.getUint8(0);
    const spo2  = round(parseSFLOAT(dataView, 1), 1);   /* SpO2 % */
    const pulse = round(parseSFLOAT(dataView, 3), 0);   /* نبض/دقيقة */

    if (!Number.isFinite(spo2) || !Number.isFinite(pulse)) {
      throw new Error('قراءة أكسجين غير صالحة');
    }

    /* في Continuous يوجد حقل Device & Sensor Status بعده — لا نحتاجه */
    let timestamp = null;
    if ((flags & 0x02) !== 0 && dataView.byteLength >= 14) {
      timestamp = parseBaseTime(dataView, 5);
    }

    return {
      type: 'spo2',
      spo2: spo2,
      pulse: pulse,
      unit: '%',
      timestamp: timestamp || new Date(),
      quality: qualityOf(spo2, VALID_RANGES.spo2) === 'ok' &&
               qualityOf(pulse, VALID_RANGES.pulse) === 'ok' ? 'ok' : 'suspect',
      source: device ? (device.name || 'مقياس أكسجين') : 'مقياس أكسجين'
    };
  }

  /* ─── الوزن (0x2A9D) — [مكتمل في v2.0] ───
     الدقة: 0.005 kg (أو 0.01 lb)
     flags: bit0 وحدة (0=kg,1=lb) | bit1 وقت | bit2 معرّف مستخدم | bit3 BMI+طول */
  function parseWeight(dataView, device) {
    if (dataView.byteLength < 3) throw new Error('بيانات الوزن ناقصة');

    const flags = dataView.getUint8(0);
    const isImperial = (flags & 0x01) !== 0;

    const rawWeight = parseSFLOAT(dataView, 1);           /* × 0.005 وحدة */
    if (!Number.isFinite(rawWeight)) throw new Error('قراءة وزن غير صالحة');

    let kg = rawWeight * 0.005;
    if (isImperial) {
      kg = kg * 0.45359237;   /* lb → kg (كان "weight * 0..." المقطوع) */
    }
    kg = round(kg, 1);

    /* حقول اختيارية بالترتيب حسب العلم */
    let offset = 3;
    if ((flags & 0x02) !== 0) offset += 7;   /* timestamp */
    if ((flags & 0x04) !== 0) offset += 1;   /* user id */

    let bmi = null, heightCm = null;
    if ((flags & 0x08) !== 0 && dataView.byteLength >= offset + 4) {
      bmi      = round(parseSFLOAT(dataView, offset) * 0.1, 1);
      heightCm = round(dataView.getUint16(offset + 2, true) * 0.001 * 100, 1); /* m → cm */
    }

    return {
      type: 'weight',
      weight: kg,
      unit: 'kg',
      bmi: bmi,
      heightCm: heightCm,
      timestamp: new Date(),
      quality: qualityOf(kg, VALID_RANGES.weight) ? 'ok' : 'suspect',
      source: device ? (device.name || 'ميزان ذكي') : 'ميزان ذكي'
    };
  }

  /* ─── السكر (0x2A18) — [جديد في v2.0]
     flags: bit0 وحدة التركيز (0=kg/L, 1=mol/L) | bit1 time offset | ... */
  function parseGlucose(dataView, device) {
    if (dataView.byteLength < 10) throw new Error('بيانات السكر ناقصة');

    const flags    = dataView.getUint8(0);
    const isMolL   = (flags & 0x01) !== 0;   /* 1 = mol/L ، 0 = kg/L */
    const seqNum   = dataView.getUint16(1, true);
    const baseTime = parseBaseTime(dataView, 3);
    let offset = 10;

    let timeOffsetMin = null;
    if ((flags & 0x02) !== 0 && dataView.byteLength >= offset + 2) {
      timeOffsetMin = dataView.getInt16(offset, true);
      offset += 2;
    }

    if (dataView.byteLength < offset + 2) throw new Error('تركيز السكر غير موجود');

    const rawConc = parseSFLOAT(dataView, offset);

    /* التحويل إلى mmol/L و mg/dL للعرض الموحّد */
    let mmolL, mgDl;
    if (isMolL) {
      /* الجهاز يُرسل mol/L — نحوّل إلى mmol/L */
      mmolL = rawConc * 1000;
      mgDl  = mmolL * 18.016;
    } else {
      /* kg/L → mg/dL مباشرة: kg/L × 100000 */
      mgDl  = rawConc * 100000;
      mmolL = mgDl / 18.016;
    }
    mmolL = round(mmolL, 1);
    mgDl  = round(mgDl, 0);

    return {
      type: 'glucose',
      glucose_mmol: mmolL,
      glucose_mgdl: mgDl,
      unit: 'mmol/L',
      sequence: seqNum,
      timeOffsetMin: timeOffsetMin,
      timestamp: baseTime || new Date(),
      quality: qualityOf(mmolL, VALID_RANGES.glucose_mmol) ? 'ok' : 'suspect',
      source: device ? (device.name || 'مقياس سكر') : 'مقياس سكر'
    };
  }

  /* ─── نبض القلب (0x2A37) — [جديد في v2.0]
     flags: bit0 تنسيق القيمة (0=uint8, 1=uint16) | bit1 contact detected |
            bit2 contact supported | bit3 energy expended | bit4 RR intervals */
  function parseHeartRate(dataView, device) {
    if (dataView.byteLength < 2) throw new Error('بيانات نبض القلب ناقصة');

    const flags    = dataView.getUint8(0);
    const uint16Fmt = (flags & 0x01) !== 0;

    let bpm, offset;
    if (uint16Fmt) {
      bpm = dataView.getUint16(1, true);
      offset = 3;
    } else {
      bpm = dataView.getUint8(1);
      offset = 2;
    }

    /* bit1: هل المستشعر ملامس للجسم؟ (false + مدعوم = قراءة غير موثوقة) */
    const contactSupported = (flags & 0x04) !== 0;
    const contactDetected  = (flags & 0x02) !== 0;

    let energyKJ = null;
    if ((flags & 0x08) !== 0 && dataView.byteLength >= offset + 2) {
      energyKJ = dataView.getUint16(offset, true);
      offset += 2;
    }

    let rrIntervals = null;
    if ((flags & 0x10) !== 0) {
      const count = Math.floor((dataView.byteLength - offset) / 2);
      rrIntervals = [];
      for (let i = 0; i < count; i++) {
        rrIntervals.push(dataView.getUint16(offset + i * 2, true)); /* 1/1024 ثانية */
      }
    }

    /* جودة: القراءة من جهاز أجهزة استشعار — نثق بها فقط إذا لامست الجسم */
    let quality = qualityOf(bpm, VALID_RANGES.heartRate);
    if (contactSupported && !contactDetected) quality = 'suspect';

    return {
      type: 'heart_rate',
      bpm: bpm,
      unit: 'bpm',
      contactDetected: contactSupported ? contactDetected : null,
      energyKJ: energyKJ,
      rrIntervals: rrIntervals,
      timestamp: new Date(),
      quality: quality,
      source: device ? (device.name || 'جهاز نبض') : 'جهاز نبض'
    };
  }

  /* ═══════════════ 6. الواجهة العامة — متوافقة مع v1.0 ═══════════════ */
  return {
    isSupported,
    isConnected,
    requestDevice,
    connect,
    disconnect,
    readMeasurement,

    /* أسماء v1.0 — حفاظاً على التوافق مع app.js */
    readBloodPressure:  () => readMeasurement('BLOOD_PRESSURE'),
    readTemperature:    () => readMeasurement('TEMPERATURE'),
    readPulseOximeter:  () => readMeasurement('SPO2'),
    readWeight:         () => readMeasurement('WEIGHT'),

    /* جديد */
    readGlucose:        () => readMeasurement('GLUCOSE'),
    readHeartRate:      () => readMeasurement('HEART_RATE'),

    /* ثوابط للواجهات */
    SERVICES,
    CHARACTERISTICS,
    DEVICE_TYPES: Object.keys(DEVICE_PROFILES)
  };
})();

/* تصدير عام لبيئات الوحدات */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VitalsReader;
}
