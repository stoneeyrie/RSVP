// RSVP Speed Reader – achievements.js
// Gamification: Badges, Streaks, Meilensteine

import { getAllBooksFromDB, getAllStatsArchive } from './db.js';

// ── Badge-Definitionen ────────────────────────────────────────────────────────
export const BADGE_CATEGORIES = [
    {
        id: 'streak',
        name: 'Täglicher Streak',
        icon: '🔥',
        levels: [
            { id: 'streak_3',    label: 'Funke',         desc: '3 Tage in Folge gelesen',     threshold: 3   },
            { id: 'streak_7',    label: 'Wochenleser',   desc: '7 Tage in Folge gelesen',     threshold: 7   },
            { id: 'streak_30',   label: 'Monatsleser',   desc: '30 Tage in Folge gelesen',    threshold: 30  },
            { id: 'streak_100',  label: 'Unaufhaltsam',  desc: '100 Tage in Folge gelesen',   threshold: 100 },
            { id: 'streak_365',  label: 'Jahresleser',   desc: '365 Tage in Folge gelesen',   threshold: 365 },
        ],
    },
    {
        id: 'books_finished',
        name: 'Bücher beendet',
        icon: '📗',
        levels: [
            { id: 'fin_1',   label: 'Erstes Buch',       desc: '1 Buch abgeschlossen',        threshold: 1   },
            { id: 'fin_5',   label: 'Bücherregal',       desc: '5 Bücher abgeschlossen',      threshold: 5   },
            { id: 'fin_10',  label: 'Vielleser',         desc: '10 Bücher abgeschlossen',     threshold: 10  },
            { id: 'fin_25',  label: 'Bibliothek',        desc: '25 Bücher abgeschlossen',     threshold: 25  },
            { id: 'fin_50',  label: 'Buchmeister',       desc: '50 Bücher abgeschlossen',     threshold: 50  },
            { id: 'fin_100', label: 'Legendärer Leser',  desc: '100 Bücher abgeschlossen',    threshold: 100 },
        ],
    },
    {
        id: 'books_imported',
        name: 'Bücher importiert',
        icon: '📥',
        levels: [
            { id: 'imp_1',  label: 'Erster Import',      desc: '1 Buch importiert',           threshold: 1  },
            { id: 'imp_5',  label: 'Sammler',            desc: '5 Bücher importiert',         threshold: 5  },
            { id: 'imp_15', label: 'Kurator',            desc: '15 Bücher importiert',        threshold: 15 },
            { id: 'imp_30', label: 'Archivar',           desc: '30 Bücher importiert',        threshold: 30 },
            { id: 'imp_75', label: 'Großbibliothek',     desc: '75 Bücher importiert',        threshold: 75 },
        ],
    },
    {
        id: 'words_read',
        name: 'Wörter gelesen',
        icon: '📖',
        levels: [
            { id: 'words_10k',  label: 'Erste Seiten',   desc: '10.000 Wörter gelesen',       threshold: 10000   },
            { id: 'words_50k',  label: 'Kurzgeschichte', desc: '50.000 Wörter gelesen',       threshold: 50000   },
            { id: 'words_250k', label: 'Roman',          desc: '250.000 Wörter gelesen',      threshold: 250000  },
            { id: 'words_1m',   label: 'Millionär',      desc: '1.000.000 Wörter gelesen',    threshold: 1000000 },
            { id: 'words_5m',   label: 'Wortgigant',     desc: '5.000.000 Wörter gelesen',    threshold: 5000000 },
        ],
    },
    {
        id: 'reading_time',
        name: 'Gesamte Lesezeit',
        icon: '⏱️',
        levels: [
            { id: 'time_1h',    label: 'Erste Stunde',   desc: '1 Stunde gelesen',            threshold: 3600    },
            { id: 'time_10h',   label: 'Zehnstünder',    desc: '10 Stunden gelesen',          threshold: 36000   },
            { id: 'time_50h',   label: 'Ausdauerleser',  desc: '50 Stunden gelesen',          threshold: 180000  },
            { id: 'time_200h',  label: 'Vollzeit-Leser', desc: '200 Stunden gelesen',         threshold: 720000  },
            { id: 'time_1000h', label: 'Zehntausender',  desc: '1000 Stunden gelesen',        threshold: 3600000 },
        ],
    },
    {
        id: 'wpm_speed',
        name: 'Lesegeschwindigkeit',
        icon: '⚡',
        levels: [
            { id: 'wpm_300',  label: 'Durchschnittsleser', desc: 'Ø 300 WPM erreicht',        threshold: 300  },
            { id: 'wpm_400',  label: 'Schnellleser',       desc: 'Ø 400 WPM erreicht',        threshold: 400  },
            { id: 'wpm_500',  label: 'RSVP-Einsteiger',    desc: 'Ø 500 WPM erreicht',        threshold: 500  },
            { id: 'wpm_700',  label: 'RSVP-Profi',         desc: 'Ø 700 WPM erreicht',        threshold: 700  },
            { id: 'wpm_1000', label: 'Speedreader',        desc: 'Ø 1000 WPM erreicht',       threshold: 1000 },
        ],
    },
    {
        id: 'reading_days',
        name: 'Lesetage gesamt',
        icon: '📅',
        levels: [
            { id: 'days_7',    label: 'Erste Woche',     desc: '7 Tage gelesen',              threshold: 7    },
            { id: 'days_30',   label: 'Erster Monat',    desc: '30 Tage gelesen',             threshold: 30   },
            { id: 'days_100',  label: 'Hundert Tage',    desc: '100 Tage gelesen',            threshold: 100  },
            { id: 'days_365',  label: 'Ein Jahr',        desc: '365 Tage gelesen',            threshold: 365  },
            { id: 'days_1000', label: 'Tausend Tage',    desc: '1000 Tage gelesen',           threshold: 1000 },
        ],
    },
    {
        id: 'sessions',
        name: 'Lesesessions',
        icon: '▶️',
        levels: [
            { id: 'sess_10',   label: 'Warm-up',         desc: '10 Sessions gestartet',       threshold: 10   },
            { id: 'sess_50',   label: 'Routineleser',    desc: '50 Sessions gestartet',       threshold: 50   },
            { id: 'sess_200',  label: 'Diszipliniert',   desc: '200 Sessions gestartet',      threshold: 200  },
            { id: 'sess_500',  label: 'Unermüdlich',     desc: '500 Sessions gestartet',      threshold: 500  },
            { id: 'sess_2000', label: 'Leseautomat',     desc: '2000 Sessions gestartet',     threshold: 2000 },
        ],
    },
];

