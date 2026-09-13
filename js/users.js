/* ==========================================================
   MediPrescribe Pro — users.js
   منطق إدارة المستخدمين (RBAC)
   الإصدار: 2.0
   ----------------------------------------------------------
   المكونات:
   1.  حماية admin-only
   2.  أدوات مساعدة
   3.  Toast notifications
   4.  الصلاحيات المتاحة
   5.  تحميل وعرض المستخدمين
   6.  Grid View + Table View
   7.  الفلترة والبحث
   8.  Modal إضافة/تعديل
   9.  حفظ المستخدم
   10. تبديل الحالة
   11. تأكيد وحذف
   12. إحصائيات الأدوار
   13. تبديل العرض (Grid ↔ Table)
   14. تسجيل الخروج
   15. التشغيل التلقائي
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

const canManageUsers = session.role === 'admin';

if (!canManageUsers) {
  // إظهار تنبيه المنع وإخفاء الأدوات
  document.getElementById('permission-alert')?.classList.remove('hidden');
  document.querySelector('.users-toolbar')?.classList.add('hidden');
  document.querySelector('.roles-stats')?.classList.add('hidden');
  console.warn('🚫 صلاحيات غير كافية — هذه الصفحة للمدير فقط');
}

console.log('🔐 المستخدم:', session.fullName, '| دور:', session.role);


/* ==========================================================
   2. أدوات مساعدة
   ========================================================== */
function getRoleLabel(role) {
  if (typeof ROLE_LABELS_AR !== 'undefined' && ROLE_LABELS_AR[role]) {
    return ROLE_LABELS_AR[role];
  }
  return {
    admin: 'مدير النظام',
    doctor: 'طبيب باطنية',
    pharmacist: 'صيدلي',
    nurse: 'ممرض',
    receptionist: 'استقبال'
  }[role] || role;
}

function getRoleIcon(role) {
  return {
    admin: '👑',
    doctor: '🩺',
    pharmacist: '💊',
    nurse: '👩‍⚕️',
    receptionist: '📋'
  }[role] || '👤';
}

function getStatusLabel(status) {
  return {
    active: '🟢 نشط',
    inactive: '⚪ غير نشط',
    suspended: '🔴 موقوف'
  }[status] || status;
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

function formatDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  } catch (e) {
    return '—';
  }
}

