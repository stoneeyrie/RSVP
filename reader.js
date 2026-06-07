import {
    getAllBooksFromDB, getBookFromDB, saveBookToDB,
    getAppState, saveAppState,
    getBookContentFromDB,
} from './db.js';
import {
    canvas, tLeft, tCenter, tRight, wpmIn, fsIn, mainBtn,
    pauseMode, longWordMode, longWordTrigger, hyphenMode,
    stopAtChapterEnd, rewindMode, rewindAmount,
    pageDisplayContainer, pageTextContent, wordDisplay,
    showProgressBarToggle, viewReader, viewDynamic,
    progressRowContainer, progressBar,
    authorLabel, timeLabel, percentLabel,
    globalTimeCounter, globalChapterCounter,
    showBookTimeToggle, showBookRemainingToggle,
    showChapterTimeToggle, showChapterRemainingToggle,
    sideChapterPanel, readerModeToggle, textboxContainer, input,
} from './dom.js';

// ── Geteilter App-State ───────────────────────────────────────────────────────
// Diese Variablen werden von reader.js verwaltet und von anderen Modulen
// über window.* gelesen/geschrieben. reader.js ist der kanonische Owner.
export let words               = [];
export let currentIndex        = 0;
export let timer               = null;
export let isPlaying           = false;
export let chapterOffsets      = [];
export let activeBookId        = 'schnellstart';
export let activeBookTitle     = 'Freier Text';
export let activeBookAuthor    = '';
export let totalSessionSeconds   = 0;
export let sessionWordsDisplayed = 0;
export let lastTickTime        = null;
export let lastSavedIndex      = -1;
export let lastSaveTime        = 0;
export let hyphenFragments     = null;
export let hyphenFragmentIdx   = 0;
export let estimatedTimeCache  = null;
export let estimatedTimeCacheKey = '';
export let isCurrentlyInRSVPFlow = false;
export let isSnapping          = false;
export let isPageMode          = false;
export let currentPageScrollOffset = 0;
export let pageScrollWidth     = 0;
export let indexOnPageModeEnter   = 0;
export let initialPageOnEnter     = 0;
export let chapterOnPageModeEnter = 0;
export let pageRenderTimeout      = null;
export let currentLibraryFilter   = 'all';
export let currentAuthorFilter    = '';

// ── Stubs: Brücken zu Funktionen die noch in index.html leben ────────────────
// Diese werden durch window.* aufgerufen bis sie vollständig refactored sind.
export function togglePageMode()        { if (window.togglePageMode_impl)       window.togglePageMode_impl(); }
export function renderPageMode()        { if (window.renderPageMode_impl)        window.renderPageMode_impl(); }
export function getActiveChapterIndex() { return window.getActiveChapterIndex_impl ? window.getActiveChapterIndex_impl() : 0; }
export function updateProgressUI(save)  { if (window.updateProgressUI_impl)      window.updateProgressUI_impl(save); }
export function updateActiveBookMenuState() { if (window.updateActiveBookMenuState_impl) return window.updateActiveBookMenuState_impl(); }

