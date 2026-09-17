/* ============================================================
 * MediPrescribe — User Management
 * users.js v5.0.0
 *
 * متوافق مع:
 *   - db.js v2.x
 *   - IndexedDB
 *   - localStorage fallback
 *   - Login / Logout
 *   - Roles / Permissions
 *   - users.html
 *   - Legacy APIs
 *
 * التخزين:
 *   settings -> key = "users"
 *
 * ملاحظات:
 *   - الحسابات الجديدة تستخدم PBKDF2-SHA256.
 *   - يدعم كلمات المرور القديمة مؤقتاً.
 *   - عند نجاح الدخول بحساب legacy يتم ترقيته تلقائياً.
 *   - هذا نظام محلي/PWA وليس بديلاً عن Backend حقيقي.
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

        PBKDF2_ITERATIONS:
            120000,

        PBKDF2_HASH:
            'SHA-256',

        PBKDF2_SALT_BYTES:
            16,

        MAX_FAILED_ATTEMPTS:
            5,

        LOCK_MINUTES:
            10

    });


    /* =========================================================
     * ROLES
     * ========================================================= */

    const ROLES = Object.freeze({

        ADMIN:
            'admin',

        DOCTOR:
            'doctor',

        PHARMACIST:
            'pharmacist',

        NURSE:
            'nurse',

        RECEPTIONIST:
            'receptionist'

    });


    const ROLE_LABELS = Object.freeze({

        admin:
            'مدير النظام',

        doctor:
            'طبيب',

        pharmacist:
            'صيدلي',

        nurse:
            'تمريض',

        receptionist:
            'استقبال'

    });


    /* =========================================================
     * ROLE PERMISSIONS
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


    function normalizeBoolean(value, fallback = true) {

        if (value === undefined || value === null) {
            return fallback;
        }

        if (typeof value === 'boolean') {
            return value;
        }

        if (
            value === 'false' ||
            value === '0' ||
            value === 'inactive' ||
            value === 'disabled'
        ) {
            return false;
        }

        return true;

    }


    function generateId() {

        if (
            window.crypto &&
            typeof window.crypto.randomUUID ===
            'function'
        ) {

            return (
                'USER-' +
                window.crypto.randomUUID()
            );

        }

        return (
            'USER-' +
            Date.now().toString(36) +
            '-' +
            Math.random()
                .toString(36)
                .slice(2, 12)
        );

    }


    function clone(value) {

        try {

            if (
                typeof structuredClone ===
                'function'
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


    function bytesToHex(bytes) {

        return Array.from(bytes)
            .map(
                byte =>
                    byte
                        .toString(16)
                        .padStart(2, '0')
            )
            .join('');

    }


    function hexToBytes(hex) {

        hex =
            String(hex || '');

        if (
            hex.length % 2 !== 0
        ) {

            throw new Error(
                'Salt غير صالح'
            );

        }

        const bytes =
            new Uint8Array(
                hex.length / 2
            );

        for (
            let i = 0;
            i < bytes.length;
            i++
        ) {

            bytes[i] =
                parseInt(
                    hex.slice(
                        i * 2,
                        i * 2 + 2
                    ),
                    16
                );

        }

        return bytes;

    }


    /* =========================================================
     * LEGACY SHA-256
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

            return bytesToHex(
                new Uint8Array(buffer)
            );

        }


        /*
         * Fallback compatibility فقط.
         * ليس hash تشفيرياً مناسباً للإنتاج.
         */

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
     * PBKDF2
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
            !window.crypto ||
            !window.crypto.subtle ||
            typeof window.crypto.getRandomValues !==
            'function'
        ) {

            return {

                algorithm:
                    'SHA-256',

                salt:
                    '',

                hash:
                    await legacyHashPassword(
                        password
                    )

            };

        }


        const saltBytes =
            new Uint8Array(
                CONFIG.PBKDF2_SALT_BYTES
            );


        window.crypto.getRandomValues(
            saltBytes
        );


        const salt =
            bytesToHex(
                saltBytes
            );


        return derivePBKDF2(
            password,
            salt
        );

    }


    async function derivePBKDF2(
        password,
        salt
    ) {

        const key =
            await window.crypto.subtle.importKey(

                'raw',

                new TextEncoder()
                    .encode(
                        String(password || '')
                    ),

                {
                    name:
                        'PBKDF2'
                },

                false,

                [
                    'deriveBits'
                ]

            );


        const bits =
            await window.crypto.subtle.deriveBits(

                {

                    name:
                        'PBKDF2',

                    salt:
                        hexToBytes(salt),

                    iterations:
                        CONFIG.PBKDF2_ITERATIONS,

                    hash:
                        CONFIG.PBKDF2_HASH

                },

                key,

                256

            );


        return {

            algorithm:
                'PBKDF2-SHA256',

            iterations:
                CONFIG.PBKDF2_ITERATIONS,

            salt:
                salt,

            hash:
                bytesToHex(
                    new Uint8Array(bits)
                )

        };

    }


    /* =========================================================
     * VERIFY PASSWORD
     *
     * يدعم:
     *   1. PBKDF2
     *   2. SHA-256 القديم
     *   3. plaintext القديم للتوافق فقط
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


            try {

                const key =
                    await window.crypto.subtle.importKey(

                        'raw',

                        new TextEncoder()
                            .encode(password),

                        {
                            name:
                                'PBKDF2'
                        },

                        false,

                        [
                            'deriveBits'
                        ]

                    );


                const bits =
                    await window.crypto.subtle.deriveBits(

                        {

                            name:
                                'PBKDF2',

                            salt:
                                hexToBytes(
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
                                CONFIG.PBKDF2_HASH

                        },

                        key,

                        256

                    );


                const hash =
                    bytesToHex(
                        new Uint8Array(bits)
                    );


                return (
                    hash ===
                    String(
                        stored.hash || ''
                    )
                );

            } catch (error) {

                console.warn(
                    'Password verification failed:',
                    error
                );

                return false;

            }

        }


        /*
         * SHA-256 أو plaintext قديم
         */

        if (
            typeof stored === 'string'
        ) {

            const legacyHash =
                await legacyHashPassword(
                    password
                );


            /*
             * SHA-256 legacy
             */

            if (
                legacyHash === stored
            ) {

                return true;

            }


            /*
             * plaintext legacy.
             *
             * يبقى للتوافق مع البيانات القديمة فقط.
             */

            return password === stored;

        }


        return false;

    }


    /* =========================================================
     * USER STORAGE
     * ========================================================= */

    async function getAllUsers() {

        const DB =
            getDB();


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

        const DB =
            getDB();


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
     * FIND
     * ========================================================= */

    async function findUser(username) {

        username =
            normalizeUsername(
                username
            );


        if (!username) {
            return null;
        }


        const DB =
            getDB();


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


        return (
            users.find(
                user =>
                    normalizeUsername(
                        user.username
                    ) === username
            ) || null
        );

    }


    async function findUserById(id) {

        if (!id) {
            return null;
        }


        const users =
            await getAllUsers();


        return (
            users.find(
                user =>
                    user.id === id
            ) || null
        );

    }


    /* =========================================================
     * VALIDATION
     * ========================================================= */

    function validateUsername(username) {

        username =
            normalizeUsername(
                username
            );


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
            !/^[a-z0-9._-]+$/i.test(
                username
            )
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
     * USER NORMALIZATION
     * ========================================================= */

    function normalizePermissions(
        permissions
    ) {

        if (
            !Array.isArray(permissions)
        ) {

            return [];

        }


        return [
            ...new Set(
                permissions
                    .map(
                        item =>
                            String(item || '')
                                .trim()
                    )
                    .filter(Boolean)
            )
        ];

    }


    function getEffectivePermissions(
        user
    ) {

        if (!user) {
            return [];
        }


        const role =
            normalizeRole(
                user.role
            );


        const rolePermissions =
            PERMISSIONS[role] || [];


        const custom =
            normalizePermissions(
                user.permissions
            );


        /*
         * إذا لم توجد صلاحيات مخصصة:
         * استخدم صلاحيات الدور.
         */

        if (!custom.length) {

            return [
                ...rolePermissions
            ];

        }


        if (
            rolePermissions.includes('*')
        ) {

            return [
                '*'
            ];

        }


        return [
            ...new Set([
                ...rolePermissions,
                ...custom
            ])
        ];

    }


    /* =========================================================
     * CREATE USER
     * ========================================================= */

    async function createUser(
        data = {}
    ) {

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
            await findUser(
                username
            );


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
                normalizeBoolean(
                    data.active,
                    true
                ),

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

            hospital:
                String(
                    data.hospital || ''
                )
                    .trim(),

            permissions:
                normalizePermissions(
                    data.permissions
                ),

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


        users.push(
            user
        );


        await saveAllUsers(
            users
        );


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


        return sanitizeUser(
            user
        );

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


        /* -----------------------------------------------------
         * Username
         * ----------------------------------------------------- */

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


        /* -----------------------------------------------------
         * Name
         * ----------------------------------------------------- */

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


        /* -----------------------------------------------------
         * Role
         * ----------------------------------------------------- */

        if (
            changes.role !==
            undefined
        ) {

            next.role =
                normalizeRole(
                    changes.role
                );

        }


        /* -----------------------------------------------------
         * Email
         * ----------------------------------------------------- */

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


        /* -----------------------------------------------------
         * Phone
         * ----------------------------------------------------- */

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


        /* -----------------------------------------------------
         * Hospital
         * ----------------------------------------------------- */

        if (
            changes.hospital !==
            undefined
        ) {

            next.hospital =
                String(
                    changes.hospital || ''
                )
                    .trim();

        }


        /* -----------------------------------------------------
         * Permissions
         * ----------------------------------------------------- */

        if (
            changes.permissions !==
            undefined
        ) {

            next.permissions =
                normalizePermissions(
                    changes.permissions
                );

        }


        /* -----------------------------------------------------
         * Active
         * ----------------------------------------------------- */

        if (
            changes.active !==
            undefined
        ) {

            const requestedActive =
                normalizeBoolean(
                    changes.active,
                    true
                );


            /*
             * منع تعطيل آخر مدير نشط.
             */

            if (
                requestedActive === false &&
                normalizeRole(
                    current.role
                ) === ROLES.ADMIN &&
                current.active !== false
            ) {

                const otherActiveAdmins =
                    users.filter(
                        user =>
                            user.id !== id &&
                            normalizeRole(
                                user.role
                            ) === ROLES.ADMIN &&
                            user.active !== false
                    ).length;


                if (
                    otherActiveAdmins === 0
                ) {

                    throw new Error(
                        'لا يمكن تعطيل آخر مدير نشط في النظام'
                    );

                }

            }


            next.active =
                requestedActive;

        }


        /* -----------------------------------------------------
         * Password
         * ----------------------------------------------------- */

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


            delete next.password;

        }


        next.updatedAt =
            nowISO();


        users[index] =
            next;


        await saveAllUsers(
            users
        );


        /*
         * تحديث الجلسة إذا كان المستخدم
         * المعدل هو المستخدم الحالي.
         */

        const session =
            getSession();


        if (
            session &&
            session.userId === id
        ) {

            session.username =
                next.username;

            session.name =
                next.name ||
                next.fullName ||
                next.username;

            session.role =
                normalizeRole(
                    next.role
                );


            if (
                next.active === false
            ) {

                clearSession();

            } else {

                saveSession(
                    session
                );

            }

        }


        await audit(
            'USER_UPDATED',
            {

                userId:
                    id,

                username:
                    next.username

            }
        );


        return sanitizeUser(
            next
        );

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
            normalizeRole(
                user.role
            ) === ROLES.ADMIN
        ) {

            const activeAdmins =
                remaining.filter(
                    item =>
                        normalizeRole(
                            item.role
                        ) === ROLES.ADMIN &&
                        item.active !== false
                ).length;


            if (
                activeAdmins === 0
            ) {

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
     * ACTIVE / INACTIVE
     * ========================================================= */

    async function setUserActive(
        id,
        active
    ) {

        return updateUser(
            id,
            {
                active:
                    normalizeBoolean(
                        active,
                        true
                    )
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

                success:
                    false,

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

                success:
                    false,

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

                success:
                    false,

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

                success:
                    false,

                message:
                    'الحساب مقفل مؤقتاً. حاول لاحقاً'

            };

        }


        const storedPassword =
            user.passwordHash ||
            user.password;


        const valid =
            await verifyPasswordHash(
                password,
                storedPassword
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

                success:
                    false,

                message:
                    'اسم المستخدم أو كلمة المرور غير صحيحة'

            };

        }


        /*
         * ترقية legacy password إلى PBKDF2.
         */

        if (
            typeof storedPassword ===
            'string'
        ) {

            try {

                const upgradedHash =
                    await createPasswordHash(
                        password
                    );


                user.passwordHash =
                    upgradedHash;

                delete user.password;

            } catch (error) {

                console.warn(
                    'تعذر ترقية كلمة المرور القديمة:',
                    error
                );

            }

        }


        /*
         * تحديث بيانات الدخول.
         */

        const users =
            await getAllUsers();


        const index =
            users.findIndex(
                item =>
                    item.id === user.id
            );


        if (index !== -1) {

            users[index] =
                clone(user);


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
                sanitizeUser(
                    user
                ),

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

    function saveSession(session) {

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


        /*
         * إذا تغير username أو role
         * نزامن الجلسة.
         */

        let changed =
            false;


        if (
            session.userId !==
            user.id
        ) {

            clearSession();

            return null;

        }


        const currentName =
            user.name ||
            user.fullName ||
            user.username;


        const currentRole =
            normalizeRole(
                user.role
            );


        if (
            session.username !==
            user.username
        ) {

            session.username =
                user.username;

            changed =
                true;

        }


        if (
            session.name !==
            currentName
        ) {

            session.name =
                currentName;

            changed =
                true;

        }


        if (
            session.role !==
            currentRole
        ) {

            session.role =
                currentRole;

            changed =
                true;

        }


        if (changed) {

            saveSession(
                session
            );

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


        const permissions =
            getEffectivePermissions(
                user
            );


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


    function getRoleLabel(role) {

        role =
            normalizeRole(
                role
            );


        return (
            ROLE_LABELS[role] ||
            'مستخدم'
        );

    }


    function getRolePermissions(role) {

        role =
            normalizeRole(
                role
            );


        return [
            ...(PERMISSIONS[role] || [])
        ];

    }


    /* =========================================================
     * SANITIZE
     * ========================================================= */

    function sanitizeUser(user) {

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
            normalizeRole(
                current.role
            ) !== ROLES.ADMIN
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
            .filter(
                user => {

                    const text = [

                        user.username,

                        user.name,

                        user.fullName,

                        user.email,

                        user.phone,

                        user.hospital,

                        user.role

                    ]
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();


                    return text.includes(
                        query
                    );

                }
            )
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


        /*
         * لا ننشئ Admin إذا كان هناك
         * مدير نشط بالفعل.
         */

        const hasActiveAdmin =
            users.some(
                user =>
                    normalizeRole(
                        user.role
                    ) === ROLES.ADMIN &&
                    user.active !== false
            );


        if (hasActiveAdmin) {
            return false;
        }


        /*
         * إذا كانت قاعدة البيانات تحتوي
         * على مستخدمين ولكن لا يوجد Admin،
         * لا ننشئ حساباً تلقائياً فوق
         * بيانات موجودة.
         *
         * هذا يمنع تغيير صلاحيات نظام
         * قائم بشكل غير متوقع.
         */

        if (users.length > 0) {

            console.warn(
                'MediPrescribe: لا يوجد مدير نشط، ولم يتم إنشاء Admin تلقائياً لأن قاعدة المستخدمين تحتوي على بيانات.'
            );

            return false;

        }


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

            hospital:
                '',

            permissions:
                [],

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
            'MediPrescribe: تم إنشاء حساب Demo admin. يجب تغيير كلمة المرور الافتراضية.'
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
            validateUsername(
                user.username
            );


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
            normalizeBoolean(
                newUser.active,
                true
            );


        newUser.email =
            String(
                newUser.email || ''
            )
                .trim()
                .toLowerCase();


        newUser.phone =
            String(
                newUser.phone || ''
            )
                .trim();


        newUser.hospital =
            String(
                newUser.hospital || ''
            )
                .trim();


        newUser.permissions =
            normalizePermissions(
                newUser.permissions
            );


        /*
         * Legacy password:
         * تحويله إلى PBKDF2 قبل التخزين.
         */

        if (
            newUser.password
        ) {

            validatePassword(
                newUser.password
            );


            newUser.passwordHash =
                await createPasswordHash(
                    newUser.password
                );


            delete newUser.password;

        }


        /*
         * إذا لم توجد passwordHash
         * لا نحفظ حساباً بلا credential.
         */

        if (
            !newUser.passwordHash
        ) {

            throw new Error(
                'كلمة المرور مطلوبة'
            );

        }


        newUser.createdAt =
            newUser.createdAt ||
            nowISO();


        newUser.updatedAt =
            nowISO();


        newUser.lastLogin =
            newUser.lastLogin ||
            null;


        newUser.failedLoginAttempts =
            Number(
                newUser.failedLoginAttempts || 0
            );


        newUser.lockedUntil =
            newUser.lockedUntil ||
            null;


        users.push(
            newUser
        );


        await saveAllUsers(
            users
        );


        await audit(
            'USER_CREATED',
            {

                userId:
                    newUser.id,

                username:
                    newUser.username,

                role:
                    newUser.role

            }
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

    let initialized =
        false;

    let initializationPromise =
        null;


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
                     * انتظار DB.
                     */

                    if (
                        typeof window.initDB ===
                        'function'
                    ) {

                        await window.initDB();

                    }


                    /*
                     * إنشاء Demo Admin
                     * فقط عند قاعدة مستخدمين فارغة.
                     */

                    await ensureAdminUser();


                    /*
                     * تحديث الواجهة.
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
                        '✅ MediPrescribe users.js v5.0.0 جاهز'
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
            '5.0.0',

        CONFIG,

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

        getEffectivePermissions,

        changePassword,

        adminResetPassword,

        updateUI:
            updateUserUI,

        createPasswordHash,

        verifyPassword:
            verifyPasswordHash,

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
     */

    window.getCurrentUser =
        getCurrentUser;


    window.hasPermission =
        hasPermission;


    window.getRoleLabel =
        getRoleLabel;


    window.hashPassword =
        legacyHashPassword;


    /*
     * مهم:
     * توحيد verifyPassword مع users.js
     */

    window.verifyPassword =
        verifyPasswordHash;


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
                once:
                    true
            }

        );

    } else {

        initUsers();

    }


})(window, document);
