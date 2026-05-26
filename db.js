// RSVP Speed Reader Pro – IndexedDB Datenschicht
// Alle Lese- und Schreiboperationen für library, libraryContent, appState, statsArchive

let db = null;

/* --- IndexedDB --- */
function initDB() { return new Promise((resolve) => { const request = indexedDB.open("RSVPReaderPremiumDB", 3); request.onupgradeneeded = (e) => { let database = e.target.result; const oldV = e.oldVersion; if (!database.objectStoreNames.contains("library")) database.createObjectStore("library", { keyPath: "id" }); if (!database.objectStoreNames.contains("appState")) database.createObjectStore("appState"); if (!database.objectStoreNames.contains("statsArchive")) database.createObjectStore("statsArchive", { keyPath: "id" }); if (!database.objectStoreNames.contains("libraryContent")) database.createObjectStore("libraryContent", { keyPath: "id" }); }; request.onsuccess = (e) => { db = e.target.result; migrateLibraryContent().then(() => resolve(true)); }; request.onerror = () => resolve(false); }); }
function saveBookToDB(bookObj) {
    // Niemals schwere Felder in den Metadaten-Store schreiben
    const meta = Object.assign({}, bookObj);
    delete meta.words; delete meta.text; delete meta.cover;
    return new Promise((resolve) => {
        if (!db) return resolve();
        const tx = db.transaction("library", "readwrite");
        tx.objectStore("library").put(meta);
        tx.oncomplete = () => resolve(); tx.onerror = () => resolve();
    });
}
function getAllBooksFromDB() { return new Promise((resolve) => { if (!db) return resolve([]); const req = db.transaction("library", "readonly").objectStore("library").getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => resolve([]); }); }
function getBookFromDB(id) { return new Promise((resolve) => { if (!db || id === "schnellstart") return resolve(null); const req = db.transaction("library", "readonly").objectStore("library").get(id); req.onsuccess = () => resolve(req.result || null); req.onerror = () => resolve(null); }); }
async function deleteBookFromDB(id) {
    await Promise.all([
        new Promise(r => { if (!db) return r(); const tx = db.transaction("library","readwrite"); tx.objectStore("library").delete(id); tx.oncomplete = r; tx.onerror = r; }),
        deleteBookContentFromDB(id),
    ]);
}
function saveAppState(key, val) { return new Promise((resolve) => { if (!db) { localStorage.setItem(key, JSON.stringify(val)); return resolve(); } const tx = db.transaction("appState", "readwrite"); tx.objectStore("appState").put(val, key); tx.oncomplete = () => resolve(); }); }
function getAppState(key) { return new Promise((resolve) => { if (!db) { const val = localStorage.getItem(key); try { resolve(val ? JSON.parse(val) : null); } catch { resolve(val); } return; } const req = db.transaction("appState", "readonly").objectStore("appState").get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null); }); }
function saveToStatsArchive(entry) { return new Promise((resolve) => { if (!db) return resolve(); const tx = db.transaction("statsArchive", "readwrite"); tx.objectStore("statsArchive").put(entry); tx.oncomplete = () => resolve(); }); }
function deleteFromStatsArchive(id) {
    return new Promise((resolve) => {
        if (!db) return resolve();
        const tx = db.transaction("statsArchive", "readwrite");
        tx.objectStore("statsArchive").delete(id);
        tx.oncomplete = resolve; tx.onerror = resolve;
    });
}

function getAllStatsArchive() { return new Promise((resolve) => { if (!db) return resolve([]); const req = db.transaction("statsArchive", "readonly").objectStore("statsArchive").getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => resolve([]); }); }

// ── libraryContent: schwere Daten (words, text, cover) ──────────────────────
function saveBookContentToDB(id, words, text, cover) {
    return new Promise((resolve) => {
        if (!db) return resolve();
        const tx = db.transaction("libraryContent", "readwrite");
        tx.objectStore("libraryContent").put({ id, words, text, cover });
        tx.oncomplete = () => resolve(); tx.onerror = () => resolve();
    });
}
function getBookContentFromDB(id) {
    return new Promise((resolve) => {
        if (!db || id === "schnellstart") return resolve(null);
        const req = db.transaction("libraryContent", "readonly").objectStore("libraryContent").get(id);
        req.onsuccess = () => resolve(req.result || null); req.onerror = () => resolve(null);
    });
}
function deleteBookContentFromDB(id) {
    return new Promise((resolve) => {
        if (!db) return resolve();
        const tx = db.transaction("libraryContent", "readwrite");
        tx.objectStore("libraryContent").delete(id);
        tx.oncomplete = () => resolve(); tx.onerror = () => resolve();
    });
}

// ── Migration v2→v3: words/text/cover aus library in libraryContent verschieben
async function migrateLibraryContent() {
    const books = await getAllBooksFromDB();
    // Phase 1: Bücher mit words noch im Meta-Store → Content auslagern
    const needsMigration = books.some(b => b.words && b.words.length > 0);
    if (needsMigration) {
    for (const book of books) {
        if (!book.words || book.words.length === 0) continue;
        // Content in eigenen Store schreiben
        await saveBookContentToDB(book.id, book.words, book.text || '', book.cover || null);
        // Schwere Felder aus Metadaten-Store entfernen, wordCount sichern
        const meta = Object.assign({}, book);
        meta.wordCount = book.words.length; // explizit setzen bevor words gelöscht wird
        if (!meta.estimatedTotalSeconds) meta.estimatedTotalSeconds = estimateBookRemainingSeconds(book.words, 0);
        if (!meta.thumbnail && book.cover) meta.thumbnail = await generateThumbnail(book.cover);
        delete meta.words; delete meta.text; delete meta.cover;
        await saveBookToDB(meta);
    }
    } // end needsMigration
    // Phase 2: Bücher ohne wordCount reparieren (falls Migration v1 ohne wordCount lief)
    const booksNow = await getAllBooksFromDB();
    for (const book of booksNow) {
        if (book.wordCount) continue; // bereits gesetzt
        const content = await getBookContentFromDB(book.id);
        if (content && content.words && content.words.length > 0) {
            const meta = Object.assign({}, book);
            meta.wordCount = content.words.length;
            if (!meta.estimatedTotalSeconds) meta.estimatedTotalSeconds = estimateBookRemainingSeconds(content.words, 0);
            if (!meta.thumbnail && content.cover) meta.thumbnail = await generateThumbnail(content.cover);
            await saveBookToDB(meta);
        }
    }
}
