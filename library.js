import {
    getAllBooksFromDB, getAllStatsArchive, getBookFromDB,
    saveBookToDB, deleteBookFromDB, saveToStatsArchive, deleteFromStatsArchive,
    getBookContentFromDB, saveBookContentToDB,
    getAppState, saveAppState,
} from './db.js';
import {
    stopEngineOnly, saveSessionStats, buildBookData, render,
    generateThumbnail, resizeCoverImage, estimateBookRemainingSeconds,
    words, currentIndex, chapterOffsets, activeBookId, activeBookTitle, activeBookAuthor,
    hyphenFragments, lastSavedIndex, lastSaveTime, estimatedTimeCache, isPageMode,
    currentLibraryFilter, currentAuthorFilter,
    setWords, setCurrentIndex, setChapterOffsets,
    setActiveBookId, setActiveBookTitle, setActiveBookAuthor,
    setHyphenFragments, setLastSavedIndex, setLastSaveTime, setEstimatedTimeCache,
    setCurrentLibraryFilter, setCurrentAuthorFilter,
    togglePageMode, renderPageMode, getActiveChapterIndex, updateProgressUI, updateActiveBookMenuState,,
    start,
} from './reader.js';
import { closeRightMenu, switchUIMode,
    updateActiveBookMenuState,
} from './ui.js';
import {
    canvas, input, wpmIn, rewindMode, rewindAmount,
    pageDisplayContainer, readerModeToggle,
    viewReader, libraryList, fileInput, chapterListScroll,
} from './dom.js';
import { updateResetButtonVisibility } from './settings.js';
import { renderStatsPanel } from './stats.js';

// RSVP Speed Reader – library.js
// Bibliothek: Rendern, Filtern, Laden, Kapitel-Panel, Buch-Import

// ── Filter ────────────────────────────────────────────────────────────────────
export function filterLibrary(filterType, tabEl) {
    setCurrentLibraryFilter(filterType);
    document.querySelectorAll('.lib-tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
    renderLibraryList();
}

export function toggleAuthorFilter() {
    const row = document.getElementById('lib-author-filter-row');
    const btn = document.getElementById('btn-author-filter');
    const isVisible = row.classList.contains('visible');
    if (isVisible) {
        row.classList.remove('visible');
        btn.classList.remove('active');
        setCurrentAuthorFilter('');
        document.getElementById('lib-author-select').value = '';
        document.getElementById('lib-author-select').classList.remove('active-filter');
        renderLibraryList();
    } else {
        row.classList.add('visible');
        btn.classList.add('active');
        populateAuthorDropdown();
    }
}

export function onAuthorSelectChange(sel) {
    setCurrentAuthorFilter(sel.value);
    if (sel.value) sel.classList.add('active-filter');
    else sel.classList.remove('active-filter');
    renderLibraryList();
}

export function populateAuthorDropdown() {
    getAllBooksFromDB().then(books => {
        const select  = document.getElementById('lib-author-select');
        const current = select.value;
        const authors = [...new Set(
            books.map(b => (b.author || '').trim()).filter(a => a && a !== 'Unbekannter Autor')
        )].sort((a, b) => a.localeCompare(b, 'de'));
        select.innerHTML = '<option value="">— Alle Autoren —</option>';
        authors.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a;
            opt.textContent = a;
            if (a === current) opt.selected = true;
            select.appendChild(opt);
        });
    });
}

