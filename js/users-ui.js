/* =========================================================
 * MediPrescribe
 * users-ui.js
 * Version: 3.0.0
 *
 * إدارة المستخدمين + RBAC
 * متوافق مع users.html المرفق
 * ========================================================= */

(function (window, document) {
  "use strict";

  /* =========================================================
     CONFIG
     ========================================================= */

  const CONFIG = {
    apiWaitTimeout: 10000,
    apiWaitInterval: 100,
    debounceDelay: 250,
    toastDuration: 3500,
    minPasswordLength: 8,
    minFullNameLength: 3,
    minUsernameLength: 3
  };

  /* =========================================================
     STATE
     ========================================================= */

  const state = {
    users: [],
    filteredUsers: [],

    currentView: "grid",

    search: "",
    filterRole: "",
    filterStatus: "",

    pendingDeleteId: null,

    canManage: false,

    loading: false,
    initialized: false,
    eventsBound: false,

    requestId: 0
  };

  /* =========================================================
     DOM HELPERS
     ========================================================= */

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from(
      (root || document).querySelectorAll(selector)
    );
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function exists(id) {
    return Boolean(byId(id));
  }

  function getValue(id, fallback) {
    const el = byId(id);

    if (!el) {
      return fallback == null ? "" : fallback;
    }

    return el.value == null
      ? (fallback == null ? "" : fallback)
      : String(el.value);
  }

  function setValue(id, value) {
    const el = byId(id);

    if (!el) {
      return;
    }

    el.value =
      value == null
        ? ""
        : String(value);
  }

  function setText(id, value) {
    const el = byId(id);

    if (!el) {
      return;
    }

    el.textContent =
      value == null
        ? ""
        : String(value);
  }

  /* =========================================================
     SAFE HTML
     ========================================================= */

  function escapeHTML(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* =========================================================
     NORMALIZATION
     ========================================================= */

  function normalizeId(value) {
    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }

    return String(value).trim();
  }

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase();
  }

  function getUserId(user) {
    if (!user) {
      return "";
    }

    return normalizeId(
      user.id ??
      user.userId ??
      user._id
    );
  }

  function getUserName(user) {
    if (!user) {
      return "";
    }

    return (
      user.fullName ||
      user.name ||
      user.displayName ||
      user.username ||
      "بدون اسم"
    );
  }

  function getUsername(user) {
    return (
      user.username ||
      user.userName ||
      ""
    );
  }

  function getEmail(user) {
    return (
      user.email ||
      user.emailAddress ||
      ""
    );
  }

  function getPhone(user) {
    return (
      user.phone ||
      user.mobile ||
      user.phoneNumber ||
      ""
    );
  }

  function getRole(user) {
    return String(
      user && user.role
        ? user.role
        : ""
    ).toLowerCase();
  }

  /* =========================================================
     ROLE LABELS
     ========================================================= */

  const ROLE_LABELS = {
    admin: "مدير النظام",
    doctor: "طبيب",
    pharmacist: "صيدلي",
    nurse: "ممرض",
    receptionist: "استقبال"
  };

  const ROLE_ICONS = {
    admin: "👑",
    doctor: "🩺",
    pharmacist: "💊",
    nurse: "👩‍⚕️",
    receptionist: "📋"
  };

  function getRoleLabel(role) {
    const normalized = String(
      role || ""
    ).toLowerCase();

    if (
      window.User &&
      typeof window.User.getRoleLabel === "function"
    ) {
      try {
        const result =
          window.User.getRoleLabel(normalized);

        if (result) {
          return result;
        }
      } catch (_) {}
    }

    return (
      ROLE_LABELS[normalized] ||
      role ||
      "غير محدد"
    );
  }

  function getRoleIcon(role) {
    return (
      ROLE_ICONS[
        String(role || "").toLowerCase()
      ] ||
      "👤"
    );
  }

  /* =========================================================
     STATUS
     ========================================================= */

  function getUserStatus(user) {
    if (!user) {
      return "inactive";
    }

    const explicitStatus =
      String(
        user.status ||
        ""
      ).toLowerCase();

    if (
      explicitStatus === "suspended" ||
      user.suspended === true ||
      user.isSuspended === true
    ) {
      return "suspended";
    }

    if (
      explicitStatus === "inactive" ||
      explicitStatus === "disabled"
    ) {
      return "inactive";
    }

    if (
      explicitStatus === "active"
    ) {
      return "active";
    }

    if (
      user.active === false ||
      user.isActive === false
    ) {
      return "inactive";
    }

    return "active";
  }

  function isUserActive(user) {
    return getUserStatus(user) === "active";
  }

  function getStatusLabel(status) {
    switch (status) {
      case "active":
        return "نشط";

      case "suspended":
        return "موقوف";

      case "inactive":
        return "غير نشط";

      default:
        return "غير محدد";
    }
  }

  /* =========================================================
     DATE
     ========================================================= */

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    try {
      const date =
        value instanceof Date
          ? value
          : new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "—";
      }

      return new Intl.DateTimeFormat(
        "ar-SA",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }
      ).format(date);

    } catch (_) {
      return "—";
    }
  }

  /* =========================================================
     INITIALS
     ========================================================= */

  function getInitials(user) {
    const name =
      getUserName(user).trim();

    if (!name) {
      return "؟";
    }

    const parts =
      name
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length === 1) {
      return parts[0].slice(0, 2);
    }

    return (
      parts[0].charAt(0) +
      parts[parts.length - 1].charAt(0)
    );
  }

  /* =========================================================
     TOAST
     ========================================================= */

  function showToast(
    message,
    type,
    duration
  ) {
    const box =
      byId("toast-box");

    if (!box) {
      console[type === "error" ? "error" : "log"](
        "MediPrescribe:",
        message
      );
      return;
    }

    const toast =
      document.createElement("div");

    toast.className =
      "toast " +
      (
        type ||
        "success"
      );

    toast.setAttribute(
      "role",
      "alert"
    );

    toast.textContent =
      String(message || "");

    box.appendChild(toast);

    window.setTimeout(
      function () {
        if (toast.parentNode) {
          toast.remove();
        }
      },
      duration ||
      CONFIG.toastDuration
    );
  }

  /* =========================================================
     DEBOUNCE
     ========================================================= */

  function debounce(
    callback,
    delay
  ) {
    let timer = null;

    return function () {
      const context = this;
      const args = arguments;

      clearTimeout(timer);

      timer = setTimeout(
        function () {
          callback.apply(
            context,
            args
          );
        },
        delay
      );
    };
  }

  /* =========================================================
     USER API
     ========================================================= */

  function hasRequiredUserAPI() {
    return Boolean(
      window.User &&
      typeof window.User.getAllUsers ===
        "function"
    );
  }

  async function waitForUserAPI() {
    if (hasRequiredUserAPI()) {
      return window.User;
    }

    const started =
      Date.now();

    while (
      Date.now() - started <
      CONFIG.apiWaitTimeout
    ) {
      await new Promise(
        function (resolve) {
          setTimeout(
            resolve,
            CONFIG.apiWaitInterval
          );
        }
      );

      if (hasRequiredUserAPI()) {
        return window.User;
      }
    }

    throw new Error(
      "لم يتم تحميل users.js أو User API."
    );
  }

  async function initializeUserAPI() {
    const api =
      await waitForUserAPI();

    if (
      typeof api.init ===
      "function"
    ) {
      try {
        await api.init();
      } catch (error) {
        console.error(
          "MediPrescribe: User.init failed",
          error
        );

        /*
         * إذا كان init موجوداً وفشل،
         * نوقف التحميل حتى لا تظهر أخطاء
         * مضللة لاحقاً.
         */
        throw error;
      }
    }

    return api;
  }

  /* =========================================================
     API CALL HELPER
     ========================================================= */

  async function callAPI(
    method,
    ...args
  ) {
    if (
      !window.User ||
      typeof window.User[method] !==
        "function"
    ) {
      throw new Error(
        "الدالة User." +
        method +
        " غير متوفرة."
      );
    }

    return await window.User[method](
      ...args
    );
  }

  /* =========================================================
     EXTRACT USERS
     ========================================================= */

  function extractUsers(result) {
    if (Array.isArray(result)) {
      return result;
    }

    if (
      result &&
      Array.isArray(result.users)
    ) {
      return result.users;
    }

    if (
      result &&
      Array.isArray(result.data)
    ) {
      return result.data;
    }

    if (
      result &&
      Array.isArray(result.items)
    ) {
      return result.items;
    }

    return [];
  }

  /* =========================================================
     HOSPITALS
     ========================================================= */

  const DEFAULT_HOSPITALS = [
    {
      value: "",
      label: "— غير محدد —"
    },
    {
      value: "المستشفى الجمهوري",
      label: "المستشفى الجمهوري"
    },
    {
      value: "مستشفى الثورة",
      label: "مستشفى الثورة"
    },
    {
      value: "مستشفى الكويت",
      label: "مستشفى الكويت"
    },
    {
      value: "مستشفى السبعين",
      label: "مستشفى السبعين"
    },
    {
      value: "مستشفى خاص",
      label: "منشأة صحية خاصة"
    }
  ];

  function getHospitals() {
    if (
      window.HOSPITALS &&
      Array.isArray(window.HOSPITALS)
    ) {
      return window.HOSPITALS;
    }

    if (
      window.hospitals &&
      Array.isArray(window.hospitals)
    ) {
      return window.hospitals;
    }

    if (
      window.User &&
      Array.isArray(window.User.hospitals)
    ) {
      return window.User.hospitals;
    }

    return DEFAULT_HOSPITALS;
  }

  function populateHospitals(
    selectedValue
  ) {
    const select =
      byId("u-hospital");

    if (!select) {
      return;
    }

    const current =
      selectedValue !== undefined
        ? String(selectedValue || "")
        : String(select.value || "");

    select.innerHTML = "";

    const hospitals =
      getHospitals();

    hospitals.forEach(
      function (hospital) {
        let value = "";
        let label = "";

        if (
          typeof hospital === "string"
        ) {
          value = hospital;
          label = hospital;
        } else if (hospital) {
          value =
            hospital.value ??
            hospital.id ??
            hospital.name ??
            "";

          label =
            hospital.label ??
            hospital.name ??
            value;
        }

        const option =
          document.createElement("option");

        option.value =
          String(value || "");

        option.textContent =
          String(
            label ||
            "غير محدد"
          );

        select.appendChild(
          option
        );
      }
    );

    /*
     * إذا كانت قيمة المستخدم القديمة
     * غير موجودة في القائمة، نضيفها.
     */
    if (
      current &&
      !Array.from(
        select.options
      ).some(
        option =>
          option.value === current
      )
    ) {
      const option =
        document.createElement("option");

      option.value = current;
      option.textContent =
        current;

      select.appendChild(
        option
      );
    }

    select.value =
      current;
  }

  /* =========================================================
     PERMISSIONS
     ========================================================= */

  const PERMISSIONS = [
    {
      key: "users.manage",
      title: "إدارة المستخدمين",
      description:
        "إنشاء وتعديل وحذف المستخدمين"
    },
    {
      key: "dashboard.view",
      title: "لوحة التحكم",
      description:
        "الوصول إلى لوحة التحكم"
    },
    {
      key: "patients.view",
      title: "عرض المرضى",
      description:
        "مشاهدة سجلات المرضى"
    },
    {
      key: "patients.create",
      title: "إضافة مرضى",
      description:
        "إنشاء سجل مريض جديد"
    },
    {
      key: "patients.edit",
      title: "تعديل المرضى",
      description:
        "تعديل بيانات المرضى"
    },
    {
      key: "prescriptions.view",
      title: "عرض الوصفات",
      description:
        "مشاهدة الوصفات الطبية"
    },
    {
      key: "prescriptions.create",
      title: "إنشاء وصفات",
      description:
        "إنشاء وصفة طبية"
    },
    {
      key: "prescriptions.dispense",
      title: "صرف الوصفات",
      description:
        "صرف الأدوية من الوصفة"
    },
    {
      key: "medications.view",
      title: "عرض الأدوية",
      description:
        "الوصول إلى الأدوية"
    },
    {
      key: "bookings.view",
      title: "عرض المواعيد",
      description:
        "مشاهدة المواعيد"
    },
    {
      key: "bookings.create",
      title: "إنشاء المواعيد",
      description:
        "إنشاء موعد جديد"
    }
  ];

  function getUserPermissions(user) {
    if (!user) {
      return [];
    }

    const permissions =
      user.permissions ||
      user.permission ||
      [];

    if (!Array.isArray(permissions)) {
      return [];
    }

    return permissions.map(
      permission =>
        String(permission)
    );
  }

  function renderPermissions(
    selectedPermissions
  ) {
    const container =
      byId("permissions-grid");

    if (!container) {
      return;
    }

    const selected =
      new Set(
        Array.isArray(
          selectedPermissions
        )
          ? selectedPermissions.map(
              item => String(item)
            )
          : []
      );

    container.innerHTML =
      PERMISSIONS.map(
        function (permission) {
          const checked =
            selected.has(
              permission.key
            )
              ? " checked"
              : "";

          return `
            <label class="permission-item">
              <input
                type="checkbox"
                value="${escapeHTML(permission.key)}"
                data-permission="${escapeHTML(permission.key)}"
                ${checked}>
              <span>
                <span class="permission-title">
                  ${escapeHTML(permission.title)}
                </span>
                <span class="permission-description">
                  ${escapeHTML(permission.description)}
                </span>
              </span>
            </label>
          `;
        }
      ).join("");
  }

  function getSelectedPermissions() {
    return $$("#permissions-grid input[type='checkbox']:checked")
      .map(
        input =>
          String(
            input.value || ""
          ).trim()
      )
      .filter(Boolean);
  }

  /* =========================================================
     PERMISSION CHECK
     ========================================================= */

  async function checkPermission() {
    let allowed = false;

    try {
      if (
        window.User &&
        typeof window.User.isAdmin ===
          "function"
      ) {
        if (
          await window.User.isAdmin()
        ) {
          allowed = true;
        }
      }
    } catch (error) {
      console.warn(
        "MediPrescribe: isAdmin check failed",
        error
      );
    }

    if (!allowed) {
      try {
        if (
          window.User &&
          typeof window.User.hasPermission ===
            "function"
        ) {
          allowed =
            Boolean(
              await window.User.hasPermission(
                "users.manage"
              )
            );

          if (!allowed) {
            allowed =
              Boolean(
                await window.User.hasPermission(
                  "*"
                )
              );
          }
        }
      } catch (error) {
        console.warn(
          "MediPrescribe: permission check failed",
          error
        );
      }
    }

    state.canManage =
      Boolean(allowed);

    updatePermissionUI();

    return state.canManage;
  }

  function updatePermissionUI() {
    const alert =
      byId("permission-alert");

    if (alert) {
      alert.classList.toggle(
        "hidden",
        state.canManage
      );
    }

    const addButton =
      byId("add-user-btn");

    if (addButton) {
      addButton.disabled =
        !state.canManage;

      addButton.setAttribute(
        "aria-disabled",
        state.canManage
          ? "false"
          : "true"
      );

      if (!state.canManage) {
        addButton.title =
          "لا تملك صلاحية إدارة المستخدمين";
      } else {
        addButton.removeAttribute(
          "title"
        );
      }
    }
  }

  /* =========================================================
     STATS
     ========================================================= */

  function updateStats() {
    const roles = [
      "admin",
      "doctor",
      "pharmacist",
      "nurse",
      "receptionist"
    ];

    roles.forEach(
      function (role) {
        const count =
          state.users.filter(
            user =>
              getRole(user) === role
          ).length;

        setText(
          "count-" + role,
          count
        );
      }
    );
  }

  /* =========================================================
     FILTERS
     ========================================================= */

  function applyFilters() {
    const search =
      normalizeText(
        state.search
      );

    state.filteredUsers =
      state.users.filter(
        function (user) {
          const role =
            getRole(user);

          const status =
            getUserStatus(user);

          if (
            state.filterRole &&
            role !==
              state.filterRole
          ) {
            return false;
          }

          if (
            state.filterStatus &&
            status !==
              state.filterStatus
          ) {
            return false;
          }

          if (search) {
            const haystack =
              [
                getUserName(user),
                getUsername(user),
                getEmail(user),
                getPhone(user),
                user.hospital || "",
                getRoleLabel(role)
              ]
                .join(" ")
                .toLowerCase();

            if (
              !haystack.includes(
                search
              )
            ) {
              return false;
            }
          }

          return true;
        }
      );

    renderUsers();
  }

  /* =========================================================
     LOADING
     ========================================================= */

  function renderLoading() {
    const grid =
      byId("users-view-grid");

    const tbody =
      byId("users-tbody");

    if (grid) {
      grid.innerHTML = `
        <div class="users-empty">
          <div class="users-empty-icon">
            ⏳
          </div>

          <h3>
            جاري تحميل المستخدمين...
          </h3>

          <p>
            يرجى الانتظار قليلاً.
          </p>
        </div>
      `;
    }

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="7"
            style="text-align:center;padding:40px;">
            ⏳ جاري تحميل المستخدمين...
          </td>
        </tr>
      `;
    }
  }

  /* =========================================================
     ERROR STATE
     ========================================================= */

  function renderLoadError(error) {
    const message =
      error &&
      error.message
        ? error.message
        : "تعذر تحميل المستخدمين.";

    const grid =
      byId("users-view-grid");

    const tbody =
      byId("users-tbody");

    if (grid) {
      grid.innerHTML = `
        <div class="users-empty">
          <div class="users-empty-icon">
            ⚠️
          </div>

          <h3>
            فشل تحميل المستخدمين
          </h3>

          <p>
            ${escapeHTML(message)}
          </p>

          <button
            type="button"
            class="btn btn-gold"
            data-action="retry-load"
            style="margin-top:15px;">
            🔄 إعادة المحاولة
          </button>
        </div>
      `;
    }

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="7"
            style="text-align:center;padding:35px;">
            <div style="margin-bottom:12px;">
              ⚠️ فشل تحميل المستخدمين
            </div>

            <div
              style="
                color:var(--mp-text-muted);
                margin-bottom:15px;
              ">
              ${escapeHTML(message)}
            </div>

            <button
              type="button"
              class="btn btn-gold btn-sm"
              data-action="retry-load">
              🔄 إعادة المحاولة
            </button>
          </td>
        </tr>
      `;
    }
  }

  /* =========================================================
     EMPTY
     ========================================================= */

  function renderEmpty() {
    const grid =
      byId("users-view-grid");

    const tbody =
      byId("users-tbody");

    const hasFilters =
      Boolean(
        state.search ||
        state.filterRole ||
        state.filterStatus
      );

    if (grid) {
      grid.innerHTML = `
        <div class="users-empty">
          <div class="users-empty-icon">
            ${
              hasFilters
                ? "🔎"
                : "👥"
            }
          </div>

          <h3>
            ${
              hasFilters
                ? "لا توجد نتائج"
                : "لا يوجد مستخدمون"
            }
          </h3>

          <p>
            ${
              hasFilters
                ? "لم يتم العثور على مستخدم يطابق معايير البحث والفلترة."
                : "لم تتم إضافة أي مستخدمين بعد."
            }
          </p>

          ${
            hasFilters
              ? `
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  data-action="clear-filters"
                  style="margin-top:15px;">
                  مسح الفلاتر
                </button>
              `
              : ""
          }
        </div>
      `;
    }

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td
            colspan="7"
            style="
              text-align:center;
              padding:40px;
              color:var(--mp-text-muted);
            ">
            ${
              hasFilters
                ? "لا توجد نتائج مطابقة."
                : "لا يوجد مستخدمون."
            }
          </td>
        </tr>
      `;
    }
  }

  /* =========================================================
     GRID RENDER
     ========================================================= */

  function renderGrid() {
    const grid =
      byId("users-view-grid");

    if (!grid) {
      return;
    }

    if (
      state.filteredUsers.length ===
      0
    ) {
      renderEmpty();
      return;
    }

    grid.innerHTML =
      state.filteredUsers
        .map(
          function (user) {
            const id =
              getUserId(user);

            const name =
              getUserName(user);

            const username =
              getUsername(user);

            const role =
              getRole(user);

            const roleLabel =
              getRoleLabel(role);

            const hospital =
              user.hospital ||
              user.facility ||
              "—";

            const phone =
              getPhone(user) ||
              "—";

            const email =
              getEmail(user) ||
              "—";

            const status =
              getUserStatus(user);

            const lastLogin =
              user.lastLogin ||
              user.lastLoginAt ||
              user.lastSeen;

            const actionButtons =
              state.canManage
                ? `
                  <div class="user-card-actions">

                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      data-action="edit"
                      data-id="${escapeHTML(id)}">

                      ✏️ تعديل

                    </button>

                    <button
                      type="button"
                      class="btn btn-danger btn-sm"
                      data-action="delete"
                      data-id="${escapeHTML(id)}">

                      🗑️ حذف

                    </button>

                  </div>
                `
                : "";

            return `
              <article
                class="user-card"
                data-user-id="${escapeHTML(id)}">

                <div class="user-card-header">

                  <div class="user-avatar">
                    ${escapeHTML(
                      getInitials(user)
                    )}
                  </div>

                  <div style="min-width:0;">

                    <h3 class="user-card-name">
                      ${escapeHTML(name)}
                    </h3>

                    <div class="user-card-username">
                      @${escapeHTML(username || "—")}
                    </div>

                    <div class="user-card-role">
                      ${escapeHTML(
                        getRoleIcon(role)
                      )}
                      &nbsp;
                      ${escapeHTML(roleLabel)}
                    </div>

                  </div>

                </div>

                <div class="user-info-list">

                  <div class="user-info-row">
                    <span class="user-info-label">
                      البريد
                    </span>

                    <span class="user-info-value">
                      ${escapeHTML(email)}
                    </span>
                  </div>

                  <div class="user-info-row">
                    <span class="user-info-label">
                      الهاتف
                    </span>

                    <span class="user-info-value">
                      ${escapeHTML(phone)}
                    </span>
                  </div>

                  <div class="user-info-row">
                    <span class="user-info-label">
                      المنشأة
                    </span>

                    <span class="user-info-value">
                      ${escapeHTML(hospital)}
                    </span>
                  </div>

                  <div class="user-info-row">
                    <span class="user-info-label">
                      الحالة
                    </span>

                    <span class="user-info-value">

                      <span
                        class="status-badge status-${escapeHTML(status)}">

                        ${escapeHTML(
                          getStatusLabel(status)
                        )}

                      </span>

                    </span>
                  </div>

                  <div class="user-info-row">
                    <span class="user-info-label">
                      آخر دخول
                    </span>

                    <span class="user-info-value">
                      ${escapeHTML(
                        formatDate(lastLogin)
                      )}
                    </span>
                  </div>

                </div>

                ${actionButtons}

              </article>
            `;
          }
        )
        .join("");
  }

  /* =========================================================
     TABLE RENDER
     ========================================================= */

  function renderTable() {
    const tbody =
      byId("users-tbody");

    if (!tbody) {
      return;
    }

    if (
      state.filteredUsers.length ===
      0
    ) {
      renderEmpty();
      return;
    }

    tbody.innerHTML =
      state.filteredUsers
        .map(
          function (user) {
            const id =
              getUserId(user);

            const name =
              getUserName(user);

            const username =
              getUsername(user);

            const role =
              getRole(user);

            const status =
              getUserStatus(user);

            const hospital =
              user.hospital ||
              user.facility ||
              "—";

            const phone =
              getPhone(user) ||
              "—";

            const lastLogin =
              user.lastLogin ||
              user.lastLoginAt ||
              user.lastSeen;

            const actions =
              state.canManage
                ? `
                  <div class="table-actions">

                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      data-action="edit"
                      data-id="${escapeHTML(id)}"
                      title="تعديل">

                      ✏️

                    </button>

                    <button
                      type="button"
                      class="btn btn-danger btn-sm"
                      data-action="delete"
                      data-id="${escapeHTML(id)}"
                      title="حذف">

                      🗑️

                    </button>

                  </div>
                `
                : "—";

            return `
              <tr data-user-id="${escapeHTML(id)}">

                <td>

                  <div class="table-user">

                    <div class="table-avatar">
                      ${escapeHTML(
                        getInitials(user)
                      )}
                    </div>

                    <div>

                      <div class="table-user-name">
                        ${escapeHTML(name)}
                      </div>

                      <div class="table-user-username">
                        @${escapeHTML(username || "—")}
                      </div>

                    </div>

                  </div>

                </td>

                <td>
                  ${escapeHTML(
                    getRoleIcon(role)
                  )}
                  ${escapeHTML(
                    getRoleLabel(role)
                  )}
                </td>

                <td>
                  ${escapeHTML(hospital)}
                </td>

                <td dir="ltr">
                  ${escapeHTML(phone)}
                </td>

                <td>

                  <span
                    class="status-badge status-${escapeHTML(status)}">

                    ${escapeHTML(
                      getStatusLabel(status)
                    )}

                  </span>

                </td>

                <td>
                  ${escapeHTML(
                    formatDate(lastLogin)
                  )}
                </td>

                <td>
                  ${actions}
                </td>

              </tr>
            `;
          }
        )
        .join("");
  }

  /* =========================================================
     RENDER ALL
     ========================================================= */

  function renderUsers() {
    updateStats();

    renderGrid();
    renderTable();

    setView(
      state.currentView,
      false
    );
  }

  /* =========================================================
     LOAD USERS
     ========================================================= */

  async function loadUsers(
    options
  ) {
    const opts =
      options || {};

    const currentRequest =
      ++state.requestId;

    if (
      !opts.silent
    ) {
      renderLoading();
    }

    state.loading = true;

    try {
      await waitForUserAPI();

      const result =
        await callAPI(
          "getAllUsers"
        );

      if (
        currentRequest !==
        state.requestId
      ) {
        return false;
      }

      state.users =
        extractUsers(result)
          .filter(Boolean)
          .map(
            function (user) {
              return {
                ...user
              };
            }
          );

      state.loading = false;

      applyFilters();

      return true;

    } catch (error) {
      state.loading = false;

      console.error(
        "MediPrescribe: loadUsers failed",
        error
      );

      renderLoadError(error);

      showToast(
        "فشل تحميل المستخدمين: " +
        (
          error &&
          error.message
            ? error.message
            : "خطأ غير معروف"
        ),
        "error"
      );

      return false;
    }
  }

  /* =========================================================
     MODAL
     ========================================================= */

  function openModal(id) {
    const modal =
      byId(id);

    if (!modal) {
      return;
    }

    modal.classList.remove(
      "hidden"
    );

    document.body.classList.add(
      "modal-open"
    );
  }

  function closeModal(id) {
    const modal =
      byId(id);

    if (!modal) {
      return;
    }

    modal.classList.add(
      "hidden"
    );

    const userModal =
      byId("user-modal");

    const confirmModal =
      byId("confirm-modal");

    const userOpen =
      userModal &&
      !userModal.classList.contains(
        "hidden"
      );

    const confirmOpen =
      confirmModal &&
      !confirmModal.classList.contains(
        "hidden"
      );

    if (
      !userOpen &&
      !confirmOpen
    ) {
      document.body.classList.remove(
        "modal-open"
      );
    }
  }

  function resetUserForm() {
    const form =
      byId("user-form");

    if (form) {
      form.reset();
    }

    setValue(
      "u-id",
      ""
    );

    populateHospitals(
      ""
    );

    renderPermissions(
      []
    );

    const password =
      byId("u-password");

    if (password) {
      password.required = true;
    }

    const hint =
      byId("pass-hint");

    if (hint) {
      hint.style.display =
        "none";
    }
  }

  /* =========================================================
     OPEN ADD
     ========================================================= */

  function openCreateUserModal() {
    if (!state.canManage) {
      showToast(
        "لا تملك صلاحية إدارة المستخدمين.",
        "warning"
      );
      return;
    }

    resetUserForm();

    setText(
      "modal-title",
      "➕ مستخدم جديد"
    );

    openModal(
      "user-modal"
    );

    window.setTimeout(
      function () {
        const fullname =
          byId("u-fullname");

        if (fullname) {
          fullname.focus();
        }
      },
      50
    );
  }

  /* =========================================================
     OPEN EDIT
     ========================================================= */

  function findUserById(id) {
    const normalized =
      normalizeId(id);

    return (
      state.users.find(
        function (user) {
          return (
            getUserId(user) ===
            normalized
          );
        }
      ) ||
      null
    );
  }

  function openUserModal(
    userOrId
  ) {
    if (!state.canManage) {
      showToast(
        "لا تملك صلاحية تعديل المستخدمين.",
        "warning"
      );
      return;
    }

    const user =
      typeof userOrId === "object"
        ? userOrId
        : findUserById(
            userOrId
          );

    if (!user) {
      showToast(
        "لم يتم العثور على المستخدم.",
        "error"
      );
      return;
    }

    setValue(
      "u-id",
      getUserId(user)
    );

    setValue(
      "u-fullname",
      user.fullName ||
      user.name ||
      ""
    );

    setValue(
      "u-username",
      getUsername(user)
    );

    setValue(
      "u-email",
      getEmail(user)
    );

    setValue(
      "u-role",
      getRole(user)
    );

    setValue(
      "u-phone",
      getPhone(user)
    );

    setValue(
      "u-status",
      getUserStatus(user)
    );

    populateHospitals(
      user.hospital ||
      user.facility ||
      ""
    );

    setValue(
      "u-password",
      ""
    );

    const password =
      byId("u-password");

    if (password) {
      password.required = false;
    }

    const hint =
      byId("pass-hint");

    if (hint) {
      hint.style.display =
        "block";
    }

    renderPermissions(
      getUserPermissions(user)
    );

    setText(
      "modal-title",
      "✏️ تعديل المستخدم"
    );

    openModal(
      "user-modal"
    );
  }

  /* =========================================================
     VALIDATION
     ========================================================= */

  function clearValidation() {
    $$(".input-dark").forEach(
      function (input) {
        input.classList.remove(
          "invalid"
        );

        input.removeAttribute(
          "aria-invalid"
        );
      }
    );
  }

  function invalidate(
    element,
    message
  ) {
    if (element) {
      element.classList.add(
        "invalid"
      );

      element.setAttribute(
        "aria-invalid",
        "true"
      );

      try {
        element.focus();
      } catch (_) {}
    }

    showToast(
      message,
      "error"
    );

    return false;
  }

  function validateForm() {
    clearValidation();

    const fullName =
      getValue(
        "u-fullname"
      ).trim();

    const username =
      getValue(
        "u-username"
      ).trim();

    const password =
      getValue(
        "u-password"
      );

    const email =
      getValue(
        "u-email"
      ).trim();

    const role =
      getValue(
        "u-role"
      ).trim();

    const phone =
      getValue(
        "u-phone"
      ).trim();

    const id =
      getValue(
        "u-id"
      ).trim();

    if (
      fullName.length <
      CONFIG.minFullNameLength
    ) {
      return invalidate(
        byId("u-fullname"),
        "يرجى إدخال الاسم الكامل."
      );
    }

    if (
      !new RegExp(
        "^[a-zA-Z0-9._-]{" +
        CONFIG.minUsernameLength +
        ",60}$"
      ).test(username)
    ) {
      return invalidate(
        byId("u-username"),
        "اسم المستخدم يجب أن يحتوي على أحرف إنجليزية أو أرقام أو . _ - فقط."
      );
    }

    if (!id) {
      if (
        password.length <
        CONFIG.minPasswordLength
      ) {
        return invalidate(
          byId("u-password"),
          "كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل."
        );
      }
    } else if (
      password &&
      password.length <
        CONFIG.minPasswordLength
    ) {
      return invalidate(
        byId("u-password"),
        "كلمة المرور الجديدة يجب أن تحتوي على 8 أحرف على الأقل."
      );
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      return invalidate(
        byId("u-email"),
        "صيغة البريد الإلكتروني غير صحيحة."
      );
    }

    if (!role) {
      return invalidate(
        byId("u-role"),
        "يرجى اختيار الدور."
      );
    }

    if (
      phone &&
      !/^[\d+\-\s()]{6,20}$/.test(
        phone
      )
    ) {
      return invalidate(
        byId("u-phone"),
        "رقم الهاتف غير صحيح."
      );
    }

    return true;
  }

  /* =========================================================
     BUILD USER DATA
     ========================================================= */

  function buildUserData() {
    const id =
      getValue(
        "u-id"
      ).trim();

    const password =
      getValue(
        "u-password"
      );

    const status =
      getValue(
        "u-status"
      ) || "active";

    const data = {
      name:
        getValue(
          "u-fullname"
        ).trim(),

      fullName:
        getValue(
          "u-fullname"
        ).trim(),

      username:
        getValue(
          "u-username"
        ).trim(),

      email:
        getValue(
          "u-email"
        ).trim(),

      role:
        getValue(
          "u-role"
        ).trim(),

      hospital:
        getValue(
          "u-hospital"
        ).trim(),

      phone:
        getValue(
          "u-phone"
        ).trim(),

      active:
        status === "active",

      status:
        status,

      suspended:
        status === "suspended",

      permissions:
        getSelectedPermissions()
    };

    if (password) {
      data.password =
        password;
    }

    if (id) {
      data.id = id;
    }

    return {
      id,
      data
    };
  }

  /* =========================================================
     SUBMIT
     ========================================================= */

  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    if (!state.canManage) {
      showToast(
        "لا تملك صلاحية إدارة المستخدمين.",
        "error"
      );
      return;
    }

    if (state.loading) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    const submitButton =
      event.target.querySelector(
        'button[type="submit"]'
      );

    if (
      submitButton &&
      submitButton.dataset.saving ===
        "true"
    ) {
      return;
    }

    if (submitButton) {
      submitButton.dataset.saving =
        "true";

      submitButton.disabled =
        true;

      submitButton.dataset.originalText =
        submitButton.innerHTML;

      submitButton.innerHTML =
        "⏳ جارٍ الحفظ...";
    }

    state.loading = true;

    try {
      await waitForUserAPI();

      const {
        id,
        data
      } =
        buildUserData();

      if (id) {
        await callAPI(
          "updateUser",
          id,
          data
        );

        showToast(
          "تم تحديث بيانات المستخدم بنجاح.",
          "success"
        );

      } else {
        await callAPI(
          "createUser",
          data
        );

        showToast(
          "تم إنشاء المستخدم بنجاح.",
          "success"
        );
      }

      closeModal(
        "user-modal"
      );

      await loadUsers({
        silent: true
      });

    } catch (error) {
      console.error(
        "MediPrescribe: save user failed",
        error
      );

      showToast(
        "فشل حفظ المستخدم: " +
        (
          error &&
          error.message
            ? error.message
            : "خطأ غير معروف"
        ),
        "error"
      );

    } finally {
      state.loading = false;

      if (submitButton) {
        submitButton.dataset.saving =
          "false";

        submitButton.disabled =
          false;

        submitButton.innerHTML =
          submitButton.dataset.originalText ||
          "💾 حفظ";
      }
    }
  }

  /* =========================================================
     DELETE
     ========================================================= */

  function openDeleteConfirm(
    id
  ) {
    if (!state.canManage) {
      showToast(
        "لا تملك صلاحية حذف المستخدمين.",
        "warning"
      );
      return;
    }

    const user =
      findUserById(id);

    if (!user) {
      showToast(
        "المستخدم غير موجود.",
        "error"
      );
      return;
    }

    state.pendingDeleteId =
      normalizeId(id);

    const name =
      getUserName(user);

    const text =
      byId("confirm-text");

    if (text) {
      text.textContent =
        "هل أنت متأكد من حذف المستخدم " +
        name +
        "؟ لا يمكن التراجع عن هذه العملية.";
    }

    openModal(
      "confirm-modal"
    );
  }

  async function confirmDelete() {
    if (!state.canManage) {
      closeModal(
        "confirm-modal"
      );
      return;
    }

    const id =
      normalizeId(
        state.pendingDeleteId
      );

    if (!id) {
      closeModal(
        "confirm-modal"
      );
      return;
    }

    const button =
      byId("confirm-yes");

    if (
      button &&
      button.dataset.deleting ===
        "true"
    ) {
      return;
    }

    if (button) {
      button.dataset.deleting =
        "true";

      button.disabled =
        true;

      button.dataset.originalText =
        button.innerHTML;

      button.innerHTML =
        "⏳ جارٍ الحذف...";
    }

    try {
      await waitForUserAPI();

      await callAPI(
        "deleteUser",
        id
      );

      showToast(
        "تم حذف المستخدم بنجاح.",
        "success"
      );

      state.pendingDeleteId =
        null;

      closeModal(
        "confirm-modal"
      );

      await loadUsers({
        silent: true
      });

    } catch (error) {
      console.error(
        "MediPrescribe: delete user failed",
        error
      );

      showToast(
        "فشل حذف المستخدم: " +
        (
          error &&
          error.message
            ? error.message
            : "خطأ غير معروف"
        ),
        "error"
      );

    } finally {
      if (button) {
        button.dataset.deleting =
          "false";

        button.disabled =
          false;

        button.innerHTML =
          button.dataset.originalText ||
          "🗑️ نعم، احذف";
      }
    }
  }

  /* =========================================================
     VIEW
     ========================================================= */

  function setView(
    view,
    saveState
  ) {
    const normalized =
      view === "table"
        ? "table"
        : "grid";

    state.currentView =
      normalized;

    const grid =
      byId("users-view-grid");

    const table =
      byId("users-view-table");

    if (grid) {
      grid.classList.toggle(
        "hidden",
        normalized !== "grid"
      );
    }

    if (table) {
      table.classList.toggle(
        "hidden",
        normalized !== "table"
      );
    }

    $$("#view-toggle button[data-view]")
      .forEach(
        function (button) {
          const active =
            button.dataset.view ===
            normalized;

          button.classList.toggle(
            "active",
            active
          );

          button.setAttribute(
            "aria-pressed",
            active
              ? "true"
              : "false"
          );
        }
      );

    if (saveState !== false) {
      try {
        localStorage.setItem(
          "mp_users_view",
          normalized
        );
      } catch (_) {}
    }
  }

  function restoreView() {
    let saved = "grid";

    try {
      saved =
        localStorage.getItem(
          "mp_users_view"
        ) || "grid";
    } catch (_) {}

    setView(
      saved === "table"
        ? "table"
        : "grid",
      false
    );
  }

  /* =========================================================
     FILTER CLEAR
     ========================================================= */

  function clearFilters() {
    state.search = "";
    state.filterRole = "";
    state.filterStatus = "";

    setValue(
      "users-search",
      ""
    );

    setValue(
      "filter-role",
      ""
    );

    setValue(
      "filter-status",
      ""
    );

    applyFilters();
  }

  /* =========================================================
     ACTION HANDLER
     ========================================================= */

  function handleAction(
    action,
    id
  ) {
    const normalized =
      normalizeId(id);

    switch (action) {
      case "edit":
        openUserModal(
          normalized
        );
        break;

      case "delete":
        openDeleteConfirm(
          normalized
        );
        break;

      case "retry-load":
        loadUsers();
        break;

      case "clear-filters":
        clearFilters();
        break;

      default:
        break;
    }
  }

  /* =========================================================
     EVENTS
     ========================================================= */

  function bindEvents() {
    if (state.eventsBound) {
      return;
    }

    state.eventsBound =
      true;

    /* Add */

    const addButton =
      byId("add-user-btn");

    if (addButton) {
      addButton.addEventListener(
        "click",
        openCreateUserModal
      );
    }

    /* Form */

    const form =
      byId("user-form");

    if (form) {
      form.addEventListener(
        "submit",
        handleSubmit
      );
    }

    /* Close */

    const closeButton =
      byId("modal-close");

    if (closeButton) {
      closeButton.addEventListener(
        "click",
        function () {
          closeModal(
            "user-modal"
          );
        }
      );
    }

    /* Cancel */

    const cancelButton =
      byId("cancel-btn");

    if (cancelButton) {
      cancelButton.addEventListener(
        "click",
        function () {
          closeModal(
            "user-modal"
          );
        }
      );
    }

    /* Confirm yes */

    const confirmYes =
      byId("confirm-yes");

    if (confirmYes) {
      confirmYes.addEventListener(
        "click",
        confirmDelete
      );
    }

    /* Confirm no */

    const confirmNo =
      byId("confirm-no");

    if (confirmNo) {
      confirmNo.addEventListener(
        "click",
        function () {
          state.pendingDeleteId =
            null;

          closeModal(
            "confirm-modal"
          );
        }
      );
    }

    /* Search */

    const search =
      byId("users-search");

    if (search) {
      search.addEventListener(
        "input",
        debounce(
          function () {
            state.search =
              this.value.trim();

            applyFilters();
          },
          CONFIG.debounceDelay
        )
      );
    }

    /* Role filter */

    const roleFilter =
      byId("filter-role");

    if (roleFilter) {
      roleFilter.addEventListener(
        "change",
        function () {
          state.filterRole =
            this.value;

          applyFilters();
        }
      );
    }

    /* Status filter */

    const statusFilter =
      byId("filter-status");

    if (statusFilter) {
      statusFilter.addEventListener(
        "change",
        function () {
          state.filterStatus =
            this.value;

          applyFilters();
        }
      );
    }

    /* View */

    const viewToggle =
      byId("view-toggle");

    if (viewToggle) {
      viewToggle.addEventListener(
        "click",
        function (event) {
          const button =
            event.target.closest(
              "button[data-view]"
            );

          if (!button) {
            return;
          }

          setView(
            button.dataset.view
          );
        }
      );
    }

    /* Delegated actions */

    document.addEventListener(
      "click",
      function (event) {
        const button =
          event.target.closest(
            "[data-action]"
          );

        if (!button) {
          return;
        }

        const action =
          button.dataset.action;

        const id =
          button.dataset.id ||
          "";

        handleAction(
          action,
          id
        );
      }
    );

    /* Keyboard */

    document.addEventListener(
      "keydown",
      function (event) {
        if (
          event.key === "Escape"
        ) {
          const confirmModal =
            byId("confirm-modal");

          const userModal =
            byId("user-modal");

          if (
            confirmModal &&
            !confirmModal.classList.contains(
              "hidden"
            )
          ) {
            closeModal(
              "confirm-modal"
            );
            return;
          }

          if (
            userModal &&
            !userModal.classList.contains(
              "hidden"
            )
          ) {
            closeModal(
              "user-modal"
            );
          }
        }

        if (
          (event.ctrlKey ||
            event.metaKey) &&
          event.key.toLowerCase() ===
            "k"
        ) {
          event.preventDefault();

          const search =
            byId("users-search");

          if (search) {
            search.focus();
            search.select();
          }
        }
      }
    );

    /* Click outside */

    $$(".modal").forEach(
      function (modal) {
        modal.addEventListener(
          "mousedown",
          function (event) {
            if (
              event.target !==
              modal
            ) {
              return;
            }

            if (
              modal.id ===
              "user-modal"
            ) {
              closeModal(
                "user-modal"
              );
            }

            if (
              modal.id ===
              "confirm-modal"
            ) {
              closeModal(
                "confirm-modal"
              );
            }
          }
        );
      }
    );

    /* Logout */

    const logout =
      byId("logout-btn");

    if (logout) {
      logout.addEventListener(
        "click",
        async function () {
          try {
            if (
              window.User &&
              typeof window.User.logout ===
                "function"
            ) {
              await window.User.logout();
            } else {
              try {
                localStorage.removeItem(
                  "currentUser"
                );

                localStorage.removeItem(
                  "mp_current_user"
                );

                sessionStorage.clear();
              } catch (_) {}
            }
          } catch (error) {
            console.error(
              "Logout failed:",
              error
            );
          }

          window.location.href =
            "index.html";
        }
      );
    }

    /* Phone */

    const phone =
      byId("u-phone");

    if (phone) {
      phone.addEventListener(
        "input",
        function () {
          this.value =
            this.value
              .replace(
                /[^\d+\-\s()]/g,
                ""
              )
              .slice(
                0,
                20
              );
        }
      );
    }

    /* Username */

    const username =
      byId("u-username");

    if (username) {
      username.addEventListener(
        "input",
        function () {
          this.value =
            this.value
              .replace(
                /\s+/g,
                ""
              )
              .slice(
                0,
                60
              );
        }
      );
    }

    /* Theme sync */

    window.addEventListener(
      "storage",
      function (event) {
        if (
          event.key ===
          "mp_theme"
        ) {
          applyTheme();
        }
      }
    );
  }

  /* =========================================================
     THEME
     ========================================================= */

  function applyTheme() {
    try {
      const theme =
        localStorage.getItem(
          "mp_theme"
        );

      document.documentElement.dataset.theme =
        theme === "light"
          ? "light"
          : "dark";

    } catch (_) {
      document.documentElement.dataset.theme =
        "dark";
    }
  }

  /* =========================================================
     CURRENT USER BADGE
     ========================================================= */

  async function updateUserBadge() {
    const badge =
      byId("user-badge");

    if (!badge) {
      return;
    }

    try {
      if (
        window.User &&
        typeof window.User.getCurrentUser ===
          "function"
      ) {
        const current =
          await window.User.getCurrentUser();

        if (current) {
          const name =
            getUserName(
              current
            );

          const role =
            getRoleLabel(
              getRole(current)
            );

          badge.textContent =
            name +
            " · " +
            role;

          return;
        }
      }
    } catch (error) {
      console.warn(
        "MediPrescribe: current user unavailable",
        error
      );
    }

    badge.textContent =
      "المستخدم الحالي";
  }

  /* =========================================================
     INIT
     ========================================================= */

  async function init() {
    if (state.initialized) {
      return;
    }

    state.initialized =
      true;

    applyTheme();

    bindEvents();

    restoreView();

    populateHospitals();

    renderPermissions([]);

    try {
      await initializeUserAPI();

      await checkPermission();

      await updateUserBadge();

      await loadUsers();

    } catch (error) {
      console.error(
        "MediPrescribe: users page initialization failed",
        error
      );

      const message =
        error &&
        error.message
          ? error.message
          : "تعذر تهيئة نظام المستخدمين.";

      renderLoadError(
        new Error(message)
      );

      showToast(
        message,
        "error"
      );
    }
  }

  /* =========================================================
     PUBLIC API
     ========================================================= */

  window.loadUsers =
    loadUsers;

  window.renderUsers =
    renderUsers;

  window.openUserModal =
    openUserModal;

  window.openCreateUserModal =
    openCreateUserModal;

  window.refreshUsersPage =
    function () {
      return loadUsers();
    };

  window.MediPrescribeUsersUI = {
    init,
    loadUsers,
    renderUsers,
    openUserModal,
    openCreateUserModal,
    clearFilters,
    state
  };

  /* =========================================================
     START
     ========================================================= */

  function start() {
    if (
      document.readyState ===
      "loading"
    ) {
      document.addEventListener(
        "DOMContentLoaded",
        init,
        {
          once: true
        }
      );
    } else {
      init();
    }
  }

  start();

})(window, document);
