/* ============================================================
 * MediPrescribe — User Management
 * users.js v4.0.0
 *
 * متوافق مع:
 *   - db.js v2.x
 *   - IndexedDB
 *   - localStorage fallback
 *   - Login / Logout
 *   - Roles / Permissions
 *   - الأكواد القديمة التي تستخدم:
 *       hashPassword()
 *       readUsersFromDB()
 *       addUserToDB()
 *       updateUserInDB()
 *
 * ملاحظة:
 * هذا نظام محلي/PWA. نظام طبي إنتاجي متعدد المستخدمين
 * يحتاج Backend ومصادقة حقيقية وتخزين كلمات مرور آمن.
 * ============================================================ */

'use strict';

(function (window, document) {

    /* =========================================================
     * CONFIG
     * ========================================================= */

    const CONFIG = Object.freeze({
        USERS_KEY: 'users',
        SESSION_KEY: 'medi_session',

        SESSION_TTL:
            8 * 60 * 60 * 1000,

        PBKDF2_ITERATIONS: 120000,
        PBKDF2_HASH: 'SHA-256',

        MAX_FAILED_ATTEMPTS: 5,
        LOCK_MINUTES: 10
    });


    /* =========================================================
     * ROLES
     * ========================================================= */

    const ROLES = Object.freeze({

        ADMIN: 'admin',
        DOCTOR: 'doctor',
        PHARMACIST: 'pharmacist',
        NURSE: 'nurse',
        RECEPTIONIST: 'receptionist'

    });


    const ROLE_LABELS = Object.freeze({

        admin: 'مدير النظام',
        doctor: 'طبيب',
        pharmacist: 'صيدلي',
        nurse: 'تمريض',
        receptionist: 'استقبال'

    });


    /* =========================================================
     * PERMISSIONS
     * ========================================================= */

    const PERMISSIONS = Object.freeze({

        admin: [
            '*'
        ],

        doctor: [
            'dashboard.view',

            'patients.view',
            'patients.create',
            'patients.edit',

            'prescriptions.view',
            'prescriptions.create',
            'prescriptions.edit',

            'bookings.view',
            'bookings.create',
            'bookings.edit'
        ],

        pharmacist: [
            'dashboard.view',

            'patients.view',

            'prescriptions.view',
            'prescriptions.dispense',

            'medications.view',
            'medications.create',
            'medications.edit'
        ],

        nurse: [
            'dashboard.view',

            'patients.view',
            'patients.create',
            'patients.edit',

            'bookings.view',
            'bookings.create',
            'bookings.edit'
        ],

        receptionist: [
            'dashboard.view',

            'patients.view',
            'patients.create',
            'patients.edit',

            'bookings.view',
            'bookings.create',
            'bookings.edit'
        ]

    });


    /* =========================================================
     * HELPERS
     * ========================================================= */

    function getDB() {

        if (!window.DB) {
            throw new Error(
                'DB غير متاح. تأكد من تحميل db.js قبل users.js'
            );
        }

        return window.DB;
    }


    function nowISO() {
        return new Date().toISOString();
    }


    function normalizeUsername(username) {

        return String(username || '')
            .trim()
            .toLowerCase();

    }


    function cleanName(name) {

        return String(name || '')
            .trim()
            .replace(/\s+/g, ' ');

    }


    function normalizeRole(role) {

        role =
            String(role || '')
                .trim()
                .toLowerCase();

        return ROLE_LABELS[role]
            ? role
            : ROLES.DOCTOR;
    }


    function generateId() {

        if (
            window.crypto &&
            typeof window.crypto.randomUUID === 'function'
        ) {

            return 'USER-' +
                window.crypto.randomUUID();

        }

        return 'USER-' +
            Date.now().toString(36) +
            '-' +
            Math.random()
                .toString(36)
                .slice(2, 12);

    }


    function clone(value) {

        try {

            if (
                typeof structuredClone === 'function'
            ) {
                return structuredClone(value);
            }

        } catch (_) {}

        try {

            return JSON.parse(
                JSON.stringify(value)
            );

        } catch (_) {

            return value;

        }
    }


    /* =========================================================
     * PASSWORD — LEGACY SHA-256
     *
     * مهم جداً:
     * hashPassword() القديم يجب أن يرجع String
     * حتى لا ينكسر users.js القديم.
     * ========================================================= */

    async function legacyHashPassword(password) {

        password =
            String(password || '');

        if (
            window.crypto &&
            window.crypto.subtle
        ) {

            const data =
                new TextEncoder()
                    .encode(password);

            const buffer =
                await window.crypto.subtle.digest(
                    'SHA-256',
                    data
                );

            return Array.from(
                new Uint8Array(buffer)
            )
                .map(byte =>
                    byte
                        .toString(16)
                        .padStart(2, '0')
                )
                .join('');

        }


        /* fallback */

        let hash = 0;

        for (
            let i = 0;
            i < password.length;
            i++
        ) {

            hash =
                ((hash << 5) - hash) +
                password.charCodeAt(i);

            hash |= 0;

        }

        return String(hash);
    }


    /* =========================================================
     * PASSWORD — MODERN PBKDF2
     * ========================================================= */

    async function createPasswordHash(password) {

        password =
            String(password || '');

        if (!password) {
            throw new Error(
                'كلمة المرور مطلوبة'
            );
        }


        if (
            window.crypto &&
            window.crypto.subtle &&
            typeof window.crypto.getRandomValues ===
            'function'
        ) {

            const saltBytes =
                new Uint8Array(16);

            window.crypto.getRandomValues(
                saltBytes
            );


            const salt =
                Array.from(saltBytes)
                    .map(byte =>
                        byte
                            .toString(16)
                            .padStart(2, '0')
                    )
                    .join('');


            const key =
                await window.crypto.subtle.importKey(
                    'raw',
                    new TextEncoder()
                        .encode(password),
                    {
                        name: 'PBKDF2'
                    },
                    false,
                    ['deriveBits']
                );


            const bits =
                await window.crypto.subtle.deriveBits(
                    {
                        name: 'PBKDF2',

                        salt:
                            new TextEncoder()
                                .encode(salt),

                        iterations:
                            CONFIG.PBKDF2_ITERATIONS,

                        hash:
                            CONFIG.PBKDF2_HASH
                    },

                    key,

                    256
                );


            const hash =
                Array.from(
                    new Uint8Array(bits)
                )
                    .map(byte =>
                        byte
                            .toString(16)
                            .padStart(2, '0')
                    )
                    .join('');


            return {

                algorithm:
                    'PBKDF2-SHA256',

                iterations:
                    CONFIG.PBKDF2_ITERATIONS,

                salt,

                hash

            };

        }


        return {

            algorithm:
                'SHA-256',

            salt: '',

            hash:
                await legacyHashPassword(
                    password
                )

        };

    }


    /* =========================================================
     * VERIFY PASSWORD
     * ========================================================= */

    async function verifyPasswordHash(
        password,
        stored
    ) {

        password =
            String(password || '');


        if (!stored) {
            return false;
        }


        /*
         * Password قديمة كنص
         */

        if (
            typeof stored === 'string'
        ) {

            const hash =
                await legacyHashPassword(
                    password
                );

            return (
                hash === stored ||
                password === stored
            );

        }


        /*
         * PBKDF2
         */

        if (
            typeof stored === 'object' &&
            stored.algorithm ===
            'PBKDF2-SHA256'
        ) {

            if (
                !window.crypto ||
                !window.crypto.subtle
            ) {
                return false;
            }


            const key =
                await window.crypto.subtle.importKey(
                    'raw',

                    new TextEncoder()
                        .encode(password),

                    {
                        name: 'PBKDF2'
                    },

                    false,

                    ['deriveBits']
                );


            const bits =
                await window.crypto.subtle.deriveBits(
                    {
                        name: 'PBKDF2',

                        salt:
                            new TextEncoder()
                                .encode(
                                    String(
                                        stored.salt || ''
                                    )
                                ),

                        iterations:
                            Number(
                                stored.iterations
                            ) ||
                            CONFIG.PBKDF2_ITERATIONS,

                        hash:
                            'SHA-256'
                    },

                    key,

                    256
                );


            const hash =
                Array.from(
                    new Uint8Array(bits)
                )
                    .map(byte =>
                        byte
                            .toString(16)
                            .padStart(2, '0')
                    )
                    .join('');


            return (
                hash ===
                String(stored.hash || '')
            );

        }


        return false;

    }


    /* =========================================================
     * USERS STORAGE
     *
     * مهم:
     * لا يوجد DB Store اسمه "users".
     *
     * users محفوظون في:
     * settings -> key = "users"
     * ========================================================= */

    async function getAllUsers() {

        const DB = getDB();


        if (
            typeof DB.getAllUsers ===
            'function'
        ) {

            const users =
                await DB.getAllUsers();

            return Array.isArray(users)
                ? users
                : [];

        }


        if (
            typeof DB.get ===
            'function'
        ) {

            const result =
                await DB.get(
                    'settings',
                    CONFIG.USERS_KEY
                );

            if (
                result &&
                Array.isArray(result.value)
            ) {

                return result.value;

            }

        }


        return [];

    }


    async function saveAllUsers(users) {

        const DB = getDB();

        users =
            Array.isArray(users)
                ? users
                : [];


        const cleanUsers =
            clone(users);


        if (
            typeof DB.saveAllUsers ===
            'function'
        ) {

            return DB.saveAllUsers(
                cleanUsers
            );

        }


        if (
            typeof DB.put ===
            'function'
        ) {

            return DB.put(
                'settings',
                {
                    key:
                        CONFIG.USERS_KEY,

                    value:
                        cleanUsers,

                    updatedAt:
                        nowISO()
                }
            );

        }


        throw new Error(
            'لا توجد آلية لحفظ المستخدمين في DB'
        );

    }


    /* =========================================================
     * FIND USER
     * ========================================================= */

    async function findUser(username) {

        username =
            normalizeUsername(username);

        if (!username) {
            return null;
        }


        const DB = getDB();


        if (
            typeof DB.getUserByUsername ===
            'function'
        ) {

            const user =
                await DB.getUserByUsername(
                    username
                );

            if (user) {
                return user;
            }

        }


        const users =
            await getAllUsers();


        return users.find(
            user =>
                normalizeUsername(
                    user.username
                ) === username
        ) || null;

    }


    async function findUserById(id) {

        if (!id) {
            return null;
        }


        const users =
            await getAllUsers();


        return users.find(
            user =>
                user.id === id
        ) || null;

    }


    /* =========================================================
     * VALIDATION
     * ========================================================= */

    function validateUsername(username) {

        username =
            normalizeUsername(username);


        if (!username) {
            throw new Error(
                'اسم المستخدم مطلوب'
            );
        }


        if (username.length < 3) {
            throw new Error(
                'اسم المستخدم يجب أن يحتوي على 3 أحرف على الأقل'
            );
        }


        if (username.length > 50) {
            throw new Error(
                'اسم المستخدم طويل جداً'
            );
        }


        if (
            !/^[a-z0-9._-]+$/i.test(username)
        ) {

            throw new Error(
                'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام و . _ - فقط'
            );

        }


        return username;

    }


    function validatePassword(
        password,
        required = true
    ) {

        password =
            String(password || '');


        if (
            !password &&
            !required
        ) {
            return;
        }


        if (!password) {
            throw new Error(
                'كلمة المرور مطلوبة'
            );
        }


        if (password.length < 6) {
            throw new Error(
                'كلمة المرور يجب أن تحتوي على 6 أحرف على الأقل'
            );
        }


        if (password.length > 128) {
            throw new Error(
                'كلمة المرور طويلة جداً'
            );
        }

    }


    /* =========================================================
     * CREATE USER
     * ========================================================= */

    async function createUser(data = {}) {

        const username =
            validateUsername(
                data.username
            );


        const name =
            cleanName(
                data.name ||
                data.fullName
            );


        if (!name) {
            throw new Error(
                'اسم المستخدم الكامل مطلوب'
            );
        }


        const role =
            normalizeRole(
                data.role
            );


        validatePassword(
            data.password
        );


        const existing =
            await findUser(username);


        if (existing) {
            throw new Error(
                'اسم المستخدم مستخدم بالفعل'
            );
        }


        const passwordHash =
            await createPasswordHash(
                data.password
            );


        const timestamp =
            nowISO();


        const user = {

            id:
                generateId(),

            username,

            name,

            fullName:
                name,

            role,

            active:
                data.active !== false,

            email:
                String(
                    data.email || ''
                )
                    .trim()
                    .toLowerCase(),

            phone:
                String(
                    data.phone || ''
                )
                    .trim(),

            passwordHash,

            createdAt:
                timestamp,

            updatedAt:
                timestamp,

            lastLogin:
                null,

            failedLoginAttempts:
                0,

            lockedUntil:
                null

        };


        const users =
            await getAllUsers();


        users.push(user);


        await saveAllUsers(users);


        await audit(
            'USER_CREATED',
            {
                userId:
                    user.id,

                username:
                    user.username,

                role:
                    user.role
            }
        );


        return sanitizeUser(user);

    }


    /* =========================================================
     * UPDATE USER
     * ========================================================= */

    async function updateUser(
        id,
        changes = {}
    ) {

        if (!id) {
            throw new Error(
                'معرف المستخدم مطلوب'
            );
        }


        const users =
            await getAllUsers();


        const index =
            users.findIndex(
                user =>
                    user.id === id
            );


        if (index === -1) {
            throw new Error(
                'المستخدم غير موجود'
            );
        }


        const current =
            users[index];


        const next =
            clone(current);


        /*
         * Username
         */

        if (
            changes.username !==
            undefined
        ) {

            const username =
                validateUsername(
                    changes.username
                );


            if (
                username !==
                normalizeUsername(
                    current.username
                )
            ) {

                const duplicate =
                    users.find(
                        user =>
                            user.id !== id &&
                            normalizeUsername(
                                user.username
                            ) === username
                    );


                if (duplicate) {
                    throw new Error(
                        'اسم المستخدم مستخدم بالفعل'
                    );
                }

            }


            next.username =
                username;

        }


        /*
         * Name
         */

        if (
            changes.name !==
            undefined ||
            changes.fullName !==
            undefined
        ) {

            const name =
                cleanName(
                    changes.name !==
                    undefined
                        ? changes.name
                        : changes.fullName
                );


            if (!name) {
                throw new Error(
                    'اسم المستخدم الكامل مطلوب'
                );
            }


            next.name =
                name;

            next.fullName =
                name;

        }


        /*
         * Role
         */

        if (
            changes.role !==
            undefined
        ) {

            next.role =
                normalizeRole(
                    changes.role
                );

        }


        /*
         * Email
         */

        if (
            changes.email !==
            undefined
        ) {

            next.email =
                String(
                    changes.email || ''
                )
                    .trim()
                    .toLowerCase();

        }


        /*
         * Phone
         */

        if (
            changes.phone !==
            undefined
        ) {

            next.phone =
                String(
                    changes.phone || ''
                )
                    .trim();

        }


        /*
         * Active
         */

        if (
            changes.active !==
            undefined
        ) {

            next.active =
                Boolean(
                    changes.active
                );

        }


        /*
         * Password
         */

        if (
            changes.password !==
            undefined &&
            String(
                changes.password || ''
            ).length
        ) {

            validatePassword(
                changes.password
            );


            next.passwordHash =
                await createPasswordHash(
                    changes.password
                );

        }


        next.updatedAt =
            nowISO();


        users[index] =
            next;


        await saveAllUsers(users);


        await audit(
            'USER_UPDATED',
            {
                userId:
                    id,

                username:
                    next.username
            }
        );


        return sanitizeUser(next);

    }


    /* =========================================================
     * DELETE USER
     * ========================================================= */

    async function deleteUser(id) {

        if (!id) {
            throw new Error(
                'معرف المستخدم مطلوب'
            );
        }


        const current =
            await getCurrentUser();


        if (
            current &&
            current.id === id
        ) {

            throw new Error(
                'لا يمكن حذف المستخدم المسجل دخوله حالياً'
            );

        }


        const users =
            await getAllUsers();


        const user =
            users.find(
                item =>
                    item.id === id
            );


        if (!user) {
            throw new Error(
                'المستخدم غير موجود'
            );
        }


        const remaining =
            users.filter(
                item =>
                    item.id !== id
            );


        /*
         * منع حذف آخر مدير نشط.
         */

        if (
            user.role ===
            ROLES.ADMIN
        ) {

            const activeAdmins =
                remaining.filter(
                    item =>
                        item.role ===
                        ROLES.ADMIN &&
                        item.active !== false
                ).length;


            if (activeAdmins === 0) {

                throw new Error(
                    'لا يمكن حذف آخر مدير نشط في النظام'
                );

            }

        }


        await saveAllUsers(
            remaining
        );


        await audit(
            'USER_DELETED',
            {
                userId:
                    id,

                username:
                    user.username
            }
        );


        return true;

    }


    /* =========================================================
     * ACTIVATE / DEACTIVATE
     * ========================================================= */

    async function setUserActive(
        id,
        active
    ) {

        return updateUser(
            id,
            {
                active:
                    Boolean(active)
            }
        );

    }


    /* =========================================================
     * LOGIN
     * ========================================================= */

    async function login(
        username,
        password
    ) {

        username =
            normalizeUsername(
                username
            );


        password =
            String(password || '');


        if (
            !username ||
            !password
        ) {

            return {
                success: false,
                message:
                    'أدخل اسم المستخدم وكلمة المرور'
            };

        }


        const user =
            await findUser(
                username
            );


        if (!user) {

            await audit(
                'LOGIN_FAILED',
                {
                    username,
                    reason:
                        'USER_NOT_FOUND'
                }
            );


            return {
                success: false,
                message:
                    'اسم المستخدم أو كلمة المرور غير صحيحة'
            };

        }


        /*
         * الحساب غير نشط
         */

        if (
            user.active === false
        ) {

            return {
                success: false,
                message:
                    'هذا الحساب غير نشط'
            };

        }


        /*
         * الحساب مقفل
         */

        if (
            user.lockedUntil &&
            new Date(
                user.lockedUntil
            ).getTime() >
            Date.now()
        ) {

            return {
                success: false,
                message:
                    'الحساب مقفل مؤقتاً. حاول لاحقاً'
            };

        }


        const valid =
            await verifyPasswordHash(
                password,

                user.passwordHash ||
                user.password
            );


        if (!valid) {

            await registerFailedLogin(
                user.id
            );


            await audit(
                'LOGIN_FAILED',
                {
                    username,
                    reason:
                        'INVALID_PASSWORD'
                }
            );


            return {
                success: false,
                message:
                    'اسم المستخدم أو كلمة المرور غير صحيحة'
            };

        }


        /*
         * تسجيل الدخول ناجح
         */

        const users =
            await getAllUsers();


        const index =
            users.findIndex(
                item =>
                    item.id === user.id
            );


        if (index !== -1) {

            users[index].lastLogin =
                nowISO();

            users[index].failedLoginAttempts =
                0;

            users[index].lockedUntil =
                null;

            users[index].updatedAt =
                nowISO();


            await saveAllUsers(
                users
            );

        }


        const session = {

            id:
                generateId(),

            userId:
                user.id,

            username:
                user.username,

            name:
                user.name ||
                user.fullName ||
                user.username,

            role:
                normalizeRole(
                    user.role
                ),

            loginAt:
                nowISO(),

            expiresAt:
                new Date(
                    Date.now() +
                    CONFIG.SESSION_TTL
                ).toISOString()

        };


        saveSession(
            session
        );


        await audit(
            'LOGIN_SUCCESS',
            {
                userId:
                    user.id,

                username:
                    user.username,

                role:
                    user.role
            }
        );


        return {

            success:
                true,

            user:
                sanitizeUser(user),

            session

        };

    }


    /* =========================================================
     * FAILED LOGIN
     * ========================================================= */

    async function registerFailedLogin(
        userId
    ) {

        const users =
            await getAllUsers();


        const index =
            users.findIndex(
                item =>
                    item.id === userId
            );


        if (index === -1) {
            return;
        }


        const user =
            users[index];


        user.failedLoginAttempts =
            Number(
                user.failedLoginAttempts || 0
            ) + 1;


        if (
            user.failedLoginAttempts >=
            CONFIG.MAX_FAILED_ATTEMPTS
        ) {

            user.lockedUntil =
                new Date(
                    Date.now() +
                    CONFIG.LOCK_MINUTES *
                    60 *
                    1000
                ).toISOString();


            user.failedLoginAttempts =
                0;

        }


        user.updatedAt =
            nowISO();


        await saveAllUsers(
            users
        );

    }


    /* =========================================================
     * SESSION
     * ========================================================= */

    function saveSession(
        session
    ) {

        try {

            localStorage.setItem(
                CONFIG.SESSION_KEY,

                JSON.stringify(
                    session
                )
            );

        } catch (error) {

            console.error(
                'تعذر حفظ جلسة المستخدم:',
                error
            );

        }

    }


    function getSession() {

        try {

            const raw =
                localStorage.getItem(
                    CONFIG.SESSION_KEY
                );


            if (!raw) {
                return null;
            }


            const session =
                JSON.parse(raw);


            if (
                !session ||
                !session.expiresAt
            ) {

                clearSession();

                return null;

            }


            if (
                new Date(
                    session.expiresAt
                ).getTime() <=
                Date.now()
            ) {

                clearSession();

                return null;

            }


            return session;

        } catch (_) {

            clearSession();

            return null;

        }

    }


    async function getCurrentUser() {

        const session =
            getSession();


        if (!session) {
            return null;
        }


        const user =
            await findUser(
                session.username
            );


        if (
            !user ||
            user.active === false
        ) {

            clearSession();

            return null;

        }


        return sanitizeUser(
            user
        );

    }


    function clearSession() {

        try {

            localStorage.removeItem(
                CONFIG.SESSION_KEY
            );

        } catch (_) {}

    }


    async function logout() {

        const user =
            await getCurrentUser();


        if (user) {

            await audit(
                'LOGOUT',
                {
                    userId:
                        user.id,

                    username:
                        user.username
                }
            );

        }


        clearSession();


        try {

            document.dispatchEvent(
                new CustomEvent(
                    'mediprescribe:logout'
                )
            );

        } catch (_) {}


        return true;

    }


    /* =========================================================
     * PERMISSIONS
     * ========================================================= */

    async function hasPermission(
        permission
    ) {

        if (!permission) {
            return false;
        }


        const user =
            await getCurrentUser();


        if (!user) {
            return false;
        }


        const role =
            normalizeRole(
                user.role
            );


        const permissions =
            PERMISSIONS[role] || [];


        return (
            permissions.includes('*') ||
            permissions.includes(
                permission
            )
        );

    }


    function hasPermissionSync(
        permission
    ) {

        if (!permission) {
            return false;
        }


        const session =
            getSession();


        if (!session) {
            return false;
        }


        const role =
            normalizeRole(
                session.role
            );


        const permissions =
            PERMISSIONS[role] || [];


        return (
            permissions.includes('*') ||
            permissions.includes(
                permission
            )
        );

    }


    function getRoleLabel(
        role
    ) {

        role =
            normalizeRole(role);


        return (
            ROLE_LABELS[role] ||
            'مستخدم'
        );

    }


    function getRolePermissions(
        role
    ) {

        role =
            normalizeRole(role);


        return [
            ...(PERMISSIONS[role] || [])
        ];

    }


    /* =========================================================
     * SANITIZE
     * ========================================================= */

    function sanitizeUser(
        user
    ) {

        if (!user) {
            return null;
        }


        const safe =
            clone(user);


        delete safe.password;
        delete safe.passwordHash;


        return safe;

    }


    /* =========================================================
     * AUDIT
     * ========================================================= */

    async function audit(
        action,
        details = {}
    ) {

        try {

            const DB =
                getDB();


            if (
                typeof DB.logAudit ===
                'function'
            ) {

                await DB.logAudit(
                    action,
                    details
                );

                return;

            }


            if (
                typeof window.logAudit ===
                'function'
            ) {

                await window.logAudit(
                    action,
                    details
                );

            }

        } catch (error) {

            /*
             * فشل Audit لا يمنع النظام
             * من إكمال عملية المستخدم.
             */

            console.warn(
                'Audit log failed:',
                error
            );

        }

    }


    /* =========================================================
     * CHANGE PASSWORD
     * ========================================================= */

    async function changePassword(
        currentPassword,
        newPassword
    ) {

        const session =
            getSession();


        if (!session) {
            throw new Error(
                'يجب تسجيل الدخول أولاً'
            );
        }


        validatePassword(
            newPassword
        );


        const user =
            await findUser(
                session.username
            );


        if (!user) {
            throw new Error(
                'المستخدم غير موجود'
            );
        }


        const valid =
            await verifyPasswordHash(
                currentPassword,

                user.passwordHash ||
                user.password
            );


        if (!valid) {
            throw new Error(
                'كلمة المرور الحالية غير صحيحة'
            );
        }


        await updateUser(
            user.id,
            {
                password:
                    newPassword
            }
        );


        await audit(
            'PASSWORD_CHANGED',
            {
                userId:
                    user.id,

                username:
                    user.username
            }
        );


        return true;

    }


    /* =========================================================
     * ADMIN RESET PASSWORD
     * ========================================================= */

    async function adminResetPassword(
        userId,
        newPassword
    ) {

        const current =
            await getCurrentUser();


        if (
            !current ||
            current.role !==
            ROLES.ADMIN
        ) {

            throw new Error(
                'ليس لديك صلاحية إعادة تعيين كلمة المرور'
            );

        }


        validatePassword(
            newPassword
        );


        const user =
            await findUserById(
                userId
            );


        if (!user) {
            throw new Error(
                'المستخدم غير موجود'
            );
        }


        await updateUser(
            userId,
            {
                password:
                    newPassword
            }
        );


        await audit(
            'ADMIN_PASSWORD_RESET',
            {
                targetUserId:
                    userId,

                targetUsername:
                    user.username
            }
        );


        return true;

    }


    /* =========================================================
     * SEARCH
     * ========================================================= */

    async function searchUsers(
        query = ''
    ) {

        query =
            String(query || '')
                .trim()
                .toLowerCase();


        const users =
            await getAllUsers();


        if (!query) {

            return users.map(
                sanitizeUser
            );

        }


        return users
            .filter(user => {

                const text = [

                    user.username,
                    user.name,
                    user.fullName,
                    user.email,
                    user.phone,
                    user.role

                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();


                return text.includes(
                    query
                );

            })
            .map(
                sanitizeUser
            );

    }


    /* =========================================================
     * STATS
     * ========================================================= */

    async function getUserStats() {

        const users =
            await getAllUsers();


        const stats = {

            total:
                users.length,

            active:
                users.filter(
                    user =>
                        user.active !== false
                ).length,

            inactive:
                users.filter(
                    user =>
                        user.active === false
                ).length,

            byRole: {}

        };


        Object.keys(
            ROLE_LABELS
        ).forEach(
            role => {

                stats.byRole[role] =
                    users.filter(
                        user =>
                            normalizeRole(
                                user.role
                            ) === role
                    ).length;

            }
        );


        return stats;

    }


    /* =========================================================
     * DEFAULT ADMIN
     * ========================================================= */

    async function ensureAdminUser() {

        const users =
            await getAllUsers();


        if (users.length > 0) {
            return false;
        }


        /*
         * حساب Demo فقط.
         */

        const passwordHash =
            await createPasswordHash(
                'admin123'
            );


        const timestamp =
            nowISO();


        const admin = {

            id:
                generateId(),

            username:
                'admin',

            name:
                'System Administrator',

            fullName:
                'System Administrator',

            role:
                ROLES.ADMIN,

            active:
                true,

            email:
                '',

            phone:
                '',

            passwordHash,

            createdAt:
                timestamp,

            updatedAt:
                timestamp,

            lastLogin:
                null,

            failedLoginAttempts:
                0,

            lockedUntil:
                null

        };


        await saveAllUsers(
            [admin]
        );


        console.warn(
            'MediPrescribe: تم إنشاء حساب Demo admin. كلمة المرور الافتراضية: admin123'
        );


        return true;

    }


    /* =========================================================
     * UPDATE UI
     * ========================================================= */

    async function updateUserUI() {

        const user =
            await getCurrentUser();


        document
            .querySelectorAll(
                '[data-current-user]'
            )
            .forEach(
                element => {

                    element.textContent =
                        user
                            ? (
                                user.name ||
                                user.fullName ||
                                user.username
                            )
                            : 'غير مسجل';

                }
            );


        document
            .querySelectorAll(
                '[data-current-role]'
            )
            .forEach(
                element => {

                    element.textContent =
                        user
                            ? getRoleLabel(
                                user.role
                            )
                            : '';

                }
            );


        const permissionElements =
            document.querySelectorAll(
                '[data-permission]'
            );


        for (
            const element of
            permissionElements
        ) {

            const permission =
                element.dataset.permission;


            const allowed =
                await hasPermission(
                    permission
                );


            element.hidden =
                !allowed;

        }


        return user;

    }


    /* =========================================================
     * REQUIRE LOGIN
     * ========================================================= */

    async function requireLogin() {

        const user =
            await getCurrentUser();


        if (user) {
            return user;
        }


        if (
            typeof window.showLoginScreen ===
            'function'
        ) {

            window.showLoginScreen();

        } else {

            document.dispatchEvent(
                new CustomEvent(
                    'mediprescribe:login-required'
                )
            );

        }


        return null;

    }


    /* =========================================================
     * LEGACY COMPATIBILITY
     *
     * هذه الدوال مهمة جداً لمنع:
     *
     * hashPassword is not defined
     *
     * وكذلك منع الكود القديم من محاولة:
     *
     * DB.all('users')
     *
     * ========================================================= */

    async function readUsersFromDB() {

        return getAllUsers();

    }


    async function addUserToDB(
        user
    ) {

        if (!user) {
            throw new Error(
                'بيانات المستخدم مطلوبة'
            );
        }


        const users =
            await getAllUsers();


        const username =
            normalizeUsername(
                user.username
            );


        if (!username) {
            throw new Error(
                'اسم المستخدم مطلوب'
            );
        }


        const duplicate =
            users.find(
                item =>
                    normalizeUsername(
                        item.username
                    ) === username
            );


        if (duplicate) {
            throw new Error(
                'اسم المستخدم مستخدم بالفعل'
            );
        }


        const newUser =
            clone(user);


        if (!newUser.id) {
            newUser.id =
                generateId();
        }


        newUser.username =
            username;


        newUser.name =
            cleanName(
                newUser.name ||
                newUser.fullName ||
                username
            );


        newUser.fullName =
            newUser.name;


        newUser.role =
            normalizeRole(
                newUser.role
            );


        newUser.active =
            newUser.active !== false;


        newUser.createdAt =
            newUser.createdAt ||
            nowISO();


        newUser.updatedAt =
            nowISO();


        users.push(
            newUser
        );


        await saveAllUsers(
            users
        );


        return sanitizeUser(
            newUser
        );

    }


    async function updateUserInDB(
        id,
        changes
    ) {

        return updateUser(
            id,
            changes
        );

    }


    /* =========================================================
     * INITIALIZATION
     * ========================================================= */

    let initialized = false;
    let initializationPromise = null;


    async function initUsers() {

        if (initialized) {
            return true;
        }


        if (initializationPromise) {
            return initializationPromise;
        }


        initializationPromise =
            (async function () {

                try {

                    /*
                     * انتظار DB
                     */

                    if (
                        typeof window.initDB ===
                        'function'
                    ) {

                        await window.initDB();

                    }


                    /*
                     * إنشاء Admin فقط إذا
                     * لم يكن هناك أي مستخدم.
                     */

                    await ensureAdminUser();


                    /*
                     * تحديث الواجهة
                     */

                    await updateUserUI();


                    initialized =
                        true;


                    document.dispatchEvent(
                        new CustomEvent(
                            'mediprescribe:users-ready'
                        )
                    );


                    console.log(
                        '✅ MediPrescribe users.js v4.0.0 جاهز'
                    );


                    return true;

                } catch (error) {

                    console.error(
                        '❌ MediPrescribe User initialization failed:',
                        error
                    );


                    document.dispatchEvent(
                        new CustomEvent(
                            'mediprescribe:users-error',
                            {
                                detail:
                                    error
                            }
                        )
                    );


                    return false;

                }

            })();


        try {

            return await initializationPromise;

        } finally {

            initializationPromise =
                null;

        }

    }


    /* =========================================================
     * PUBLIC API
     * ========================================================= */

    const UserAPI = {

        version:
            '4.0.0',

        ROLES,

        ROLE_LABELS,

        PERMISSIONS,

        init:
            initUsers,

        getAllUsers,

        getUserByUsername:
            findUser,

        getUserById:
            findUserById,

        createUser,

        updateUser,

        deleteUser,

        setUserActive,

        searchUsers,

        getUserStats,

        login,

        logout,

        getSession,

        getCurrentUser,

        requireLogin,

        hasPermission,

        hasPermissionSync,

        getRoleLabel,

        getRolePermissions,

        changePassword,

        adminResetPassword,

        updateUI:
            updateUserUI,

        /*
         * API الحديثة
         */

        createPasswordHash,

        verifyPassword:
            verifyPasswordHash,

        /*
         * Compatibility
         */

        hashPassword:
            legacyHashPassword,

        readUsersFromDB,

        addUserToDB,

        updateUserInDB

    };


    /* =========================================================
     * GLOBAL API
     * ========================================================= */

    window.User =
        UserAPI;


    /*
     * Compatibility globals
     *
     * مهم جداً:
     */

    window.getCurrentUser =
        getCurrentUser;


    window.hasPermission =
        hasPermission;


    window.getRoleLabel =
        getRoleLabel;


    /*
     * hashPassword القديم يرجع String
     */

    window.hashPassword =
        legacyHashPassword;


    /*
     * دوال users.js القديم
     */

    window.readUsersFromDB =
        readUsersFromDB;


    window.addUserToDB =
        addUserToDB;


    window.updateUserInDB =
        updateUserInDB;


    /* =========================================================
     * AUTO INIT
     * ========================================================= */

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',

            function () {

                initUsers();

            },

            {
                once: true
            }
        );

    } else {

        initUsers();

    }


})(window, document);