// ── Bibliothek rendern ────────────────────────────────────────────────────────
export function renderLibraryList() {
    Promise.all([getAllBooksFromDB(), getAllStatsArchive()]).then(async ([books, archived]) => {
        libraryList.innerHTML = '';

        // Ghost-Einträge: aus Backup, noch nicht importiert
        const ghostEntries = archived.filter(a => a._fromBackup === true);

        const filteredBooks = books.filter(book => {
            const idx   = parseInt(book.lastIndex) || 0;
            const total = book.wordCount || 0;
            const pct   = total > 0 ? (idx / total) * 100 : 0;
            const isNew      = idx === 0;
            const isFinished = total > 0 && (idx >= total || Math.round(pct) >= 100);
            const isStarted  = idx > 0 && !isFinished;
            const statusOk   = currentLibraryFilter === 'all'
                || (currentLibraryFilter === 'new'      && isNew)
                || (currentLibraryFilter === 'reading'  && isStarted)
                || (currentLibraryFilter === 'finished' && isFinished);
            const authorOk = !currentAuthorFilter || (book.author || '').trim() === currentAuthorFilter;
            return statusOk && authorOk;
        });

        if (filteredBooks.length === 0 && ghostEntries.length === 0) {
            libraryList.innerHTML = '<div style="text-align:center;color:#666;font-size:13px;padding:30px;">Keine Bücher in dieser Kategorie.</div>';
            return;
        }

        filteredBooks.forEach(book => {
            const card = document.createElement('div');
            card.className = `library-book-card ${activeBookId === book.id ? 'active' : ''}`;

            const idx        = parseInt(book.lastIndex) || 0;
            const total      = book.wordCount || 0;
            const pct        = total > 0 ? Math.min(100, Math.round((idx / total) * 100)) : 0;
            const isFinished = total > 0 && (idx >= total || pct >= 100);

            let statusClass = 'status-new', statusText = 'Neu';
            if (idx > 0 && !isFinished) { statusClass = 'status-reading';  statusText = 'Begonnen'; }
            else if (isFinished)        { statusClass = 'status-finished'; statusText = 'Beendet';  }

            const displayAuthor  = book.author || 'Unbekannter Autor';
            const displayTitle   = book.title  || 'Unbenanntes Dokument';
            const coverImageHtml = book.thumbnail
                ? `<img src="${book.thumbnail}" class="book-cover-img" alt="Cover">`
                : '';

            const lastReadStr = book.lastReadDate
                ? new Date(book.lastReadDate).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', year:'2-digit'})
                : null;

            const wpmHtml = book.avgWpm
                ? `<span class="book-stat-item has-data"><svg width="11" height="11" viewBox="0 0 24 24"><path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"/></svg>Ø ${Math.round(book.avgWpm)} WPM</span>`
                : '';

            const gSecs  = book.totalReadSeconds || 0;
            const gH     = Math.floor(gSecs / 3600);
            const gM     = Math.floor((gSecs % 3600) / 60);
            const timeHtml = gSecs >= 60
                ? `<span class="book-stat-item has-data" style="color:#7aaa7a;"><svg width="11" height="11" viewBox="0 0 24 24" style="fill:#7aaa7a;"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>${gH >= 1 ? gH + 'h ' + (gM > 0 ? gM + 'min' : '') : gM + ' min'}</span>`
                : '';

            // Geschätzte Restzeit
            let estHtml = '';
            if (isFinished) {
                estHtml = '<span class="book-stat-item has-data" style="color:var(--accent-green);">✓ Fertig</span>';
            } else if (total > 0) {
                const remSec = book.estimatedRemainingSeconds != null
                    ? book.estimatedRemainingSeconds
                    : book.estimatedTotalSeconds
                        ? Math.round(book.estimatedTotalSeconds * (total - idx) / total)
                        : 0;
                const rH = Math.floor(remSec / 3600), rM = Math.ceil((remSec % 3600) / 60);
                const remStr = remSec >= 3600 ? `~${rH}h ${rM}m übrig`
                             : remSec >= 60   ? `~${rM}m übrig`
                             : remSec  > 0    ? '< 1m übrig' : '';
                if (remStr) estHtml = `<span class="book-stat-item has-data"><svg width="11" height="11" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>${remStr}</span>`;
            }

            card.innerHTML = `
                <button class="lib-delete-card-btn" title="Buch löschen"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
                <div class="book-cover-placeholder">${coverImageHtml}<div class="cover-content-overlay"><div class="cover-author" style="${book.thumbnail ? 'display:none;' : ''}">${displayAuthor}</div><div class="cover-title" style="${book.thumbnail ? 'display:none;' : ''}">${displayTitle}</div><div class="cover-footer-brand">RSVP</div></div></div>
                <div class="book-details-block">
                    <div>
                        <div class="book-title-meta-row">${displayTitle}</div>
                        <div class="book-author-meta-sub">${displayAuthor}</div>
                    </div>
                    <div class="book-meta-badges-row">
                        <span class="lib-type-badge">${book.type || 'txt'}</span>
                        <span class="lib-status-tag ${statusClass}">${statusText}</span>
                        <span class="lib-progress">${pct}%</span>
                    </div>
                    <div class="book-stats-row">
                        <span class="book-stat-item ${lastReadStr ? 'has-data' : ''}">
                            <svg width="11" height="11" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>
                            ${lastReadStr || 'Noch nicht gelesen'}
                        </span>
                        ${wpmHtml}${timeHtml}${estHtml}
                    </div>
                </div>
            `;

            card.onclick = async (e) => {
                if (e.target.closest('.lib-delete-card-btn')) return;
                await loadLibraryBook(book.id, true);
            };

            card.querySelector('.lib-delete-card-btn').onclick = async (e) => {
                e.stopPropagation();
                if (confirm(`"${displayAuthor} – ${displayTitle}" wirklich löschen?`)) {
                    const coverContent = await getBookContentFromDB(book.id);
                    const coverThumb   = coverContent?.cover
                        ? await resizeCoverImage(coverContent.cover, 72)
                        : (book.thumbnail || null);
                    const total_w    = book.wordCount || 0;
                    const book_pct   = total_w > 0 ? Math.min(100, Math.round(((book.lastIndex||0)/total_w)*100)) : 0;
                    const isBookDone = book_pct >= 99;

                    await saveToStatsArchive({
                        id:               book.id,
                        title:            book.title,
                        author:           book.author,
                        coverThumb,
                        totalReadSeconds: book.totalReadSeconds || 0,
                        avgWpm:           book.avgWpm           || 0,
                        sessionCount:     book.sessionCount     || 0,
                        lastReadDate:     book.lastReadDate     || null,
                        wordCount:        total_w,
                        lastIndex:        book.lastIndex        || 0,
                        pct:              book_pct,
                        readingLog:       book.readingLog       || {},
                        wpmHistory:       book.wpmHistory       || [],
                        deletedAt:        new Date().toISOString(),
                        _notFinished:     !isBookDone,
                    });
                    await deleteBookFromDB(book.id);

                    const currentLastLibBook = await getAppState('rsvp-last-library-book-id');
                    if (currentLastLibBook === book.id) await saveAppState('rsvp-last-library-book-id', null);

                    if (activeBookId === book.id) {
                        setActiveBookId('schnellstart');
                        setActiveBookTitle('Freier Text');
                        setActiveBookAuthor('');
                        setChapterOffsets([]);
                        const data = buildBookData(input.value, 0);
                        setWords(data.words);
                        const savedIdx = await getAppState('rsvp-fast-index');
                        setCurrentIndex(parseInt(savedIdx) || 0);
                        await saveAppState('rsvp-active-book-id', 'schnellstart');
                    }
                    await updateActiveBookMenuState();
                    updateResetButtonVisibility();
                    renderLibraryList();
                }
            };

            libraryList.appendChild(card);
        });

        // ── Ghost-Sektion: Bücher aus Backup, noch nicht importiert ──────────
        if (ghostEntries.length > 0) {
            const section = document.createElement('div');
            section.className = 'lib-ghost-section-header';
            section.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="fill:#f39c12;">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                Nicht importiert (${ghostEntries.length})`;
            libraryList.appendChild(section);

            ghostEntries.forEach(ghost => {
                const card = document.createElement('div');
                card.className = 'library-book-card ghost-card';

                const displayTitle  = ghost.title  || 'Unbenanntes Buch';
                const displayAuthor = ghost.author || 'Unbekannter Autor';
                const pct      = ghost.pct || 0;
                const gSecs    = ghost.totalReadSeconds || 0;
                const gH       = Math.floor(gSecs / 3600);
                const gM       = Math.floor((gSecs % 3600) / 60);
                const timeStr  = gSecs >= 3600 ? `${gH}h ${gM}m gelesen`
                               : gSecs >= 60   ? `${gM}m gelesen`
                               : gSecs  > 0    ? '< 1m gelesen' : 'Noch nicht gelesen';
                const wpmStr   = ghost.avgWpm ? `· Ø ${Math.round(ghost.avgWpm)} WPM` : '';
                const lastReadStr = ghost.lastReadDate
                    ? new Date(ghost.lastReadDate).toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'2-digit'})
                    : null;

                card.innerHTML = `
                    <div class="book-cover-placeholder">
                        ${ghost.coverThumb ? `<img src="${ghost.coverThumb}" class="book-cover-img" alt="Cover">` : ''}
                        <div class="cover-content-overlay">
                            <div class="cover-author" style="${ghost.coverThumb ? 'display:none;' : ''}">${displayAuthor}</div>
                            <div class="cover-title"  style="${ghost.coverThumb ? 'display:none;' : ''}">${displayTitle}</div>
                            <div class="cover-footer-brand">RSVP</div>
                        </div>
                    </div>
                    <div class="book-details-block">
                        <div>
                            <div class="book-title-meta-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                ${displayTitle}
                                <span class="lib-ghost-badge">⚠ Nicht importiert</span>
                            </div>
                            <div class="book-author-meta-sub">${displayAuthor}</div>
                        </div>
                        <div class="book-meta-badges-row">
                            <span class="lib-status-tag status-reading">${pct}% gelesen</span>
                        </div>
                        <div class="book-stats-row">
                            <span class="book-stat-item ${lastReadStr ? 'has-data' : ''}">
                                <svg width="11" height="11" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>
                                ${lastReadStr || 'Kein Datum'}
                            </span>
                            ${gSecs >= 60 ? `<span class="book-stat-item has-data">${timeStr} ${wpmStr}</span>` : ''}
                        </div>
                        <div class="lib-ghost-hint">Buch importieren um Lesestand &amp; Statistik zu übernehmen</div>
                    </div>`;

                libraryList.appendChild(card); // kein Click-Handler – Ghost-Karten nicht anklickbar
            });
        }
    });
}

// ── Buch laden ────────────────────────────────────────────────────────────────
export async function loadLibraryBook(id, switchToReader = false) {
    stopEngineOnly();
    await saveSessionStats();
    setActiveBookId(id);
    setLastSavedIndex(-1);
    setLastSaveTime(0);
    await saveAppState('rsvp-active-book-id', id);
    closeRightMenu();
    setHyphenFragments(null);
    const modeToggle = document.getElementById('reader-mode-toggle');

    if (id === 'schnellstart') {
        setActiveBookTitle('Freier Text');
        setActiveBookAuthor('');
        setChapterOffsets([]);
        const data = buildBookData(input.value, 0);
        setWords(data.words);
        setEstimatedTimeCache(null);
        const savedIdx = await getAppState('rsvp-fast-index');
        setCurrentIndex(parseInt(savedIdx) || 0);
        if (modeToggle) modeToggle.style.display = 'none';
        if (isPageMode) togglePageMode();
        if (switchToReader) switchUIMode('reader');
    } else {
        const [book, bookContent] = await Promise.all([getBookFromDB(id), getBookContentFromDB(id)]);
        if (!book) return loadLibraryBook('schnellstart', switchToReader);

        setActiveBookTitle(book.title);
        setActiveBookAuthor(book.author || '');
        setWords((bookContent && bookContent.words) ? bookContent.words : []);
        setChapterOffsets(book.chapters || []);
        setEstimatedTimeCache(null);

        let savedIndex = parseInt(book.lastIndex) || 0;
        setCurrentIndex(savedIndex > 0 ? savedIndex : 0);

        // Auto-Rewind
        const rewindPermitted = await getAppState('rsvp-rewind-permitted-' + id);
        if (rewindMode.checked && rewindPermitted === true) {
            const rewindWords = parseInt(rewindAmount.value) || 0;
            setCurrentIndex(Math.max(0, currentIndex - rewindWords));
        }

        await saveAppState('rsvp-last-library-book-id', id);

        if (book.type === 'epub') {
            if (modeToggle) modeToggle.style.display = 'flex';
        } else {
            if (modeToggle) modeToggle.style.display = 'none';
            if (isPageMode) togglePageMode();
        }
        if (switchToReader) switchUIMode('reader');
    }

    await updateActiveBookMenuState();
    updateResetButtonVisibility();
    await saveAppState('rsvp-rewind-permitted-' + id, false);
    render();
    if (viewReader.classList.contains('view-active')) await updateProgressUI(false);
}

// ── Kapitel-Panel ─────────────────────────────────────────────────────────────
export function renderReaderChapterList() {
    chapterListScroll.innerHTML = '';
    if (chapterOffsets.length === 0) return;
    const activeIndex = getActiveChapterIndex();
    chapterOffsets.forEach((chap, i) => {
        const item = document.createElement('div');
        item.className = `chapter-item ${i === activeIndex ? 'active' : ''}`;
        item.innerHTML = `<span>${chap.name}</span>`;
        item.onclick = async () => {
            stopEngineOnly();
            setHyphenFragments(null);
            setCurrentIndex(parseInt(chap.start) || 0);
            await saveAppState('rsvp-rewind-permitted-' + activeBookId, false);
            closeRightMenu();
            await updateProgressUI(true);
            if (isPageMode) renderPageMode();
            else render();
        };
        chapterListScroll.appendChild(item);
    });
}

// ── Buch-Import finalisieren ──────────────────────────────────────────────────
export async function finalizeBookImport(title, author, text, parsedWords, chapters, type, coverData) {
    const thumbnail  = await generateThumbnail(coverData);
    const normalize  = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const totalWords = parsedWords ? parsedWords.length : 0;

    // Passenden Archiv-Eintrag suchen (Ghost > regulär)
    const allArchived  = await getAllStatsArchive();
    const ghostMatch   = allArchived.find(a =>
        a._fromBackup === true &&
        normalize(a.title)  === normalize(title) &&
        normalize(a.author) === normalize(author)
    );
    const archiveMatch = !ghostMatch && allArchived.find(a =>
        !a._fromBackup &&
        normalize(a.title)  === normalize(title) &&
        normalize(a.author) === normalize(author)
    );
    const existingStats = ghostMatch || archiveMatch || null;

    let startIndex   = 0;
    let statsToMerge = null;

    if (existingStats) {
        const pct     = existingStats.pct || (
            existingStats.lastIndex && totalWords > 0
                ? Math.min(100, Math.round(existingStats.lastIndex / totalWords * 100))
                : 0
        );
        const gSecs   = existingStats.totalReadSeconds || 0;
        const gH      = Math.floor(gSecs / 3600);
        const gM      = Math.floor((gSecs % 3600) / 60);
        const timeStr = gSecs >= 3600 ? `${gH}h ${gM}m` : gSecs >= 60 ? `${gM}m` : '< 1m';
        const wpmStr  = existingStats.avgWpm ? `\nØ ${Math.round(existingStats.avgWpm)} WPM` : '';
        const source  = ghostMatch ? 'Im Backup gefundene Daten' : 'Frühere Lesedaten gefunden';

        const msg  = `${source} für dieses Buch:\n`
            + `• Fortschritt: ${pct}%\n`
            + `• Lesezeit: ${timeStr}${wpmStr}\n\n`
            + `Lesestand und Statistiken übernehmen?`;
        const take = confirm(msg);

        if (take) {
            startIndex   = existingStats.lastIndex || 0;
            statsToMerge = existingStats;
        }
        if (ghostMatch) await deleteFromStatsArchive(ghostMatch.id);
        if (archiveMatch) {
            if (archiveMatch._notFinished || take) await deleteFromStatsArchive(archiveMatch.id);
        }
    }

    const bookId      = 'book_' + Date.now();
    const newBookMeta = {
        id:                       bookId,
        title,
        author,
        chapters,
        wordCount:                totalWords,
        estimatedTotalSeconds:     estimateBookRemainingSeconds(parsedWords, 0),
        estimatedRemainingSeconds: estimateBookRemainingSeconds(parsedWords, startIndex),
        lastIndex:                startIndex,
        type,
        thumbnail,
        lastReadDate:     statsToMerge ? statsToMerge.lastReadDate     : null,
        avgWpm:           statsToMerge ? statsToMerge.avgWpm           : null,
        sessionCount:     statsToMerge ? statsToMerge.sessionCount     : 0,
        totalReadSeconds: statsToMerge ? statsToMerge.totalReadSeconds : 0,
        readingLog:       statsToMerge ? statsToMerge.readingLog       : {},
        wpmHistory:       statsToMerge ? statsToMerge.wpmHistory       : [],
    };

    await Promise.all([
        saveBookToDB(newBookMeta),
        saveBookContentToDB(bookId, parsedWords, text, coverData),
    ]);

    fileInput.value = '';
    renderLibraryList();
    renderStatsPanel();
    const authorRow = document.getElementById('lib-author-filter-row');
    if (authorRow && authorRow.classList.contains('visible')) populateAuthorDropdown();
}
