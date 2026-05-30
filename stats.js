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
const DE_DAYS_SHORT   = ['Mo','Di','Mi','Do','Fr','Sa','So'];

// ── State ─────────────────────────────────────────────────────────────────────
let statsMonthFilter = null;

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
export function fmtSecs(sec) {
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
    return sec >= 3600 ? `${h}h ${m}m` : sec >= 60 ? `${m}m` : sec > 0 ? '< 1m' : '–';
}

function hmColor(sec, maxS) {
    if (sec === 0) return 'transparent';
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

// ── Aggregations-Hilfsfunktionen ──────────────────────────────────────────────
function getTodayKey() { return new Date().toISOString().substring(0, 10); }
function getWeekKeys() {
    const now = new Date();
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const keys = [];
    for (let i = 0; i <= day; i++) {
        const d = new Date(now); d.setDate(now.getDate() - (day - i));
        keys.push(d.toISOString().substring(0, 10));
    }
    return keys;
}
function getMonthPrefix() { return new Date().toISOString().substring(0, 7); }
function aggregatePeriod(allEntries, keyFilter) {
    let total = 0; const byBook = {};
    for (const e of allEntries) {
        let bookSecs = 0;
        for (const [k, sec] of Object.entries(e.readingLog || {})) { if (keyFilter(k)) bookSecs += sec; }
        if (bookSecs > 0) { total += bookSecs; byBook[e.id || e.title] = { title: e.title || 'Unbenannt', secs: bookSecs }; }
    }
    return { total, byBook };
}
function weeklyAvgSecs(allEntries) {
    const counts = {};
    for (const e of allEntries) {
        for (const [k] of Object.entries(e.readingLog || {})) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
            const d = new Date(k), mon = d.getDay() === 0 ? 6 : d.getDay() - 1;
            const monday = new Date(d); monday.setDate(d.getDate() - mon);
            const wk = monday.toISOString().substring(0, 10);
            counts[wk] = (counts[wk] || 0) + (e.readingLog[k] || 0);
        }
    }
    const vals = Object.values(counts).filter(v => v > 0);
    return vals.length ? Math.round(vals.reduce((a,b) => a+b,0) / vals.length) : 0;
}
function monthlyAvgSecs(allEntries) {
    const counts = {};
    for (const e of allEntries) {
        for (const [k, sec] of Object.entries(e.readingLog || {})) {
            const prefix = k.substring(0, 7); counts[prefix] = (counts[prefix] || 0) + sec;
        }
    }
    const vals = Object.values(counts).filter(v => v > 0);
    return vals.length ? Math.round(vals.reduce((a,b) => a+b,0) / vals.length) : 0;
}

// ── Section-Header Helper ─────────────────────────────────────────────────────
function sectionHeader(iconPath, label, sub = '') {
    return `<div class="ss-header">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">${iconPath}</svg>
        <span class="ss-header-label">${label}</span>
        ${sub ? `<span class="ss-header-sub">${sub}</span>` : ''}
    </div>`;
}

// ── Stat-Row Helper (einheitliche horizontale Zeile mit Balken) ───────────────
function statRow(label, value, pct, color = 'var(--accent)', isToday = false, subLabel = '') {
    return `<div class="ss-stat-row${isToday ? ' ss-today' : ''}">
        <span class="ss-row-label">${label}</span>
        <div class="ss-row-bar-wrap">
            <div class="ss-row-bar" style="width:${Math.max(0, Math.min(100, pct))}%;background:${color};"></div>
        </div>
        <div class="ss-row-right">
            <span class="ss-row-value">${value}</span>
            ${subLabel ? `<span class="ss-row-sub">${subLabel}</span>` : ''}
        </div>
    </div>`;
}

