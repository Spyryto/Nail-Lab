/* Simple, schema-versioned IndexedDB adapter. Not a remote account or cloud sync. */
const DB = "nail-lab";
const STORE = "drafts";
let database;
function open() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
window.NailStorage = {
  async load(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  },
  async save(key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
};
