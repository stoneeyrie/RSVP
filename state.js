// RSVP Speed Reader – state.js
// Zentraler App-State: alle globalen Variablen an einem Ort

// ── Reader-State ──────────────────────────────────────────────────────────────
export let words         = [];
export let currentIndex  = 0;
export let timer         = null;
export let isPlaying     = false;
export let chapterOffsets = [];
export let activeBookId  = 'schnellstart';
export let activeBookTitle  = 'Freier Text';
export let activeBookAuthor = '';

// ── Library-State ─────────────────────────────────────────────────────────────
export let currentLibraryFilter = 'all';
export let currentAuthorFilter  = '';

// ── Page-Mode-State ───────────────────────────────────────────────────────────
export let isPageMode             = false;
export let currentPageScrollOffset = 0;
export let pageScrollWidth         = 0;
export let indexOnPageModeEnter    = 0;
export let initialPageOnEnter      = 0;
export let chapterOnPageModeEnter  = 0;
export let pageRenderTimeout       = null;

// ── Session-State ─────────────────────────────────────────────────────────────
export let totalSessionSeconds = 0;
export let lastTickTime        = null;
export let lastSavedIndex      = -1;
export let lastSaveTime        = 0;

// ── Hyphen-State ──────────────────────────────────────────────────────────────
export let hyphenFragments    = null;
export let hyphenFragmentIdx  = 0;

// ── Cache ─────────────────────────────────────────────────────────────────────
export let estimatedTimeCache    = null;
export let estimatedTimeCacheKey = '';

// ── Misc ──────────────────────────────────────────────────────────────────────
export let isCurrentlyInRSVPFlow = false;
export let isSnapping            = false;

// ── Setter-Funktionen ─────────────────────────────────────────────────────────
// Da ES-Module-Exports keine direkte Zuweisung von außen erlauben,
// stellen wir Setter bereit für State der von mehreren Modulen geschrieben wird.

export function setWords(v)              { words = v; }
export function setCurrentIndex(v)       { currentIndex = v; }
export function setTimer(v)              { timer = v; }
export function setIsPlaying(v)          { isPlaying = v; }
export function setChapterOffsets(v)     { chapterOffsets = v; }
export function setActiveBookId(v)       { activeBookId = v; }
export function setActiveBookTitle(v)    { activeBookTitle = v; }
export function setActiveBookAuthor(v)   { activeBookAuthor = v; }

export function setCurrentLibraryFilter(v) { currentLibraryFilter = v; }
export function setCurrentAuthorFilter(v)  { currentAuthorFilter = v; }

export function setIsPageMode(v)              { isPageMode = v; }
export function setCurrentPageScrollOffset(v) { currentPageScrollOffset = v; }
export function setPageScrollWidth(v)         { pageScrollWidth = v; }
export function setIndexOnPageModeEnter(v)    { indexOnPageModeEnter = v; }
export function setInitialPageOnEnter(v)      { initialPageOnEnter = v; }
export function setChapterOnPageModeEnter(v)  { chapterOnPageModeEnter = v; }
export function setPageRenderTimeout(v)       { pageRenderTimeout = v; }

export function setTotalSessionSeconds(v) { totalSessionSeconds = v; }
export function setLastTickTime(v)        { lastTickTime = v; }
export function setLastSavedIndex(v)      { lastSavedIndex = v; }
export function setLastSaveTime(v)        { lastSaveTime = v; }

export function setHyphenFragments(v)   { hyphenFragments = v; }
export function setHyphenFragmentIdx(v) { hyphenFragmentIdx = v; }

export function setEstimatedTimeCache(v)    { estimatedTimeCache = v; }
export function setEstimatedTimeCacheKey(v) { estimatedTimeCacheKey = v; }

export function setIsCurrentlyInRSVPFlow(v) { isCurrentlyInRSVPFlow = v; }
export function setIsSnapping(v)            { isSnapping = v; }
