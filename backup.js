import {
    getAllBooksFromDB, getAllStatsArchive, saveBookToDB,
    saveToStatsArchive, deleteFromStatsArchive,
    getAppState,
} from './db.js';
import { saveSessionStats, resizeCoverImage } from './reader.js';
import { hyphenMode, longWordMode, longWordTrigger, rewindAmount, rewindMode, stopAtChapterEnd } from './dom.js';
import { renderStatsPanel } from './stats.js';
import { applySettingsToUI } from './settings.js';
import { renderLibraryList } from './library.js';

// RSVP Speed Reader – backup.js
// Export und Import von Backup-Dateien (Bücher, Statistik, Einstellungen)

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

// readingLog zusammenführen – pro Monat den HÖHEREN Wert nehmen (idempotent).
export function mergeReadingLogs(local, backup) {
    const result = Object.assign({}, local || {});
    for (const [ym, sec] of Object.entries(backup || {})) {
        result[ym] = Math.max(result[ym] || 0, sec);
    }
    return result;
}

// wpmHistory zusammenführen, Duplikate per Timestamp entfernen.
export function mergeWpmHistory(local, backup) {
    const combined = [...(local || []), ...(backup || [])];
    const seen = new Set();
    return combined.filter(entry => {
        const key = typeof entry === 'object'
            ? (entry.ts || entry.date || JSON.stringify(entry))
            : entry;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// "Neuestes Datum" gewinnt (ISO-String-Vergleich).
export function newerDate(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
}

// ── Export ────────────────────────────────────────────────────────────────────
export async function exportBackup() {
    await saveSessionStats();
    const [books, archived] = await Promise.all([getAllBooksFromDB(), getAllStatsArchive()]);
    const backup = {
        version:   3,
        exportedAt: new Date().toISOString(),
        books: await Promise.all(books.map(async b => ({
            title:            b.title            || '',
            author:           b.author           || '',
            lastIndex:        b.lastIndex        || 0,
            totalWords:       b.wordCount        || 0,   // wordCount, nicht b.words (liegt in libraryContent)
            lastReadDate:     b.lastReadDate     || null,
            avgWpm:           b.avgWpm           || null,
            sessionCount:     b.sessionCount     || 0,
            totalReadSeconds: b.totalReadSeconds || 0,
            readingLog:       b.readingLog       || {},
            wpmHistory:       b.wpmHistory       || [],
            coverThumb:       b.thumbnail        || await resizeCoverImage(b.cover, 72) || null,
        }))),
        settings: {
            wpm:                  localStorage.getItem('rsvp-wpm')                    || null,
            fontSize:             localStorage.getItem('rsvp-fs')                     || null,
            pauseOnLongWord:      localStorage.getItem('rsvp-pause-on')               || null,
            longWordMode:         localStorage.getItem('rsvp-long-on')                || null,
            longWordTrigger:      localStorage.getItem('rsvp-long-val')               || null,
            rewindMode:           localStorage.getItem('rsvp-rewind-on')              || null,
            rewindAmount:         localStorage.getItem('rsvp-rewind-val')             || null,
            hyphenMode:           localStorage.getItem('rsvp-hyphen-on')              || null,
            stopAtChapterEnd:     localStorage.getItem('rsvp-stop-chapter')           || null,
            showChapterTime:      localStorage.getItem('rsvp-show-chapter-time')      || null,
            showChapterRemaining: localStorage.getItem('rsvp-show-chapter-remaining') || null,
            showBookTime:         localStorage.getItem('rsvp-show-book-time')         || null,
            showBookRemaining:    localStorage.getItem('rsvp-show-book-remaining')    || null,
            showProgressBar:      localStorage.getItem('rsvp-show-progress-bar')      || null,
            amoledMode:           localStorage.getItem('rsvp-amoled-mode')            || null,
            showResetButton:      localStorage.getItem('rsvp-show-reset-button')      || null,
            resumeEnabled:        localStorage.getItem('rsvp-resume-enabled')         || null,
        },
        archivedStats: archived.map(a => ({
            id:               a.id,
            title:            a.title            || '',
            author:           a.author           || '',
            lastIndex:        a.lastIndex        || 0,
            totalWords:       a.wordCount || a.totalWords || 0,
            lastReadDate:     a.lastReadDate     || null,
            avgWpm:           a.avgWpm           || null,
            sessionCount:     a.sessionCount     || 0,
            totalReadSeconds: a.totalReadSeconds || 0,
            readingLog:       a.readingLog       || {},
            wpmHistory:       a.wpmHistory       || [],
            deletedAt:        a.deletedAt        || null,
            pct:              a.pct              || 0,
            coverThumb:       a.coverThumb       || null,
        })),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `rsvp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────────
export async function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    try {
        const text   = await file.text();
        const backup = JSON.parse(text);
        if (!backup.books || !Array.isArray(backup.books)) {
            throw new Error('Ungültiges Format');
        }

        const normalize = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

        // ── 1. Aktive Bücher: Statistiken zusammenführen ──────────────────────
        const existing = await getAllBooksFromDB();
        let matched = 0, skipped = 0;

        for (const entry of backup.books) {
            const book = existing.find(b =>
                normalize(b.title)  === normalize(entry.title) &&
                normalize(b.author) === normalize(entry.author)
            );

            if (!book) {
                // Buch nicht in Bibliothek → Ghost-Eintrag anlegen
                const existingArchive = await getAllStatsArchive();
                const alreadyInArchive = existingArchive.some(a =>
                    normalize(a.title)  === normalize(entry.title) &&
                    normalize(a.author) === normalize(entry.author)
                );
                if (!alreadyInArchive) {
                    await new Promise(resolve => {
                        const tx = db.transaction('statsArchive', 'readwrite');
                        tx.objectStore('statsArchive').put({
                            id:               'ghost_' + Date.now() + '_' + Math.random().toString(36).slice(2),
                            title:            entry.title            || '',
                            author:           entry.author           || '',
                            lastIndex:        entry.lastIndex        || 0,
                            wordCount:        entry.totalWords       || 0,
                            lastReadDate:     entry.lastReadDate     || null,
                            avgWpm:           entry.avgWpm           || null,
                            sessionCount:     entry.sessionCount     || 0,
                            totalReadSeconds: entry.totalReadSeconds || 0,
                            readingLog:       entry.readingLog       || {},
                            wpmHistory:       entry.wpmHistory       || [],
                            deletedAt:        null,
                            pct:              entry.totalWords > 0
                                ? Math.min(100, Math.round((entry.lastIndex || 0) / entry.totalWords * 100))
                                : 0,
                            coverThumb:       entry.coverThumb || null,
                            _fromBackup:      true,
                        });
                        tx.oncomplete = resolve;
                        tx.onerror    = resolve;
                    });
                }
                skipped++;
                continue;
            }

            // Shallow copy – Buchinhalte werden nie verändert
            const updated = Object.assign({}, book);

            updated.lastReadDate     = newerDate(book.lastReadDate, entry.lastReadDate);
            updated.lastIndex        = Math.max(book.lastIndex     || 0, entry.lastIndex     || 0);
            updated.sessionCount     = Math.max(book.sessionCount  || 0, entry.sessionCount  || 0);
            updated.totalReadSeconds = Math.max(book.totalReadSeconds || 0, entry.totalReadSeconds || 0);

            if ((entry.sessionCount || 0) > (book.sessionCount || 0) && entry.avgWpm) {
                updated.avgWpm = entry.avgWpm;
            } else if (!book.avgWpm && entry.avgWpm) {
                updated.avgWpm = entry.avgWpm;
            }

            updated.readingLog = mergeReadingLogs(book.readingLog, entry.readingLog);
            updated.wpmHistory = mergeWpmHistory(book.wpmHistory,  entry.wpmHistory);

            await saveBookToDB(updated);
            matched++;
        }

        // ── 2. Archivierte Statistiken: Merge statt Skip ──────────────────────
        let archivedRestored = 0, archivedMerged = 0;
        if (backup.archivedStats && Array.isArray(backup.archivedStats)) {
            const existingArchive = await getAllStatsArchive();
            const archiveById  = new Map(existingArchive.map(a => [a.id, a]));
            const archiveByKey = new Map(existingArchive.map(a => [
                normalize(a.title) + '||' + normalize(a.author), a
            ]));

            for (const entry of backup.archivedStats) {
                const found = archiveById.get(entry.id)
                    || archiveByKey.get(normalize(entry.title) + '||' + normalize(entry.author));

                if (found) {
                    const merged = Object.assign({}, found);
                    merged.lastReadDate     = newerDate(found.lastReadDate, entry.lastReadDate);
                    merged.lastIndex        = Math.max(found.lastIndex        || 0, entry.lastIndex        || 0);
                    merged.sessionCount     = Math.max(found.sessionCount     || 0, entry.sessionCount     || 0);
                    merged.totalReadSeconds = Math.max(found.totalReadSeconds || 0, entry.totalReadSeconds || 0);
                    if ((entry.sessionCount || 0) > (found.sessionCount || 0) && entry.avgWpm) {
                        merged.avgWpm = entry.avgWpm;
                    } else if (!found.avgWpm && entry.avgWpm) {
                        merged.avgWpm = entry.avgWpm;
                    }
                    merged.readingLog = mergeReadingLogs(found.readingLog, entry.readingLog);
                    merged.wpmHistory = mergeWpmHistory(found.wpmHistory,  entry.wpmHistory);
                    if (!found.coverThumb && entry.coverThumb) merged.coverThumb = entry.coverThumb;
                    merged.pct = Math.max(found.pct || 0, entry.pct || 0);

                    await new Promise(resolve => {
                        const tx = db.transaction('statsArchive', 'readwrite');
                        tx.objectStore('statsArchive').put(merged);
                        tx.oncomplete = resolve;
                        tx.onerror    = resolve;
                    });
                    archivedMerged++;
                } else {
                    await new Promise(resolve => {
                        const tx = db.transaction('statsArchive', 'readwrite');
                        tx.objectStore('statsArchive').put({
                            id:               entry.id,
                            title:            entry.title            || '',
                            author:           entry.author           || '',
                            lastIndex:        entry.lastIndex        || 0,
                            wordCount:        entry.totalWords       || 0,
                            lastReadDate:     entry.lastReadDate     || null,
                            avgWpm:           entry.avgWpm           || null,
                            sessionCount:     entry.sessionCount     || 0,
                            totalReadSeconds: entry.totalReadSeconds || 0,
                            readingLog:       entry.readingLog       || {},
                            wpmHistory:       entry.wpmHistory       || [],
                            deletedAt:        entry.deletedAt        || null,
                            pct:              entry.pct              || 0,
                            coverThumb:       entry.coverThumb       || null,
                        });
                        tx.oncomplete = resolve;
                        tx.onerror    = resolve;
                    });
                    archivedRestored++;
                }
            }
        }

        // ── 3. Einstellungen übernehmen ───────────────────────────────────────
        let settingsRestored = false;
        if (backup.settings && typeof backup.settings === 'object') {
            const s = backup.settings;
            const setLS = (key, val) => {
                if (val !== null && val !== undefined) localStorage.setItem(key, val);
            };
            setLS('rsvp-wpm',                    s.wpm);
            setLS('rsvp-fs',                     s.fontSize);
            setLS('rsvp-pause-on',               s.pauseOnLongWord);
            setLS('rsvp-long-on',                s.longWordMode);
            setLS('rsvp-long-val',               s.longWordTrigger);
            setLS('rsvp-rewind-on',              s.rewindMode);
            setLS('rsvp-rewind-val',             s.rewindAmount);
            setLS('rsvp-hyphen-on',              s.hyphenMode);
            setLS('rsvp-stop-chapter',           s.stopAtChapterEnd);
            setLS('rsvp-show-chapter-time',      s.showChapterTime);
            setLS('rsvp-show-chapter-remaining', s.showChapterRemaining);
            setLS('rsvp-show-book-time',         s.showBookTime);
            setLS('rsvp-show-book-remaining',    s.showBookRemaining);
            setLS('rsvp-show-progress-bar',      s.showProgressBar);
            setLS('rsvp-amoled-mode',            s.amoledMode);
            setLS('rsvp-show-reset-button',      s.showResetButton);
            setLS('rsvp-resume-enabled',         s.resumeEnabled);
            applySettingsToUI();
            settingsRestored = true;
        }

        renderLibraryList();
        renderStatsPanel();

        const parts = [];
        if (matched > 0)          parts.push(`✓ ${matched} Buch${matched !== 1 ? 'er' : ''} aktualisiert`);
        if (skipped > 0)          parts.push(`${skipped} Buch${skipped !== 1 ? 'er' : ''} nicht gefunden → in Bibliothek als "Nicht importiert" markiert`);
        if (archivedRestored > 0) parts.push(`${archivedRestored} archivierte Einträge neu hinzugefügt`);
        if (archivedMerged > 0)   parts.push(`${archivedMerged} archivierte Einträge zusammengeführt`);
        if (settingsRestored)     parts.push(`✓ Einstellungen (WPM, Textgröße, Toggles) übernommen`);
        alert(parts.length > 0 ? parts.join('\n') : 'Keine passenden Daten gefunden.');

    } catch (e) {
        alert('Fehler beim Importieren: ' + e.message);
    }
}
