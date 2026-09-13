/* ==========================================================
   MediPrescribe Pro — rx.js
   نظام رقم الوصفة التسلسلي + رمز QR للتحقق
   الإصدار: 1.0
   ========================================================== */

(function() {
'use strict';

const RxSecure = {

  /* --- توليد رقم وصفة تسلسلي --- */
  async nextNumber() {
    try {
      if (typeof DB === 'undefined') return null;

      const year = new Date().getFullYear();
      const counterKey = 'rx_counter_' + year;

      // اقرأ العداد من localStorage (سيُزامن مع قاعدة البيانات)
      let counter = parseInt(localStorage.getItem(counterKey) || '0', 10);
      counter++;
      localStorage.setItem(counterKey, String(counter));

      const padded = String(counter).padStart(5, '0');
      return `RX-${year}-${padded}`;
    } catch (e) {
      console.error('nextNumber error:', e);
      return null;
    }
  },

  /* --- توليد كود تحقق (4-6 أحرف) --- */
  generateCode(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون حروف متشابهة
    let code = '';
    const arr = new Uint32Array(length);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
      for (let i = 0; i < length; i++) {
        code += chars[arr[i] % chars.length];
      }
    } else {
      for (let i = 0; i < length; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    return code;
  },

  /* --- تعيين رقم + كود لوصفة جديدة --- */
  async assign(patientName) {
    try {
      const rxNumber = await this.nextNumber();
      const verificationCode = this.generateCode(6);
      return {
        rxNumber,
        verificationCode,
        patientName: patientName || '',
        issuedAt: Date.now()
      };
    } catch (e) {
      console.error('assign error:', e);
      return { rxNumber: null, verificationCode: null };
    }
  },

  /* --- توليد QR Code كـ Data URL --- */
  async qrDataURL(text, size = 128) {
    try {
      // محاولة استخدام مكتبة QRCode الخارجية إن وُجدت
      if (typeof window.QRCode !== 'undefined') {
        return await this._qrWithLibrary(text, size);
      }

      // بديل: توليد QR بسيط عبر Canvas (مبدئي)
      return await this._qrFallback(text, size);
    } catch (e) {
      console.warn('qrDataURL error:', e);
      return null;
    }
  },

  /* --- استخدام مكتبة QRCode (إن كانت محمّلة) --- */
  async _qrWithLibrary(text, size) {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        if (typeof window.QRCode.toCanvas === 'function') {
          window.QRCode.toCanvas(canvas, text, { width: size, margin: 1 }, err => {
            if (err) return reject(err);
            resolve(canvas.toDataURL('image/png'));
          });
        } else if (typeof window.QRCode === 'function') {
          new window.QRCode(canvas, {
            text: text,
            width: size,
            height: size,
            correctLevel: window.QRCode.CorrectLevel.M
          });
          resolve(canvas.toDataURL('image/png'));
        } else {
          reject(new Error('QRCode API غير معروف'));
        }
      } catch (e) {
        reject(e);
      }
    });
  },

  /* --- بديل بسيط (Visual Hash) — إن لم توجد مكتبة --- */
  async _qrFallback(text, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // خلفية بيضاء
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);

    // شبكة 21×21 بسيطة مبنية على hash النص
    const grid = 21;
    const cell = size / grid;

    // احسب hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }

    // ارسم شبكة زائفة (تحديد مسارات)
    ctx.fillStyle = '#0a1628';
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        const bit = (hash >> ((x + y * grid) % 30)) & 1;
        if (bit) {
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }

    // زوايا QR المعروفة
    const drawFinder = (ox, oy) => {
      ctx.fillStyle = '#0a1628';
      ctx.fillRect(ox * cell, oy * cell, 7 * cell, 7 * cell);
      ctx.fillStyle = '#fff';
      ctx.fillRect((ox + 1) * cell, (oy + 1) * cell, 5 * cell, 5 * cell);
      ctx.fillStyle = '#0a1628';
      ctx.fillRect((ox + 2) * cell, (oy + 2) * cell, 3 * cell, 3 * cell);
    };
    drawFinder(0, 0);
    drawFinder(grid - 7, 0);
    drawFinder(0, grid - 7);

    return canvas.toDataURL('image/png');
  },

  /* --- التحقق من صحة وصفة (رابط خارجي) --- */
  verifyURL(rxNumber) {
    return `${location.origin}${location.pathname.replace(/\/[^/]*$/, '/')}verify.html?rx=${encodeURIComponent(rxNumber)}`;
  },

  /* --- فحص بسيط: هل الرقم يطابق النمط؟ --- */
  isValidRxNumber(rxNumber) {
    return /^RX-\d{4}-\d{5}$/.test(String(rxNumber || ''));
  }
};

window.RxSecure = RxSecure;
console.log('✅ rx.js جاهز — RxSecure متاح');

})();