(function () {
  "use strict";

  var DB_NAME = "puzzle-photo-db";
  var DB_VERSION = 1;
  var STORE = "puzzles";
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(storeMode) {
    return openDb().then(function (db) {
      return db.transaction(STORE, storeMode).objectStore(STORE);
    });
  }

  function put(record) {
    return tx("readwrite").then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.put(record);
        req.onsuccess = function () { resolve(record); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function get(id) {
    return tx("readonly").then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function getAll() {
    return tx("readonly").then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function remove(id) {
    return tx("readwrite").then(function (store) {
      return new Promise(function (resolve, reject) {
        var req = store.delete(id);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  window.PuzzleDB = { put: put, get: get, getAll: getAll, remove: remove };
})();