// ── Setter für geteilten State (für andere Module) ───────────────────────────
export function setWords(v)                  { words = v; }
export function setCurrentIndex(v)           { currentIndex = v; }
export function setTimer(v)                  { timer = v; }
export function setIsPlaying(v)              { isPlaying = v; }
export function setChapterOffsets(v)         { chapterOffsets = v; }
export function setActiveBookId(v)           { activeBookId = v; }
export function setActiveBookTitle(v)        { activeBookTitle = v; }
export function setActiveBookAuthor(v)       { activeBookAuthor = v; }
export function setTotalSessionSeconds(v)    { totalSessionSeconds = v; }
export function setSessionWordsDisplayed(v)  { sessionWordsDisplayed = v; }
export function setLastTickTime(v)           { lastTickTime = v; }
export function setLastSavedIndex(v)         { lastSavedIndex = v; }
export function setLastSaveTime(v)           { lastSaveTime = v; }
export function setHyphenFragments(v)        { hyphenFragments = v; }
export function setHyphenFragmentIdx(v)      { hyphenFragmentIdx = v; }
export function setEstimatedTimeCache(v)     { estimatedTimeCache = v; }
export function setEstimatedTimeCacheKey(v)  { estimatedTimeCacheKey = v; }
export function setIsCurrentlyInRSVPFlow(v)  { isCurrentlyInRSVPFlow = v; }
export function setIsSnapping(v)             { isSnapping = v; }
export function setIsPageMode(v)             { isPageMode = v; }
export function setCurrentPageScrollOffset(v){ currentPageScrollOffset = v; }
export function setPageScrollWidth(v)        { pageScrollWidth = v; }
export function setIndexOnPageModeEnter(v)   { indexOnPageModeEnter = v; }
export function setInitialPageOnEnter(v)     { initialPageOnEnter = v; }
export function setChapterOnPageModeEnter(v) { chapterOnPageModeEnter = v; }
export function setPageRenderTimeout(v)      { pageRenderTimeout = v; }
export function setCurrentLibraryFilter(v)   { currentLibraryFilter = v; }
export function setCurrentAuthorFilter(v)    { currentAuthorFilter = v; }

// RSVP Speed Reader Pro – Reader Engine
// RSVP-Kern: Zeitberechnung, Wortanzeige, step/render-Loop, Session-Statistik

const measurer = document.createElement("canvas").getContext("2d");
const ORP_TABLE = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3];

// ── Silbentrennung via Hypher (TeX-Algorithmus, Deutsch) ──────────────────────
// Wird beim Modulstart sofort geladen (~15 KB) damit es beim ersten Wort bereit ist.
let _hypher = null;
let _hypherLoading = false;

async function loadHypher() {
    if (_hypher) return _hypher;
    if (_hypherLoading) return null;
    _hypherLoading = true;
    try {
        // Hypher UMD-Bundle laden
        await new Promise((res, rej) => {
            if (window.Hypher) { res(); return; }
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/hypher@0.2.2/lib/hypher.js';
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
        });

        // Deutsche Trennmuster aus dem Paket (CommonJS format → direkt evaluieren)
        const resp = await fetch('https://cdn.jsdelivr.net/npm/hypher@0.2.2/test/de.js');
        const text = await resp.text();
        // Format: module.exports = { id:'de', leftmin:2, rightmin:2, patterns:{...} }
        const patterns = new Function('module', 'exports', text + '; return module.exports;')(
            { exports: {} }, {}
        );
        if (patterns && patterns.patterns && window.Hypher) {
            _hypher = new window.Hypher(patterns);
        }
    } catch (e) {
        console.warn('Hypher konnte nicht geladen werden:', e);
        _hypher = null;
    }
    _hypherLoading = false;
    return _hypher;
}

// Sofort beim Modulstart laden
loadHypher();

// Gibt Silben zurück, z.B. "Dampfschiff" → ["Dampf","schiff"]
// Fallback: Trennung in der Mitte wenn Hypher nicht verfügbar
function getSyllables(word) {
    if (_hypher) {
        const sylls = _hypher.hyphenate(word);
        return sylls.length > 1 ? sylls : null;
    }
    return null;
}

// Bester Trennpunkt: Silben so aufteilen dass beide Hälften möglichst gleich lang
function splitAtBestSyllable(syllables) {
    const total = syllables.join('').length;
    let best = 1, bestDiff = Infinity, len = 0;
    for (let i = 0; i < syllables.length - 1; i++) {
        len += syllables[i].length;
        const diff = Math.abs(len - total / 2);
        if (diff < bestDiff) { bestDiff = diff; best = i + 1; }
    }
    const left  = syllables.slice(0, best).join('') + '-';
    const right = syllables.slice(best).join('');
    return [left, right];
}

