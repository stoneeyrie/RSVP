import { saveAppState } from './db.js';
import { render, updateProgressUI,
    activeBookId,
} from './reader.js';
import {
    wpmIn, fsIn, pauseMode, longWordMode, longWordTrigger,
    rewindMode, rewindAmount, hyphenMode, stopAtChapterEnd,
    showChapterTimeToggle, showChapterRemainingToggle,
    showBookTimeToggle, showBookRemainingToggle,
    showProgressBarToggle, amoledModeToggle, resumeToggle,
} from './dom.js';

// RSVP Speed Reader – settings.js
// Einstellungen: Speichern, Laden, Reset-Button-Sichtbarkeit

export function updateResetButtonVisibility() {
    const btnReset = document.getElementById('btn-reset');
    const controls = document.getElementById('main-controls');
    const toggle   = document.getElementById('show-reset-button-toggle');
    if (!btnReset || !controls || !toggle) return;
    const isSchnellstart = (typeof activeBookId === 'undefined' || activeBookId === 'schnellstart' || activeBookId === '');
    const isPageMode = controls.dataset.pageMode === 'true';
    if (isPageMode) return;
    if (isSchnellstart || toggle.checked) {
        btnReset.style.display = '';
        controls.style.gridTemplateColumns = 'repeat(5, 1fr)';
    } else {
        btnReset.style.display = 'none';
        controls.style.gridTemplateColumns = 'repeat(4, 1fr)';
    }
}

export function saveSettings() {
    localStorage.setItem('rsvp-wpm',                    wpmIn.value);
    localStorage.setItem('rsvp-fs',                     fsIn.value);
    localStorage.setItem('rsvp-pause-on',               pauseMode.checked);
    localStorage.setItem('rsvp-long-on',                longWordMode.checked);
    localStorage.setItem('rsvp-long-val',               longWordTrigger.value);
    localStorage.setItem('rsvp-rewind-on',              rewindMode.checked);
    localStorage.setItem('rsvp-rewind-val',             rewindAmount.value);
    localStorage.setItem('rsvp-hyphen-on',              hyphenMode.checked);
    localStorage.setItem('rsvp-stop-chapter',           stopAtChapterEnd.checked);
    localStorage.setItem('rsvp-show-chapter-time',      showChapterTimeToggle.checked);
    localStorage.setItem('rsvp-show-chapter-remaining', showChapterRemainingToggle.checked);
    localStorage.setItem('rsvp-show-book-time',         showBookTimeToggle.checked);
    localStorage.setItem('rsvp-show-book-remaining',    showBookRemainingToggle.checked);
    localStorage.setItem('rsvp-show-progress-bar',      showProgressBarToggle.checked);
    localStorage.setItem('rsvp-amoled-mode',            amoledModeToggle.checked);
    localStorage.setItem('rsvp-show-reset-button',      document.getElementById('show-reset-button-toggle').checked);
    localStorage.setItem('rsvp-resume-enabled',         resumeToggle.checked);
    updateResetButtonVisibility();
    if (amoledModeToggle.checked) {
        document.body.classList.add('amoled-mode');
        document.documentElement.style.setProperty('--scrollbar-thumb', '#222');
    } else {
        document.body.classList.remove('amoled-mode');
        document.documentElement.style.setProperty('--scrollbar-thumb', '#444');
    }
    updateProgressUI(false);
    render();
}

export function applySettingsToUI() {
    if (localStorage.getItem('rsvp-wpm'))           wpmIn.value             = localStorage.getItem('rsvp-wpm');
    if (localStorage.getItem('rsvp-fs'))            fsIn.value              = localStorage.getItem('rsvp-fs');
    if (localStorage.getItem('rsvp-pause-on'))      pauseMode.checked       = localStorage.getItem('rsvp-pause-on')  === 'true';
    if (localStorage.getItem('rsvp-long-on'))       longWordMode.checked    = localStorage.getItem('rsvp-long-on')   === 'true';
    if (localStorage.getItem('rsvp-long-val'))      longWordTrigger.value   = localStorage.getItem('rsvp-long-val');
    if (localStorage.getItem('rsvp-rewind-on'))     rewindMode.checked      = localStorage.getItem('rsvp-rewind-on') === 'true';
    if (localStorage.getItem('rsvp-rewind-val'))    rewindAmount.value      = localStorage.getItem('rsvp-rewind-val');
    if (localStorage.getItem('rsvp-hyphen-on'))     hyphenMode.checked      = localStorage.getItem('rsvp-hyphen-on') === 'true';
    if (localStorage.getItem('rsvp-stop-chapter'))  document.getElementById('stop-at-chapter-end').checked = localStorage.getItem('rsvp-stop-chapter') === 'true';
    if (localStorage.getItem('rsvp-show-chapter-time'))      showChapterTimeToggle.checked      = localStorage.getItem('rsvp-show-chapter-time')      === 'true';
    if (localStorage.getItem('rsvp-show-chapter-remaining')) showChapterRemainingToggle.checked = localStorage.getItem('rsvp-show-chapter-remaining') === 'true';
    if (localStorage.getItem('rsvp-show-book-time'))         showBookTimeToggle.checked         = localStorage.getItem('rsvp-show-book-time')         === 'true';
    if (localStorage.getItem('rsvp-show-book-remaining'))    showBookRemainingToggle.checked    = localStorage.getItem('rsvp-show-book-remaining')    === 'true';
    if (localStorage.getItem('rsvp-show-progress-bar'))      showProgressBarToggle.checked      = localStorage.getItem('rsvp-show-progress-bar')      === 'true';
    if (localStorage.getItem('rsvp-resume-enabled'))         resumeToggle.checked               = localStorage.getItem('rsvp-resume-enabled')         === 'true';
    if (document.getElementById('show-reset-button-toggle')) {
        const saved = localStorage.getItem('rsvp-show-reset-button');
        document.getElementById('show-reset-button-toggle').checked = saved !== 'false';
    }
    updateResetButtonVisibility();
    if (localStorage.getItem('rsvp-amoled-mode')) {
        amoledModeToggle.checked = localStorage.getItem('rsvp-amoled-mode') === 'true';
        if (amoledModeToggle.checked) {
            document.body.classList.add('amoled-mode');
            document.documentElement.style.setProperty('--scrollbar-thumb', '#222');
        } else {
            document.body.classList.remove('amoled-mode');
            document.documentElement.style.setProperty('--scrollbar-thumb', '#444');
        }
    }
}
