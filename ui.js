import {
    getBookFromDB, saveBookToDB, getAppState, saveAppState,
} from './db.js';
import {
    stopEngineOnly, saveSessionStats,
    estimateBookRemainingSeconds,
    words, currentIndex, chapterOffsets, activeBookId,
    isPageMode,
} from './reader.js';
import { renderLibraryList, renderReaderChapterList, loadLibraryBook } from './library.js';
import { renderStatsPanel } from './stats.js';

// RSVP Speed Reader – ui.js
// Navigation, Menüs, Panel-Umschaltung, PWA-Banner

// ── Menü-Steuerung ────────────────────────────────────────────────────────────
export function openLeftMenu()  { closeRightMenu(); sidebarMenu.classList.add('active'); sidebarOverlay.classList.add('active'); }
export function closeLeftMenu() { sidebarMenu.classList.remove('active'); checkOverlayState(); }
export function closeRightMenu() { sideChapterPanel.classList.remove('active'); checkOverlayState(); }
export function closeAllMenus() { closeLeftMenu(); closeRightMenu(); }

export function openRightMenu() {
    if (chapterOffsets.length === 0) return;
    stopEngineOnly();
    closeLeftMenu();
    renderReaderChapterList();
    sideChapterPanel.classList.add('active');
    sidebarOverlay.classList.add('active');
}

export function checkOverlayState() {
    if (!sidebarMenu.classList.contains('active') && !sideChapterPanel.classList.contains('active')) {
        sidebarOverlay.classList.remove('active');
    }
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
export function cleanBookTitle(title) {
    if (!title) return '';
    return title.split(/[-–—:]/)[0].trim();
}

// ── Panel-Umschaltung ─────────────────────────────────────────────────────────
export function switchUIMode(mode, targetPanel = '') {
    Object.keys(navButtons).forEach(k => { if (navButtons[k]) navButtons[k].classList.remove('active-panel'); });
    closeAllMenus();

    if (mode === 'reader') {
        viewDynamic.classList.remove('view-active');
        Object.keys(appPanels).forEach(k => appPanels[k].classList.remove('open'));
        viewReader.classList.add('view-active');
        if (activeBookId === 'schnellstart') {
            if (navButtons.faststart) navButtons.faststart.classList.add('active-panel');
            if (isPageMode) togglePageMode();
            textboxContainer.classList.add('textbox-active');
            chapterSubheaderBar.classList.remove('bar-active');
            chapterSubheaderBar.style.display = 'none';
        } else {
            if (navButtons.activeBook) navButtons.activeBook.classList.add('active-panel');
            textboxContainer.classList.remove('textbox-active');
            chapterSubheaderBar.style.display = 'flex';
            if (chapterOffsets.length > 0) chapterSubheaderBar.classList.add('bar-active');
            else chapterSubheaderBar.classList.remove('bar-active');
        }
        updateProgressUI(false);
    } else if (mode === 'library') {
        viewReader.classList.remove('view-active');
        viewDynamic.classList.add('view-active');
        chapterSubheaderBar.classList.remove('bar-active');
        progressRowContainer.classList.remove('bar-visible');
        Object.keys(appPanels).forEach(k => {
            if (k === targetPanel) {
                appPanels[k].classList.add('open');
                if (navButtons[k]) navButtons[k].classList.add('active-panel');
            } else {
                appPanels[k].classList.remove('open');
            }
        });
        if (targetPanel === 'library') {
            authorLabel.innerText = '';
            timeLabel.innerText   = 'Meine Bibliothek';
            stopEngineOnly();
            saveSessionStats().then(async () => {
                // estimatedRemainingSeconds vor Bibliotheksanzeige aktualisieren
                if (activeBookId && activeBookId !== 'schnellstart' && words && words.length > 0) {
                    const book = await getBookFromDB(activeBookId);
                    if (book) {
                        book.estimatedRemainingSeconds = estimateBookRemainingSeconds(words, currentIndex);
                        book.estimatedTotalSeconds     = estimateBookRemainingSeconds(words, 0);
                        await saveBookToDB(book);
                    }
                }
                renderLibraryList();
            });
        }
        if (targetPanel === 'settings') { authorLabel.innerText = ''; timeLabel.innerText = 'Einstellungen'; }
        if (targetPanel === 'about')    { authorLabel.innerText = ''; timeLabel.innerText = 'Was ist RSVP?'; }
        if (targetPanel === 'support')  { authorLabel.innerText = ''; timeLabel.innerText = 'Unterstützen'; }
        if (targetPanel === 'stats')    {
            authorLabel.innerText = '';
            timeLabel.innerText   = 'Meine Statistik';
            stopEngineOnly();
            saveSessionStats().then(() => renderStatsPanel());
        }
        percentLabel.innerText      = '0%';
        progressBar.style.width     = '0%';
        globalTimeCounter.innerHTML = '';
        globalChapterCounter.innerHTML = '';
    }
}

// ── Navigation ────────────────────────────────────────────────────────────────
export async function navigateToFaststart() {
    stopEngineOnly();
    await loadLibraryBook('schnellstart', true);
}

export async function jumpToActiveBook() {
    stopEngineOnly();
    closeLeftMenu();
    const lastActiveBook = await getAppState('rsvp-last-library-book-id');
    if (lastActiveBook && lastActiveBook !== 'schnellstart') {
        await loadLibraryBook(lastActiveBook, true);
    } else {
        switchUIMode('reader');
    }
}

export async function updateActiveBookMenuState() {
    const lastActiveBook = await getAppState('rsvp-last-library-book-id');
    const btn = document.getElementById('nav-active-book');
    if (btn) {
        btn.disabled = !(lastActiveBook && lastActiveBook !== 'schnellstart');
    }
}

// ── PWA: Service Worker ───────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showPwaUpdateBanner();
                        }
                    });
                });
            })
            .catch(err => console.warn('SW Registrierung fehlgeschlagen:', err));
    });
}