// Prüft ob ein Wort bei aktueller Schriftgröße zu breit für den Reader ist
function isTooWide(word) {
    measurer.font = `bold ${fsIn.value}px 'Segoe UI', Arial`;
    const w = measurer.measureText(word).width;
    const available = (canvas.parentElement?.getBoundingClientRect().width || 360) * 0.88;
    return w > available;
}

// Normalisiert alle Bindestrichvarianten auf einfaches '-'
function normalizeDashes(word) {
    return word.replace(/[\u2013\u2014\u2012\u2015]/g, '-');
}

// Haupt-Funktion: gibt [teil1, teil2, ...] zurück wenn Trennung nötig, sonst null
function autoSplitLongWord(word) {
    if (!isTooWide(word)) return null;

    // 1. En-Dash / Em-Dash normalisieren → echte Bindestriche
    const normalized = normalizeDashes(word);

    // 2. Vorhandene Bindestriche nutzen (inkl. normalisierte Dashes)
    if (normalized.includes('-') && normalized.length > 5) {
        const parts = normalized.split('-').filter(p => p.length > 0);
        if (parts.length >= 2) {
            // Passenden Splitpunkt finden sodass jedes Fragment passt
            const fragments = [];
            let current = parts[0];
            for (let i = 1; i < parts.length; i++) {
                const candidate = current + '-' + parts[i];
                if (isTooWide(candidate)) {
                    fragments.push(current + '-');
                    current = parts[i];
                } else {
                    current = candidate;
                }
            }
            fragments.push(current);
            if (fragments.length >= 2) return fragments;
        }
    }

    // 3. Hypher-Silbentrennung (nur reinen Buchstabenanteil übergeben)
    const cleanWord = word.replace(/[^a-zA-ZäöüÄÖÜß]/g, '');
    const sylls = getSyllables(cleanWord);
    if (sylls && sylls.length >= 2) {
        // Mehrfach splitten wenn nötig: solange noch Fragmente zu breit sind
        const [l, r] = splitAtBestSyllable(sylls);
        return [l, r];
    }

    // 4. Fallback: an Wortlänge orientiert (kein blindes Mittensplit mehr)
    // Mindestens 3 Zeichen pro Fragment
    const minLen = 3;
    let splitAt = Math.floor(word.length / 2);
    while (splitAt > minLen && isTooWide(word.slice(0, splitAt) + '-')) splitAt--;
    return [word.slice(0, splitAt) + '-', word.slice(splitAt)];
}


export function buildBookData(htmlString, startIdx) {
    let tempDiv = document.createElement('div');
    if (!/<[a-z][\s\S]*>/i.test(htmlString)) {
        tempDiv.innerHTML = `<p>${htmlString.replace(/\n/g, '<br>')}</p>`;
    } else {
        tempDiv.innerHTML = htmlString;
    }

    let walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
    let node;
    let chapterWords = [];
    let currentHtmlIndex = startIdx;
    let nodesToReplace = [];

    while ((node = walker.nextNode())) {
        let text = node.nodeValue;
        let tokens = text.split(/(\s+)/);
        // Satzgrenzen innerhalb eines Tokens aufbrechen: "Wort.Wort" → "Wort." + "Wort"
        // Nur trennen wenn nach dem Satzzeichen ein Großbuchstabe folgt (kein Dezimaltrennzeichen etc.)
        const splitTokens = [];
        for (const t of tokens) {
            if (/^\s*$/.test(t)) { splitTokens.push(t); continue; }
            const parts = t.split(/(?<=[.!?])(?=\p{Lu})/u);
            splitTokens.push(...parts);
        }
        tokens = splitTokens;
        // Eigenständige Satzzeichen (.!?,;:…) an das vorherige Wort anhängen
        const mergedTokens = [];
        for (const t of tokens) {
            if (/^[.!?,;:…]+$/.test(t) && mergedTokens.length > 0) {
                let appended = false;
                for (let i = mergedTokens.length - 1; i >= 0; i--) {
                    if (mergedTokens[i].trim().length > 0) { mergedTokens[i] += t; appended = true; break; }
                }
                if (!appended) mergedTokens.push(t);
            } else {
                mergedTokens.push(t);
            }
        }
        tokens = mergedTokens;
        let newHtml = "";
        let hasWords = false;

        for (let token of tokens) {
            if (token.trim().length > 0) {
                chapterWords.push(token);
                newHtml += `<span data-word-idx="${currentHtmlIndex}">${token}</span>`;
                currentHtmlIndex++;
                hasWords = true;
            } else {
                newHtml += token; 
            }
        }
        if (hasWords) nodesToReplace.push({ oldNode: node, newHtml: newHtml });
    }

    for (let item of nodesToReplace) {
        let wrapper = document.createElement('span');
        wrapper.innerHTML = item.newHtml;
        let parent = item.oldNode.parentNode;
        while (wrapper.firstChild) {
            parent.insertBefore(wrapper.firstChild, item.oldNode);
        }
        parent.removeChild(item.oldNode);
    }

    return { html: tempDiv.innerHTML, words: chapterWords, nextIndex: currentHtmlIndex };
}

