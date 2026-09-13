/* ==========================================================
   MediPrescribe Pro — public.js
   منطق الصفحة العامة (للمرضى والزوار)
   الإصدار: 1.0
   ----------------------------------------------------------
   المكونات:
   1. بيانات الأقسام الطبية
   2. عرض الأقسام
   3. شريط البحث الرئيسي
   4. نموذج حجز المواعيد
   5. الشات الذكي (AI Chat)
   6. عدّاد الزوار
   7. أزرار المشاركة الاجتماعية
   8. Toast notifications
   9. Smooth scroll
   10. Modal ترحيبي
   11. أدوات مساعدة عامة
========================================================== */


/* ==========================================================
   1. بيانات الأقسام الطبية
   ========================================================== */
const DEPARTMENTS = [
  {
    id: 1,
    title: 'الباطنية العامة',
    icon: '🩺',
    img: 'images/internal.jpg',
    tags: ['سكري', 'ضغط', 'غدة درقية'],
    desc: 'تشخيص وعلاج الأمراض المزمنة والمتابعة الدورية',
    likes: 128,
    rating: 5
  },
  {
    id: 2,
    title: 'أمراض القلب',
    icon: '❤️',
    img: 'images/cardio.jpg',
    tags: ['تخطيط القلب', 'قسطرة', 'ضغط الدم'],
    desc: 'رعاية قلبية شاملة مع أحدث التقنيات التشخيصية',
    likes: 214,
    rating: 5
  },
  {
    id: 3,
    title: 'طب الأطفال',
    icon: '👶',
    img: 'images/pediatrics.jpg',
    tags: ['تطعيمات', 'نمو', 'حديثي الولادة'],
    desc: 'رعاية صحية متكاملة للأطفال من الولادة حتى المراهقة',
    likes: 189,
    rating: 5
  },
  {
    id: 4,
    title: 'الجلدية',
    icon: '✨',
    img: 'images/derma.jpg',
    tags: ['حبوب', 'حساسية', 'ليزر'],
    desc: 'علاج مشاكل الجلد والشعر والأظافر بأحدث الطرق',
    likes: 156,
    rating: 5
  },
  {
    id: 5,
    title: 'العيون',
    icon: '👁️',
    img: 'images/eyes.jpg',
    tags: ['فحص نظر', 'ليزك', 'جلوكوما'],
    desc: 'فحوصات وتصحيح النظر وجراحات العيون الدقيقة',
    likes: 142,
    rating: 5
  },
  {
    id: 6,
    title: 'العظام',
    icon: '🦴',
    img: 'images/ortho.jpg',
    tags: ['كسور', 'مفاصل', 'علاج طبيعي'],
    desc: 'تشخيص وعلاج إصابات العظام والمفاصل والعمود الفقري',
    likes: 167,
    rating: 5
  }
];


/* ==========================================================
   2. عرض الأقسام الطبية
   ========================================================== */
function renderDepartments() {
  const grid = document.getElementById('departments-grid');
  if (!grid) return;

  grid.innerHTML = DEPARTMENTS.map(d => `
    <article class="dept-card" data-id="${d.id}">
      <img
        src="${d.img}"
        alt="${d.title}"
        loading="lazy"
        onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 200%22><rect fill=%22%23e0f2f1%22 width=%22400%22 height=%22200%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 font-size=%2248%22>${encodeURIComponent(d.icon)}</text></svg>'"
      >
      <div class="dept-card-body">
        <h4>${d.icon} ${d.title}</h4>
        <p style="font-size:.85rem;color:var(--text-light);margin-bottom:12px;">${d.desc}</p>
        <div class="card-links">
          ${d.tags.map(t => `<a href="#" data-tag="${t}">${t}</a>`).join('')}
        </div>
        <a href="#" class="read-more" data-dept="${d.id}">
          اقرأ المزيد ←
        </a>
        <div class="interaction-bar">
          <span class="likes" data-id="${d.id}" title="إعجاب">
            ❤️ <span class="like-count">${d.likes}</span>
          </span>
          <span class="rating" title="التقييم">
            ${'⭐'.repeat(d.rating)}
          </span>
        </div>
      </div>
    </article>
  `).join('');

  // ربط أحداث التفاعل
  bindDepartmentEvents();
}

