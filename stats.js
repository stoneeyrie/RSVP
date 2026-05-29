import {
    getAllBooksFromDB, getAllStatsArchive,
    getBookFromDB, deleteFromStatsArchive, saveToStatsArchive, deleteBookFromDB,
    getBookContentFromDB,
} from './db.js';
import { resizeCoverImage, activeBookId, activeBookTitle, activeBookAuthor, chapterOffsets, words, currentIndex, setActiveBookId, setActiveBookTitle, setActiveBookAuthor, setChapterOffsets, setWords, setCurrentIndex,
    start,
} from './reader.js';
import { viewDynamic,
    timeLabel,
} from './dom.js';
import { renderLibraryList } from './library.js';

// RSVP Speed Reader – stats.js
// Statistik-Panel: Rendern, Monatsfilter, Löschen

// ── Konstanten ────────────────────────────────────────────────────────────────
const MONTHS_DE       = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DE_MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

// ── State ─────────────────────────────────────────────────────────────────────
// Aktiver Monatsfilter: null = alle, 'YYYY-MM' = gefilterter Monat
let statsMonthFilter = null;

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
export function fmtSecs(sec) {
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
    return sec >= 3600 ? `${h}h ${m}m` : sec >= 60 ? `${m}m` : sec > 0 ? '< 1m' : '–';
}

function hmColor(sec, maxS) {
    if (sec === 0) return '#1e1e1e';
    const t = Math.pow(sec / maxS, 0.5);
    if (t < 0.2)  return '#0d3a5c';
    if (t < 0.4)  return '#1a5f8a';
    if (t < 0.65) return '#2281b8';
    if (t < 0.85) return '#2e9fd6';
    return '#3498db';
}

// ── Tab-Umschaltung ───────────────────────────────────────────────────────────
export function showStatsTab(tabId, btn) {
    document.querySelectorAll('.stats-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.stats-tab').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('stats-tab-' + tabId);
    if (target) target.style.display = '';
    if (btn) btn.classList.add('active');
}