export function formatDuration(seconds) {
    if (seconds < 0 || isNaN(seconds)) seconds = 0;
    const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`; return `${m}m ${s.toString().padStart(2, '0')}s`;
}

// --- Realistische Zeitschätzung: simuliert exakt die step()-Engine-Logik -------
// Baut einmalig ein kumulatives Zeitarray auf (ms von Wort 0 bis Wort i)
// und cached es – wird automatisch bei Einstellungs- oder Buchänderung neu gebaut.
function getEstimateKey() {
    return `${wpmIn.value}|${pauseMode.checked}|${longWordMode.checked}|${longWordTrigger.value}|${hyphenMode.checked}|${fsIn.value}`;
}

export function buildEstimatedTimeCumulative() {
    const key = getEstimateKey();
    if (estimatedTimeCache && estimatedTimeCacheKey === key) return estimatedTimeCache;

    const wpm     = parseInt(wpmIn.value) || 300;
    const baseMs  = 60000 / wpm;
    const isPause    = pauseMode.checked;
    const isLongWord = longWordMode.checked;
    const lwTrigger  = parseInt(longWordTrigger.value) || 8;
    const isHyphen   = hyphenMode.checked;

    // Breite einmal vorberechnen (nicht pro Wort)
    const fontSize = parseInt(fsIn.value) || 50;
    measurer.font = `bold ${fontSize}px 'Segoe UI', Arial`;
    const available = (canvas.parentElement?.getBoundingClientRect().width || 360) * 0.88;
    // Ab dieser Zeichenanzahl könnte ein Wort zu breit sein (konservative Schätzung: 0.6em pro Zeichen)
    const minSuspectLen = Math.floor(available / (fontSize * 0.6));

    // cumul[i] = Gesamtdauer in ms von Index 0 bis (nicht einschließlich) Index i
    const cumul = new Array(words.length + 1);
    cumul[0] = 0;
    let running = 0;

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        let fragments;
        if (isHyphen && word.includes('-') && word.length > 5) {
            fragments = word.split(/(?<=-)/);
        } else {
            fragments = [word];
        }
        // Auto-Split: nur prüfen wenn Wort lang genug um verdächtig zu sein
        if (fragments.length === 1 && word.length > minSuspectLen) {
            const wordWidth = measurer.measureText(word).width;
            if (wordWidth > available) {
                const split = autoSplitLongWord(word);
                if (split) fragments = split;
            }
        }
        for (const frag of fragments) {
            let ms = baseMs;
            if (isLongWord && frag.length > lwTrigger) ms *= 1.4;
            if (isPause && /[.!?]/.test(frag))         ms *= 1.8;
            else if (isPause && /[,]/.test(frag))      ms *= 1.6;
            running += ms;
        }
        cumul[i + 1] = running;
    }

    estimatedTimeCache    = cumul;
    estimatedTimeCacheKey = key;
    return cumul;
}

// Gibt die geschätzte Lesezeit in Sekunden für den Bereich [fromIdx, toIdx) zurück
export function estimateSeconds(fromIdx, toIdx) {
    if (words.length === 0) return 0;
    const cumul = buildEstimatedTimeCumulative();
    const from = Math.max(0, Math.min(fromIdx, words.length));
    const to   = Math.max(0, Math.min(toIdx,   words.length));
    return (cumul[to] - cumul[from]) / 1000;
}
// -------------------------------------------------------------------------------

// --- Restzeit-Schätzung für Bibliothekskarten (Sampling-basiert) ---------------
// Verwendet eine Stichprobe von 600 Wörtern, um den Modifier-Faktor zu schätzen.
// Deutlich schneller als buildEstimatedTimeCumulative für nicht-aktive Bücher.

export function estimateBookRemainingSeconds(bookWords, lastIndex) {
    if (!bookWords || bookWords.length === 0) return 0;
    const remaining = bookWords.length - lastIndex;
    if (remaining <= 0) return 0;

    const wpm        = parseInt(wpmIn.value) || 300;
    const baseMs     = 60000 / wpm;
    const isPause    = pauseMode.checked;
    const isLongWord = longWordMode.checked;
    const lwTrigger  = parseInt(longWordTrigger.value) || 8;
    const isHyphen   = hyphenMode.checked;

    // Fast path: keine Modifier aktiv
    if (!isPause && !isLongWord && !isHyphen) return (remaining * baseMs) / 1000;

    // Stichprobe gleichmäßig über das gesamte Buch verteilen
    const sampleSize = Math.min(600, bookWords.length);
    const step = bookWords.length / sampleSize;
    let pauseCount = 0, longWordCount = 0, extraFragments = 0;

    for (let i = 0; i < sampleSize; i++) {
        const w = bookWords[Math.floor(i * step)] || '';
        if (isPause    && /[.!?]/.test(w))              pauseCount++;
        if (isPause    && /[,]/.test(w))                pauseCount += 0.44; // 0.6/1.8*1.3 Anteil
        if (isLongWord && w.length > lwTrigger)          longWordCount++;
        if (isHyphen && w.length > 5) {
            if      (w.includes('-')) extraFragments += w.split(/(?<=-)/).length - 1;
            else if (w.includes('/')) extraFragments += w.split(/(?=\/)/).length - 1;
            else if (/[a-zäöüß\d][A-ZÄÖÜ]/u.test(w)) extraFragments += w.split(/(?<=[a-zäöüß\d])(?=[A-ZÄÖÜ])/u).length - 1;
        }
    }

    const pauseRatio    = pauseCount    / sampleSize;
    const longWordRatio = longWordCount / sampleSize;
    const hyphenRatio   = extraFragments / sampleSize;

    // Durchschnittliche ms pro Wort inkl. aller Modifier
    const avgMsPerWord = baseMs * (
        1
        + (isPause    ? pauseRatio    * 0.8 : 0)
        + (isLongWord ? longWordRatio * 0.4 : 0)
        + hyphenRatio
    );

    return (remaining * avgMsPerWord) / 1000;
}

// --- Thumbnail-Generierung (Cover auf ~80x120px, JPEG q=0.6, ~3-6KB) ---------
export async function generateThumbnail(dataUrl) {
    if (!dataUrl) return null;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const MAX_W = 80, MAX_H = 120;
            const ratio = Math.min(MAX_W / img.width, MAX_H / img.height);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * ratio);
            canvas.height = Math.round(img.height * ratio);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });
}
// -------------------------------------------------------------------------------

// --- Wortanzeige ---------------------------------------------------------------
export function render() {
    if (isPageMode) { renderPageMode(); return; }
    if (words.length === 0) { tLeft.innerText = ""; tCenter.innerText = ""; tRight.innerText = ""; return; }
    if (currentIndex >= words.length) { currentIndex = words.length; stopEngineOnly(); updateProgressUI(true); return; }
    
    let wordStr = words[currentIndex] || "";

    // ── Fragment-Handling: manuelle Silbentrennung + Auto-Split ───────────────
    // hyphenFragments kann von zwei Quellen kommen:
    //   1. hyphenMode (Bindestrich, Slash, CamelCase)
    //   2. autoSplitLongWord (zu breites Wort)
    // Wir dürfen hyphenFragments nur nullen wenn KEIN Fragment mehr aktiv ist.

    if (hyphenFragments) {
        // Aktives Fragment: einfach weiter anzeigen
        wordStr = hyphenFragments[hyphenFragmentIdx] || wordStr;
    } else {
        // Kein aktives Fragment: prüfen ob neues nötig
        if (hyphenMode.checked && wordStr.length > 5) {
            const hasHyphen = wordStr.includes('-');
            const hasSlash  = !hasHyphen && wordStr.includes('/');
            const hasCamel  = !hasHyphen && !hasSlash && /[a-zäöüß\d][A-ZÄÖÜ]/u.test(wordStr);
            if (hasHyphen || hasSlash || hasCamel) {
                if      (hasHyphen) hyphenFragments = wordStr.split(/(?<=-)/);
                else if (hasSlash)  hyphenFragments = wordStr.split(/(?=\/)/);
                else                hyphenFragments = wordStr.split(/(?<=[a-zäöüß\d])(?=[A-ZÄÖÜ])/u);
                hyphenFragmentIdx = 0;
                wordStr = hyphenFragments[0];
            }
        }

        // Auto-Split bei zu breiten Wörtern (unabhängig von hyphenMode)
        if (!hyphenFragments && wordStr.length > 8) {
            const split = autoSplitLongWord(wordStr);
            if (split) {
                hyphenFragments   = split;
                hyphenFragmentIdx = 0;
                wordStr = hyphenFragments[0];
            }
        }
    }

    const wordToMeasure = wordStr.replace(/\n/g, '');

    // ORP nach O'Regan & Rayner:
    // 1. Führende Satzzeichen (», «, „, ", (, - usw.) zählen und als Offset merken
    // 2. Nur lesbare Zeichen für die Längenberechnung verwenden
    // 3. ORP-Index auf den bereinigten Kern berechnen, dann Offset addieren
    const leadingPunct = wordToMeasure.match(/^[»«„""‟''"()\[\]{}\/–—\-]+/u);
    const leadingOffset = leadingPunct ? leadingPunct[0].length : 0;
    const stripped = wordToMeasure.replace(/[^\p{L}\p{N}]/gu, '');
    const readableLen = stripped.length || wordToMeasure.length;

    // Lookup-Tabelle: 0-basierte Indizes (O'Regan et al., zählt ab 1 → hier -1)
    const orpOnStripped = readableLen < ORP_TABLE.length
        ? ORP_TABLE[readableLen]
        : Math.floor(readableLen * 0.3);
    const focusIdx = orpOnStripped + leadingOffset;

    tLeft.innerText = wordToMeasure.substring(0, focusIdx); tCenter.innerText = wordToMeasure.substring(focusIdx, focusIdx + 1); tRight.innerText = wordToMeasure.substring(focusIdx + 1);
    
    measurer.font = `bold ${fsIn.value}px 'Segoe UI', Arial`;
    const leftW = measurer.measureText(tLeft.innerText).width;
    const centerW = measurer.measureText(tCenter.innerText).width;
    
    canvas.style.left = `calc(35% - ${leftW + (centerW / 2)}px)`; canvas.style.fontSize = fsIn.value + "px"; updateProgressUI(true);
}

export function setupPageSnapStyles() {
    if (pageDisplayContainer) { pageDisplayContainer.style.overflow = "hidden"; }
    if (pageTextContent) {
        pageTextContent.style.overflowX = "auto";
        pageTextContent.style.overflowY = "hidden";
        pageTextContent.style.display = "block";
        pageTextContent.style.width = "100%";
        pageTextContent.style.webkitOverflowScrolling = "touch";
    }
}

export function step() {
    if (!isPlaying) { lastTickTime = null; return; }
    const now = performance.now();
    if (lastTickTime) { const elapsedSeconds = (now - lastTickTime) / 1000; totalSessionSeconds += elapsedSeconds; }
    lastTickTime = now;

    render(); 
    sessionWordsDisplayed++;
    if (!isPlaying) { lastTickTime = null; return; } 
    let delay = 60000 / (parseInt(wpmIn.value) || 300);
    
    let currentRenderedString = words[currentIndex] || "";
    if (hyphenFragments && hyphenFragments[hyphenFragmentIdx]) currentRenderedString = hyphenFragments[hyphenFragmentIdx];

    if (currentRenderedString) {
        if (longWordMode.checked && currentRenderedString.length > (parseInt(longWordTrigger.value) || 8)) delay *= 1.4;
        if (pauseMode.checked && /[.!?]/.test(currentRenderedString)) delay *= 1.8;
        else if (pauseMode.checked && /[,]/.test(currentRenderedString)) delay *= 1.6;
    }

    // Stopp nach Kapitelende – Check VOR dem Increment:
    // currentIndex zeigt noch auf das letzte Wort des Kapitels (gerade gerendert).
    // Nächster Index wäre chapEnd → jetzt stoppen und Kapitelname anzeigen.
    if (stopAtChapterEnd && stopAtChapterEnd.checked && chapterOffsets.length > 0) {
        const nextIdx = (hyphenFragments
            ? (hyphenFragmentIdx + 1 >= hyphenFragments.length ? currentIndex + 1 : currentIndex)
            : currentIndex + 1);
        for (let ci = 0; ci < chapterOffsets.length; ci++) {
            const chapEnd = ci + 1 < chapterOffsets.length ? chapterOffsets[ci + 1].start : words.length;
            if (nextIdx === chapEnd) {
                // Letztes Wort wurde bereits gerendert – Index vorrücken,
                // dann erst nach vollem delay stoppen und Kapitelname zeigen.
                if (hyphenFragments) {
                    hyphenFragmentIdx++;
                    if (hyphenFragmentIdx >= hyphenFragments.length) { hyphenFragments = null; currentIndex++; }
                } else { currentIndex++; }
                const nextChap = chapterOffsets[ci + 1];
                const label = nextChap ? (nextChap.name || 'Nächstes Kapitel') : '– Ende –';
                timer = setTimeout(() => {
                    stopEngineOnly();
                    const fs = fsIn.value + 'px';
                    measurer.font = 'bold ' + fs + " 'Segoe UI', Arial";
                    const lStripped = label.replace(/[^\p{L}\p{N}]/gu, '');
                    const lLen = lStripped.length || label.length;
                    const lFocusIdx = lLen < ORP_TABLE.length ? ORP_TABLE[lLen] : Math.floor(lLen * 0.3);
                    const lLeftW = measurer.measureText(label.substring(0, lFocusIdx)).width;
                    const lCenterW = measurer.measureText(label.substring(lFocusIdx, lFocusIdx + 1)).width;
                    tLeft.innerText = label.substring(0, lFocusIdx);
                    tCenter.innerText = label.substring(lFocusIdx, lFocusIdx + 1);
                    tRight.innerText = label.substring(lFocusIdx + 1);
                    canvas.style.fontSize = fs;
                    canvas.style.left = 'calc(35% - ' + (lLeftW + lCenterW / 2) + 'px)';
                    updateProgressUI(true);
                }, delay);
                return;
            }
        }
    }

    if (hyphenFragments) {
        hyphenFragmentIdx++;
        if (hyphenFragmentIdx >= hyphenFragments.length) { hyphenFragments = null; currentIndex++; }
    } else { currentIndex++; }

    timer = setTimeout(step, delay);
}

export function start() {
    if(isPlaying) { 
        stopEngineOnly();
        if (currentIndex > 0) currentIndex--;
        isCurrentlyInRSVPFlow = false;
        if (rewindMode.checked) saveAppState('rsvp-rewind-permitted-' + activeBookId, true); 
        updateProgressUI(true); 
        return; 
    }
    isCurrentlyInRSVPFlow = true;
    if (window.closeRightMenu) window.closeRightMenu(); 
    if (activeBookId === "schnellstart") { let data = buildBookData(input.value, 0); words = data.words; }
    if(words.length === 0) return;
    if(currentIndex >= words.length) { mainBtn.innerText = "Neustart nötig"; setTimeout(() => { if(!isPlaying) mainBtn.innerText = "START"; }, 1000); return; }
    lastTickTime = performance.now(); isPlaying = true; mainBtn.innerText = "STOPP"; mainBtn.style.background = "#e74c3c"; step();
}

export async function stopEngineOnly() {
    isPlaying = false; clearTimeout(timer); lastTickTime = null;
    mainBtn.innerText = "START"; mainBtn.style.background = "var(--accent)";
    // totalSessionSeconds wird NICHT zurückgesetzt – akkumuliert über alle Pausen hinweg.
    // Gespeichert wird erst beim Buchwechsel (saveSessionStats).
}

// Cover auf Thumbnail-Größe verkleinern (Canvas, max. ~5 KB als JPEG)
export function resizeCoverImage(dataUrl, maxPx = 72) {
    return new Promise((resolve) => {
        if (!dataUrl) return resolve(null);
        const img = new Image();
        img.onload = () => {
            const ratio  = Math.min(maxPx / img.width, (maxPx * 1.5) / img.height);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.max(1, Math.round(img.width  * ratio));
            canvas.height = Math.max(1, Math.round(img.height * ratio));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });
}

export async function saveSessionStats() {
    if (totalSessionSeconds > 2 && activeBookId && activeBookId !== "schnellstart") {
        const wpmNow = parseInt(document.getElementById('wpm')?.value) || 300;
        const book = await getBookFromDB(activeBookId);
        if (book) {
            const prevSessions = book.sessionCount || 0;
            const prevAvg = book.avgWpm || wpmNow;
            book.avgWpm = prevSessions === 0
                ? wpmNow
                : Math.round((prevAvg * prevSessions + wpmNow) / (prevSessions + 1));
            book.sessionCount = prevSessions + 1;
            book.lastReadDate = new Date().toISOString();
            book.totalReadSeconds = (book.totalReadSeconds || 0) + totalSessionSeconds;
            // Tägliches Leseprotokoll – lokales Datum (nicht UTC)
            const _ld = new Date();
            const ymd = `${_ld.getFullYear()}-${String(_ld.getMonth()+1).padStart(2,'0')}-${String(_ld.getDate()).padStart(2,'0')}`;
            book.readingLog = book.readingLog || {};
            book.readingLog[ymd] = (book.readingLog[ymd] || 0) + Math.round(totalSessionSeconds);
            // Tatsächlich angezeigte RSVP-Wörter (inkl. Rücksprünge)
            book.wordsLog = book.wordsLog || {};
            book.wordsLog[ymd] = (book.wordsLog[ymd] || 0) + sessionWordsDisplayed;
            book.totalWordsDisplayed = Object.values(book.wordsLog).reduce((s, v) => s + (v || 0), 0);
            await saveBookToDB(book);
        }
    }
    totalSessionSeconds = 0;
    sessionWordsDisplayed = 0;

    // Badge-Check nach jeder Session
    import('./achievements.js').then(m => m.checkForNewBadgesAfterSession()).catch(() => {});
}