// ── Streak berechnen ──────────────────────────────────────────────────────────
export function calculateStreak(allEntries) {
    const allDays = new Set();
    for (const e of allEntries) {
        for (const key of Object.keys(e.readingLog || {})) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(key)) allDays.add(key);
        }
    }
    const toKey = d => d.toISOString().substring(0, 10);
    let streak = 0;
    let check = new Date();
    if (!allDays.has(toKey(check))) check.setDate(check.getDate() - 1);
    while (allDays.has(toKey(check))) {
        streak++;
        check.setDate(check.getDate() - 1);
    }
    return streak;
}

export function calculateTotalReadingDays(allEntries) {
    const allDays = new Set();
    for (const e of allEntries) {
        for (const key of Object.keys(e.readingLog || {})) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(key)) allDays.add(key);
        }
    }
    return allDays.size;
}

// ── Alle Werte berechnen ──────────────────────────────────────────────────────
export async function computeAchievementValues() {
    const [books, archived] = await Promise.all([getAllBooksFromDB(), getAllStatsArchive()]);
    const allEntries = [
        ...books.map(b => ({ ...b, _archived: false })),
        ...archived.map(a => ({ ...a, _archived: true })),
    ];

    const totalWords    = allEntries.reduce((s, e) => s + (e.totalWordsDisplayed || 0), 0);
    const totalSecs     = allEntries.reduce((s, e) => s + (e.totalReadSeconds || 0), 0);
    const totalSessions = allEntries.reduce((s, e) => s + (e.sessionCount || 0), 0);
    const booksFinished = allEntries.filter(e => {
        const wc = e.wordCount || e.totalWords || 0;
        return wc > 0 && ((e.lastIndex || 0) / wc) >= 0.99;
    }).length;
    const booksImported = books.length + archived.length;
    const streak        = calculateStreak(allEntries);
    const readingDays   = calculateTotalReadingDays(allEntries);

    const wpmEntries = allEntries.filter(e => e.avgWpm && e.sessionCount);
    const avgWpm = wpmEntries.length > 0
        ? Math.round(wpmEntries.reduce((s, e) => s + e.avgWpm * e.sessionCount, 0)
            / wpmEntries.reduce((s, e) => s + e.sessionCount, 0))
        : 0;

    return {
        streak,
        books_finished: booksFinished,
        books_imported: booksImported,
        words_read:     totalWords,
        reading_time:   totalSecs,
        wpm_speed:      avgWpm,
        reading_days:   readingDays,
        sessions:       totalSessions,
    };
}

