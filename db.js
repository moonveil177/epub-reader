/* Folio – local storage (IndexedDB). Everything stays on the device. */
'use strict';
const DB = (() => {
  let dbp;
  function open() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('folio', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          d.createObjectStore('books', { keyPath: 'id' });   // metadata + cover
          d.createObjectStore('files', { keyPath: 'id' });   // the EPUB file itself
          d.createObjectStore('state', { keyPath: 'bookId' }); // reading position, paragraphs read
          d.createObjectStore('marks', { keyPath: 'id' }).createIndex('book', 'bookId');
          d.createObjectStore('days', { keyPath: 'date' });  // stats per day
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function run(store, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      let out;
      const rq = fn(t.objectStore(store));
      if (rq) rq.onsuccess = () => { out = rq.result; };
      t.oncomplete = () => res(out);
      t.onerror = t.onabort = () => rej(t.error);
    });
  }
  return {
    get: (s, k) => run(s, 'readonly', o => o.get(k)),
    all: s => run(s, 'readonly', o => o.getAll()),
    put: (s, v) => run(s, 'readwrite', o => o.put(v)),
    del: (s, k) => run(s, 'readwrite', o => o.delete(k)),
    byIndex: (s, i, k) => run(s, 'readonly', o => o.index(i).getAll(k)),
  };
})();
