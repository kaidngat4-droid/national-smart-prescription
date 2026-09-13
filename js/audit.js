/* ==========================================================
   MediPrescribe Pro — audit.js
   منطق صفحة سجل التدقيق (Audit Log)
   الإصدار: 1.0
   ----------------------------------------------------------
   المكونات:
   1. حماية admin-only
   2. أدوات مساعدة
   3. Toast
   4. تحميل السجلات
   5. الفلترة والبحث
   6. عرض الجدول
   7. عرض البطاقات (Grid)
   8. الإحصائيات
   9. تصدير CSV
   10. حذف السجلات القديمة
   11. تسجيل الخروج
   12. التشغيل التلقائي
========================================================== */

/* ==========================================================
   1. حماية الصفحة (Admin-only)
   ========================================================== */
const session = (typeof getCurrentUser === 'function')
  ? getCurrentUser()
  : JSON.parse(localStorage.getItem('mp_session') || 'null');

if (!session) {
  location.replace('login.html');
  throw new Error('No session');
}

const canViewAudit = session.role === 'admin';

if (!canViewAudit) {
  document.getElementById('permission-alert')?.classList.remove('hidden');
  document.querySelector('.stats-grid')?.classList.add('hidden');
  document.querySelector('.users-toolbar')?.classList.add('hidden');
  document.querySelector('.table-wrap')?.classList.add('hidden');
  document.querySelector('.users-grid')?.classList.add('hidden');
}

console.log('📊 سجل التدقيق — المستخدم:', session.fullName);

/* ==========================================================
   2. أدوات مساعدة
   ========================================================== */

// تصنيف الحدث حسب النوع
function getActionCategory(action) {
  if (!action) return 'other';
  const a = action.toLowerCase();

  if (a.includes('دخول') && a.includes('فاشلة')) return 'failed';
  if (a.includes('تسجيل دخول')) return 'login';
  if (a.includes('خروج')) return 'logout';
  if (a.includes('إنشاء وصفة') || a.includes('وصفة')) return 'prescription';
  if (a.includes('مستخدم') || a.includes('زرع')) return 'user';
  if (a.includes('حذف')) return 'delete';
  if (a.includes('تصدير')) return 'export';
  return 'other';
}

// لون وأيقونة كل نوع
function getActionBadge(action) {
  const cat = getActionCategory(action);
  const map = {
    login:        { icon: '🔐', label: 'دخول',        class: 'role-doctor' },
    logout:       { icon: '🚪', label: 'خروج',        class: 'status-inactive' },
    failed:       { icon: '❌', label: 'فاشلة',       class: 'role-admin' },
    prescription: { icon: '📝', label: 'وصفة',        class: 'role-pharmacist' },
    user:         { icon: '👥', label: 'مستخدم',      class: 'role-nurse' },
    delete:       { icon: '🗑️', label: 'حذف',        class: 'status-suspended' },
    export:       { icon: '📤', label: 'تصدير',       class: 'role-receptionist' },
    other:        { icon: '📌', label: 'أخرى',        class: 'status-active' }
  };
  const info = map[cat] || map.other;
  return `<span class="badge ${info.class}">${info.icon} ${info.label}</span>`;
}

// تنسيق التاريخ
function formatDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  } catch { return '—'; }
}

function formatTime(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString('ar-EG', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch { return '—'; }
}

function formatDateTime(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('ar-EG');
  } catch { return '—'; }
}

// حساب "منذ كم"
function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 60) return 'الآن';
  if (min < 60) return `منذ ${min} دقيقة`;
  if (hour < 24) return `منذ ${hour} ساعة`;
  if (day < 30) return `منذ ${day} يوم`;
  return '';
}

function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==========================================================
   3. Toast
   ========================================================== */
function showToast(message, type = 'info', duration = 3000) {
  const box = document.getElementById('toast-box');
  if (!box) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  box.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity .3s, transform .3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}
window.showToast = showToast;

/* ==========================================================
   4. الحالة العامة
   ========================================================== */
let allLogs = [];
let currentView = 'table';
let deleteMode = false;

/* ==========================================================
   5. تحميل السجلات
   ========================================================== */
