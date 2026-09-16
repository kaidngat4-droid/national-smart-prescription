/* =========================================================
 * MediPrescribe - Database Layer
 * db.js v2.0.0
 *
 * Local database:
 *     IndexedDB
 *
 * Stores:
 *     patients
 *     prescriptions
 *     bookings
 *     audit
 *     medications
 *     settings
 *     meta
 *
 * Features:
 *     - IndexedDB
 *     - Transactions
 *     - Indexes
 *     - CRUD
 *     - Search
 *     - Audit
 *     - Backup / Restore
 *     - Migration
 *     - localStorage fallback
 *     - Safe IDs
 *     - Timestamps
 *     - Compatibility with existing MediPrescribe modules
 *
 * IMPORTANT:
 * This is a local client-side database layer.
 * It is NOT a replacement for a secure central server/database
 * for multi-device clinical production systems.
 * ========================================================= */

(() => {
  'use strict';


  /* =========================================================
   * 1. CONFIG
   * ========================================================= */

  const CONFIG = Object.freeze({

    version: '2.0.0',

    dbName: 'MediPrescribeDB',

    dbVersion: 2,

    fallbackPrefix:
      'MediPrescribeDB_Fallback_',

    maxAuditRecords: 10000,

    maxLocalRecordsPerStore: 5000,

    requestTimeoutMs: 15000,

    debug: false

  });


  /* =========================================================
   * 2. STORE DEFINITIONS
   * ========================================================= */

  const STORES = Object.freeze({

    patients: {

      keyPath: 'id',

      autoIncrement: false,

      indexes: {

        nationalId: {
          keyPath: 'nationalId',
          unique: false
        },

        phone: {
          keyPath: 'phone',
          unique: false
        },

        name: {
          keyPath: 'name',
          unique: false
        },

        createdAt: {
          keyPath: 'createdAt',
          unique: false
        },

        updatedAt: {
          keyPath: 'updatedAt',
          unique: false
        }

      }

    },


    prescriptions: {

      keyPath: 'id',

      autoIncrement: false,

      indexes: {

        rxNumber: {
          keyPath: 'rxNumber',
          unique: false
        },

        patientId: {
          keyPath: 'patientId',
          unique: false
        },

        doctorId: {
          keyPath: 'doctorId',
          unique: false
        },

        status: {
          keyPath: 'status',
          unique: false
        },

        createdAt: {
          keyPath: 'createdAt',
          unique: false
        },

        updatedAt: {
          keyPath: 'updatedAt',
          unique: false
        }

      }

    },


    bookings: {

      keyPath: 'id',

      autoIncrement: false,

      indexes: {

        bookingNumber: {
          keyPath: 'bookingNumber',
          unique: false
        },

        phone: {
          keyPath: 'phone',
          unique: false
        },

        department: {
          keyPath: 'department',
          unique: false
        },

        date: {
          keyPath: 'date',
          unique: false
        },

        status: {
          keyPath: 'status',
          unique: false
        },

        createdAt: {
          keyPath: 'createdAt',
          unique: false
        }

      }

    },


    audit: {

      keyPath: 'id',

      autoIncrement: false,

      indexes: {

        action: {
          keyPath: 'action',
          unique: false
        },

        userId: {
          keyPath: 'userId',
          unique: false
        },

        entityType: {
          keyPath: 'entityType',
          unique: false
        },

        entityId: {
          keyPath: 'entityId',
          unique: false
        },

        timestamp: {
          keyPath: 'timestamp',
          unique: false
        }

      }

    },


    medications: {

      keyPath: 'id',

      autoIncrement: false,

      indexes: {

        genericName: {
          keyPath: 'genericName',
          unique: false
        },

        brandName: {
          keyPath: 'brandName',
          unique: false
        },

        active: {
          keyPath: 'active',
          unique: false
        },

        updatedAt: {
          keyPath: 'updatedAt',
          unique: false
        }

      }

    },


    settings: {

      keyPath: 'key',

      autoIncrement: false,

      indexes: {

        updatedAt: {
          keyPath: 'updatedAt',
          unique: false
        }

      }

    },


    meta: {

      keyPath: 'key',

      autoIncrement: false,

      indexes: {}

    }

  });


  const STORE_NAMES =
    Object.freeze(
      Object.keys(STORES)
    );


  /* =========================================================
   * 3. STATE
   * ========================================================= */

  let db = null;

  let openingPromise = null;

  let initialized = false;

  let usingFallback = false;


  /* =========================================================
   * 4. LOGGING
   * ========================================================= */

  function debugLog(...args) {

    if (!CONFIG.debug) {
      return;
    }

    try {

      console.log(
        '[MediPrescribe DB]',
        ...args
      );

    } catch (_) {
      /* ignore */
    }

  }


  function errorLog(...args) {

    try {

      console.error(
        '[MediPrescribe DB]',
        ...args
      );

    } catch (_) {
      /* ignore */
    }

  }


  /* =========================================================
   * 5. SECURITY / UTILITY
   * ========================================================= */

  function cleanText(
    value,
    maxLength = 1000
  ) {

    let text =
      String(value ?? '')
        .replace(
          /[\u0000-\u001F\u007F]/g,
          ' '
        )
        .replace(
          /\s+/g,
          ' '
        )
        .trim();

    if (
      text.length > maxLength
    ) {

      text =
        text.slice(
          0,
          maxLength
        );

    }

    return text;

  }


  function createId(
    prefix = 'ID'
  ) {

    let random =
      Math.random()
        .toString(36)
        .slice(2, 12);

    try {

      if (
        window.crypto &&
        window.crypto.getRandomValues
      ) {

        const bytes =
          new Uint8Array(8);

        window.crypto.getRandomValues(
          bytes
        );

        random =
          Array.from(bytes)
            .map(
              byte =>
                byte
                  .toString(16)
                  .padStart(2, '0')
            )
            .join('');

      }

    } catch (_) {
      /* fallback */
    }

    return (
      `${prefix}-${Date.now()}-${random}`
    );

  }


  function nowISO() {

    return new Date().toISOString();

  }


  function clone(value) {

    if (
      value === undefined
    ) {

      return undefined;

    }

    try {

      if (
        typeof structuredClone ===
        'function'
      ) {

        return structuredClone(
          value
        );

      }

    } catch (_) {
      /* fallback */
    }

    try {

      return JSON.parse(
        JSON.stringify(value)
      );

    } catch (_) {

      return value;

    }

  }


  function normalizeStoreName(
    store
  ) {

    const name =
      cleanText(
        store,
        100
      );

    if (
      !STORE_NAMES.includes(name)
    ) {

      throw new Error(
        `Unknown database store: ${name}`
      );

    }

    return name;

  }


  /* =========================================================
   * 6. RECORD NORMALIZATION
   * ========================================================= */

  function normalizeRecord(
    store,
    data,
    options = {}
  ) {

    const current =
      nowISO();

    const input =
      clone(data) || {};

    const isUpdate =
      Boolean(
        options.isUpdate
      );

    const existingId =
      cleanText(
        input.id,
        200
      );

    const record = {
      ...input
    };


    if (!record.id) {

      record.id =
        createId(
          store.toUpperCase()
        );

    }


    if (
      isUpdate &&
      existingId
    ) {

      record.id =
        existingId;

    }


    if (!record.createdAt) {

      record.createdAt =
        current;

    }


    record.updatedAt =
      current;


    /*
     * Normalize common fields.
     */
    if (
      typeof record.name ===
      'string'
    ) {

      record.name =
        cleanText(
          record.name,
          200
        );

    }


    if (
      typeof record.phone ===
      'string'
    ) {

      record.phone =
        cleanText(
          record.phone,
          50
        );

    }


    if (
      typeof record.status ===
      'string'
    ) {

      record.status =
        cleanText(
          record.status,
          50
        );

    }


    return record;

  }


  /* =========================================================
   * 7. FALLBACK STORAGE
   * ========================================================= */

  function fallbackKey(
    store
  ) {

    return (
      CONFIG.fallbackPrefix +
      store
    );

  }


  function fallbackRead(
    store
  ) {

    try {

      const raw =
        localStorage.getItem(
          fallbackKey(store)
        );

      if (!raw) {
        return [];
      }

      const data =
        JSON.parse(raw);

      return Array.isArray(data)
        ? data
        : [];

    } catch (error) {

      errorLog(
        'Fallback read failed',
        error
      );

      return [];

    }

  }


  function fallbackWrite(
    store,
    records
  ) {

    try {

      const safe =
        Array.isArray(records)
          ? records.slice(
              -CONFIG.maxLocalRecordsPerStore
            )
          : [];

      localStorage.setItem(
        fallbackKey(store),
        JSON.stringify(safe)
      );

      return true;

    } catch (error) {

      errorLog(
        'Fallback write failed',
        error
      );

      return false;

    }

  }


  function fallbackFindIndex(
    records,
    id
  ) {

    return records.findIndex(
      record =>
        String(record.id) ===
        String(id)
    );

  }


  /* =========================================================
   * 8. OPEN DATABASE
   * ========================================================= */

  function open() {

    if (db) {

      return Promise.resolve(db);

    }


    if (openingPromise) {

      return openingPromise;

    }


    if (
      !window.indexedDB
    ) {

      usingFallback = true;

      initialized = true;

      return Promise.resolve(null);

    }


    openingPromise =
      new Promise(
        (resolve, reject) => {

          let request;

          try {

            request =
              indexedDB.open(
                CONFIG.dbName,
                CONFIG.dbVersion
              );

          } catch (error) {

            openingPromise = null;

            reject(error);

            return;

          }


          request.onupgradeneeded =
            event => {

              const database =
                event.target.result;

              createSchema(
                database
              );

            };


          request.onsuccess =
            event => {

              db =
                event.target.result;

              usingFallback = false;

              initialized = true;

              /*
               * If another tab upgrades/deletes
               * the database, close gracefully.
               */
              db.onversionchange =
                () => {

                  try {
                    db.close();
                  } catch (_) {
                    /* ignore */
                  }

                  db = null;

                };


              debugLog(
                'Database opened'
              );

              openingPromise = null;

              resolve(db);

            };


          request.onerror =
            event => {

              const error =
                event.target.error;

              openingPromise = null;

              errorLog(
                'IndexedDB open failed',
                error
              );

              /*
               * We do not silently lose data.
               * Fallback is only used when IDB is
               * unavailable.
               */
              usingFallback = true;

              initialized = true;

              resolve(null);

            };


          request.onblocked =
            () => {

              debugLog(
                'IndexedDB open blocked'
              );

            };

        }
      );


    return openingPromise;

  }


  /* =========================================================
   * 9. CREATE SCHEMA
   * ========================================================= */

  function createSchema(
    database
  ) {

    STORE_NAMES.forEach(
      storeName => {

        const definition =
          STORES[storeName];

        let objectStore;


        if (
          database.objectStoreNames
            .contains(storeName)
        ) {

          /*
           * Existing stores are handled
           * during upgrade.
           */
          objectStore =
            null;

        } else {

          objectStore =
            database.createObjectStore(
              storeName,
              {

                keyPath:
                  definition.keyPath,

                autoIncrement:
                  definition.autoIncrement

              }
            );

        }


        /*
         * Indexes can only be created when
         * we have the object store instance.
         *
         * For existing stores we attempt to
         * obtain it from the upgrade transaction.
         */
        if (!objectStore) {

          try {

            objectStore =
              database
                .transaction
                ? null
                : null;

          } catch (_) {
            /* ignore */
          }

        }


        if (
          objectStore &&
          definition.indexes
        ) {

          Object.entries(
            definition.indexes
          ).forEach(
            ([indexName, indexConfig]) => {

              try {

                objectStore.createIndex(
                  indexName,
                  indexConfig.keyPath,
                  {
                    unique:
                      Boolean(
                        indexConfig.unique
                      )
                  }
                );

              } catch (error) {

                debugLog(
                  `Index ${indexName} creation skipped`,
                  error
                );

              }

            }
          );

        }

      }
    );


    /*
     * The browser supplies the upgrade transaction
     * through the currently executing upgrade event.
     *
     * Existing stores need their missing indexes
     * added separately.
     */
    try {

      const transaction =
        database.transaction;

      if (
        transaction &&
        typeof transaction.objectStore ===
        'function'
      ) {

        STORE_NAMES.forEach(
          storeName => {

            try {

              const definition =
                STORES[storeName];

              const objectStore =
                transaction.objectStore(
                  storeName
                );

              Object.entries(
                definition.indexes || {}
              ).forEach(
                ([indexName, config]) => {

                  if (
                    !objectStore.indexNames
                      .contains(indexName)
                  ) {

                    objectStore.createIndex(
                      indexName,
                      config.keyPath,
                      {
                        unique:
                          Boolean(
                            config.unique
                          )
                      }
                    );

                  }

                }
              );

            } catch (error) {

              debugLog(
                `Schema migration skipped for ${storeName}`,
                error
              );

            }

          }
        );

      }

    } catch (_) {
      /* ignore */
    }

  }


  /* =========================================================
   * 10. ENSURE READY
   * ========================================================= */

  async function ensureReady() {

    await open();

    return {

      initialized,

      usingFallback,

      indexedDB:
        !usingFallback && Boolean(db)

    };

  }


  /* =========================================================
   * 11. TRANSACTION
   * ========================================================= */

  async function transaction(
    storeNames,
    mode,
    callback
  ) {

    const names =
      Array.isArray(storeNames)
        ? storeNames
        : [storeNames];

    names.forEach(
      normalizeStoreName
    );


    await ensureReady();


    /*
     * Fallback mode.
     */
    if (
      usingFallback ||
      !db
    ) {

      return callback(null);

    }


    return new Promise(
      (resolve, reject) => {

        let tx;

        try {

          tx =
            db.transaction(
              names,
              mode
            );

        } catch (error) {

          reject(error);

          return;

        }


        let callbackResult;

        try {

          callbackResult =
            callback(tx);

        } catch (error) {

          try {
            tx.abort();
          } catch (_) {
            /* ignore */
          }

          reject(error);

          return;

        }


        tx.oncomplete =
          () => {

            resolve(
              callbackResult
            );

          };


        tx.onerror =
          event => {

            reject(
              event.target.error ||
              new Error(
                'IndexedDB transaction failed'
              )
            );

          };


        tx.onabort =
          event => {

            reject(
              event.target.error ||
              new Error(
                'IndexedDB transaction aborted'
              )
            );

          };

      }
    );

  }


  /* =========================================================
   * 12. ADD
   * ========================================================= */

  async function add(
    store,
    data
  ) {

    const storeName =
      normalizeStoreName(store);

    const record =
      normalizeRecord(
        storeName,
        data,
        {
          isUpdate: false
        }
      );


    await ensureReady();


    /*
     * FALLBACK
     */
    if (
      usingFallback ||
      !db
    ) {

      const records =
        fallbackRead(
          storeName
        );

      if (
        fallbackFindIndex(
          records,
          record.id
        ) !== -1
      ) {

        throw new Error(
          `Record already exists: ${record.id}`
        );

      }

      records.push(record);

      fallbackWrite(
        storeName,
        records
      );

      return clone(record);

    }


    /*
     * INDEXEDDB
     */
    return new Promise(
      (resolve, reject) => {

        try {

          const tx =
            db.transaction(
              storeName,
              'readwrite'
            );

          const objectStore =
            tx.objectStore(
              storeName
            );

          const request =
            objectStore.add(
              record
            );


          request.onsuccess =
            () => {

              resolve(
                clone(record)
              );

            };


          request.onerror =
            event => {

              reject(
                event.target.error ||
                new Error(
                  'Unable to add record'
                )
              );

            };

        } catch (error) {

          reject(error);

        }

      }
    );

  }


  /* =========================================================
   * 13. PUT / UPSERT
   * ========================================================= */

  async function put(
    store,
    data
  ) {

    const storeName =
      normalizeStoreName(store);

    const record =
      normalizeRecord(
        storeName,
        data,
        {
          isUpdate: true
        }
      );


    await ensureReady();


    if (
      usingFallback ||
      !db
    ) {

      const records =
        fallbackRead(
          storeName
        );

      const index =
        fallbackFindIndex(
          records,
          record.id
        );

      if (index >= 0) {

        /*
         * Preserve original creation time.
         */
        if (
          records[index].createdAt
        ) {

          record.createdAt =
            records[index].createdAt;

        }

        records[index] =
          record;

      } else {

        records.push(
          record
        );

      }

      fallbackWrite(
        storeName,
        records
      );

      return clone(record);

    }


    return new Promise(
      (resolve, reject) => {

        try {

          const tx =
            db.transaction(
              storeName,
              'readwrite'
            );

          const objectStore =
            tx.objectStore(
              storeName
            );

          const request =
            objectStore.put(
              record
            );

          request.onsuccess =
            () => {

              resolve(
                clone(record)
              );

            };

          request.onerror =
            event => {

              reject(
                event.target.error ||
                new Error(
                  'Unable to save record'
                )
              );

            };

        } catch (error) {

          reject(error);

        }

      }
    );

  }


  /* =========================================================
   * 14. GET
   * ========================================================= */

  async function get(
    store,
    id
  ) {

    const storeName =
      normalizeStoreName(store);

    const key =
      cleanText(
        id,
        300
      );


    await ensureReady();


    if (
      usingFallback ||
      !db
    ) {

      const records =
        fallbackRead(
          storeName
        );

      const record =
        records.find(
          item =>
            String(item.id) ===
            String(key)
        );

      return record
        ? clone(record)
        : null;

    }


    return new Promise(
      (resolve, reject) => {

        try {

          const tx =
            db.transaction(
              storeName,
              'readonly'
            );

          const objectStore =
            tx.objectStore(
              storeName
            );

          const request =
            objectStore.get(
              key
            );

          request.onsuccess =
            () => {

              resolve(
                request.result
                  ? clone(
                      request.result
                    )
                  : null
              );

            };

          request.onerror =
            event => {

              reject(
                event.target.error
              );

            };

        } catch (error) {

          reject(error);

        }

      }
    );

  }


  /* =========================================================
   * 15. GET BY INDEX
   * ========================================================= */

  async function getByIndex(
    store,
    indexName,
    value
  ) {

    const storeName =
      normalizeStoreName(store);

    const index =
      cleanText(
        indexName,
        100
      );


    await ensureReady();


    if (
      usingFallback ||
      !db
    ) {

      const records =
        fallbackRead(
          storeName
        );

      return records
        .filter(
          record =>
            record[index] === value
        )
        .map(clone);

    }


    return new Promise(
      (resolve, reject) => {

        try {

          const tx =
            db.transaction(
              storeName,
              'readonly'
            );

          const objectStore =
            tx.objectStore(
              storeName
            );

          if (
            !objectStore.indexNames
              .contains(index)
          ) {

            reject(
              new Error(
                `Index not found: ${index}`
              )
            );

            return;

          }

          const idx =
            objectStore.index(
              index
            );

          const request =
            idx.getAll(
              value
            );

          request.onsuccess =
            () => {

              resolve(
                (request.result || [])
                  .map(clone)
              );

            };

          request.onerror =
            event => {

              reject(
                event.target.error
              );

            };

        } catch (error) {

          reject(error);

        }

      }
    );

  }


  /* =========================================================
   * 16. ALL
   * ========================================================= */

  async function all(
    store
  ) {

    const storeName =
      normalizeStoreName(store);


    await ensureReady();


    if (
      usingFallback ||
      !db
    ) {

      return fallbackRead(
        storeName
      ).map(clone);

    }


    return new Promise(
      (resolve, reject) => {

        try {

          const tx =
            db.transaction(
              storeName,
              'readonly'
            );

          const objectStore =
            tx.objectStore(
              storeName
            );

          const request =
            objectStore.getAll();


          request.onsuccess =
            () => {

              resolve(
                (request.result || [])
                  .map(clone)
              );

            };


          request.onerror =
            event => {

              reject(
                event.target.error
              );

            };

        } catch (error) {

          reject(error);

        }

      }
    );

  }


  /* =========================================================
   * 17. DELETE
   * ========================================================= */

  async function remove(
    store,
    id
  ) {

    const storeName =
      normalizeStoreName(store);

    const key =
      cleanText(
        id,
        300
      );


    await ensureReady();


    if (
      usingFallback ||
      !db
    ) {

      const records =
        fallbackRead(
          storeName
        );

      const filtered =
        records.filter(
          record =>
            String(record.id) !==
            String(key)
        );

      const changed =
        filtered.length !==
        records.length;

      fallbackWrite(
        storeName,
        filtered
      );

      return changed;

    }


    return new Promise(
      (resolve, reject) => {

        try {

          const tx =
            db.transaction(
              storeName,
              'readwrite'
            );

          const objectStore =
            tx.objectStore(
              storeName
            );

          const request =
            objectStore.delete(
              key
            );

          request.onsuccess =
            () => {

              resolve(true);

            };

          request.onerror =
            event => {

              reject(
                event.target.error
              );

            };

        } catch (error) {

          reject(error);

        }

      }
    );

  }


  /* =========================================================
   * 18. CLEAR
   * ========================================================= */

  async function clear(
    store
  ) {

    const storeName =
      normalizeStoreName(store);


    await ensureReady();


    if (
      usingFallback ||
      !db
    ) {

      return fallbackWrite(
        storeName,
        []
      );

    }


    return new Promise(
      (resolve, reject) => {

        try {

          const tx =
            db.transaction(
              storeName,
              'readwrite'
            );

          const objectStore =
            tx.objectStore(
              storeName
            );

          const request =
            objectStore.clear();


          request.onsuccess =
            () => {

              resolve(true);

            };


          request.onerror =
            event => {

              reject(
                event.target.error
              );

            };

        } catch (error) {

          reject(error);

        }

      }
    );

  }


  /* =========================================================
   * 19. COUNT
   * ========================================================= */

  async function count(
    store
  ) {

    const storeName =
      normalizeStoreName(store);


    await ensureReady();


    if (
      usingFallback ||
      !db
    ) {

      return fallbackRead(
        storeName
      ).length;

    }


    return new Promise(
      (resolve, reject) => {

        try {

          const tx =
            db.transaction(
              storeName,
              'readonly'
            );

          const objectStore =
            tx.objectStore(
              storeName
            );

          const request =
            objectStore.count();


          request.onsuccess =
            () => {

              resolve(
                request.result || 0
              );

            };


          request.onerror =
            event => {

              reject(
                event.target.error
              );

            };

        } catch (error) {

          reject(error);

        }

      }
    );

  }


  /* =========================================================
   * 20. UPDATE
   * ========================================================= */

  async function update(
    store,
    id,
    changes
  ) {

    const existing =
      await get(
        store,
        id
      );

    if (!existing) {

      throw new Error(
        `Record not found: ${id}`
      );

    }

    const merged = {

      ...existing,

      ...(clone(changes) || {}),

      id:
        existing.id,

      createdAt:
        existing.createdAt

    };

    return put(
      store,
      merged
    );

  }


  /* =========================================================
   * 21. FIND
   * ========================================================= */

  async function find(
    store,
    predicate
  ) {

    if (
      typeof predicate !==
      'function'
    ) {

      throw new TypeError(
        'predicate must be a function'
      );

    }

    const records =
      await all(store);

    return records.find(
      predicate
    ) || null;

  }


  /* =========================================================
   * 22. FILTER
   * ========================================================= */

  async function filter(
    store,
    predicate
  ) {

    if (
      typeof predicate !==
      'function'
    ) {

      throw new TypeError(
        'predicate must be a function'
      );

    }

    const records =
      await all(store);

    return records.filter(
      predicate
    );

  }


  /* =========================================================
   * 23. SEARCH
   * ========================================================= */

  async function search(
    store,
    query,
    fields = []
  ) {

    const storeName =
      normalizeStoreName(store);

    const q =
      String(query ?? '')
        .trim()
        .toLowerCase();

    if (!q) {

      return all(storeName);

    }


    const records =
      await all(storeName);


    const selectedFields =
      Array.isArray(fields) &&
      fields.length
        ? fields
        : [
            'name',
            'phone',
            'genericName',
            'brandName',
            'rxNumber',
            'bookingNumber',
            'department',
            'diagnosis'
          ];


    return records.filter(
      record => {

        return selectedFields.some(
          field => {

            const value =
              record[field];

            if (
              value === undefined ||
              value === null
            ) {

              return false;

            }

            return String(value)
              .toLowerCase()
              .includes(q);

          }
        );

      }
    );

  }


  /* =========================================================
   * 24. PATIENT HELPERS
   * ========================================================= */

  async function savePatient(
    patient
  ) {

    return put(
      'patients',
      patient
    );

  }


  async function getPatient(
    patientId
  ) {

    return get(
      'patients',
      patientId
    );

  }


  async function findPatientByPhone(
    phone
  ) {

    const result =
      await getByIndex(
        'patients',
        'phone',
        phone
      );

    return result[0] || null;

  }


  async function findPatientsByName(
    name
  ) {

    return search(
      'patients',
      name,
      ['name']
    );

  }


  /* =========================================================
   * 25. PRESCRIPTION HELPERS
   * ========================================================= */

  async function savePrescription(
    prescription
  ) {

    return put(
      'prescriptions',
      prescription
    );

  }


  async function getPrescription(
    id
  ) {

    return get(
      'prescriptions',
      id
    );

  }


  async function findPrescriptionByRxNumber(
    rxNumber
  ) {

    const result =
      await getByIndex(
        'prescriptions',
        'rxNumber',
        rxNumber
      );

    return result[0] || null;

  }


  async function getPatientPrescriptions(
    patientId
  ) {

    return getByIndex(
      'prescriptions',
      'patientId',
      patientId
    );

  }


  /* =========================================================
   * 26. BOOKING HELPERS
   * ========================================================= */

  async function saveBooking(
    booking
  ) {

    return put(
      'bookings',
      booking
    );

  }


  async function getBooking(
    id
  ) {

    return get(
      'bookings',
      id
    );

  }


  async function findBookingByNumber(
    bookingNumber
  ) {

    const result =
      await getByIndex(
        'bookings',
        'bookingNumber',
        bookingNumber
      );

    return result[0] || null;

  }


  async function getBookingsByDate(
    date
  ) {

    return getByIndex(
      'bookings',
      'date',
      date
    );

  }


  async function getBookingsByStatus(
    status
  ) {

    return getByIndex(
      'bookings',
      'status',
      status
    );

  }


  /* =========================================================
   * 27. AUDIT LOG
   * ========================================================= */

  async function audit(
    action,
    details = {},
    options = {}
  ) {

    const record = {

      id:
        createId('AUDIT'),

      action:
        cleanText(
          action,
          200
        ),

      timestamp:
        nowISO(),

      userId:
        cleanText(
          options.userId || '',
          200
        ),

      userName:
        cleanText(
          options.userName || '',
          200
        ),

      entityType:
        cleanText(
          options.entityType || '',
          100
        ),

      entityId:
        cleanText(
          options.entityId || '',
          300
        ),

      source:
        cleanText(
          options.source ||
          'client',
          100
        ),

      details:
        clone(details) || {},

      version:
        CONFIG.version

    };


    const result =
      await add(
        'audit',
        record
      );


    /*
     * Best-effort cleanup.
     * لا نفشل العملية الأصلية إذا فشل التنظيف.
     */
    try {

      const total =
        await count(
          'audit'
        );

      if (
        total >
        CONFIG.maxAuditRecords
      ) {

        await trimStore(
          'audit',
          CONFIG.maxAuditRecords
        );

      }

    } catch (error) {

      debugLog(
        'Audit cleanup failed',
        error
      );

    }


    return result;

  }


  /* =========================================================
   * 28. TRIM STORE
   * ========================================================= */

  async function trimStore(
    store,
    maxRecords
  ) {

    const storeName =
      normalizeStoreName(store);

    const limit =
      Math.max(
        0,
        Number(maxRecords) || 0
      );


    const records =
      await all(storeName);

    if (
      records.length <= limit
    ) {

      return 0;

    }


    records.sort(
      (a, b) => {

        const aTime =
          Date.parse(
            a.updatedAt ||
            a.createdAt ||
            a.timestamp ||
            ''
          ) || 0;

        const bTime =
          Date.parse(
            b.updatedAt ||
            b.createdAt ||
            b.timestamp ||
            ''
          ) || 0;

        return aTime - bTime;

      }
    );


    const removeCount =
      records.length - limit;

    const toDelete =
      records.slice(
        0,
        removeCount
      );


    for (
      const record of toDelete
    ) {

      try {

        await remove(
          storeName,
          record.id
        );

      } catch (error) {

        debugLog(
          'trimStore delete failed',
          error
        );

      }

    }


    return removeCount;

  }


  /* =========================================================
   * 29. SETTINGS
   * ========================================================= */

  async function setSetting(
    key,
    value
  ) {

    const setting = {

      key:
        cleanText(
          key,
          300
        ),

      value:
        clone(value),

      updatedAt:
        nowISO()

    };


    return put(
      'settings',
      setting
    );

  }


  async function getSetting(
    key,
    defaultValue = null
  ) {

    const setting =
      await get(
        'settings',
        cleanText(
          key,
          300
        )
      );

    if (!setting) {

      return defaultValue;

    }

    return clone(
      setting.value
    );

  }


  async function removeSetting(
    key
  ) {

    return remove(
      'settings',
      cleanText(
        key,
        300
      )
    );

  }


  /* =========================================================
   * 30. META
   * ========================================================= */

  async function setMeta(
    key,
    value
  ) {

    return put(
      'meta',
      {

        key:
          cleanText(
            key,
            300
          ),

        value:
          clone(value),

        updatedAt:
          nowISO()

      }
    );

  }


  async function getMeta(
    key,
    defaultValue = null
  ) {

    const record =
      await get(
        'meta',
        cleanText(
          key,
          300
        )
      );

    return record
      ? clone(record.value)
      : defaultValue;

  }


  /* =========================================================
   * 31. DATABASE INFO
   * ========================================================= */

  async function info() {

    await ensureReady();

    const result = {

      name:
        CONFIG.dbName,

      version:
        CONFIG.dbVersion,

      apiVersion:
        CONFIG.version,

      initialized,

      usingFallback,

      indexedDB:
        !usingFallback && Boolean(db),

      stores: {}

    };


    for (
      const store of STORE_NAMES
    ) {

      try {

        result.stores[store] =
          await count(store);

      } catch (_) {

        result.stores[store] =
          null;

      }

    }


    return result;

  }


  /* =========================================================
   * 32. EXPORT ALL DATA
   * ========================================================= */

  async function exportData(
    options = {}
  ) {

    const includeAudit =
      options.includeAudit !== false;

    const data = {

      application:
        'MediPrescribe',

      dbName:
        CONFIG.dbName,

      dbVersion:
        CONFIG.dbVersion,

      exportedAt:
        nowISO(),

      version:
        CONFIG.version,

      stores: {}

    };


    for (
      const store of STORE_NAMES
    ) {

      if (
        !includeAudit &&
        store === 'audit'
      ) {

        continue;

      }

      data.stores[store] =
        await all(store);

    }


    return data;

  }


  /* =========================================================
   * 33. EXPORT JSON STRING
   * ========================================================= */

  async function exportJSON(
    options = {}
  ) {

    const data =
      await exportData(
        options
      );

    return JSON.stringify(
      data,
      null,
      2
    );

  }


  /* =========================================================
   * 34. DOWNLOAD BACKUP
   * ========================================================= */

  async function downloadBackup(
    options = {}
  ) {

    const json =
      await exportJSON(
        options
      );

    const blob =
      new Blob(
        [json],
        {
          type:
            'application/json;charset=utf-8'
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        'a'
      );

    const date =
      new Date()
        .toISOString()
        .slice(
          0,
          10
        );

    link.href = url;

    link.download =
      `MediPrescribe_Backup_${date}.json`;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    setTimeout(
      () => {

        try {
          URL.revokeObjectURL(url);
        } catch (_) {
          /* ignore */
        }

      },
      1000
    );

    await audit(
      'DATABASE_BACKUP_EXPORTED',
      {
        includeAudit:
          options.includeAudit !== false
      },
      {
        source: 'db'
      }
    ).catch(() => {});


    return true;

  }


  /* =========================================================
   * 35. VALIDATE IMPORT
   * ========================================================= */

  function validateImportData(
    data
  ) {

    if (
      !data ||
      typeof data !== 'object'
    ) {

      throw new Error(
        'Invalid backup data.'
      );

    }


    if (
      !data.stores ||
      typeof data.stores !== 'object'
    ) {

      throw new Error(
        'Backup does not contain stores.'
      );

    }


    return true;

  }


  /* =========================================================
   * 36. IMPORT DATA
   *
   * mode:
   *   merge  = يضيف/يحدث السجلات
   *   replace = يمسح المخازن الموجودة ثم يستورد
   * ========================================================= */

  async function importData(
    data,
    options = {}
  ) {

    validateImportData(
      data
    );


    const mode =
      options.mode === 'replace'
        ? 'replace'
        : 'merge';


    const imported = {

      stores: {},

      mode,

      importedAt:
        nowISO()

    };


    /*
     * Replace mode:
     * clear selected stores first.
     */
    if (mode === 'replace') {

      for (
        const store of STORE_NAMES
      ) {

        if (
          Array.isArray(
            data.stores[store]
          )
        ) {

          await clear(store);

        }

      }

    }


    /*
     * Import records.
     */
    for (
      const store of STORE_NAMES
    ) {

      const records =
        data.stores[store];

      if (
        !Array.isArray(records)
      ) {

        continue;

      }


      imported.stores[store] =
        0;


      for (
        const record of records
      ) {

        if (
          !record ||
          typeof record !== 'object'
        ) {

          continue;

        }


        try {

          await put(
            store,
            record
          );

          imported.stores[store] += 1;

        } catch (error) {

          debugLog(
            `Import failed for ${store}`,
            error
          );

        }

      }

    }


    await audit(
      'DATABASE_BACKUP_IMPORTED',
      {
        mode,
        stores:
          imported.stores
      },
      {
        source: 'db'
      }
    ).catch(() => {});


    return imported;

  }


  /* =========================================================
   * 37. IMPORT JSON
   * ========================================================= */

  async function importJSON(
    json,
    options = {}
  ) {

    let data;

    try {

      data =
        typeof json === 'string'
          ? JSON.parse(json)
          : json;

    } catch (error) {

      throw new Error(
        'Invalid JSON backup file.'
      );

    }


    return importData(
      data,
      options
    );

  }


  /* =========================================================
   * 38. IMPORT FILE
   * ========================================================= */

  async function importFile(
    file,
    options = {}
  ) {

    if (!file) {

      throw new Error(
        'No backup file selected.'
      );

    }


    const text =
      await file.text();


    return importJSON(
      text,
      options
    );

  }


  /* =========================================================
   * 39. DATABASE HEALTH CHECK
   * ========================================================= */

  async function healthCheck() {

    const result = {

      ok: true,

      database:
        CONFIG.dbName,

      version:
        CONFIG.dbVersion,

      indexedDB:
        Boolean(
          window.indexedDB
        ),

      usingFallback,

      stores: {},

      errors: []

    };


    try {

      await ensureReady();

    } catch (error) {

      result.ok = false;

      result.errors.push(
        String(
          error.message ||
          error
        )
      );

      return result;

    }


    for (
      const store of STORE_NAMES
    ) {

      try {

        result.stores[store] =
          await count(store);

      } catch (error) {

        result.ok = false;

        result.errors.push(
          `${store}: ${
            error.message ||
            error
          }`
        );

      }

    }


    return result;

  }


  /* =========================================================
   * 40. RESET DATABASE DATA
   *
   * خطير:
   * يمسح جميع بيانات MediPrescribe المحلية.
   * ========================================================= */

  async function clearAll(
    options = {}
  ) {

    if (
      options.confirm !== true
    ) {

      throw new Error(
        'clearAll requires { confirm: true }.'
      );

    }


    for (
      const store of STORE_NAMES
    ) {

      await clear(store);

    }


    return true;

  }


  /* =========================================================
   * 41. CLOSE DATABASE
   * ========================================================= */

  function close() {

    if (!db) {
      return;
    }

    try {

      db.close();

    } catch (_) {
      /* ignore */
    }

    db = null;

    initialized = false;

  }


  /* =========================================================
   * 42. DELETE DATABASE
   *
   * خطير جدًا.
   * يستخدم فقط أثناء التطوير أو إعادة التهيئة.
   * ========================================================= */

  async function destroy(
    options = {}
  ) {

    if (
      options.confirm !== true
    ) {

      throw new Error(
        'destroy requires { confirm: true }.'
      );

    }


    close();


    if (
      !window.indexedDB
    ) {

      for (
        const store of STORE_NAMES
      ) {

        try {

          localStorage.removeItem(
            fallbackKey(store)
          );

        } catch (_) {
          /* ignore */
        }

      }

      return true;

    }


    return new Promise(
      (resolve, reject) => {

        const request =
          indexedDB.deleteDatabase(
            CONFIG.dbName
          );


        request.onsuccess =
          () => {

            db = null;

            initialized = false;

            resolve(true);

          };


        request.onerror =
          event => {

            reject(
              event.target.error
            );

          };


        request.onblocked =
          () => {

            debugLog(
              'Database deletion blocked'
            );

          };

      }
    );

  }


  /* =========================================================
   * 43. DATABASE VERSION
   * ========================================================= */

  async function getVersion() {

    await ensureReady();

    return {

      application:
        CONFIG.version,

      database:
        CONFIG.dbVersion,

      name:
        CONFIG.dbName,

      usingFallback

    };

  }


  /* =========================================================
   * 44. GENERIC UPSERT
   * ========================================================= */

  async function upsert(
    store,
    data
  ) {

    return put(
      store,
      data
    );

  }


  /* =========================================================
   * 45. GENERIC REMOVE ALIAS
   * ========================================================= */

  async function del(
    store,
    id
  ) {

    return remove(
      store,
      id
    );

  }


  /* =========================================================
   * 46. INITIALIZATION
   * ========================================================= */

  async function init() {

    if (
      initialized
    ) {

      return info();

    }


    try {

      await ensureReady();

      /*
       * Store schema sanity.
       */
      await setMeta(
        'lastInit',
        nowISO()
      );


      debugLog(
        `DB v${CONFIG.version} initialized`
      );


      return info();

    } catch (error) {

      errorLog(
        'Database initialization failed',
        error
      );

      throw error;

    }

  }


  /* =========================================================
   * 47. PUBLIC API
   * ========================================================= */

  const API = {

    /*
     * Version / configuration
     */
    VERSION:
      CONFIG.version,

    version:
      CONFIG.version,

    config:
      CONFIG,

    stores:
      STORE_NAMES,

    /*
     * Initialization
     */
    init,

    open,

    close,

    ensureReady,

    info,

    healthCheck,

    getVersion,

    /*
     * CRUD
     */
    add,

    put,

    upsert,

    get,

    getByIndex,

    all,

    update,

    remove,

    del,

    clear,

    clearAll,

    count,

    find,

    filter,

    search,

    /*
     * Patients
     */
    savePatient,

    getPatient,

    findPatientByPhone,

    findPatientsByName,

    /*
     * Prescriptions
     */
    savePrescription,

    getPrescription,

    findPrescriptionByRxNumber,

    getPatientPrescriptions,

    /*
     * Bookings
     */
    saveBooking,

    getBooking,

    findBookingByNumber,

    getBookingsByDate,

    getBookingsByStatus,

    /*
     * Audit
     */
    audit,

    logAudit:
      audit,

    /*
     * Settings
     */
    setSetting,

    getSetting,

    removeSetting,

    /*
     * Meta
     */
    setMeta,

    getMeta,

    /*
     * Backup
     */
    exportData,

    exportJSON,

    downloadBackup,

    importData,

    importJSON,

    importFile,

    /*
     * Maintenance
     */
    trimStore,

    destroy,

    /*
     * Utility
     */
    createId,

    nowISO

  };

  /* =========================================================
   * 48. GLOBAL EXPORT
   * ========================================================= */

  window.DB = API;


  /* =========================================================
   * 49. USER MANAGEMENT HELPERS
   *
   * ⭐ دوال مفقودة في db.js الأصلي — لكن login.html يحتاجها
   * بدونها: تسجيل الدخول يفشل دائماً
   * ========================================================= */

  /* ── قراءة قائمة المستخدمين ── */
  async function getAllUsers() {
    try {
      const users = await API.getSetting('users', []);
      return Array.isArray(users) ? users : [];
    } catch (_) {
      /* fallback: اقرأ من localStorage */
      try {
        const raw = localStorage.getItem('mp_users');
        return raw ? JSON.parse(raw) : [];
      } catch (_) {
        return [];
      }
    }
  }

  /* ── حفظ قائمة المستخدمين ── */
  async function saveAllUsers(users) {
    const list = Array.isArray(users) ? users : [];

    /* احفظ في IndexedDB */
    await API.put('settings', {
      key: 'users',
      value: list,
      updatedAt: new Date().toISOString()
    });

    /* احفظ نسخة في localStorage للتوافق */
    try {
      localStorage.setItem('mp_users', JSON.stringify(list));
    } catch (_) {}

    return true;
  }

  /* ── البحث عن مستخدم باسم المستخدم ── */
  async function getUserByUsername(username) {
    if (!username) return null;

    const target = String(username).trim().toLowerCase();
    const users = await getAllUsers();

    return users.find(u =>
      String(u.username || '').toLowerCase() === target
    ) || null;
  }

  /* ── التحقق من كلمة المرور ── */
  async function verifyPassword(inputPassword, storedPassword) {
    if (!inputPassword || !storedPassword) return false;

    /* 1) مطابقة مباشرة (نص عادي — للتطوير) */
    if (String(inputPassword) === String(storedPassword)) {
      return true;
    }

    /* 2) دعم SHA-256 إن وُجد */
    if (window.crypto && window.crypto.subtle) {
      try {
        const buf = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(inputPassword)
        );
        const hash = Array.from(new Uint8Array(buf))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        if (hash === storedPassword) return true;
      } catch (_) {}
    }

    return false;
  }

  /* ── تحديث آخر تسجيل دخول ── */
  async function updateLastLogin(userId) {
    try {
      const users = await getAllUsers();
      const idx = users.findIndex(u => u.id === userId);
      if (idx === -1) return false;

      users[idx].lastLogin = new Date().toISOString();
      users[idx].updatedAt = new Date().toISOString();

      await saveAllUsers(users);
      return true;
    } catch (_) {
      return false;
    }
  }

  /* ── إعادة تعيين قاعدة البيانات ── */
  async function resetDatabase() {
    try {
      /* 1) امسح IndexedDB */
      if (typeof indexedDB !== 'undefined') {
        await new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(CONFIG.dbName);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
          req.onblocked = () => resolve(false);
        });
      }

      /* 2) امسح localStorage */
      try {
        localStorage.removeItem('mp_session');
        localStorage.removeItem('mp_users');
        localStorage.removeItem('mp_username');
        localStorage.removeItem('mp_prescription_draft');
      } catch (_) {}

      /* 3) امسح Cache */
      if (typeof caches !== 'undefined') {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        } catch (_) {}
      }

      return true;
    } catch (err) {
      errorLog('resetDatabase failed:', err);
      return false;
    }
  }

  /* ── إنشاء مستخدمين افتراضيين إذا كانت القائمة فارغة ── */
  async function seedDefaultUsers() {
    const users = await getAllUsers();
    if (users.length > 0) return false; /* موجودون بالفعل */

    const now = new Date().toISOString();

    const defaults = [
      {
        id: 'USER-admin-001',
        username: 'admin',
        password: 'admin123',
        fullName: 'د. المسؤول العام',
        role: 'admin',
        roleLabel: 'مسؤول النظام',
        hospital: 'هيئة مستشفى الثورة العام',
        status: 'active',
        permissions: ['*'],
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'USER-doctor-001',
        username: 'dr.salem',
        password: 'salam123',
        fullName: 'د. سالم العمري',
        role: 'doctor',
        roleLabel: 'طبيب باطني',
        hospital: 'هيئة مستشفى الثورة العام',
        status: 'active',
        permissions: ['create_prescription', 'view_records'],
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'USER-pharma-001',
        username: 'pharma.ali',
        password: 'ali123',
        fullName: 'د. علي الصيدلي',
        role: 'pharmacist',
        roleLabel: 'صيدلي',
        hospital: 'مستشفى جبله الجامعي',
        status: 'active',
        permissions: ['view_records', 'export_data'],
        createdAt: now,
        updatedAt: now
      }
    ];

    await saveAllUsers(defaults);

    try {
      console.log('✅ DB: تم إنشاء المستخدمين الافتراضيين:', defaults.length);
    } catch (_) {}

    return true;
  }


  /* =========================================================
   * 50. BACKWARD COMPATIBILITY ALIASES
   *
   * ⭐ مهم جداً:
   * app.js يستدعي initDB() و logAudit()
   * login.html يستدعي getUserByUsername() و verifyPassword()
   * ========================================================= */

  /* ── Aliases الرئيسية ── */
  window.initDB            = init;
  window.logAudit          = audit;

  /* ── دوال المستخدمين (login.html) ── */
  window.getAllUsers       = getAllUsers;
  window.saveAllUsers      = saveAllUsers;
  window.getUserByUsername = getUserByUsername;
  window.verifyPassword    = verifyPassword;
  window.updateLastLogin   = updateLastLogin;
  window.resetDatabase     = resetDatabase;
  window.seedDefaultUsers  = seedDefaultUsers;

  /* ── Stubs للدوال الخارجية ── */
  if (typeof window.getCurrentUser === 'undefined') {
    window.getCurrentUser = function() {
      try {
        return JSON.parse(localStorage.getItem('mp_session') || 'null');
      } catch (_) {
        return null;
      }
    };
  }

  if (typeof window.hasPermission === 'undefined') {
    window.hasPermission = function() {
      /* مؤقت: يُسمح بكل الصلاحيات حتى تُحمَّل users.js */
      return true;
    };
  }

  if (typeof window.showToast === 'undefined') {
    window.showToast = function(message, type, duration) {
      try {
        console.log(`[Toast:${type || 'info'}] ${message}`);
      } catch (_) {}
    };
  }

  if (typeof window.esc === 'undefined') {
    window.esc = function(s) {
      return String(s ?? '').replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;',
                '"': '&quot;', "'": '&#39;' }[c]));
    };
  }

  if (typeof window.getRoleLabel === 'undefined') {
    window.getRoleLabel = function(role) {
      const labels = {
        admin: 'مسؤول النظام',
        doctor: 'طبيب',
        pharmacist: 'صيدلي',
        nurse: 'ممرض',
        viewer: 'مشاهد'
      };
      return labels[role] || role || 'مستخدم';
    };
  }


  /* =========================================================
   * 51. AUTO INIT
   * ========================================================= */

  async function autoInit() {
    try {
      await init();

      /* ⭐ زرع المستخدمين الافتراضيين إن كانت القائمة فارغة */
      await seedDefaultUsers();

    } catch (error) {
      errorLog('Auto initialization failed', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      autoInit,
      { once: true }
    );
  } else {
    autoInit();
  }


  /* =========================================================
   * 52. LOG READY
   * ========================================================= */

  debugLog(`✅ MediPrescribe DB v${CONFIG.version} loaded`);

  try {
    console.log(
      '%c✅ db.js v' + CONFIG.version,
      'color:#43a047;font-weight:bold',
      '— دوال: initDB, logAudit, getUserByUsername, verifyPassword, seedDefaultUsers'
    );
  } catch (_) {}


})();
