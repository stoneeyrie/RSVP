// RSVP Speed Reader – dom.js
// Alle DOM-Referenzen zentral – lazy initialisiert nach DOMContentLoaded

// Direkte Exports (DOM ist bereits geladen da script am Ende von body steht)
export const canvas       = document.getElementById('word-canvas');
export const tLeft        = document.getElementById('txt-left');
export const tCenter      = document.getElementById('txt-center');
export const tRight       = document.getElementById('txt-right');
export const input        = document.getElementById('input-text');

export const wpmIn        = document.getElementById('wpm');
export const fsIn         = document.getElementById('font-size');
export const mainBtn      = document.getElementById('main-btn');
export const authorLabel  = document.getElementById('author-label');
export const timeLabel    = document.getElementById('time-label');
export const percentLabel = document.getElementById('percent-label');
export const globalTimeCounter    = document.getElementById('global-time-counter');
export const globalChapterCounter = document.getElementById('global-chapter-counter');
export const progressBar          = document.getElementById('progress-bar');
export const progressRowContainer = document.getElementById('progress-row-container');

export const pauseMode       = document.getElementById('pause-mode');
export const hyphenMode      = document.getElementById('hyphen-mode');
export const longWordMode    = document.getElementById('long-word-mode');
export const longWordTrigger = document.getElementById('long-word-trigger');
export const rewindMode      = document.getElementById('rewind-mode');
export const rewindAmount    = document.getElementById('rewind-amount');
export const stopAtChapterEnd = document.getElementById('stop-at-chapter-end');
export const resumeToggle    = document.getElementById('resume-book-toggle');

export const showChapterTimeToggle      = document.getElementById('show-chapter-time-toggle');
export const showChapterRemainingToggle = document.getElementById('show-chapter-remaining-toggle');
export const showBookTimeToggle         = document.getElementById('show-book-time-toggle');
export const showBookRemainingToggle    = document.getElementById('show-book-remaining-toggle');
export const showProgressBarToggle      = document.getElementById('show-progress-bar-toggle');
export const amoledModeToggle           = document.getElementById('amoled-mode-toggle');

export const viewReader       = document.getElementById('main-reader-view');
export const viewDynamic      = document.getElementById('main-dynamic-view');
export const textboxContainer = document.getElementById('faststart-textbox-container');

export const sideChapterPanel    = document.getElementById('chapter-side-panel');
export const chapterSubheaderBar = document.getElementById('mode-controls');
export const chapterToggleBtn    = document.getElementById('reader-chapter-toggle');
export const chapterPanelCloseBtn = document.getElementById('chapter-panel-close-btn');
export const chapterListScroll   = document.getElementById('chapter-list-scroll');

export const sidebarMenu     = document.getElementById('sidebar-menu');
export const sidebarOverlay  = document.getElementById('sidebar-overlay');
export const hamburgerTrigger = document.getElementById('hamburger-trigger');
export const sidebarCloseBtn  = document.getElementById('sidebar-close-btn');

export const wordDisplay          = document.getElementById('word-display');
export const pageDisplayContainer = document.getElementById('page-display-container');
export const pageTextContent      = document.getElementById('page-text-content');
export const readerModeToggle     = document.getElementById('reader-mode-toggle');

export const appPanels = {
    library:  document.getElementById('panel-library'),
    settings: document.getElementById('panel-settings'),
    stats:    document.getElementById('panel-stats'),
    backup:   document.getElementById('panel-backup'),
    about:    document.getElementById('panel-about'),
    support:  document.getElementById('panel-support'),
};
export const navButtons = {
    faststart:  document.getElementById('nav-faststart'),
    library:    document.getElementById('nav-library'),
    stats:      document.getElementById('nav-stats'),
    settings:   document.getElementById('nav-settings'),
    backup:     document.getElementById('nav-backup'),
    about:      document.getElementById('nav-about'),
    support:    document.getElementById('nav-support'),
    activeBook: document.getElementById('nav-active-book'),
};
export const libraryList = document.getElementById('library-list');
export const fileInput   = document.getElementById('file-input');

// Sicherheitscheck: Warnung wenn DOM-Elemente fehlen
if (typeof window !== 'undefined' && window.location) {
    const missing = [
        ['canvas', canvas], ['tLeft', tLeft], ['mainBtn', mainBtn],
        ['fileInput', fileInput], ['wpmIn', wpmIn], ['sidebarMenu', sidebarMenu],
    ].filter(([, el]) => !el).map(([name]) => name);
    if (missing.length > 0) {
        console.warn('dom.js: Fehlende DOM-Elemente:', missing.join(', '));
    }
}