function bindDepartmentEvents() {
  // زر الإعجاب
  document.querySelectorAll('.dept-card .likes').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const countEl = el.querySelector('.like-count');
      const current = parseInt(countEl.textContent, 10);
      const alreadyLiked = el.dataset.liked === '1';

      if (alreadyLiked) {
        countEl.textContent = current - 1;
        el.dataset.liked = '0';
        el.style.opacity = '0.7';
      } else {
        countEl.textContent = current + 1;
        el.dataset.liked = '1';
        el.style.opacity = '1';
        showToast('❤️ شكراً لإعجابك!', 'success', 1500);
      }
    });
  });

  // روابط المزيد
  document.querySelectorAll('.read-more').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const id = parseInt(el.dataset.dept, 10);
      const dept = DEPARTMENTS.find(d => d.id === id);
      if (dept) {
        showToast(`📖 صفحة "${dept.title}" قادمة قريباً`, 'info');
      }
    });
  });

  // وسوم الأقسام
  document.querySelectorAll('.card-links a').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const tag = el.dataset.tag;
      if (tag) {
        showToast(`🏷️ البحث عن "${tag}" قادم قريباً`, 'info', 1500);
      }
    });
  });
}


/* ==========================================================
   3. شريط البحث الرئيسي (Hero)
   ========================================================== */
function initHeroSearch() {
  const input = document.getElementById('hero-search');
  const btn = document.getElementById('hero-search-btn');

  if (!input) return;

  const doSearch = () => {
    const query = input.value.trim();
    if (!query) {
      showToast('⚠️ يرجى إدخال نص للبحث', 'warning');
      return;
    }

    // بحث في الأقسام
    const results = DEPARTMENTS.filter(d =>
      d.title.includes(query) ||
      d.tags.some(t => t.includes(query)) ||
      d.desc.includes(query)
    );

    if (results.length) {
      showToast(`✅ وُجد ${results.length} قسم — التمرير إليها`, 'success');
      // تمرير إلى الأقسام
      document.getElementById('departments')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

      // إبراز القسم الأول
      setTimeout(() => {
        const firstCard = document.querySelector(
          `.dept-card[data-id="${results[0].id}"]`
        );
        if (firstCard) {
          firstCard.style.transition = 'box-shadow .4s';
          firstCard.style.boxShadow = '0 0 0 4px var(--accent-color)';
          setTimeout(() => {
            firstCard.style.boxShadow = '';
          }, 2000);
        }
      }, 600);
    } else {
      showToast('🔍 لا توجد نتائج مطابقة', 'info');
    }
  };

  btn?.addEventListener('click', doSearch);

  input.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });
}


/* ==========================================================
   4. نموذج حجز المواعيد
   ========================================================== */