// Install-Prompt abfangen (Android Chrome)
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showPwaInstallBanner();
});

window.addEventListener('appinstalled', () => {
    hidePwaInstallBanner();
    deferredInstallPrompt = null;
});

export function showPwaInstallBanner() {
    const existing = document.getElementById('pwa-install-banner');
    if (existing || window.matchMedia('(display-mode: standalone)').matches) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
            <img src="icons/icon-192.png" style="width:36px;height:36px;border-radius:8px;flex-shrink:0;">
            <div style="min-width:0;">
                <div style="font-weight:600;font-size:13px;color:#fff;">RSVP Reader installieren</div>
                <div style="font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Offline verfügbar · Kein Browser-UI</div>
            </div>
        </div>
        <button id="pwa-install-btn" style="background:#3498db;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;">Installieren</button>
        <button id="pwa-dismiss-btn" style="background:transparent;border:none;color:#666;font-size:18px;cursor:pointer;flex-shrink:0;line-height:1;">✕</button>
    `;
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1a1a1a;border-top:1px solid #333;padding:12px 16px;display:flex;align-items:center;gap:10px;z-index:9999;box-shadow:0 -4px 20px rgba(0,0,0,0.5);';
    document.body.appendChild(banner);
    document.getElementById('pwa-install-btn').onclick = async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') hidePwaInstallBanner();
        deferredInstallPrompt = null;
    };
    document.getElementById('pwa-dismiss-btn').onclick = hidePwaInstallBanner;
}

export function hidePwaInstallBanner() {
    const b = document.getElementById('pwa-install-banner');
    if (b) b.remove();
}

export function showPwaUpdateBanner() {
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#27ae60;color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;z-index:9999;font-size:13px;';
    banner.innerHTML = '<span>🔄 Update verfügbar</span><button onclick="location.reload()" style="background:#fff;color:#27ae60;border:none;padding:5px 12px;border-radius:6px;font-weight:600;cursor:pointer;">Neu laden</button>';
    document.body.appendChild(banner);
}