async function loadLogs() {
  if (!canViewAudit) return;

  try {
    await initDB();
    const logs = await DB.all('audit');

    // ترتيب من الأحدث للأقدم
    allLogs = logs.sort((a, b) => (b.time || 0) - (a.time || 0));

    // تحديث قائمة المستخدمين في الفلتر
    populateUserFilter();

    // تحديث الإحصائيات
    updateStats();

    // عرض السجلات
    renderLogs();
  } catch (err) {
    console.error('loadLogs error:', err);
    showToast('❌ فشل تحميل سجل التدقيق', 'error');
  }
}

/* ==========================================================
   6. ملء فلتر المستخدمين
   ========================================================== */
function populateUserFilter() {
  const select = document.getElementById('filter-user');
  if (!select) return;

  // استخرج المستخدمين الفريدين
  const users = [...new Set(
    allLogs.map(l => l.by).filter(Boolean)
  )].sort();

  select.innerHTML = '<option value="">— كل المستخدمين —</option>' +
    users.map(u => `<option value="${escapeHTML(u)}">${escapeHTML(u)}</option>`).join('');
}

/* ==========================================================
   7. الفلترة
   ========================================================== */
function getFilteredLogs() {
  const q = (document.getElementById('audit-search')?.value || '').trim().toLowerCase();
  const actionFilter = document.getElementById('filter-action')?.value || '';
  const userFilter = document.getElementById('filter-user')?.value || '';
  const periodFilter = document.getElementById('filter-period')?.value || 'all';

  const now = Date.now();
  const periods = {
    today: now - (24 * 60 * 60 * 1000),
    week: now - (7 * 24 * 60 * 60 * 1000),
    month: now - (30 * 24 * 60 * 60 * 1000)
  };

  return allLogs.filter(log => {
    // فلترة الحالة
    if (actionFilter && getActionCategory(log.action) !== actionFilter) return false;

    // فلترة المستخدم
    if (userFilter && log.by !== userFilter) return false;

    // فلترة الفترة
    if (periodFilter !== 'all') {
      if (!log.time || log.time < periods[periodFilter]) return false;
    }

    // البحث النصي
    if (q) {
      const haystack = [log.action, log.detail, log.by]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

/* ==========================================================
   8. عرض الجدول
   ========================================================== */
function renderLogs() {
  const logs = getFilteredLogs();
  renderTable(logs);
  renderGrid(logs);
}

function renderTable(logs) {
  const tbody = document.getElementById('audit-tbody');
  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          📭 لا توجد سجلات مطابقة
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map((log, i) => `
    <tr>
      <td style="color:var(--text-muted);font-size:.8rem;">
        ${i + 1}
      </td>
      <td>
        ${getActionBadge(log.action)}
        <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px;">
          ${escapeHTML(log.action || '—')}
        </div>
      </td>
      <td style="font-size:.83rem;">
        ${escapeHTML(log.detail || '—')}
      </td>
      <td style="font-size:.83rem;color:var(--mp-gold-light);">
        ${escapeHTML(log.by || 'غير مسجل')}
      </td>
      <td style="font-size:.8rem;">
        ${formatDate(log.time)}
      </td>
      <td style="font-size:.8rem;">
        ${formatTime(log.time)}
        <br>
        <small style="color:var(--text-muted);font-size:.7rem;">
          ${timeAgo(log.time)}
        </small>
      </td>
    </tr>
  `).join('');
}

/* ==========================================================
   9. عرض البطاقات (Grid)
   ========================================================== */
function renderGrid(logs) {
  const grid = document.getElementById('audit-grid-view');
  if (!grid) return;

  if (!logs.length) {
    grid.innerHTML = `
      <div class="users-empty">
        <div class="icon">📭</div>
        <h4>لا توجد سجلات مطابقة</h4>
        <p>جرّب تعديل معايير البحث أو الفلترة</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = logs.map(log => {
    const cat = getActionCategory(log.action);
    const icon = getActionBadge(log.action).match(/>([^<]+)</)?.[1]?.trim().split(' ')[0] || '📌';

    return `
      <div class="user-card">
        <div class="user-card-header">
          <div class="user-avatar" style="background: ${getAvatarGradient(cat)};">
            ${icon}
          </div>
          <div class="user-info">
            <h4 title="${escapeHTML(log.action)}">${escapeHTML(log.action || '—')}</h4>
            <div class="username">${formatDateTime(log.time)}</div>
          </div>
        </div>
        <div class="user-card-body">
          <div class="user-meta-row">
            <span class="label">النوع</span>
            ${getActionBadge(log.action)}
          </div>
          <div class="user-meta-row">
            <span class="label">بواسطة</span>
            <span class="value" style="color:var(--mp-gold-light);">
              ${escapeHTML(log.by || 'غير مسجل')}
            </span>
          </div>
          ${log.detail ? `
            <div class="user-meta-row" style="flex-direction:column;align-items:flex-start;gap:4px;">
              <span class="label">التفاصيل</span>
              <span style="color:var(--text-inverse);font-size:.82rem;line-height:1.6;">
                ${escapeHTML(log.detail)}
              </span>
            </div>
          ` : ''}
          <div class="user-meta-row">
            <span class="label">منذ</span>
            <span class="value">${timeAgo(log.time) || '—'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function getAvatarGradient(cat) {
  const map = {
    login:        'linear-gradient(135deg,#0288d1,#64b5f6)',
    logout:       'linear-gradient(135deg,#9e9e9e,#bdbdbd)',
    failed:       'linear-gradient(135deg,#e53935,#ff8a80)',
    prescription: 'linear-gradient(135deg,#43a047,#81c784)',
    user:         'linear-gradient(135deg,#9c27b0,#ce93d8)',
    delete:       'linear-gradient(135deg,#c62828,#ef5350)',
    export:       'linear-gradient(135deg,#ff9800,#ffb74d)',
    other:        'linear-gradient(135deg,#d4af37,#f1d878)'
  };
  return map[cat] || map.other;
}

/* ==========================================================
   10. الإحصائيات
   ========================================================== */
function updateStats() {
  const total = allLogs.length;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const today = allLogs.filter(l => l.time >= todayStart.getTime()).length;

  const logins = allLogs.filter(l =>
    getActionCategory(l.action) === 'login'
  ).length;

  const usersCount = new Set(
    allLogs.map(l => l.by).filter(Boolean)
  ).size;

  setText('stat-total', total);
  setText('stat-today', today);
  setText('stat-logins', logins);
  setText('stat-users-count', usersCount);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value.toLocaleString('ar-EG');
}

/* ==========================================================
   11. تصدير CSV
   ========================================================== */
async function exportCSV() {
  if (!canViewAudit) {
    showToast('🚫 لا تمتلك صلاحية التصدير', 'error');
    return;
  }

  const logs = getFilteredLogs();
  if (!logs.length) {
    showToast('⚠️ لا توجد سجلات للتصدير', 'info');
    return;
  }

  try {
    const headers = ['#', 'الحدث', 'النوع', 'التفاصيل', 'بواسطة', 'التاريخ', 'الوقت'];

    const rows = logs.map((l, i) => [
      i + 1,
      l.action || '',
      getActionCategory(l.action),
      l.detail || '',
      l.by || '',
      formatDate(l.time),
      formatTime(l.time)
    ]);

    const csv = '\uFEFF' + // BOM لدعم العربية في Excel
      [headers, ...rows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MediPrescribe_Audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    await logAudit('تصدير سجل التدقيق', `${logs.length} سجل`);
    showToast(`✅ تم تصدير ${logs.length} سجل`, 'success');
  } catch (err) {
    console.error('exportCSV error:', err);
    showToast('❌ فشل التصدير: ' + err.message, 'error');
  }
}

/* ==========================================================
   12. حذف السجلات الأقدم من 90 يوماً
   ========================================================== */
async function cleanupOldLogs() {
  if (!canViewAudit) {
    showToast('🚫 لا تمتلك صلاحية الحذف', 'error');
    return;
  }

  const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
  const toDelete = allLogs.filter(l => l.time < cutoff);

  if (!toDelete.length) {
    showToast('✅ لا توجد سجلات أقدم من 90 يوماً', 'info');
    return;
  }

  // عرض Modal تأكيد
  const confirmText = document.getElementById('confirm-text');
  if (confirmText) {
    confirmText.textContent =
      `سيتم حذف ${toDelete.length} سجل أقدم من 90 يوماً. لا يمكن التراجع.`;
  }

  deleteMode = true;
  document.getElementById('confirm-modal')?.classList.remove('hidden');
}

async function confirmDelete() {
  if (!deleteMode) return;

  try {
    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const toDelete = allLogs.filter(l => l.time < cutoff);

    let deleted = 0;
    for (const log of toDelete) {
      await DB.del('audit', log.id);
      deleted++;
    }

    // سجّل عملية الحذف نفسها
    await logAudit('حذف سجلات تدقيق قديمة', `${deleted} سجل أقدم من 90 يوماً`);

    showToast(`🗑️ تم حذف ${deleted} سجل قديم`, 'success');

    closeConfirmModal();
    await loadLogs();
  } catch (err) {
    console.error('cleanup error:', err);
    showToast('❌ فشل الحذف', 'error');
  }
}

function closeConfirmModal() {
  document.getElementById('confirm-modal')?.classList.add('hidden');
  deleteMode = false;
}

/* ==========================================================
   13. تسجيل الخروج
   ========================================================== */
function initLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;

    try {
      await logAudit('تسجيل خروج', session.username);
    } catch (e) {
      console.warn('logAudit failed:', e);
    }

    localStorage.removeItem('mp_session');
    location.replace('login.html');
  });
}

/* ==========================================================
   14. تبديل العرض
   ========================================================== */
function initViewToggle() {
  const toggle = document.getElementById('view-toggle');
  if (!toggle) return;

  toggle.addEventListener('click', e => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;

    currentView = btn.dataset.view;

    toggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const table = document.getElementById('audit-table-view');
    const grid = document.getElementById('audit-grid-view');

    if (currentView === 'table') {
      table?.classList.remove('hidden');
      grid?.classList.add('hidden');
    } else {
      table?.classList.add('hidden');
      grid?.classList.remove('hidden');
    }
  });
}

/* ==========================================================
   15. أحداث عامة
   ========================================================== */
function initEventListeners() {
  document.getElementById('audit-search')?.addEventListener('input', renderLogs);
  document.getElementById('filter-action')?.addEventListener('change', renderLogs);
  document.getElementById('filter-user')?.addEventListener('change', renderLogs);
  document.getElementById('filter-period')?.addEventListener('change', renderLogs);

  document.getElementById('export-btn')?.addEventListener('click', exportCSV);
  document.getElementById('clear-btn')?.addEventListener('click', cleanupOldLogs);

  document.getElementById('confirm-yes')?.addEventListener('click', confirmDelete);
  document.getElementById('confirm-no')?.addEventListener('click', closeConfirmModal);

  document.getElementById('confirm-modal')?.addEventListener('click', e => {
    if (e.target.id === 'confirm-modal') closeConfirmModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeConfirmModal();
  });
}

/* ==========================================================
   16. عرض شارة المستخدم
   ========================================================== */
function initUserInterface() {
  const badge = document.getElementById('user-badge');
  if (badge) {
    badge.textContent = `${session.fullName} · ${session.roleLabel || session.role}`;
  }

  // إخفاء رابط إدارة المستخدمين لغير المدير (احتياطي)
  if (session.role !== 'admin') {
    document.getElementById('nav-users')?.remove();
  }
}

/* ==========================================================
   17. التشغيل التلقائي
   ========================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('📊 MediPrescribe — سجل التدقيق');

  initUserInterface();
  initViewToggle();
  initLogout();
  initEventListeners();

  if (canViewAudit) {
    await loadLogs();
    console.log('✅ audit.js — كل المكونات جاهزة');
  } else {
    console.log('⚠️ عرض مقيّد (ليس admin)');
  }
});

/* ==========================================================
   18. تصدير للاستخدام الخارجي
   ========================================================== */
window.auditAPI = {
  loadLogs,
  renderLogs,
  exportCSV,
  cleanupOldLogs,
  getFilteredLogs
};