// ── Quick-Overview ─────────────────────────────────────────────────────────────
function buildQuickOverview(allEntries) {
    const todayKey = getTodayKey();
    const weekKeys = new Set(getWeekKeys());
    const monthPfx = getMonthPrefix();

    const today = aggregatePeriod(allEntries, k => k === todayKey);
    const week  = aggregatePeriod(allEntries, k => weekKeys.has(k));
    const month = aggregatePeriod(allEntries, k => k.startsWith(monthPfx));
    const wAvg  = weeklyAvgSecs(allEntries);
    const mAvg  = monthlyAvgSecs(allEntries);

    // ── Heute-Detail: Bücher die heute gelesen wurden ──────────────────────────
    const todayBooks = Object.values(today.byBook).sort((a,b) => b.secs - a.secs);
    const todayMaxSec = todayBooks.length ? todayBooks[0].secs : 1;
    const todayRows = todayBooks.length
        ? todayBooks.map(b => statRow(b.title, fmtSecs(b.secs), b.secs / todayMaxSec * 100)).join('')
        : `<div class="ss-empty-hint">Heute noch nichts gelesen.</div>`;

    // ── Woche: Mo–aktueller Tag als Balken ────────────────────────────────────
    const weekArr = [...weekKeys];
    const weekSecs = weekArr.map(k => { let s = 0; for (const e of allEntries) s += (e.readingLog||{})[k]||0; return s; });
    const weekMax = Math.max(...weekSecs, 1);
    const weekRows = weekArr.map((k, i) => {
        const s = weekSecs[i];
        const isT = k === todayKey;
        return statRow(DE_DAYS_SHORT[i], s > 0 ? fmtSecs(s) : '–', s / weekMax * 100,
            isT ? 'var(--accent-green)' : 'var(--accent)', isT);
    }).join('');

    // ── Monat: Tage mit Aktivität als Balken (kompakt, gruppiert) ─────────────
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const monthDays = [];
    let monthMax = 1;
    for (let d = 1; d <= daysInMonth; d++) {
        const key = `${monthPfx}-${String(d).padStart(2,'0')}`;
        let s = 0; for (const e of allEntries) s += (e.readingLog||{})[key]||0;
        monthDays.push({ d, key, s });
        if (s > monthMax) monthMax = s;
    }
    // Nur Tage mit Aktivität + heute anzeigen, max 15 Zeilen
    const activeDays = monthDays.filter(x => x.s > 0 || x.key === todayKey);
    const monthRows = activeDays.length
        ? activeDays.map(({ d, key, s }) => {
            const isT = key === todayKey;
            const label = `${d}. ${DE_MONTHS_SHORT[now.getMonth()]}`;
            return statRow(label, s > 0 ? fmtSecs(s) : '–', s / monthMax * 100,
                isT ? 'var(--accent-green)' : 'var(--accent)', isT);
        }).join('')
        : `<div class="ss-empty-hint">Diesen Monat noch nichts gelesen.</div>`;

    // ── 3 klappbare Kacheln ───────────────────────────────────────────────────
    const tile = (id, label, value, subValue, rows) => `
        <div class="ss-period-tile" id="ss-tile-${id}" onclick="statsToggleDetail('${id}')">
            <div class="ss-tile-head">
                <span class="ss-tile-label">${label}</span>
                <span class="ss-tile-value">${value}</span>
                <span class="ss-tile-chevron">›</span>
            </div>
            ${subValue ? `<div class="ss-tile-sub">${subValue}</div>` : ''}
            <div class="ss-tile-body" id="ss-detail-${id}" style="display:none;">
                <div class="ss-tile-rows">${rows}</div>
            </div>
        </div>`;

    const todaySub  = today.total > 0 ? `${Object.keys(today.byBook).length} Buch${Object.keys(today.byBook).length !== 1 ? 'er' : ''}` : '';
    const weekSub   = week.total  > 0 ? (wAvg > 0 ? `Ø ${fmtSecs(Math.round(wAvg/7))}/Tag` : '') : '';
    const monthSub  = month.total > 0 ? (mAvg > 0 ? `Ø ${fmtSecs(Math.round(mAvg/daysInMonth))}/Tag` : '') : '';

    return `<div class="ss-section">
        ${sectionHeader('<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>', 'Aktuell')}
        <div class="ss-period-stack">
            ${tile('today', 'Heute',        today.total > 0 ? fmtSecs(today.total) : '–', todaySub,  todayRows)}
            ${tile('week',  'Diese Woche',  week.total  > 0 ? fmtSecs(week.total)  : '–', weekSub,   weekRows)}
            ${tile('month', 'Dieser Monat', month.total > 0 ? fmtSecs(month.total) : '–', monthSub,  monthRows)}
        </div>
    </div>`;
}

export function statsToggleDetail(id) {
    const body = document.getElementById('ss-detail-' + id);
    const tile = document.getElementById('ss-tile-' + id);
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    // Alle schließen
    ['today','week','month'].forEach(k => {
        const b = document.getElementById('ss-detail-' + k);
        const t = document.getElementById('ss-tile-' + k);
        if (b) b.style.display = 'none';
        if (t) t.classList.remove('ss-tile-open');
    });
    if (!isOpen) { body.style.display = 'block'; tile.classList.add('ss-tile-open'); }
}