// ── Freigeschaltete Badges ────────────────────────────────────────────────────
export function getUnlockedBadges(values) {
    const unlocked = [];
    for (const cat of BADGE_CATEGORIES) {
        const val = values[cat.id] || 0;
        for (const level of cat.levels) {
            if (val >= level.threshold) {
                unlocked.push({ ...level, categoryId: cat.id, categoryName: cat.name, catIcon: cat.icon });
            }
        }
    }
    return unlocked;
}

export function getNewBadges(unlockedBadges) {
    const seen = JSON.parse(localStorage.getItem('rsvp-seen-badges') || '[]');
    return unlockedBadges.filter(b => !seen.includes(b.id));
}

export function markBadgesAsSeen(badges) {
    const seen = JSON.parse(localStorage.getItem('rsvp-seen-badges') || '[]');
    const newSeen = [...new Set([...seen, ...badges.map(b => b.id)])];
    localStorage.setItem('rsvp-seen-badges', JSON.stringify(newSeen));
}

// ── Formatierung ──────────────────────────────────────────────────────────────
export function formatAchievementValue(categoryId, value) {
    switch (categoryId) {
        case 'words_read':   return value >= 1000000 ? `${(value/1000000).toFixed(1)}M` : value >= 1000 ? `${Math.round(value/1000)}k` : `${value}`;
        case 'reading_time': { const h = Math.floor(value/3600), m = Math.floor((value%3600)/60); return h >= 1 ? `${h}h ${m}m` : `${m}m`; }
        case 'wpm_speed':    return `${value} WPM`;
        default:             return `${value}`;
    }
}