function formatDateTime(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('ar-EG', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return '—';
  }
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
   3. Toast Notifications
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
  setTimeout(() => {
    toast.style.transition = 'opacity .3s, transform .3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}
window.showToast = showToast;


/* ==========================================================
   4. الصلاحيات المتاحة
   ========================================================== */
const PERMISSIONS = (typeof ALL_PERMISSIONS !== 'undefined')
  ? [
      { id: 'create_prescription', label: '📝 إنشاء وصفة' },
      { id: 'view_records',        label: '📋 عرض السجلات' },
      { id: 'print_prescription',  label: '🖨️ طباعة الوصفات' },
      { id: 'delete_records',      label: '🗑️ حذف السجلات' },
      { id: 'manage_users',        label: '👥 إدارة المستخدمين' },
      { id: 'export_data',         label: '📤 تصدير البيانات' },
      { id: 'view_audit_log',      label: '🔍 سجل التدقيق' },
      { id: 'system_settings',     label: '⚙️ إعدادات النظام' }
    ]
  : [];

const ROLE_DEFAULT_PERMISSIONS_LOCAL = (typeof ROLE_DEFAULT_PERMISSIONS !== 'undefined')
  ? ROLE_DEFAULT_PERMISSIONS
  : {
      admin:        PERMISSIONS.map(p => p.id),
      doctor:       ['create_prescription', 'view_records', 'print_prescription', 'export_data'],
      pharmacist:   ['view_records', 'print_prescription'],
      nurse:        ['view_records'],
      receptionist: ['view_records', 'print_prescription']
    };


/* ==========================================================
   5. الحالة العامة
   ========================================================== */
let allUsers = [];
let currentView = 'grid';
let editingId = null;
let deleteId = null;
let roleChangeTouched = false;


/* ==========================================================
   6. تحميل المستخدمين
   ========================================================== */
async function loadUsers() {
  try {
    await initDB();
    allUsers = await DB.all('users');
    // ترتيب: admin أولاً ثم الأحدث
    allUsers.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (b.role === 'admin' && a.role !== 'admin') return 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    updateRoleCounts();
    renderUsers();
  } catch (err) {
    console.error('loadUsers error:', err);
    showToast('❌ فشل تحميل المستخدمين', 'error');
  }
}


/* ==========================================================
   7. إحصائيات الأدوار
   ========================================================== */
function updateRoleCounts() {
  const counts = {
    admin: 0, doctor: 0, pharmacist: 0, nurse: 0, receptionist: 0
  };
  allUsers.forEach(u => {
    if (counts[u.role] !== undefined) counts[u.role]++;
  });

  ['admin', 'doctor', 'pharmacist', 'nurse', 'receptionist'].forEach(role => {
    const el = document.getElementById(`count-${role}`);
    if (el) el.textContent = counts[role].toLocaleString('ar-EG');
  });
}


/* ==========================================================
   8. الفلترة والبحث
   ========================================================== */
function getFilteredUsers() {
  const q = (document.getElementById('users-search')?.value || '').trim().toLowerCase();
  const roleFilter = document.getElementById('filter-role')?.value || '';
  const statusFilter = document.getElementById('filter-status')?.value || '';

  return allUsers.filter(u => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (statusFilter && u.status !== statusFilter) return false;
    if (q) {
      const haystack = [
        u.fullName, u.username, u.email, u.phone, u.hospital
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}


/* ==========================================================
   9. العرض الرئيسي (يوزّع بين Grid/Table)
   ========================================================== */
function renderUsers() {
  const users = getFilteredUsers();
  renderGridView(users);
  renderTableView(users);
}


/* ==========================================================
   10. Grid View
   ========================================================== */
function renderGridView(users) {
  const grid = document.getElementById('users-view-grid');
  if (!grid) return;

  if (!users.length) {
    grid.innerHTML = `
      <div class="users-empty">
        <div class="icon">👥</div>
        <h4>لا يوجد مستخدمون مطابقون</h4>
        <p>جرّب تعديل معايير البحث أو أضف مستخدماً جديداً</p>
        <button class="btn btn-gold" onclick="openUserModal()" type="button">
          ➕ إضافة مستخدم
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = users.map(u => `
    <div class="user-card" data-id="${u.id}">
      <div class="user-card-header">
        <div class="user-avatar" style="background: ${getAvatarGradient(u.role)};">
          ${getInitials(u.fullName || u.username)}
        </div>
        <div class="user-info">
          <h4 title="${escapeHTML(u.fullName)}">${escapeHTML(u.fullName || '—')}</h4>
          <div class="username">@${escapeHTML(u.username)}</div>
        </div>
      </div>
      <div class="user-card-body">
        <div class="user-meta-row">
          <span class="label">الدور</span>
          <span class="badge role-${u.role}">
            ${getRoleIcon(u.role)} ${getRoleLabel(u.role)}
          </span>
        </div>
        <div class="user-meta-row">
          <span class="label">المستشفى</span>
          <span class="value">${escapeHTML(u.hospital || '—')}</span>
        </div>
        <div class="user-meta-row">
          <span class="label">الهاتف</span>
          <span class="value">${escapeHTML(u.phone || '—')}</span>
        </div>
        <div class="user-meta-row">
          <span class="label">الحالة</span>
          <span class="badge status-${u.status || 'active'}">
            ${getStatusLabel(u.status || 'active')}
          </span>
        </div>
        <div class="user-meta-row">
          <span class="label">آخر دخول</span>
          <span class="value">${formatDate(u.lastLogin)}</span>
        </div>
      </div>
      <div class="user-card-actions">
        <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${u.id}" type="button">
          ✏️ تعديل
        </button>
        <button class="btn btn-ghost btn-sm" data-action="toggle" data-id="${u.id}" type="button">
          ${u.status === 'active' ? '⏸️ إيقاف' : '▶️ تنشيط'}
        </button>
        ${u.username !== session.username ? `
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${u.id}" type="button">
            🗑️ حذف
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');

  bindCardActions(grid);
}

function getAvatarGradient(role) {
  const gradients = {
    admin:        'linear-gradient(135deg, #e53935, #ff8a80)',
    doctor:       'linear-gradient(135deg, #0288d1, #64b5f6)',
    pharmacist:   'linear-gradient(135deg, #43a047, #81c784)',
    nurse:        'linear-gradient(135deg, #9c27b0, #ce93d8)',
    receptionist: 'linear-gradient(135deg, #ff9800, #ffb74d)'
  };
  return gradients[role] || 'linear-gradient(135deg, var(--mp-gold), var(--mp-gold-light))';
}

function bindCardActions(container) {
  container.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id, 10);
      const action = btn.dataset.action;

      if (action === 'edit') editUser(id);
      else if (action === 'toggle') toggleUserStatus(id);
      else if (action === 'delete') askDelete(id);
    });
  });
}


/* ==========================================================
   11. Table View
   ========================================================== */
function renderTableView(users) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">لا يوجد مستخدمون مطابقون</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="mini-avatar" style="background: ${getAvatarGradient(u.role)};">
            ${getInitials(u.fullName || u.username)}
          </div>
          <div class="user-cell-info">
            <strong>${escapeHTML(u.fullName || '—')}</strong>
            <small>@${escapeHTML(u.username)}</small>
          </div>
        </div>
      </td>
      <td>
        <span class="badge role-${u.role}">
          ${getRoleIcon(u.role)} ${getRoleLabel(u.role)}
        </span>
      </td>
      <td style="font-size:.83rem;">${escapeHTML(u.hospital || '—')}</td>
      <td style="font-size:.83rem;">${escapeHTML(u.phone || '—')}</td>
      <td>
        <span class="badge status-${u.status || 'active'}">
          ${getStatusLabel(u.status || 'active')}
        </span>
      </td>
      <td style="font-size:.82rem;">${formatDate(u.lastLogin)}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-ghost btn-xs" data-action="edit" data-id="${u.id}"
                  type="button" title="تعديل">✏️</button>
          <button class="btn btn-ghost btn-xs" data-action="toggle" data-id="${u.id}"
                  type="button" title="تبديل الحالة">
            ${u.status === 'active' ? '⏸️' : '▶️'}
          </button>
          ${u.username !== session.username ? `
            <button class="btn btn-danger btn-xs" data-action="delete" data-id="${u.id}"
                    type="button" title="حذف">🗑️</button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  // ربط الأحداث
  tbody.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id, 10);
      const action = btn.dataset.action;
      if (action === 'edit') editUser(id);
      else if (action === 'toggle') toggleUserStatus(id);
      else if (action === 'delete') askDelete(id);
    });
  });
}


/* ==========================================================
   12. Modal إضافة/تعديل
   ========================================================== */
function openUserModal(user = null) {
  if (!canManageUsers) {
    showToast('🚫 لا تمتلك صلاحية إدارة المستخدمين', 'error');
    return;
  }

  editingId = user?.id || null;
  roleChangeTouched = false;

  // العنوان
  const title = document.getElementById('modal-title');
  if (title) title.textContent = user ? '✏️ تعديل المستخدم' : '➕ مستخدم جديد';

  // الحقول
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val != null ? val : '';
  };

  setVal('u-id', user?.id);
  setVal('u-fullname', user?.fullName);
  setVal('u-username', user?.username);
  setVal('u-password', '');  // دائماً فارغ
  setVal('u-email', user?.email);
  setVal('u-role', user?.role);
  setVal('u-phone', user?.phone);
  setVal('u-status', user?.status || 'active');

  // المستشفى
  const hospitalSelect = document.getElementById('u-hospital');
  if (hospitalSelect) {
    if (typeof HOSPITALS !== 'undefined' && HOSPITALS.length) {
      hospitalSelect.innerHTML = HOSPITALS.map(h => `<option>${h}</option>`).join('');
    }
    if (user?.hospital) {
      const idx = HOSPITALS?.indexOf(user.hospital) ?? -1;
      if (idx >= 0) hospitalSelect.selectedIndex = idx;
    }
  }

  // حقل كلمة المرور
  const passInput = document.getElementById('u-password');
  const passHint = document.getElementById('pass-hint');
  if (passInput) {
    passInput.required = !user;
    passInput.placeholder = user ? 'اتركها فارغة للإبقاء على الحالية' : '••••••••';
  }
  if (passHint) {
    passHint.style.display = user ? 'block' : 'none';
  }

  // الصلاحيات
  const perms = user?.permissions
    || ROLE_DEFAULT_PERMISSIONS_LOCAL[user?.role]
    || [];
  renderPermissions(perms);

  // إظهار Modal
  document.getElementById('user-modal')?.classList.remove('hidden');
  setTimeout(() => document.getElementById('u-fullname')?.focus(), 100);
}

function closeUserModal() {
  document.getElementById('user-modal')?.classList.add('hidden');
  editingId = null;
  roleChangeTouched = false;
}

function renderPermissions(selected = []) {
  const grid = document.getElementById('permissions-grid');
  if (!grid) return;

  grid.innerHTML = PERMISSIONS.map(p => `
    <label class="permission-item ${selected.includes(p.id) ? 'checked' : ''}">
      <input type="checkbox" value="${p.id}" ${selected.includes(p.id) ? 'checked' : ''}>
      <span>${p.label}</span>
    </label>
  `).join('');

  // مستمعو التغيير
  grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.permission-item')?.classList.toggle('checked', cb.checked);
    });
  });
}

