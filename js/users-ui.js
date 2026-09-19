/* ============================================================
 * MediPrescribe — Users UI Controller
 * users-ui.js v3.0.0
 *
 * متوافق مع User API v6.0.0+
 * ============================================================ */

'use strict';

(function (window, document) {

    const VERSION = '3.0.0';
    const USER = window.User;

    console.log(`🚀 users-ui.js v${VERSION} loading...`);

    /* =========================================================
       DOM HELPERS
       ========================================================= */

    const $ = (selector, root = document) =>
        root?.querySelector?.(selector) || null;

    const $$ = (selector, root = document) =>
        root?.querySelectorAll
            ? Array.from(root.querySelectorAll(selector))
            : [];

    /* =========================================================
       STATE
       ========================================================= */

    const state = {
        users: [],
        filtered: [],
        currentView: 'grid',
        search: '',
        filterRole: '',
        filterStatus: '',
        pendingDeleteId: null,
        canManage: false,
        loading: false,
        saving: false,
        deleting: false
    };

    /* =========================================================
       HELPERS
       ========================================================= */

    function toast(message, type = 'info', duration = 4000) {
        const box = $('#toast-box');

        if (!box) {
            console.log(`[toast:${type}]`, message);
            return;
        }

        const el = document.createElement('div');

        el.className = `toast ${type}`;
        el.setAttribute(
            'role',
            type === 'error' ? 'alert' : 'status'
        );

        el.textContent = String(message ?? '');

        box.appendChild(el);

        window.setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(10px)';

            window.setTimeout(() => {
                el.remove();
            }, 300);

        }, duration);
    }

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function normalizeText(value) {
        return String(value ?? '')
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[إأآٱ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .trim();
    }

    function debounce(fn, delay = 250) {
        let timer = null;

        return function (...args) {
            window.clearTimeout(timer);

            timer = window.setTimeout(() => {
                fn.apply(this, args);
            }, delay);
        };
    }

    function getUserId(user) {
        return user?.id ??
            user?._id ??
            user?.userId ??
            '';
    }

    function getUserName(user) {
        return user?.name ||
            user?.fullName ||
            user?.username ||
            'مستخدم بدون اسم';
    }

    function getUserRole(user) {
        return String(user?.role || '')
            .trim()
            .toLowerCase();
    }

    function getInitials(name) {

        const parts = String(name ?? '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!parts.length) {
            return '؟';
        }

        if (parts.length === 1) {
            return parts[0]
                .slice(0, 2)
                .toUpperCase();
        }

        return (
            parts[0][0] +
            parts[parts.length - 1][0]
        ).toUpperCase();
    }

    function formatDate(value) {

        if (!value) {
            return '—';
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return '—';
        }

        try {

            return new Intl.DateTimeFormat('ar-YE', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }).format(date);

        } catch {

            return date.toLocaleDateString();
        }
    }

    function setElementText(id, value) {

        const element = document.getElementById(id);

        if (element) {
            element.textContent = String(value ?? '');
        }
    }

    function setFieldValue(id, value = '') {

        const element = document.getElementById(id);

        if (element) {
            element.value = value ?? '';
        }
    }

    function getFieldValue(id) {

        return document.getElementById(id)?.value ?? '';
    }

    function setButtonBusy(
        button,
        busy,
        busyText = 'جاري التنفيذ...'
    ) {

        if (!button) {
            return;
        }

        if (busy) {

            if (!button.dataset.originalText) {
                button.dataset.originalText =
                    button.textContent;
            }

            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.textContent = busyText;

        } else {

            button.disabled = false;
            button.removeAttribute('aria-busy');

            if (button.dataset.originalText) {

                button.textContent =
                    button.dataset.originalText;

                delete button.dataset.originalText;
            }
        }
    }

    /* =========================================================
       STATUS
       ========================================================= */

    function isUserActive(user) {
        return user?.active !== false;
    }

    function isUserSuspended(user) {

        return user?.suspended === true ||
            user?.status === 'suspended' ||
            user?.accountStatus === 'suspended';
    }

    function getStatus(user) {

        if (isUserSuspended(user)) {
            return 'suspended';
        }

        return isUserActive(user)
            ? 'active'
            : 'inactive';
    }

    function getStatusLabel(status) {

        const labels = {
            active: 'نشط',
            inactive: 'غير نشط',
            suspended: 'موقوف'
        };

        return labels[status] || 'غير معروف';
    }

    function getStatusClass(status) {

        const classes = {
            active: 'status-active',
            inactive: 'status-inactive',
            suspended: 'status-suspended'
        };

        return classes[status] ||
            'status-inactive';
    }

    /* =========================================================
       ROLE
       ========================================================= */

    function getRoleLabel(role) {

        try {

            if (
                USER &&
                typeof USER.getRoleLabel === 'function'
            ) {

                return USER.getRoleLabel(role) ||
                    role ||
                    '—';
            }

        } catch (error) {

            console.warn(
                '[users-ui] getRoleLabel failed:',
                error
            );
        }

        return role || '—';
    }

    /* =========================================================
       PERMISSIONS
       ========================================================= */

    const PERMISSIONS_LIST = [

        {
            key: 'dashboard.view',
            title: 'عرض اللوحة',
            desc: 'الوصول للوحة التحكم'
        },

        {
            key: 'patients.view',
            title: 'عرض المرضى',
            desc: 'قراءة بيانات المرضى'
        },

        {
            key: 'patients.create',
            title: 'إضافة مريض',
            desc: 'إنشاء ملف مريض جديد'
        },

        {
            key: 'patients.edit',
            title: 'تعديل المرضى',
            desc: 'تحديث بيانات المرضى'
        },

        {
            key: 'prescriptions.view',
            title: 'عرض الوصفات',
            desc: 'قراءة الوصفات الطبية'
        },

        {
            key: 'prescriptions.create',
            title: 'إنشاء وصفة',
            desc: 'كتابة وصفات طبية'
        },

        {
            key: 'prescriptions.dispense',
            title: 'صرف الأدوية',
            desc: 'صرف الأدوية من الصيدلية'
        },

        {
            key: 'medications.view',
            title: 'عرض الأدوية',
            desc: 'الوصول لقائمة الأدوية'
        },

        {
            key: 'bookings.view',
            title: 'عرض الحجوزات',
            desc: 'قراءة المواعيد والحجوزات'
        },

        {
            key: 'bookings.create',
            title: 'إنشاء حجز',
            desc: 'إنشاء مواعيد جديدة'
        },

        {
            key: 'users.view',
            title: 'عرض المستخدمين',
            desc: 'قراءة قائمة المستخدمين'
        },

        {
            key: 'users.manage',
            title: 'إدارة المستخدمين',
            desc: 'إضافة وتعديل وحذف المستخدمين'
        }

    ];

    function renderPermissions(selected = []) {

        const grid = $('#permissions-grid');

        if (!grid) {
            return;
        }

        const selectedSet = new Set(
            (Array.isArray(selected)
                ? selected
                : []
            ).map(value =>
                String(value).toLowerCase()
            )
        );

        grid.innerHTML =
            PERMISSIONS_LIST.map(permission => {

                const checked =
                    selectedSet.has(
                        permission.key.toLowerCase()
                    );

                return `
                    <label class="permission-item">

                        <input
                            type="checkbox"
                            name="permissions"
                            value="${escapeHTML(permission.key)}"
                            ${checked ? 'checked' : ''}
                        >

                        <div>

                            <span class="permission-title">
                                ${escapeHTML(permission.title)}
                            </span>

                            <span class="permission-description">
                                ${escapeHTML(permission.desc)}
                            </span>

                        </div>

                    </label>
                `;

            }).join('');
    }

    function getSelectedPermissions() {

        return $$(
            '#permissions-grid input[name="permissions"]:checked'
        ).map(input => input.value);
    }

    /* =========================================================
       HOSPITALS
       ========================================================= */

    const HOSPITALS = [

        '',

        'مستشفى الثورة العام',

        'مستشفى الجمهورية',

        'مستشفى الكويت',

        'المركز الطبي الذكي',

        'عيادات أخرى'

    ];

    function fillHospitals(selectedValue = '') {

        const select = $('#u-hospital');

        if (!select) {
            return;
        }

        const selected =
            String(selectedValue ?? '');

        select.innerHTML =
            HOSPITALS.map(hospital => {

                return `
                    <option value="${escapeHTML(hospital)}">
                        ${escapeHTML(
                            hospital ||
                            '— غير محدد —'
                        )}
                    </option>
                `;

            }).join('');

        if (HOSPITALS.includes(selected)) {

            select.value = selected;

        } else if (selected) {

            const custom =
                document.createElement('option');

            custom.value = selected;
            custom.textContent = selected;

            select.appendChild(custom);

            select.value = selected;

        } else {

            select.value = '';
        }
    }

    /* =========================================================
       LOAD USERS
       ========================================================= */

    async function loadUsers() {

        if (state.loading) {
            return;
        }

        if (
            !USER ||
            typeof USER.getAllUsers !== 'function'
        ) {

            const error = new Error(
                'User API غير متاح أو لم يتم تحميله'
            );

            console.error('[users-ui]', error);

            toast(
                error.message,
                'error',
                5000
            );

            renderEmpty(
                'تعذر الاتصال بوحدة المستخدمين'
            );

            return;
        }

        state.loading = true;

        try {

            const raw =
                await USER.getAllUsers();

            state.users =
                Array.isArray(raw)
                    ? raw
                    : [];

            updateStats();
            applyFilters();

            console.log(
                `✅ تم تحميل ${state.users.length} مستخدم`
            );

        } catch (error) {

            console.error(
                '❌ loadUsers failed:',
                error
            );

            state.users = [];
            state.filtered = [];

            updateStats();

            renderEmpty(
                'تعذر تحميل قائمة المستخدمين'
            );

            toast(
                `فشل تحميل المستخدمين: ${
                    error?.message ||
                    'خطأ غير معروف'
                }`,
                'error',
                6000
            );

        } finally {

            state.loading = false;
        }
    }

    /* =========================================================
       STATISTICS
       ========================================================= */

    function updateStats() {

        const counts = {

            admin: 0,

            doctor: 0,

            pharmacist: 0,

            nurse: 0,

            receptionist: 0
        };

        state.users.forEach(user => {

            const role =
                getUserRole(user);

            if (
                Object.prototype
                    .hasOwnProperty
                    .call(counts, role)
            ) {

                counts[role]++;
            }
        });

        setElementText(
            'count-admin',
            counts.admin
        );

        setElementText(
            'count-doctor',
            counts.doctor
        );

        setElementText(
            'count-pharmacist',
            counts.pharmacist
        );

        setElementText(
            'count-nurse',
            counts.nurse
        );

        setElementText(
            'count-receptionist',
            counts.receptionist
        );

        setElementText(
            'users-count',
            state.users.length
        );
    }

    /* =========================================================
       FILTERS
       ========================================================= */

    function applyFilters() {

        const query =
            normalizeText(state.search);

        const roleFilter =
            normalizeText(state.filterRole);

        const statusFilter =
            state.filterStatus;

        state.filtered =
            state.users.filter(user => {

                const role =
                    getUserRole(user);

                const status =
                    getStatus(user);

                if (
                    roleFilter &&
                    role !== roleFilter
                ) {

                    return false;
                }

                if (
                    statusFilter &&
                    status !== statusFilter
                ) {

                    return false;
                }

                if (!query) {
                    return true;
                }

                const haystack = [

                    user?.name,

                    user?.fullName,

                    user?.username,

                    user?.email,

                    user?.phone,

                    user?.hospital,

                    user?.role

                ]
                    .filter(
                        value =>
                            value !== undefined &&
                            value !== null
                    )
                    .map(normalizeText)
                    .join(' ');

                return haystack.includes(query);
            });

        renderAll();
    }

    /* =========================================================
       EMPTY
       ========================================================= */

    function renderEmpty(
        message = 'لا يوجد مستخدمون'
    ) {

        const grid =
            $('#users-view-grid');

        if (grid) {

            grid.innerHTML = `

                <div class="users-empty">

                    <div
                        class="users-empty-icon"
                        aria-hidden="true"
                    >
                        👥
                    </div>

                    <h3>
                        ${escapeHTML(message)}
                    </h3>

                    <p>
                        يمكنك الضغط على
                        «مستخدم جديد»
                        لإضافة مستخدم.
                    </p>

                </div>

            `;
        }

        const tbody =
            $('#users-tbody');

        if (tbody) {

            tbody.innerHTML = `

                <tr>

                    <td
                        colspan="7"
                        style="
                            text-align:center;
                            color:var(--mp-text-muted);
                            padding:40px;
                        "
                    >
                        ${escapeHTML(message)}
                    </td>

                </tr>

            `;
        }
    }

    /* =========================================================
       RENDER ALL
       ========================================================= */

    function renderAll() {

        renderGrid();

        renderTable();
    }

    /* =========================================================
       GRID
       ========================================================= */

    function renderGrid() {

        const grid =
            $('#users-view-grid');

        if (!grid) {
            return;
        }

        if (!state.filtered.length) {

            renderEmpty(
                state.users.length
                    ? 'لا توجد نتائج مطابقة'
                    : 'لا يوجد مستخدمون بعد'
            );

            return;
        }

        grid.innerHTML =
            state.filtered.map(user => {

                const id =
                    getUserId(user);

                const name =
                    getUserName(user);

                const role =
                    getUserRole(user);

                const roleLabel =
                    getRoleLabel(role);

                const status =
                    getStatus(user);

                return `

                    <article
                        class="user-card"
                        data-user-id="${escapeHTML(id)}"
                    >

                        <header
                            class="user-card-header"
                        >

                            <div
                                class="user-avatar"
                                aria-hidden="true"
                            >
                                ${escapeHTML(
                                    getInitials(name)
                                )}
                            </div>

                            <div
                                style="
                                    min-width:0;
                                    flex:1;
                                "
                            >

                                <h3
                                    class="user-card-name"
                                >
                                    ${escapeHTML(name)}
                                </h3>

                                <div
                                    class="user-card-username"
                                >
                                    @${escapeHTML(
                                        user?.username ||
                                        '—'
                                    )}
                                </div>

                                <span
                                    class="user-card-role"
                                >
                                    ${escapeHTML(
                                        roleLabel
                                    )}
                                </span>

                            </div>

                        </header>

                        <div
                            class="user-info-list"
                        >

                            <div
                                class="user-info-row"
                            >

                                <span
                                    class="user-info-label"
                                >
                                    البريد:
                                </span>

                                <span
                                    class="user-info-value"
                                >
                                    ${escapeHTML(
                                        user?.email ||
                                        '—'
                                    )}
                                </span>

                            </div>

                            <div
                                class="user-info-row"
                            >

                                <span
                                    class="user-info-label"
                                >
                                    الهاتف:
                                </span>

                                <span
                                    class="user-info-value"
                                >
                                    ${escapeHTML(
                                        user?.phone ||
                                        '—'
                                    )}
                                </span>

                            </div>

                            <div
                                class="user-info-row"
                            >

                                <span
                                    class="user-info-label"
                                >
                                    المستشفى:
                                </span>

                                <span
                                    class="user-info-value"
                                >
                                    ${escapeHTML(
                                        user?.hospital ||
                                        '—'
                                    )}
                                </span>

                            </div>

                            <div
                                class="user-info-row"
                            >

                                <span
                                    class="user-info-label"
                                >
                                    الحالة:
                                </span>

                                <span
                                    class="status-badge
                                    ${getStatusClass(status)}"
                                >
                                    ${escapeHTML(
                                        getStatusLabel(
                                            status
                                        )
                                    )}
                                </span>

                            </div>

                        </div>

                        <div
                            class="user-card-actions"
                        >

                            <button
                                type="button"
                                class="btn btn-gold btn-sm"
                                data-action="edit"
                                data-id="${escapeHTML(id)}"
                                ${state.canManage
                                    ? ''
                                    : 'disabled'}
                            >
                                ✏️ تعديل
                            </button>

                            <button
                                type="button"
                                class="btn btn-danger btn-sm"
                                data-action="delete"
                                data-id="${escapeHTML(id)}"
                                ${state.canManage
                                    ? ''
                                    : 'disabled'}
                            >
                                🗑️ حذف
                            </button>

                        </div>

                    </article>

                `;

            }).join('');
    }

    /* =========================================================
       TABLE
       ========================================================= */

    function renderTable() {

        const tbody =
            $('#users-tbody');

        if (!tbody) {
            return;
        }

        if (!state.filtered.length) {

            tbody.innerHTML = `

                <tr>

                    <td
                        colspan="7"
                        style="
                            text-align:center;
                            color:var(--mp-text-muted);
                            padding:40px;
                        "
                    >
                        لا توجد نتائج
                    </td>

                </tr>

            `;

            return;
        }

        tbody.innerHTML =
            state.filtered.map(user => {

                const id =
                    getUserId(user);

                const name =
                    getUserName(user);

                const role =
                    getUserRole(user);

                const roleLabel =
                    getRoleLabel(role);

                const status =
                    getStatus(user);

                return `

                    <tr>

                        <td>

                            <div
                                class="table-user"
                            >

                                <div
                                    class="table-avatar"
                                    aria-hidden="true"
                                >
                                    ${escapeHTML(
                                        getInitials(name)
                                    )}
                                </div>

                                <div>

                                    <div
                                        class="table-user-name"
                                    >
                                        ${escapeHTML(name)}
                                    </div>

                                    <div
                                        class="table-user-username"
                                    >
                                        @${escapeHTML(
                                            user?.username ||
                                            '—'
                                        )}
                                    </div>

                                </div>

                            </div>

                        </td>

                        <td>
                            ${escapeHTML(
                                roleLabel
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                user?.hospital ||
                                '—'
                            )}
                        </td>

                        <td dir="ltr">
                            ${escapeHTML(
                                user?.phone ||
                                '—'
                            )}
                        </td>

                        <td>

                            <span
                                class="status-badge
                                ${getStatusClass(status)}"
                            >
                                ${escapeHTML(
                                    getStatusLabel(
                                        status
                                    )
                                )}
                            </span>

                        </td>

                        <td>
                            ${escapeHTML(
                                formatDate(
                                    user?.lastLogin
                                )
                            )}
                        </td>

                        <td>

                            <div
                                class="table-actions"
                            >

                                <button
                                    type="button"
                                    class="btn btn-gold btn-sm"
                                    data-action="edit"
                                    data-id="${escapeHTML(id)}"
                                    ${state.canManage
                                        ? ''
                                        : 'disabled'}
                                >
                                    ✏️
                                </button>

                                <button
                                    type="button"
                                    class="btn btn-danger btn-sm"
                                    data-action="delete"
                                    data-id="${escapeHTML(id)}"
                                    ${state.canManage
                                        ? ''
                                        : 'disabled'}
                                >
                                    🗑️
                                </button>

                            </div>

                        </td>

                    </tr>

                `;

            }).join('');
    }

    /* =========================================================
       MODAL
       ========================================================= */

    function openUserModal(user = null) {

        const modal =
            $('#user-modal');

        if (!modal) {

            toast(
                'نافذة المستخدم غير موجودة في الصفحة',
                'error'
            );

            return;
        }

        const isEdit =
            Boolean(
                user &&
                getUserId(user)
            );

        const id =
            isEdit
                ? getUserId(user)
                : '';

        setFieldValue(
            'u-id',
            id
        );

        setFieldValue(
            'u-fullname',
            isEdit
                ? (
                    user.name ||
                    user.fullName ||
                    ''
                )
                : ''
        );

        setFieldValue(
            'u-username',
            isEdit
                ? user.username || ''
                : ''
        );

        setFieldValue(
            'u-email',
            isEdit
                ? user.email || ''
                : ''
        );

        setFieldValue(
            'u-role',
            isEdit
                ? user.role || ''
                : ''
        );

        setFieldValue(
            'u-phone',
            isEdit
                ? user.phone || ''
                : ''
        );

        setFieldValue(
            'u-status',
            isEdit
                ? getStatus(user)
                : 'active'
        );

        fillHospitals(
            isEdit
                ? user.hospital || ''
                : ''
        );

        const password =
            $('#u-password');

        if (password) {

            password.value = '';

            password.required =
                !isEdit;
        }

        const hint =
            $('#pass-hint');

        if (hint) {

            hint.style.display =
                isEdit
                    ? 'block'
                    : 'none';
        }

        const title =
            $('#modal-title');

        if (title) {

            title.textContent =
                isEdit
                    ? '✏️ تعديل مستخدم'
                    : '➕ مستخدم جديد';
        }

        clearErrors();

        renderPermissions(
            isEdit
                ? user.permissions
                : []
        );

        modal.classList.remove(
            'hidden'
        );

        document.body.classList.add(
            'modal-open'
        );

        window.setTimeout(() => {

            $('#u-fullname')?.focus();

        }, 100);
    }

    function closeUserModal() {

        const modal =
            $('#user-modal');

        if (!modal) {
            return;
        }

        modal.classList.add(
            'hidden'
        );

        document.body.classList.remove(
            'modal-open'
        );

        clearErrors();
    }

    /* =========================================================
       VALIDATION
       ========================================================= */

    function showError(
        fieldId,
        message
    ) {

        const suffix =
            fieldId.replace(/^u-/, '');

        const errorElement =
            document.getElementById(
                `err-${suffix}`
            );

        const input =
            document.getElementById(
                fieldId
            );

        if (errorElement) {

            errorElement.textContent =
                message;

            errorElement.classList.add(
                'visible'
            );
        }

        if (input) {

            input.classList.add(
                'invalid'
            );

            input.setAttribute(
                'aria-invalid',
                'true'
            );
        }
    }

    function clearErrors() {

        [

            'u-fullname',

            'u-username',

            'u-password',

            'u-email',

            'u-role',

            'u-phone'

        ].forEach(id => {

            const suffix =
                id.replace(/^u-/, '');

            const errorElement =
                document.getElementById(
                    `err-${suffix}`
                );

            const input =
                document.getElementById(id);

            if (errorElement) {

                errorElement.textContent =
                    '';

                errorElement.classList.remove(
                    'visible'
                );
            }

            if (input) {

                input.classList.remove(
                    'invalid'
                );

                input.removeAttribute(
                    'aria-invalid'
                );
            }

        });
    }

    function validateForm() {

        clearErrors();

        let valid = true;

        const id =
            getFieldValue(
                'u-id'
            ).trim();

        const fullname =
            getFieldValue(
                'u-fullname'
            ).trim();

        const username =
            getFieldValue(
                'u-username'
            ).trim();

        const password =
            document.getElementById(
                'u-password'
            )?.value || '';

        const email =
            getFieldValue(
                'u-email'
            ).trim();

        const role =
            getFieldValue(
                'u-role'
            ).trim();

        const phone =
            getFieldValue(
                'u-phone'
            ).trim();

        if (fullname.length < 3) {

            showError(
                'u-fullname',
                'الاسم الكامل مطلوب (3 أحرف على الأقل)'
            );

            valid = false;
        }

        if (
            !/^[a-zA-Z0-9._-]{3,60}$/
                .test(username)
        ) {

            showError(
                'u-username',
                'اسم المستخدم يجب أن يكون 3-60 حرفاً من A-Z أو الأرقام أو . _ -'
            );

            valid = false;
        }

        if (
            !id &&
            password.length < 6
        ) {

            showError(
                'u-password',
                'كلمة المرور مطلوبة (6 أحرف على الأقل)'
            );

            valid = false;
        }

        if (
            id &&
            password &&
            password.length < 6
        ) {

            showError(
                'u-password',
                'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
            );

            valid = false;
        }

        if (
            email &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
                .test(email)
        ) {

            showError(
                'u-email',
                'البريد الإلكتروني غير صالح'
            );

            valid = false;
        }

        if (!role) {

            showError(
                'u-role',
                'يرجى اختيار الدور'
            );

            valid = false;
        }

        if (
            phone &&
            !/^[\d+\-\s()]{6,20}$/
                .test(phone)
        ) {

            showError(
                'u-phone',
                'رقم الهاتف غير صالح'
            );

            valid = false;
        }

        if (!valid) {

            document.querySelector(
                '#user-form .invalid'
            )?.focus();
        }

        return valid;
    }

    /* =========================================================
       SAVE
       ========================================================= */

    async function handleSubmit(event) {

        event.preventDefault();

        if (state.saving) {
            return;
        }

        if (!state.canManage) {

            toast(
                'ليس لديك صلاحية لإدارة المستخدمين',
                'error'
            );

            return;
        }

        if (!validateForm()) {

            toast(
                'يرجى تصحيح الأخطاء أولاً',
                'error'
            );

            return;
        }

        if (!USER) {

            toast(
                'User API غير متاح',
                'error'
            );

            return;
        }

        const form =
            event.currentTarget;

        const submitButton =
            form.querySelector(
                'button[type="submit"]'
            );

        state.saving = true;

        setButtonBusy(
            submitButton,
            true,
            'جاري الحفظ...'
        );

        try {

            const id =
                getFieldValue(
                    'u-id'
                ).trim();

            const password =
                document.getElementById(
                    'u-password'
                )?.value || '';

            const status =
                getFieldValue(
                    'u-status'
                );

            const fullname =
                getFieldValue(
                    'u-fullname'
                ).trim();

            const username =
                getFieldValue(
                    'u-username'
                ).trim();

            const email =
                getFieldValue(
                    'u-email'
                ).trim();

            const role =
                getFieldValue(
                    'u-role'
                ).trim();

            const hospital =
                getFieldValue(
                    'u-hospital'
                ).trim();

            const phone =
                getFieldValue(
                    'u-phone'
                ).trim();

            const data = {

                name: fullname,

                fullName: fullname,

                username,

                email,

                role,

                hospital,

                phone,

                active:
                    status !== 'inactive',

                permissions:
                    getSelectedPermissions()
            };

            if (status === 'suspended') {

                data.suspended = true;

                data.active = true;

                data.status =
                    'suspended';

            } else {

                data.suspended = false;

                data.status =
                    status || 'active';
            }

            if (password) {

                data.password =
                    password;
            }

            if (id) {

                if (
                    typeof USER.updateUser !==
                    'function'
                ) {

                    throw new Error(
                        'updateUser غير متاح في User API'
                    );
                }

                await USER.updateUser(
                    id,
                    data
                );

                toast(
                    '✅ تم تحديث المستخدم بنجاح',
                    'success'
                );

            } else {

                if (
                    typeof USER.createUser !==
                    'function'
                ) {

                    throw new Error(
                        'createUser غير متاح في User API'
                    );
                }

                await USER.createUser(
                    data
                );

                toast(
                    '✅ تم إنشاء المستخدم بنجاح',
                    'success'
                );
            }

            closeUserModal();

            await loadUsers();

        } catch (error) {

            console.error(
                '❌ Save failed:',
                error
            );

            const message =
                String(
                    error?.message ||
                    'خطأ غير معروف'
                );

            const lower =
                message.toLowerCase();

            if (
                message.includes(
                    'اسم المستخدم'
                ) ||
                lower.includes(
                    'username'
                )
            ) {

                showError(
                    'u-username',
                    message
                );

            } else if (
                message.includes(
                    'كلمة المرور'
                ) ||
                lower.includes(
                    'password'
                )
            ) {

                showError(
                    'u-password',
                    message
                );

            } else if (
                message.includes(
                    'الاسم'
                ) ||
                lower.includes(
                    'name'
                )
            ) {

                showError(
                    'u-fullname',
                    message
                );
            }

            toast(
                `❌ ${message}`,
                'error',
                6000
            );

        } finally {

            state.saving = false;

            setButtonBusy(
                submitButton,
                false
            );
        }
    }

    /* =========================================================
       DELETE
       ========================================================= */

    function openConfirmDelete(
        userId
    ) {

        if (!userId) {
            return;
        }

        state.pendingDeleteId =
            String(userId);

        const modal =
            $('#confirm-modal');

        if (!modal) {

            toast(
                'نافذة تأكيد الحذف غير موجودة',
                'error'
            );

            return;
        }

        modal.classList.remove(
            'hidden'
        );

        window.setTimeout(() => {

            $('#confirm-yes')?.focus();

        }, 100);
    }

    function closeConfirmDelete() {

        state.pendingDeleteId =
            null;

        $('#confirm-modal')
            ?.classList.add(
                'hidden'
            );
    }

    async function handleConfirmDelete() {

        const id =
            state.pendingDeleteId;

        if (
            !id ||
            state.deleting
        ) {
            return;
        }

        if (!state.canManage) {

            toast(
                'ليس لديك صلاحية حذف المستخدمين',
                'error'
            );

            closeConfirmDelete();

            return;
        }

        if (
            !USER ||
            typeof USER.deleteUser !==
            'function'
        ) {

            toast(
                'deleteUser غير متاح في User API',
                'error'
            );

            return;
        }

        const user =
            state.users.find(item =>
                String(
                    getUserId(item)
                ) === String(id)
            );

        const userName =
            user
                ? getUserName(user)
                : id;

        const button =
            $('#confirm-yes');

        state.deleting = true;

        setButtonBusy(
            button,
            true,
            'جاري الحذف...'
        );

        try {

            await USER.deleteUser(id);

            toast(
                `✅ تم حذف المستخدم: ${userName}`,
                'success'
            );

            closeConfirmDelete();

            await loadUsers();

        } catch (error) {

            console.error(
                '❌ Delete failed:',
                error
            );

            toast(
                `❌ ${
                    String(
                        error?.message ||
                        'فشل حذف المستخدم'
                    )
                }`,
                'error',
                6000
            );

        } finally {

            state.deleting = false;

            setButtonBusy(
                button,
                false
            );
        }
    }

    /* =========================================================
       ACTIONS
       ========================================================= */

    async function handleAction(
        action,
        id
    ) {

        if (!state.canManage) {

            toast(
                'ليس لديك صلاحية لتنفيذ هذا الإجراء',
                'error'
            );

            return;
        }

        const user =
            state.users.find(item =>
                String(
                    getUserId(item)
                ) === String(id)
            );

        if (!user) {

            toast(
                'المستخدم غير موجود',
                'error'
            );

            return;
        }

        if (action === 'edit') {

            openUserModal(user);

        } else if (
            action === 'delete'
        ) {

            openConfirmDelete(id);
        }
    }

    /* =========================================================
       VIEW
       ========================================================= */

    function setView(view) {

        state.currentView =
            view === 'table'
                ? 'table'
                : 'grid';

        const grid =
            $('#users-view-grid');

        const table =
            $('#users-view-table');

        grid?.classList.toggle(
            'hidden',
            state.currentView !== 'grid'
        );

        table?.classList.toggle(
            'hidden',
            state.currentView !== 'table'
        );

        $$('#view-toggle button')
            .forEach(button => {

                const active =
                    button.dataset.view ===
                    state.currentView;

                button.classList.toggle(
                    'active',
                    active
                );

                button.setAttribute(
                    'aria-pressed',
                    String(active)
                );
            });
    }

    /* =========================================================
       PERMISSION CHECK
       ========================================================= */

    async function checkPermission() {

        try {

            let allowed = false;

            if (
                USER &&
                typeof USER.isAdmin ===
                'function'
            ) {

                allowed =
                    Boolean(
                        await USER.isAdmin()
                    );
            }

            if (
                !allowed &&
                USER &&
                typeof USER.hasPermission ===
                'function'
            ) {

                allowed =
                    Boolean(
                        await USER.hasPermission(
                            'users.manage'
                        )
                    );
            }

            if (
                !allowed &&
                USER &&
                typeof USER.hasPermission ===
                'function'
            ) {

                allowed =
                    Boolean(
                        await USER.hasPermission(
                            '*'
                        )
                    );
            }

            state.canManage =
                allowed;

            const alert =
                $('#permission-alert');

            const addButton =
                $('#add-user-btn');

            alert?.classList.toggle(
                'hidden',
                allowed
            );

            if (addButton) {

                addButton.disabled =
                    !allowed;

                if (allowed) {

                    addButton.removeAttribute(
                        'title'
                    );

                } else {

                    addButton.title =
                        'لا تملك صلاحية إدارة المستخدمين';
                }
            }

            console.log(
                `[users-ui] canManage: ${
                    state.canManage
                }`
            );

            return allowed;

        } catch (error) {

            console.warn(
                '[users-ui] Permission check failed:',
                error
            );

            state.canManage = false;

            $('#permission-alert')
                ?.classList.remove(
                    'hidden'
                );

            const addButton =
                $('#add-user-btn');

            if (addButton) {

                addButton.disabled = true;

                addButton.title =
                    'تعذر التحقق من الصلاحيات';
            }

            return false;
        }
    }

    /* =========================================================
       USER BADGE
       ========================================================= */

    async function updateUserBadge() {

        if (
            !USER ||
            typeof USER.getCurrentUser !==
            'function'
        ) {
            return;
        }

        try {

            const user =
                await USER.getCurrentUser();

            const badge =
                $('#user-badge');

            if (!badge) {
                return;
            }

            if (!user) {

                badge.textContent =
                    'زائر';

                return;
            }

            const name =
                getUserName(user);

            const role =
                getRoleLabel(
                    getUserRole(user)
                );

            badge.textContent =
                `${name} · ${role}`;

        } catch (error) {

            console.warn(
                '[users-ui] Badge update failed:',
                error
            );
        }
    }

    /* =========================================================
       EVENTS
       ========================================================= */

    function bindEvents() {

        /* Add user */

        $('#add-user-btn')
            ?.addEventListener(
                'click',
                event => {

                    event.preventDefault();

                    if (!state.canManage) {

                        toast(
                            'ليس لديك صلاحية لإضافة مستخدمين',
                            'error'
                        );

                        return;
                    }

                    openUserModal();
                }
            );

        /* Form */

        $('#user-form')
            ?.addEventListener(
                'submit',
                handleSubmit
            );

        /* Modal */

        $('#cancel-btn')
            ?.addEventListener(
                'click',
                closeUserModal
            );

        $('#modal-close')
            ?.addEventListener(
                'click',
                closeUserModal
            );

        /* Delete */

        $('#confirm-yes')
            ?.addEventListener(
                'click',
                handleConfirmDelete
            );

        $('#confirm-no')
            ?.addEventListener(
                'click',
                closeConfirmDelete
            );

        /* Delegated actions */

        const delegatedAction =
            event => {

                const button =
                    event.target.closest?.(
                        '[data-action]'
                    );

                if (!button) {
                    return;
                }

                const action =
                    button.dataset.action;

                const id =
                    button.dataset.id;

                if (
                    action &&
                    id
                ) {

                    void handleAction(
                        action,
                        id
                    );
                }
            };

        $('#users-view-grid')
            ?.addEventListener(
                'click',
                delegatedAction
            );

        $('#users-tbody')
            ?.addEventListener(
                'click',
                delegatedAction
            );

        /* Search */

        $('#users-search')
            ?.addEventListener(
                'input',
                debounce(event => {

                    state.search =
                        event.target.value ||
                        '';

                    applyFilters();

                }, 250)
            );

        /* Filters */

        $('#filter-role')
            ?.addEventListener(
                'change',
                event => {

                    state.filterRole =
                        event.target.value ||
                        '';

                    applyFilters();
                }
            );

        $('#filter-status')
            ?.addEventListener(
                'change',
                event => {

                    state.filterStatus =
                        event.target.value ||
                        '';

                    applyFilters();
                }
            );

        /* View */

        $$('#view-toggle button')
            .forEach(button => {

                button.addEventListener(
                    'click',
                    () => {

                        setView(
                            button.dataset.view
                        );
                    }
                );
            });

        /* Logout */

        $('#logout-btn')
            ?.addEventListener(
                'click',
                async event => {

                    event.preventDefault();

                    try {

                        if (
                            USER &&
                            typeof USER.logout ===
                            'function'
                        ) {

                            await USER.logout();
                        }

                    } catch (error) {

                        console.warn(
                            '[users-ui] logout failed:',
                            error
                        );

                    } finally {

                        try {

                            localStorage.removeItem(
                                'medi_session'
                            );

                        } catch (_) {}

                        window.location.href =
                            'index.html';
                    }
                }
            );

        /* Keyboard */

        document.addEventListener(
            'keydown',
            event => {

                /* Escape */

                if (
                    event.key ===
                    'Escape'
                ) {

                    const confirmModal =
                        $('#confirm-modal');

                    const userModal =
                        $('#user-modal');

                    if (
                        confirmModal &&
                        !confirmModal.classList
                            .contains('hidden')
                    ) {

                        closeConfirmDelete();

                        return;
                    }

                    if (
                        userModal &&
                        !userModal.classList
                            .contains('hidden')
                    ) {

                        closeUserModal();

                        return;
                    }
                }

                /* Ctrl + K */

                if (
                    (
                        event.ctrlKey ||
                        event.metaKey
                    ) &&
                    event.key.toLowerCase() ===
                    'k'
                ) {

                    const target =
                        event.target;

                    const tag =
                        target?.tagName
                            ?.toLowerCase();

                    if (
                        tag === 'input' ||
                        tag === 'textarea' ||
                        target?.isContentEditable
                    ) {
                        return;
                    }

                    event.preventDefault();

                    const search =
                        $('#users-search');

                    search?.focus();
                    search?.select();
                }

            }
        );

        /* Click outside modal */

        $('#user-modal')
            ?.addEventListener(
                'mousedown',
                event => {

                    if (
                        event.target.id ===
                        'user-modal'
                    ) {

                        closeUserModal();
                    }
                }
            );

        $('#confirm-modal')
            ?.addEventListener(
                'mousedown',
                event => {

                    if (
                        event.target.id ===
                        'confirm-modal'
                    ) {

                        closeConfirmDelete();
                    }
                }
            );

        /* Clear errors */

        [

            'u-fullname',

            'u-username',

            'u-password',

            'u-email',

            'u-role',

            'u-phone'

        ].forEach(id => {

            const input =
                document.getElementById(id);

            input?.addEventListener(
                'input',
                () => {

                    const suffix =
                        id.replace(
                            /^u-/,
                            ''
                        );

                    const errorElement =
                        document.getElementById(
                            `err-${suffix}`
                        );

                    errorElement
                        ?.classList.remove(
                            'visible'
                        );

                    input.classList.remove(
                        'invalid'
                    );

                    input.removeAttribute(
                        'aria-invalid'
                    );
                }
            );
        });

        console.log(
            '✅ users-ui events bound'
        );
    }

    /* =========================================================
       INIT
       ========================================================= */

    async function init() {

        console.log(
            `🚀 users-ui.js v${VERSION} initializing...`
        );

        try {

            if (
                USER &&
                typeof USER.init ===
                'function'
            ) {

                await USER.init();
            }

            fillHospitals();

            await checkPermission();

            bindEvents();

            setView('grid');

            await updateUserBadge();

            await loadUsers();

            /* Public API */

            window.loadUsers =
                loadUsers;

            window.openUserModal =
                openUserModal;

            window.renderUsers =
                renderAll;

            window.usersUI = {

                version: VERSION,

                state,

                reload:
                    loadUsers,

                setView,

                openUserModal,

                closeUserModal

            };

            console.log(
                `✅ users-ui.js v${VERSION} ready`
            );

            console.log(
                `   - Loaded: ${state.users.length} users`
            );

            console.log(
                `   - canManage: ${state.canManage}`
            );

        } catch (error) {

            console.error(
                '❌ users-ui init failed:',
                error
            );

            toast(
                `فشل تهيئة صفحة المستخدمين: ${
                    error?.message ||
                    'خطأ غير معروف'
                }`,
                'error',
                6000
            );
        }
    }

    /* =========================================================
       START
       ========================================================= */

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            init,
            {
                once: true
            }
        );

    } else {

        void init();
    }

})(window, document);