function initBookingForm() {
  const form = document.getElementById('booking-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const [nameInput, phoneInput, deptSelect, dateInput, timeInput] =
      form.querySelectorAll('input, select');

    // التحقق من صحة المدخلات
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const dept = deptSelect.value;
    const date = dateInput.value;
    const time = timeInput.value;

    if (!name || !phone || !dept || !date || !time) {
      showToast('⚠️ يرجى إكمال جميع الحقول', 'warning');
      return;
    }

    // التحقق من رقم الهاتف (بسيط)
    if (!/^[\d+\-\s]{7,15}$/.test(phone)) {
      showToast('⚠️ رقم الهاتف غير صحيح', 'warning');
      return;
    }

    // التحقق من التاريخ (يجب أن يكون مستقبلياً)
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      showToast('⚠️ يرجى اختيار تاريخ مستقبلي', 'warning');
      return;
    }

    // محاكاة إرسال الطلب
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ جارٍ الإرسال...';

    try {
      // محاكاة تأخير الشبكة (استبدل بـ fetch حقيقي لاحقاً)
      await new Promise(resolve => setTimeout(resolve, 800));

      // حفظ محلياً (اختياري — يمكن إرسالها لخادم)
      const bookings = JSON.parse(
        localStorage.getItem('mp_bookings') || '[]'
      );
      bookings.push({
        name,
        phone,
        department: dept,
        date,
        time,
        createdAt: Date.now()
      });
      localStorage.setItem('mp_bookings', JSON.stringify(bookings));

      showToast(
        `✅ تم استلام حجزك — ${dept} في ${date} الساعة ${time}`,
        'success',
        5000
      );

      form.reset();

      // اختياري: إظهار تأكيد
      console.log('📅 حجز جديد:', { name, phone, dept, date, time });
    } catch (err) {
      console.error('booking error:', err);
      showToast('❌ فشل إرسال الحجز — حاول مرة أخرى', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });

  // ضبط الحد الأدنى للتاريخ (اليوم)
  const dateInput = form.querySelector('input[type="date"]');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
  }
}


/* ==========================================================
   5. الشات الذكي (AI Chat)
   ========================================================== */
const AI_RESPONSES = {
  'سكري': 'للتحكم بالسكري: راقب السكر يومياً، اتبع نظاماً غذائياً متوازناً قليل النشويات، ومارس الرياضة 30 دقيقة يومياً. إذا تجاوزت القراءة 250 ملغ/دل راجع طبيبك فوراً.',
  'ضغط': 'لضغط الدم المرتفع: قلل الملح إلى أقل من 5غ يومياً، تجنب التوتر والنوم الكافي، وتناول الأدوية بانتظام. القياس المثالي أقل من 130/80.',
  'صداع': 'الصداع قد يكون بسبب الإجهاد أو قلة النوم أو الجفاف. اشرب ماءً كافياً، واسترح. إذا استمر أكثر من 3 أيام أو كان شديداً مفاجئاً، راجع الطبيب.',
  'حرارة': 'الحرارة إذا تجاوزت 38.5° استخدم خافض حرارة (باراسيتامول 1غ كل 6-8 ساعات). أكثر من السوائل. إذا استمرت أكثر من 3 أيام راجع الطبيب.',
  'كحة': 'للكحة: عسل دافئ مع ليمون (لمن فوق سنة)، شرب سوائل دافئة، تجنب المهيجات. إذا استمرت أكثر من أسبوعين مع بلغم دموي، راجع فوراً.',
  'إسهال': 'للإسهال: اشرب محلول ORS بعد كل مرة. تجنب مضادات الإسهال مع الحمى أو الدم. إذا استمر أكثر من 3 أيام أو ظهر دم راجع الطبيب.',
  'ألم': 'للألم البسيط: باراسيتامول 1غ كل 6-8 ساعات أو إيبوبروفين 400ملغ كل 8 ساعات مع الطعام. تجنب المسكنات القوية بدون وصفة.',
  'سعال': 'للسعال: شرب ماء دافئ مع عسل، الترطيب، تجنب التدخين. إذا استمر أكثر من أسبوعين أو ظهر ضيق نفس، راجع الطبيب.',
  'قلب': 'لصحة القلب: رياضة هوائية 150 دقيقة أسبوعياً، نظام غذائي متوسطي، تجنب التدخين، وقياس الضغط والكوليسترول سنوياً.',
  'وزن': 'للتخسيس الصحي: عجز 500 سعرة حرارية يومياً، بروتين كافٍ، تمارين مقاومة، ونوم 7-8 ساعات. تجنب الحميات القاسية.',
  'حامل': 'للحوامل: حمض فوليك 400 مكغ يومياً، متابعة منتظمة مع طبيب النساء، تجنب الأدوية بلا استشارة، وأخذ لقاح التيتانوس حسب البرنامج.',
  'أطفال': 'لصحة الأطفال: التزام بجدول التطعيمات، رضاعة طبيعية حتى 6 أشهر، متابعة النمو الشهري، وإعطاء فيتامين D يومياً.',
  'default': 'شكراً لسؤالك. للحصول على استشارة طبية دقيقة، يُرجى حجز موعد مع أحد أطبائنا عبر النموذج أعلاه أو الاتصال بالطوارئ 997.'
};