// ── Panel rendern ─────────────────────────────────────────────────────────────
export async function renderAchievementsPanel() {
    const container = document.getElementById('achievements-content');
    if (!container) return;
    container.innerHTML = '<div class="stats-empty">Lade…</div>';

    const values    = await computeAchievementValues();
    const unlocked  = getUnlockedBadges(values);
    const newBadges = getNewBadges(unlocked);
    if (newBadges.length > 0) markBadgesAsSeen(newBadges);

    const totalBadges = BADGE_CATEGORIES.reduce((s, c) => s + c.levels.length, 0);
    const pct = Math.round((unlocked.length / totalBadges) * 100);
    const streakVal = values.streak;
    const streakFlame = streakVal >= 30 ? '🔥🔥🔥' : streakVal >= 7 ? '🔥🔥' : streakVal > 0 ? '🔥' : '💤';

    let html = `<div class="ach-wrap">`;

    // ── Streak Hero ───────────────────────────────────────────────────────────
    html += `<div class="ach-streak-hero">
        <div class="ach-streak-flame">${streakFlame}</div>
        <div class="ach-streak-num">${streakVal}</div>
        <div class="ach-streak-lbl">Tage Streak</div>
        <div class="ach-streak-hint">${streakVal === 0 ? 'Lies heute, um deinen Streak zu starten!' : 'Lies heute, um ihn am Leben zu halten!'}</div>
    </div>`;

    // ── Gesamt-Fortschritt ────────────────────────────────────────────────────
    html += `<div class="ach-progress-section">
        <div class="ach-progress-row">
            <span class="ach-progress-label">Badges freigeschaltet</span>
            <span class="ach-progress-count">${unlocked.length} / ${totalBadges}</span>
        </div>
        <div class="ach-progress-bar-bg">
            <div class="ach-progress-bar-fill" style="width:${pct}%"></div>
        </div>
    </div>`;

    // ── Neu freigeschaltet ────────────────────────────────────────────────────
    if (newBadges.length > 0) {
        html += `<div class="ach-new-banner">🎉 Neu freigeschaltet: ${newBadges.map(b => `<strong>${b.label}</strong>`).join(', ')}</div>`;
    }

    // ── Kategorien ────────────────────────────────────────────────────────────
    for (const cat of BADGE_CATEGORIES) {
        const val = values[cat.id] || 0;
        const catUnlocked = cat.levels.filter(l => val >= l.threshold);
        const nextLevel   = cat.levels.find(l => val < l.threshold);
        const allDone     = catUnlocked.length === cat.levels.length;

        html += `<div class="ach-category">
            <div class="ach-cat-header">
                <span class="ach-cat-icon">${cat.icon}</span>
                <span class="ach-cat-name">${cat.name}</span>
                <span class="ach-cat-count">${catUnlocked.length}/${cat.levels.length}</span>
            </div>`;

        if (nextLevel && !allDone) {
            const prog   = Math.min(1, val / nextLevel.threshold);
            const valFmt = formatAchievementValue(cat.id, val);
            const tFmt   = formatAchievementValue(cat.id, nextLevel.threshold);
            html += `<div class="ach-next-progress">
                <div class="ach-next-row">
                    <span class="ach-next-label">Nächste Stufe: <strong>${nextLevel.label}</strong></span>
                    <span class="ach-next-val">${valFmt} / ${tFmt}</span>
                </div>
                <div class="ach-next-bar-bg"><div class="ach-next-bar-fill" style="width:${prog*100}%"></div></div>
            </div>`;
        }

        html += `<div class="ach-badge-grid">`;
        for (const level of cat.levels) {
            const isUnlocked = val >= level.threshold;
            const isNew      = newBadges.some(b => b.id === level.id);
            html += `<div class="ach-badge ${isUnlocked ? 'ach-badge-unlocked' : 'ach-badge-locked'}${isNew ? ' ach-badge-new' : ''}">
                <div class="ach-badge-icon">${isUnlocked ? cat.icon : '🔒'}</div>
                <div class="ach-badge-label">${level.label}</div>
                <div class="ach-badge-desc">${level.desc}</div>
                ${isUnlocked ? `<div class="ach-badge-check">✓</div>` : ''}
            </div>`;
        }
        html += `</div></div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}

// ── Toast-Notification ────────────────────────────────────────────────────────
export function showBadgeToast(badge) {
    const existing = document.getElementById('badge-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'badge-toast';
    toast.className = 'badge-toast';
    toast.innerHTML = `
        <div class="badge-toast-icon">${badge.catIcon || '🏆'}</div>
        <div class="badge-toast-text">
            <div class="badge-toast-title">Badge freigeschaltet!</div>
            <div class="badge-toast-name">${badge.label}</div>
            <div class="badge-toast-desc">${badge.desc}</div>
        </div>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('badge-toast-visible'), 50);
    setTimeout(() => { toast.classList.remove('badge-toast-visible'); setTimeout(() => toast.remove(), 400); }, 3500);
}

// ── Nach Session prüfen ───────────────────────────────────────────────────────
export async function checkForNewBadgesAfterSession() {
    const values    = await computeAchievementValues();
    const unlocked  = getUnlockedBadges(values);
    const newBadges = getNewBadges(unlocked);
    if (newBadges.length > 0) {
        markBadgesAsSeen(newBadges);
        showBadgeToast(newBadges[newBadges.length - 1]);
    }
}