// ── Monatsfilter ──────────────────────────────────────────────────────────────
export function statsSetMonthFilter(ym) {
    statsMonthFilter = (statsMonthFilter === ym) ? null : ym;
    if (ym) {
        const year = ym.split('-')[0];
        const block = document.getElementById('year-block-' + year);
        if (block) block.classList.add('open');
    }
    renderStatsPanel();
    if (ym) {
        setTimeout(() => {
            const list = document.querySelector('.stats-book-list');
            if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
    }
}

// ── Statistik-Panel rendern ───────────────────────────────────────────────────
export async function renderStatsPanel() {
    const container = document.getElementById('stats-content');
    if (!container) return;
    container.innerHTML = '<div class="stats-empty">Lade Statistiken…</div>';

    const [books, archived] = await Promise.all([getAllBooksFromDB(), getAllStatsArchive()]);
    const allEntries = [
        ...books.map(b => ({
            ...b,
            _archived: false,
            wordCount:  b.wordCount || 0,
            pct:        b.wordCount > 0 ? Math.min(100, Math.round(((b.lastIndex||0)/b.wordCount)*100)) : 0,
            coverThumb: b.thumbnail || null,
        })),
        ...archived.filter(a => !a._fromBackup).map(a => ({ ...a, _archived: true })),
    ];

    if (allEntries.length === 0) {
        container.innerHTML = '<div class="stats-empty">Noch keine Bücher in der Bibliothek.<br>Importiere dein erstes Buch,<br>um hier Statistiken zu sehen.</div>';
        return;
    }

    // ── KPI-Aggregate ────────────────────────────────────────────────────────
    const totalBooks    = allEntries.length;
    const activeCount   = books.length;
    const archivedCount = archived.filter(a => !a._fromBackup).length;
    const finishedCount = allEntries.filter(e => e.pct >= 99).length;
    const startedCount  = allEntries.filter(e => (e.lastIndex||0) > 0 && e.pct < 99).length;
    const totalSecs     = allEntries.reduce((s, e) => s + (e.totalReadSeconds||0), 0);
    const totalWords    = allEntries.reduce((s, e) => s + (e.lastIndex||0), 0);
    const wpmEntries    = allEntries.filter(e => e.avgWpm && e.sessionCount);
    const wAvgWpm       = wpmEntries.length > 0
        ? Math.round(wpmEntries.reduce((s,e) => s + e.avgWpm * e.sessionCount, 0) /
                     wpmEntries.reduce((s,e) => s + e.sessionCount, 0))
        : 0;
    const wordsStr = totalWords >= 1000000
        ? `${(totalWords/1000000).toFixed(1)}M`
        : totalWords >= 1000 ? `${Math.round(totalWords/1000)}k` : `${totalWords}`;

    let html = `<div class="info-container">
    <div class="stats-kpi-grid">
        <div class="stats-kpi-card"><div class="stats-kpi-num">${totalBooks}</div><div class="stats-kpi-lbl">Bücher gesamt</div></div>
        <div class="stats-kpi-card"><div class="stats-kpi-num" style="color:var(--accent-green);">${finishedCount}</div><div class="stats-kpi-lbl">Beendet</div></div>
        <div class="stats-kpi-card"><div class="stats-kpi-num" style="color:#f39c12;">${startedCount}</div><div class="stats-kpi-lbl">Begonnen</div></div>
        <div class="stats-kpi-card"><div class="stats-kpi-num">${fmtSecs(totalSecs)}</div><div class="stats-kpi-lbl">Lesezeit gesamt</div></div>
        <div class="stats-kpi-card"><div class="stats-kpi-num">${wAvgWpm > 0 ? wAvgWpm : '–'}</div><div class="stats-kpi-lbl">Ø WPM</div></div>
        <div class="stats-kpi-card"><div class="stats-kpi-num">${wordsStr}</div><div class="stats-kpi-lbl">Wörter gelesen</div></div>
    </div>`;

    // ── Heatmap-Timeline ─────────────────────────────────────────────────────
    const mergedLog = {};
    for (const e of allEntries) {
        for (const [ym, sec] of Object.entries(e.readingLog || {})) {
            mergedLog[ym] = (mergedLog[ym] || 0) + sec;
        }
    }

    const logKeys = Object.keys(mergedLog).sort().reverse();
    if (logKeys.length > 0) {
        const currentYear = new Date().getFullYear().toString();
        const byYear = {};
        for (const ym of logKeys) {
            const [y, m] = ym.split('-');
            if (!byYear[y]) byYear[y] = {};
            byYear[y][m] = mergedLog[ym];
        }
        const years  = Object.keys(byYear).sort().reverse();
        const maxSec = Math.max(...logKeys.map(k => mergedLog[k]));

        html += `<div class="settings-cluster-header" style="margin-bottom:8px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .89-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.11-.89-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>
            Lesezeit
            <span style="font-size:10px;font-weight:400;color:#666;margin-left:6px;">Monat antippen zum Filtern</span>
        </div><div class="stats-timeline">`;

        for (const year of years) {
            const yearSec      = Object.values(byYear[year]).reduce((a,b) => a+b, 0);
            const isCurrentYear = year === currentYear;

            html += `<div class="stats-heatmap-year ${isCurrentYear ? 'open' : ''}" id="year-block-${year}">
                <div class="stats-heatmap-year-header" onclick="this.parentElement.classList.toggle('open')">
                    <span class="stats-heatmap-year-label">📅 ${year}</span>
                    <span class="stats-heatmap-year-meta">
                        <span class="stats-heatmap-year-total">${fmtSecs(yearSec)}</span>
                        <span class="stats-heatmap-year-arrow">▶</span>
                    </span>
                </div>
                <div class="stats-heatmap-grid-wrap">
                    <div class="stats-heatmap-grid">`;

            for (let m = 1; m <= 12; m++) {
                const mKey    = m.toString().padStart(2,'0');
                const ym      = `${year}-${mKey}`;
                const sec     = byYear[year][mKey] || 0;
                const isCurrentMonth = isCurrentYear && m === (new Date().getMonth()+1);
                const isActive = statsMonthFilter === ym;
                const isEmpty  = sec === 0;
                const bg = isActive ? '#3498db' : hmColor(sec, maxSec);
                const timeLabel = sec >= 3600
                    ? `${Math.floor(sec/3600)}h${Math.floor((sec%3600)/60) > 0 ? Math.floor((sec%3600)/60)+'m' : ''}`
                    : sec >= 60 ? `${Math.floor(sec/60)}m` : sec > 0 ? '<1m' : '';
                const currentDot = isCurrentMonth && !isActive
                    ? `<div style="position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:var(--accent-green);"></div>`
                    : '';
                html += `<div class="stats-heatmap-cell${isEmpty ? ' hm-empty' : ''}${isActive ? ' hm-active' : ''}"
                    style="background:${bg};"
                    ${isEmpty ? '' : `onclick="statsSetMonthFilter('${ym}')"`}
                    title="${DE_MONTHS_SHORT[m-1]} ${year}${sec > 0 ? ': ' + fmtSecs(sec) : ' · keine Aktivität'}">
                    ${currentDot}
                    <span class="hm-month-label">${DE_MONTHS_SHORT[m-1]}</span>
                    <span class="hm-month-time">${timeLabel || '–'}</span>
                </div>`;
            }

            const legendHtml = year === years[0] ? `
                <div class="stats-heatmap-legend">
                    <span>wenig</span>
                    <div class="hm-legend-cell" style="background:#0d3a5c;"></div>
                    <div class="hm-legend-cell" style="background:#1a5f8a;"></div>
                    <div class="hm-legend-cell" style="background:#2281b8;"></div>
                    <div class="hm-legend-cell" style="background:#2e9fd6;"></div>
                    <div class="hm-legend-cell" style="background:#3498db;"></div>
                    <span>viel</span>
                </div>` : '';

            html += `</div>${legendHtml}</div></div>`;
        }
        html += `</div>`;
    }

    // ── Bücherliste ───────────────────────────────────────────────────────────
    let listEntries;
    let monthFilterSecs = 0;
    if (statsMonthFilter) {
        listEntries = allEntries
            .map(e => ({ ...e, _monthSecs: (e.readingLog || {})[statsMonthFilter] || 0 }))
            .filter(e => e._monthSecs > 0)
            .sort((a, b) => b._monthSecs - a._monthSecs);
        monthFilterSecs = listEntries.reduce((s, e) => s + e._monthSecs, 0);
    } else {
        listEntries = [...allEntries].sort((a,b) => (b.totalReadSeconds||0) - (a.totalReadSeconds||0));
    }

    const [filterYear, filterMonth] = statsMonthFilter ? statsMonthFilter.split('-') : [null, null];
    const filterLabel    = statsMonthFilter
        ? `${MONTHS_DE[parseInt(filterMonth)-1]} ${filterYear}`
        : 'Alle Bücher';
    const filterSubLabel = statsMonthFilter
        ? `${listEntries.length} Buch${listEntries.length !== 1 ? 'er' : ''} · ${fmtSecs(monthFilterSecs)} gesamt`
        : `${activeCount} aktiv${archivedCount > 0 ? ` · ${archivedCount} archiviert` : ''}`;

    html += `<div class="stats-filter-header">
        <div class="settings-cluster-header" style="margin-bottom:0;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>
            ${filterLabel}
            <span style="color:#666;font-weight:400;font-size:10px;">(${filterSubLabel})</span>
        </div>
        ${statsMonthFilter ? `<button class="stats-filter-reset" onclick="statsSetMonthFilter(null)">✕ Filter aufheben</button>` : ''}
    </div>`;

    if (statsMonthFilter && listEntries.length === 0) {
        html += `<div style="color:#666;font-size:12px;padding:16px 0;text-align:center;">Keine Leseaktivität in diesem Monat.</div>`;
    }

    html += `<div class="stats-book-list">`;

    for (const entry of listEntries) {
        const isDone = entry.pct >= 99;
        const bSecs  = entry.totalReadSeconds || 0;
        const displaySecs = statsMonthFilter ? (entry._monthSecs || 0) : bSecs;
        const spentLabel  = statsMonthFilter ? 'diesen Monat' : 'gelesen';
        const spentStr    = displaySecs > 0 ? `${fmtSecs(displaySecs)} ${spentLabel}` : 'Noch nicht gelesen';

        let rightStr = '', rightColor = '#888';
        if (isDone) {
            rightStr = '✓ Fertig'; rightColor = 'var(--accent-green)';
        } else if (entry._archived && entry.wordCount > 0) {
            const remSec = ((entry.wordCount - (entry.lastIndex||0)) / (wAvgWpm||300)) * 60;
            rightStr = !isDone && remSec >= 60 ? `~${fmtSecs(remSec)} übrig` : '';
        } else if (!entry._archived && entry.estimatedRemainingSeconds != null) {
            const remSec = entry.estimatedRemainingSeconds;
            rightStr = remSec >= 60 ? `~${fmtSecs(remSec)} übrig` : remSec > 0 ? '< 1m übrig' : '';
        }

        const wpmStr    = !statsMonthFilter && entry.avgWpm ? ` · Ø ${Math.round(entry.avgWpm)} WPM` : '';
        const barColor  = isDone ? 'var(--accent-green)' : entry._archived ? '#555' : 'var(--accent)';
        const thumbSrc  = entry._archived ? entry.coverThumb : (entry.thumbnail || null);
        const thumbHtml = thumbSrc
            ? `<img src="${thumbSrc}" class="stats-book-thumb" alt="">`
            : `<div class="stats-book-thumb" style="background:#222;border-radius:4px;"></div>`;
        const isGhost   = entry._archived && entry._fromBackup === true;
        const archBadge = isGhost
            ? `<span class="stats-backup-badge">⚠ Nicht importiert</span>`
            : entry._archived ? `<span class="stats-archive-badge">gelöscht</span>` : '';
        const delDate   = entry._archived && entry.deletedAt
            ? ` · ${new Date(entry.deletedAt).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})}`
            : '';
        const canDelete = entry._archived || isDone;
        const delLabel  = entry._archived ? 'Statistik-Eintrag löschen' : 'Buch aus Bibliothek löschen';
        const safeTitle = (entry.title||'').replace(/'/g, "\\'");
        const delBtn = canDelete
            ? `<button class="stats-book-del-btn" title="${delLabel}" onclick="handleStatsDelete('${entry.id}', ${entry._archived}, '${safeTitle}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>`
            : `<div class="stats-book-del-btn" style="opacity:0;pointer-events:none;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </div>`;

        html += `<div class="stats-book-row ${entry._archived ? 'stats-book-archived' : ''}" data-entry-id="${entry.id}" data-archived="${entry._archived}">
            ${delBtn}
            <div class="stats-book-header">
                ${thumbHtml}
                <div class="stats-book-header-text">
                    <div class="stats-book-title">${entry.title||'Unbenanntes Buch'}${archBadge}</div>
                    <div class="stats-book-author">${entry.author||'Unbekannter Autor'}${delDate}</div>
                </div>
            </div>
            <div class="stats-book-bar-track"><div class="stats-book-bar-fill" style="width:${entry.pct||0}%;background:${barColor};"></div></div>
            <div class="stats-book-meta">
                <span>${entry.pct||0}% · ${spentStr}${wpmStr}</span>
                <span style="color:${rightColor};flex-shrink:0;">${rightStr}</span>
            </div>
        </div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
}

// ── Löschen aus Statistik ─────────────────────────────────────────────────────
export async function handleStatsDelete(id, isArchived, title) {
    if (isArchived === true || isArchived === 'true') {
        const msg = `Statistik-Eintrag "${title}" endgültig löschen?\nDiese Aktion kann nicht rückgängig gemacht werden.`;
        if (!confirm(msg)) return;
        await deleteFromStatsArchive(id);
    } else {
        const book = await getBookFromDB(id);
        if (!book) return;
        const total = book.wordCount || 0;
        const pct   = total > 0 ? Math.round(((book.lastIndex||0) / total) * 100) : 0;
        if (pct < 99) {
            alert(`"${title}" ist noch nicht abgeschlossen (${pct}% gelesen).\nNicht abgeschlossene Bücher können nur direkt aus der Bibliothek entfernt werden.`);
            return;
        }
        const msg = `"${title}" aus der Bibliothek löschen?\nDie Lesestatistik bleibt im Archiv erhalten.`;
        if (!confirm(msg)) return;
        const coverContent = await getBookContentFromDB(id);
        const coverThumb   = coverContent?.cover
            ? await resizeCoverImage(coverContent.cover, 72)
            : (book.thumbnail || null);
        await saveToStatsArchive({
            id:               book.id,
            title:            book.title,
            author:           book.author,
            coverThumb,
            totalReadSeconds: book.totalReadSeconds || 0,
            avgWpm:           book.avgWpm           || 0,
            sessionCount:     book.sessionCount     || 0,
            lastReadDate:     book.lastReadDate      || null,
            wordCount:        total,
            lastIndex:        book.lastIndex         || 0,
            pct:              Math.min(100, pct),
            readingLog:       book.readingLog        || {},
            wpmHistory:       book.wpmHistory        || [],
            deletedAt:        new Date().toISOString(),
        });
        await deleteBookFromDB(id);
        // Globale Reader-State zurücksetzen wenn aktives Buch gelöscht
        if (typeof activeBookId !== 'undefined' && activeBookId === id) {
            setActiveBookId('schnellstart');
            setActiveBookTitle('Freier Text');
            setActiveBookAuthor('');
            setChapterOffsets([]);
            setWords([]);
            setCurrentIndex(0);
        }
    }
    renderLibraryList();
    renderStatsPanel();
}