function initAIChat() {
  const chat = document.getElementById('ai-chat');
  const body = document.getElementById('chat-body');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  if (!chat || !body || !input || !sendBtn) return;

  // رسالة ترحيبية أولى
  appendAIMessage('مرحباً بك! 👋 أنا المساعد الطبي الذكي. اسألني عن أي عرض صحي (سكري، ضغط، صداع، حرارة، إسهال...) وسأقدم لك نصائح أولية.');

  function appendUserMessage(text) {
    const el = document.createElement('div');
    el.className = 'user-msg';
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function appendAIMessage(text) {
    const el = document.createElement('div');
    el.className = 'ai-msg';
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function appendTypingIndicator() {
    const el = document.createElement('div');
    el.className = 'ai-msg';
    el.id = 'typing-indicator';
    el.innerHTML = '<span style="opacity:.6">يكتب</span> <span class="dots">...</span>';
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function removeTypingIndicator() {
    document.getElementById('typing-indicator')?.remove();
  }

  function getAIResponse(text) {
    const lower = text.toLowerCase();
    // البحث عن كلمة مفتاحية
    for (const key of Object.keys(AI_RESPONSES)) {
      if (key !== 'default' && text.includes(key)) {
        return AI_RESPONSES[key];
      }
    }
    return AI_RESPONSES.default;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    appendUserMessage(text);
    input.value = '';
    sendBtn.disabled = true;

    appendTypingIndicator();

    // محاكاة تأخير AI
    await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));

    removeTypingIndicator();

    const response = getAIResponse(text);
    appendAIMessage(response);

    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  // تبديل حالة الشات (فتح/إغلاق)
  const header = chat.querySelector('.chat-header');
  header?.addEventListener('click', e => {
    // لا تُغلق عند الضغط على الأزرار داخل الهيدر
    if (e.target.tagName === 'BUTTON') return;
    chat.classList.toggle('collapsed');
  });
}


/* ==========================================================
   6. عدّاد الزوار
   ========================================================== */
function initVisitorCounter() {
  const el = document.getElementById('visitor-count');
  if (!el) return;

  const KEY = 'mp_visitors';
  const SESSION_KEY = 'mp_visited_session';

  let count = parseInt(localStorage.getItem(KEY) || '1240', 10);

  // زد فقط مرة واحدة لكل جلسة
  if (!sessionStorage.getItem(SESSION_KEY)) {
    count += 1;
    localStorage.setItem(KEY, String(count));
    sessionStorage.setItem(SESSION_KEY, '1');
  }

  // أنيميشن العدّ
  let current = 0;
  const step = Math.max(1, Math.floor(count / 30));
  const timer = setInterval(() => {
    current += step;
    if (current >= count) {
      current = count;
      clearInterval(timer);
    }
    el.textContent = current.toLocaleString('ar-EG');
  }, 30);
}


/* ==========================================================
   7. أزرار المشاركة الاجتماعية
   ========================================================== */
function initSocialShare() {
  const shareData = {
    title: 'المركز الطبي الذكي',
    text: 'رعاية صحية ذكية على بُعد نقرة — احجز موعدك الآن!',
    url: window.location.href
  };

  const shareLinks = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(shareData.text + ' ' + shareData.url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareData.text)}&url=${encodeURIComponent(shareData.url)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(shareData.url)}&text=${encodeURIComponent(shareData.text)}`
  };

  Object.entries(shareLinks).forEach(([network, url]) => {
    const btn = document.querySelector(`.share-btn.${network}`);
    if (btn) {
      btn.href = url;
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
      btn.addEventListener('click', () => {
        showToast(`📤 جارٍ المشاركة على ${network}...`, 'info', 1500);
      });
    }
  });

  // زر مشاركة عام (Web Share API إن كان مدعوماً)
  const nativeShareBtn = document.getElementById('native-share-btn');
  if (nativeShareBtn && navigator.share) {
    nativeShareBtn.addEventListener('click', async () => {
      try {
        await navigator.share(shareData);
        showToast('✅ تمت المشاركة', 'success');
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('share error:', err);
        }
      }
    });
  }
}


/* ==========================================================
   8. Toast Notifications
   ========================================================== */
function showToast(message, type = 'info', duration = 3000) {
  const box = document.getElementById('toast-box');
  if (!box) {
    console.log(`[${type}] ${message}`);
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  box.appendChild(toast);

  // إزالة تلقائية
  setTimeout(() => {
    toast.style.transition = 'opacity .3s, transform .3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

window.showToast = showToast;


/* ==========================================================
   9. Smooth Scroll
   ========================================================== */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (href === '#' || href === '') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const headerOffset = 80;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });

        // تحديث الـ URL بدون إعادة تحميل
        history.pushState(null, '', href);
      }
    });
  });
}


/* ==========================================================
   10. Modal ترحيبي (يظهر مرة واحدة)
   ========================================================== */
function initWelcomeModal() {
  const modal = document.getElementById('welcome-modal');
  if (!modal) return;

  const KEY = 'mp_welcome_shown';

  // أظهر فقط مرة واحدة كل 24 ساعة
  const lastShown = parseInt(localStorage.getItem(KEY) || '0', 10);
  const dayInMs = 24 * 60 * 60 * 1000;

  if (Date.now() - lastShown > dayInMs) {
    setTimeout(() => {
      modal.classList.remove('hidden');
      localStorage.setItem(KEY, String(Date.now()));
    }, 1500);
  }

  // إغلاق
  modal.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  });

  // إغلاق عند النقر خارج المحتوى
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  // ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    }
  });
}


/* ==========================================================
   11. حجز سريع من داخل Modal
   ========================================================== */
function initQuickActions() {
  // زر "احجز الآن" في الـ Modal
  const quickBookBtn = document.getElementById('quick-book-btn');
  quickBookBtn?.addEventListener('click', () => {
    document.getElementById('welcome-modal')?.classList.add('hidden');
    document.getElementById('booking')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
    setTimeout(() => {
      document.querySelector('#booking-form input')?.focus();
    }, 800);
  });

  // زر الاتصال الطارئ
  const emergencyBtn = document.getElementById('emergency-btn');
  emergencyBtn?.addEventListener('click', () => {
    showToast('📞 جارٍ الاتصال بالطوارئ 997...', 'warning', 3000);
    // location.href = 'tel:997';  // فعّلها لتفعيل الاتصال الحقيقي
  });
}


/* ==========================================================
   12. أدوات مساعدة عامة
   ========================================================== */

// كشف الجوال
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
    .test(navigator.userAgent);
}

// كشف الوضع الليلي للنظام
function prefersDarkMode() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

// تنبيه في Console عند التحميل
function logInfo() {
  console.log(
    '%c🏥 MediPrescribe Pro — الصفحة العامة',
    'background:#00796b;color:#fff;padding:6px 12px;border-radius:6px;font-weight:bold;'
  );
  console.log(`📱 جوال: ${isMobile() ? 'نعم' : 'لا'}`);
  console.log(`🌙 الوضع الليلي: ${prefersDarkMode() ? 'مفعّل' : 'معطّل'}`);
}


/* ==========================================================
   13. التشغيل التلقائي عند تحميل الصفحة
   ========================================================== */
document.addEventListener('DOMContentLoaded', () => {
  logInfo();

  // تهيئة المكونات
  renderDepartments();
  initHeroSearch();
  initBookingForm();
  initAIChat();
  initVisitorCounter();
  initSocialShare();
  initSmoothScroll();
  initWelcomeModal();
  initQuickActions();

  console.log('✅ public.js — تم تهيئة كل المكونات');
});