function getSelectedPermissions() {
  return Array.from(
    document.querySelectorAll('#permissions-grid input[type="checkbox"]:checked')
  ).map(cb => cb.value);
}


/* ==========================================================
   13. حفظ المستخدم
   ========================================================== */
async function initUserForm() {
  const form = document.getElementById('user-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();

    if (!canManageUsers) {
      showToast('🚫 لا تمتلك صلاحية', 'error');
      return;
    }

    // جمع البيانات
    const id = document.getElementById('u-id').value;
    const fullName = document.getElementById('u-fullname').value.trim();
    const username = document.getElementById('u-username').value.trim();
    const password = document.getElementById('u-password').value;
    const email = document.getElementById('u-email').value.trim();
    const role = document.getElementById('u-role').value;
    const hospital = document.getElementById('u-hospital').value;
    const phone = document.getElementById('u-phone').value.trim();
    const status = document.getElementById('u-status').value;
    const permissions = getSelectedPermissions();

    // التحقق الأساسي
    if (!fullName || !username || !role) {
      showToast('⚠️ يرجى إكمال الحقول الإلزامية', 'warning');
      return;
    }

    if (!/^[a-zA-Z0-9._-]{3,}$/.test(username)) {
      showToast('⚠️ اسم المستخدم: 3 أحرف على الأقل، إنجليزية/أرقام/نقطة/شرطة', 'warning');
      return;
    }

    if (!id && (!password || password.length < 6)) {
      showToast('⚠️ كلمة المرور: 6 أحرف على الأقل', 'warning');
      return;
    }

    // التحقق من عدم تكرار اسم المستخدم
    const existing = allUsers.find(u =>
      u.username.toLowerCase() === username.toLowerCase()
      && String(u.id) !== String(id)
    );
    if (existing) {
      showToast('❌ اسم المستخدم موجود مسبقاً', 'error');
      return;
    }

    // زر التحميل
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ جارٍ الحفظ...';

    try {
      if (id) {
        // تعديل
        const user = allUsers.find(u => String(u.id) === String(id));
        if (!user) throw new Error('المستخدم غير موجود');

        Object.assign(user, {
          fullName, username, email, role, hospital, phone, status, permissions,
          roleLabel: getRoleLabel(role)
        });

        // كلمة المرور: فقط إذا أدخل المستخدم كلمة جديدة
        if (password) {
          user.password = await hashPassword(password);
        }

        await DB.put('users', user);
        await logAudit('تعديل المستخدم', `${username} (${getRoleLabel(role)})`);
        showToast('✅ تم تحديث المستخدم', 'success');
      } else {
        // إضافة جديدة
        const hashed = await hashPassword(password);
        const newUser = {
          username,
          password: hashed,
          fullName,
          email,
          role,
          roleLabel: getRoleLabel(role),
          hospital,
          phone,
          status,
          permissions,
          createdAt: Date.now(),
          lastLogin: null
        };
        await DB.add('users', newUser);
        await logAudit('إضافة مستخدم', `${username} (${getRoleLabel(role)})`);
        showToast(`✅ تم إضافة ${fullName} بنجاح`, 'success');
      }

      closeUserModal();
      await loadUsers();
    } catch (err) {
      console.error('save user error:', err);
      showToast('❌ فشل الحفظ: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
}


/* ==========================================================
   14. تعديل مستخدم
   ========================================================== */
function editUser(id) {
  const user = allUsers.find(u => u.id === id);
  if (user) openUserModal(user);
}


/* ==========================================================
   15. تبديل الحالة
   ========================================================== */
async function toggleUserStatus(id) {
  if (!canManageUsers) {
    showToast('🚫 لا تمتلك صلاحية', 'error');
    return;
  }

  const user = allUsers.find(u => u.id === id);
  if (!user) return;

  if (user.username === session.username) {
    showToast('⚠️ لا يمكنك إيقاف حسابك الحالي', 'warning');
    return;
  }

  const newStatus = user.status === 'active' ? 'inactive' : 'active';
  const label = newStatus === 'active' ? 'تنشيط' : 'إيقاف';

  if (!confirm(`هل تريد ${label} المستخدم "${user.fullName || user.username}"؟`)) {
    return;
  }

  try {
    user.status = newStatus;
    await DB.put('users', user);
    await logAudit(
      `${label} المستخدم`,
      `${user.username} → ${newStatus}`
    );
    showToast(`✅ تم ${label} المستخدم`, 'success');
    await loadUsers();
  } catch (err) {
    console.error('toggleUserStatus error:', err);
    showToast('❌ فشل التحديث', 'error');
  }
}


/* ==========================================================
   16. تأكيد وحذف
   ========================================================== */
function askDelete(id) {
  if (!canManageUsers) {
    showToast('🚫 لا تمتلك صلاحية', 'error');
    return;
  }

  const user = allUsers.find(u => u.id === id);
  if (!user) return;

  if (user.username === session.username) {
    showToast('⚠️ لا يمكنك حذف حسابك الحالي', 'warning');
    return;
  }

  deleteId = id;
  const text = document.getElementById('confirm-text');
  if (text) {
    text.textContent =
      `هل أنت متأكد من حذف المستخدم "${user.fullName || user.username}"؟ ` +
      `لا يمكن التراجع عن هذا الإجراء.`;
  }
  document.getElementById('confirm-modal')?.classList.remove('hidden');
}

async function confirmDelete() {
  if (!deleteId) return;

  const user = allUsers.find(u => u.id === deleteId);
  if (!user) {
    closeConfirmModal();
    return;
  }

  try {
    await DB.del('users', deleteId);
    await logAudit('حذف مستخدم', `${user.username} (${getRoleLabel(user.role)})`);
    showToast(`🗑️ تم حذف ${user.fullName || user.username}`, 'success');
    closeConfirmModal();
    await loadUsers();
  } catch (err) {
    console.error('confirmDelete error:', err);
    showToast('❌ فشل الحذف', 'error');
  }
}

function closeConfirmModal() {
  document.getElementById('confirm-modal')?.classList.add('hidden');
  deleteId = null;
}


/* ==========================================================
   17. تبديل العرض (Grid ↔ Table)
   ========================================================== */
function initViewToggle() {
  const toggle = document.getElementById('view-toggle');
  if (!toggle) return;

  toggle.addEventListener('click', e => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;

    currentView = btn.dataset.view;

    // تحديث الأزرار
    toggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // تبديل العرض
    const grid = document.getElementById('users-view-grid');
    const table = document.getElementById('users-view-table');

    if (currentView === 'grid') {
      grid?.classList.remove('hidden');
      table?.classList.add('hidden');
    } else {
      grid?.classList.add('hidden');
      table?.classList.remove('hidden');
    }
  });
}


/* ==========================================================
   18. تسجيل الخروج
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
   19. ربط الأحداث العامة
   ========================================================== */
function initEventListeners() {
  // زر الإضافة
  document.getElementById('add-user-btn')?.addEventListener('click', () => openUserModal());

  // إغلاق Modal
  document.getElementById('modal-close')?.addEventListener('click', closeUserModal);
  document.getElementById('cancel-btn')?.addEventListener('click', closeUserModal);

  // Modal الحذف
  document.getElementById('confirm-yes')?.addEventListener('click', confirmDelete);
  document.getElementById('confirm-no')?.addEventListener('click', closeConfirmModal);

  // البحث والفلترة
  document.getElementById('users-search')?.addEventListener('input', renderUsers);
  document.getElementById('filter-role')?.addEventListener('change', renderUsers);
  document.getElementById('filter-status')?.addEventListener('change', renderUsers);

  // تغيير الصلاحيات تلقائياً عند تغيير الدور (إن لم يعدّلها المستخدم يدوياً)
  document.getElementById('u-role')?.addEventListener('change', e => {
    if (roleChangeTouched) return;
    const defaults = ROLE_DEFAULT_PERMISSIONS_LOCAL[e.target.value] || [];
    renderPermissions(defaults);
  });

  // تتبّع التعديل اليدوي على الصلاحيات
  document.getElementById('permissions-grid')?.addEventListener('change', () => {
    roleChangeTouched = true;
  });

  // ESC لإغلاق النوافذ
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeUserModal();
      closeConfirmModal();
    }
  });

  // إغلاق Modal عند النقر خارجه
  document.getElementById('user-modal')?.addEventListener('click', e => {
    if (e.target.id === 'user-modal') closeUserModal();
  });
  document.getElementById('confirm-modal')?.addEventListener('click', e => {
    if (e.target.id === 'confirm-modal') closeConfirmModal();
  });
}


/* ==========================================================
   20. التشغيل التلقائي
   ========================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('👥 MediPrescribe — إدارة المستخدمين');

  // 1) الواجهة العامة
  initViewToggle();
  initUserForm();
  initLogout();
  initEventListeners();

  // 2) تحميل البيانات (فقط للمدير)
  if (canManageUsers) {
    await loadUsers();
    console.log('✅ users.js — كل المكونات جاهزة');
  } else {
    console.log('⚠️ عرض للقراءة فقط (ليس admin)');
  }
});


/* ==========================================================
   21. تصدير للاستخدام الخارجي
   ========================================================== */
window.usersAPI = {
  loadUsers,
  openUserModal,
  closeUserModal,
  editUser,
  toggleUserStatus,
  askDelete,
  confirmDelete,
  getFilteredUsers,
  renderUsers
};