// ── Haupt-Render ──────────────────────────────────────────────────────────────
export async function renderStatsPanel() {
    const container = document.getElementById('stats-content');
    if (!container) return;
    container.innerHTML = '<div class="stats-empty">Lade…</div>';

    const [books, archived] = await Promise.all([getAllBooksFromDB(), getAllStatsArchive()]);
    const allEntries = [
        ...books.map(b => ({ ...b, _archived: false, wordCount: b.wordCount||0,
            pct: b.wordCount > 0 ? Math.min(100, Math.round(((b.lastIndex||0)/b.wordCount)*100)) : 0,
            coverThumb: b.thumbnail || null })),
        ...archived.map(a => ({ ...a, _archived: true })),
    ];

    if (allEntries.length === 0) {
        container.innerHTML = '<div class="stats-empty">Noch keine Bücher in der Bibliothek.<br>Importiere dein erstes Buch,<br>um hier Statistiken zu sehen.</div>';
        return;
    }

    // ── KPIs ─────────────────────────────────────────────────────────────────
    const activeCount   = books.length;
    const archivedCount = archived.length;
    const finishedCount = allEntries.filter(e => e.pct >= 99).length;
    const startedCount  = allEntries.filter(e => (e.lastIndex||0) > 0 && e.pct < 99).length;
    const totalSecs     = allEntries.reduce((s, e) => s + (e.totalReadSeconds||0), 0);
    const totalWords    = allEntries.reduce((s, e) => s + (e.totalWordsDisplayed||0), 0);
    const wpmEntries    = allEntries.filter(e => e.avgWpm && e.sessionCount);
    const wAvgWpm       = wpmEntries.length > 0
        ? Math.round(wpmEntries.reduce((s,e) => s + e.avgWpm * e.sessionCount, 0) / wpmEntries.reduce((s,e) => s + e.sessionCount, 0))
        : 0;
    const wordsStr = totalWords >= 1000000 ? `${(totalWords/1000000).toFixed(1)}M`
        : totalWords >= 1000 ? `${Math.round(totalWords/1000)}k` : `${totalWords}`;

    // KPI-Grid: 2×3 einheitliche Kacheln
    const kpiIcon = (path) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">${path}</svg>`;
    const kpiCard = (icon, num, lbl, color='var(--accent)') =>
        `<div class="ss-kpi-card"><div class="ss-kpi-icon">${icon}</div><div class="ss-kpi-num" style="color:${color};">${num}</div><div class="ss-kpi-lbl">${lbl}</div></div>`;

    let html = `<div class="ss-wrap">`;

    // KPI-Section
    html += `<div class="ss-section ss-kpi-section">
        ${sectionHeader('<path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/>', 'Übersicht')}
        <div class="ss-kpi-grid">
            ${kpiCard(kpiIcon('<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>'), activeCount + archivedCount, 'Bücher gesamt')}
            ${kpiCard(kpiIcon('<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>'), finishedCount, 'Beendet', 'var(--accent-green)')}
            ${kpiCard(kpiIcon('<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>'), startedCount, 'Begonnen', '#f39c12')}
            ${kpiCard(kpiIcon('<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>'), fmtSecs(totalSecs), 'Lesezeit')}
            ${kpiCard(kpiIcon('<path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"/>'), wAvgWpm > 0 ? `${wAvgWpm}` : '–', 'Ø WPM')}
            ${kpiCard(kpiIcon('<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>'), totalWords > 0 ? wordsStr : '–', 'Wörter gelesen')}
        </div>
    </div>`;

    // Quick-Overview
    html += buildQuickOverview(allEntries);

    // ── Heatmap ───────────────────────────────────────────────────────────────
    const mergedLog = {};
    for (const e of allEntries) {
        for (const [key, sec] of Object.entries(e.readingLog || {})) {
            const ym = key.length === 10 ? key.substring(0, 7) : key;
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
        const years = Object.keys(byYear).sort().reverse();
        const maxSec = Math.max(...logKeys.map(k => mergedLog[k]));

        html += `<div class="ss-section">
            ${sectionHeader('<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>', 'Verlauf', 'Monat antippen zum Filtern')}
            <div class="ss-heatmap-years">`;

        for (const year of years) {
            const yearSec = Object.values(byYear[year]).reduce((a,b) => a+b, 0);
            const isCurrentYear = year === currentYear;
            html += `<div class="ss-heatmap-year ${isCurrentYear ? 'open' : ''}" id="year-block-${year}">
                <div class="ss-heatmap-year-row" onclick="this.parentElement.classList.toggle('open')">
                    <span class="ss-heatmap-year-lbl">${year}</span>
                    <span class="ss-heatmap-year-total">${fmtSecs(yearSec)}</span>
                    <span class="ss-heatmap-chevron">›</span>
                </div>
                <div class="ss-heatmap-grid-wrap">
                    <div class="ss-heatmap-grid">`;

            for (let m = 1; m <= 12; m++) {
                const mKey = m.toString().padStart(2,'0');
                const ym = `${year}-${mKey}`;
                const sec = byYear[year][mKey] || 0;
                const isActive = statsMonthFilter === ym;
                const isCurrentMonth = isCurrentYear && m === (new Date().getMonth()+1);
                const isEmpty = sec === 0;
                const bg = isActive ? 'var(--accent)' : hmColor(sec, maxSec);
                const timeLabel2 = sec >= 3600 ? `${Math.floor(sec/3600)}h${Math.floor((sec%3600)/60)>0?Math.floor((sec%3600)/60)+'m':''}` : sec >= 60 ? `${Math.floor(sec/60)}m` : sec > 0 ? '<1m' : '';

                html += `<div class="ss-hm-cell${isEmpty ? ' ss-hm-empty' : ''}${isActive ? ' ss-hm-active' : ''}"
                    style="background:${bg};"
                    ${isEmpty ? '' : `onclick="statsSetMonthFilter('${ym}')"`}
                    title="${DE_MONTHS_SHORT[m-1]} ${year}${sec > 0 ? ': '+fmtSecs(sec) : ''}">
                    ${isCurrentMonth && !isActive ? `<div class="ss-hm-dot"></div>` : ''}
                    <span class="ss-hm-lbl">${DE_MONTHS_SHORT[m-1]}</span>
                    <span class="ss-hm-time">${timeLabel2 || '–'}</span>
                </div>`;
            }

            const isFirstYear = year === years[0];
            const legendHtml = isFirstYear ? `<div class="ss-hm-legend"><span>wenig</span>${[0.1,0.3,0.55,0.75,1.0].map(t=>`<div class="ss-hm-legend-cell" style="background:${hmColor(t*maxSec,maxSec)};"></div>`).join('')}<span>viel</span></div>` : '';

            html += `</div>${legendHtml}</div></div>`;
        }
        html += `</div></div>`;
    }

    // ── Bücherliste ───────────────────────────────────────────────────────────
    let listEntries;
    let monthFilterSecs = 0;
    if (statsMonthFilter) {
        listEntries = allEntries
            .map(e => ({ ...e, _monthSecs: Object.entries(e.readingLog||{}).filter(([k]) => k.startsWith(statsMonthFilter)).reduce((s,[,v]) => s+v, 0) }))
            .filter(e => e._monthSecs > 0)
            .sort((a, b) => b._monthSecs - a._monthSecs);
        monthFilterSecs = listEntries.reduce((s, e) => s + e._monthSecs, 0);
    } else {
        listEntries = [...allEntries].sort((a,b) => (b.totalReadSeconds||0) - (a.totalReadSeconds||0));
    }

    const [filterYear, filterMonth] = statsMonthFilter ? statsMonthFilter.split('-') : [null, null];
    const filterLabel    = statsMonthFilter ? `${MONTHS_DE[parseInt(filterMonth)-1]} ${filterYear}` : 'Alle Bücher';
    const filterSubLabel = statsMonthFilter
        ? `${listEntries.length} Buch${listEntries.length !== 1 ? 'er' : ''} · ${fmtSecs(monthFilterSecs)}`
        : `${activeCount} aktiv${archivedCount > 0 ? ` · ${archivedCount} archiviert` : ''}`;

    html += `<div class="ss-section">
        <div class="ss-section-filter-row">
            ${sectionHeader('<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>', filterLabel, filterSubLabel)}
            ${statsMonthFilter ? `<button class="ss-filter-reset" onclick="statsSetMonthFilter(null)">✕ Filter aufheben</button>` : ''}
        </div>`;

    if (statsMonthFilter && listEntries.length === 0) {
        html += `<div class="ss-empty-hint">Keine Leseaktivität in diesem Monat.</div>`;
    }

    html += `<div class="ss-book-list">`;

    for (const entry of listEntries) {
        const isDone = entry.pct >= 99;
        const displaySecs = statsMonthFilter ? (entry._monthSecs||0) : (entry.totalReadSeconds||0);
        const spentStr = displaySecs > 0 ? fmtSecs(displaySecs) : '–';
        const wpmStr   = !statsMonthFilter && entry.avgWpm ? `${Math.round(entry.avgWpm)} WPM` : '';
        const barColor = isDone ? 'var(--accent-green)' : entry._archived ? '#555' : 'var(--accent)';

        let statusStr = '', statusColor = '#888';
        if (isDone) { statusStr = '✓ Fertig'; statusColor = 'var(--accent-green)'; }
        else if (entry._archived && entry.wordCount > 0) {
            const remSec = ((entry.wordCount - (entry.lastIndex||0)) / (wAvgWpm||300)) * 60;
            if (remSec >= 60) { statusStr = `~${fmtSecs(remSec)} übrig`; }
        } else if (!entry._archived && entry.estimatedRemainingSeconds != null) {
            const remSec = entry.estimatedRemainingSeconds;
            if (remSec >= 60) { statusStr = `~${fmtSecs(remSec)} übrig`; }
            else if (remSec > 0) { statusStr = '< 1m übrig'; }
        }

        const thumbSrc = entry._archived ? entry.coverThumb : (entry.thumbnail || null);
        const thumbHtml = thumbSrc
            ? `<img src="${thumbSrc}" class="ss-book-thumb" alt="">`
            : `<div class="ss-book-thumb ss-book-thumb-placeholder"></div>`;

        const isGhost = entry._archived && entry._fromBackup === true;
        const archBadge = isGhost
            ? `<span class="ss-badge ss-badge-ghost">⚠ Nicht importiert</span>`
            : entry._archived ? `<span class="ss-badge ss-badge-archive">archiviert</span>` : '';
        const delDate = entry._archived && entry.deletedAt
            ? new Date(entry.deletedAt).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'})
            : '';

        const canDelete = entry._archived || isDone;
        const delLabel  = entry._archived ? 'Eintrag löschen' : 'Buch löschen';
        const safeTitle = (entry.title||'').replace(/'/g, "\\'");
        const delBtn = canDelete
            ? `<button class="ss-book-del" title="${delLabel}" onclick="handleStatsDelete('${entry.id}', ${entry._archived}, '${safeTitle}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>`
            : `<div class="ss-book-del" style="opacity:0;pointer-events:none;"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></div>`;

        html += `<div class="ss-book-row${entry._archived ? ' ss-book-archived' : ''}">
            ${delBtn}
            <div class="ss-book-inner">
                ${thumbHtml}
                <div class="ss-book-content">
                    <div class="ss-book-title">${entry.title||'Unbenanntes Buch'}${archBadge}</div>
                    <div class="ss-book-author">${entry.author||'Unbekannter Autor'}${delDate ? ` · ${delDate}` : ''}</div>
                    <div class="ss-book-bar-wrap">
                        <div class="ss-book-bar" style="width:${entry.pct||0}%;background:${barColor};"></div>
                    </div>
                    <div class="ss-book-meta-row">
                        <span class="ss-book-pct">${entry.pct||0}%</span>
                        <span class="ss-book-time">${spentStr}</span>
                        ${wpmStr ? `<span class="ss-book-wpm">${wpmStr}</span>` : ''}
                        ${statusStr ? `<span class="ss-book-status" style="color:${statusColor};margin-left:auto;">${statusStr}</span>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }

    html += `</div></div></div>`;
    container.innerHTML = html;
}

// ── Löschen aus Statistik ─────────────────────────────────────────────────────
export async function handleStatsDelete(id, isArchived, title) {
    if (isArchived === true || isArchived === 'true') {
        if (!confirm(`Statistik-Eintrag "${title}" endgültig löschen?\nDiese Aktion kann nicht rückgängig gemacht werden.`)) return;
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
        if (!confirm(`"${title}" aus der Bibliothek löschen?\nDie Lesestatistik bleibt im Archiv erhalten.`)) return;
        const coverContent = await getBookContentFromDB(id);
        const coverThumb   = coverContent?.cover ? await resizeCoverImage(coverContent.cover, 72) : (book.thumbnail || null);
        await saveToStatsArchive({
            id: book.id, title: book.title, author: book.author, coverThumb,
            totalReadSeconds: book.totalReadSeconds||0, avgWpm: book.avgWpm||0,
            sessionCount: book.sessionCount||0, lastReadDate: book.lastReadDate||null,
            wordCount: total, lastIndex: book.lastIndex||0, pct: Math.min(100, pct),
            readingLog: book.readingLog||{}, wpmHistory: book.wpmHistory||[],
            deletedAt: new Date().toISOString(),
        });
        await deleteBookFromDB(id);
        if (typeof activeBookId !== 'undefined' && activeBookId === id) {
            setActiveBookId('schnellstart'); setActiveBookTitle('Freier Text'); setActiveBookAuthor('');
            setChapterOffsets([]); setWords([]); setCurrentIndex(0);
        }
    }
    renderLibraryList();
    renderStatsPanel();
}
