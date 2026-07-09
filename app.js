(() => {
'use strict';

// ═══════════════════════════════════════════════════════════════════════
// Element refs
// ═══════════════════════════════════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const els = {
  loadScreen: $('loadScreen'), dropZone: $('dropZone'), fileInput: $('fileInput'),
  pasteToggleBtn: $('pasteToggleBtn'), sampleBtn: $('sampleBtn'), pasteArea: $('pasteArea'),
  pasteLoadBtn: $('pasteLoadBtn'), loadError: $('loadError'), themeToggleLoad: $('themeToggleLoad'),
  installBtn: $('installBtn'), iosInstallHint: $('iosInstallHint'),

  appShell: $('appShell'), topBar: $('topBar'), backBtn: $('backBtn'),
  titleText: $('titleText'), subText: $('subText'), bookmarkBtn: $('bookmarkBtn'),
  timerBtn: $('timerBtn'), annotateBtn: $('annotateBtn'),
  settingsBtn: $('settingsBtn'), fullscreenBtn: $('fullscreenBtn'), progressBar: $('progressBar'),

  fsTopBar: $('fsTopBar'), fsPrevBtn: $('fsPrevBtn'), fsBookmarkBtn: $('fsBookmarkBtn'),
  fsListBtn: $('fsListBtn'), fsTimerBtn: $('fsTimerBtn'), fsAnnotateBtn: $('fsAnnotateBtn'),
  fsExitBtn: $('fsExitBtn'), fsNextBtn: $('fsNextBtn'),

  stage: $('stage'), cardWrap: $('cardWrap'), flipInner: $('flipInner'),
  cardFront: $('cardFront'), sectionBadge: $('sectionBadge'), questionBody: $('questionBody'),
  questionImage: $('questionImage'), cardBack: $('cardBack'), answerLine: $('answerLine'),
  explanationBody: $('explanationBody'), explanationImage: $('explanationImage'),
  prevBtn: $('prevBtn'), nextArrowBtn: $('nextArrowBtn'), optionsWrap: $('optionsWrap'),
  flipBtn: $('flipBtn'), nextBtn: $('nextBtn'), toast: $('toast'),

  qListOverlay: $('qListOverlay'), qListCount: $('qListCount'), qListCloseBtn: $('qListCloseBtn'), qListBody: $('qListBody'),

  settingsOverlay: $('settingsOverlay'), settingsCloseBtn: $('settingsCloseBtn'),
  darkModeToggle: $('darkModeToggle'), loadImagesToggle: $('loadImagesToggle'),
  shuffleToggle: $('shuffleToggle'), shuffleOptToggle: $('shuffleOptToggle'),
  fontSizeVal: $('fontSizeVal'), fontSizeSlider: $('fontSizeSlider'), accentSwatches: $('accentSwatches'),
  autoTimerFullscreenToggle: $('autoTimerFullscreenToggle'),
  timerDefaultToggle: $('timerDefaultToggle'), annotateDefaultToggle: $('annotateDefaultToggle'),
  resetProgressBtn: $('resetProgressBtn'), loadNewBtn: $('loadNewBtn'),

  timerWidget: $('timerWidget'), timerBody: $('timerBody'), timerDragHandle: $('timerDragHandle'), timerModeBtn: $('timerModeBtn'),
  timerCloseBtn: $('timerCloseBtn'), timerAnalog: $('timerAnalog'), analogSvg: $('analogSvg'),
  clockTicks: $('clockTicks'), clockNumbers: $('clockNumbers'), handMinute: $('handMinute'), handSecond: $('handSecond'),
  timerDigital: $('timerDigital'), timerDisplay: $('timerDisplay'), countdownSetup: $('countdownSetup'),
  customSecs: $('customSecs'), timerStartBtn: $('timerStartBtn'), timerPauseBtn: $('timerPauseBtn'),
  timerResetBtn: $('timerResetBtn'), autoTimerToggle: $('autoTimerToggle'),
  timerOpacitySlider: $('timerOpacitySlider'),

  annotateLayer: $('annotateLayer'), annotateCanvas: $('annotateCanvas'), laserDot: $('laserDot'),
  annotateToolbar: $('annotateToolbar'), annotateColors: $('annotateColors'), strokeWidth: $('strokeWidth'),
  undoBtn: $('undoBtn'), redoBtn: $('redoBtn'), clearBtn: $('clearBtn'), verticalModeBtn: $('verticalModeBtn'),
  pngExportBtn: $('pngExportBtn'), annotateExitBtn: $('annotateExitBtn'), downloadLink: $('downloadLink'),
  fsQuickClearBtn: $('fsQuickClearBtn'),

  recentSection: $('recentSection'), recentList: $('recentList'), clearAllSessionsBtn: $('clearAllSessionsBtn'),
};

const OPTION_KEYS = ['A', 'B', 'C', 'D'];
const ACCENTS = ['#1565C0', '#6A1B9A', '#2E7D32', '#E65100', '#C2185B', '#00838F'];
const ANNOTATE_COLORS = ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#000000', '#FFFFFF', '#FB8C00', '#8E24AA'];

// ═══════════════════════════════════════════════════════════════════════
// App state
// ═══════════════════════════════════════════════════════════════════════
const state = {
  questions: [],
  order: [],            // index into state.questions, supports question shuffle
  currentPos: 0,        // position within state.order
  selected: null,
  answered: false,
  showExplanation: false,
  score: { correct: 0, total: 0 },
  bookmarks: new Set(),
  optionOrderCache: new Map(), // questionId -> ['A','C','B','D'] slot order
  isFullscreen: false,
  settings: {
    darkMode: false, loadImages: true, shuffleQuestions: false, shuffleOptions: false,
    fontSize: 16, accent: ACCENTS[0], autoTimerFullscreen: false,
    timerDefaultOn: false, annotateDefaultOn: false, timerOpacity: 1,
  },
  timer: {
    mode: 'stopwatch', running: false, startTs: 0, elapsedBeforePause: 0,
    countdownTotal: 60000, rafId: null, analogMode: true, ended: false,
  },
  annotate: {
    active: false, tool: 'pen', color: ANNOTATE_COLORS[0],
    strokes: [], redo: [],
  },
  deferredInstallPrompt: null,
};

let ctx = null; // annotate canvas 2D context, reassigned on resize
let currentStroke = null;
let drawingPointer = false;
let lastPenTs = 0;

// ═══════════════════════════════════════════════════════════════════════
// Question normalization — accepts this app's RawQuestion export, the
// FilteredMCQ/testbook shape, the flat DB Question shape, and a generic
// { options: [...], answer } shape.
// ═══════════════════════════════════════════════════════════════════════
const KEY_TO_LETTER = { '#0': 'A', '#1': 'B', '#2': 'C', '#3': 'D' };

function detectRootArray(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    for (const key of ['questions', 'data', 'mcqs', 'items']) {
      if (Array.isArray(json[key])) return json[key];
    }
  }
  throw new Error('Could not find a question list in this JSON. Expected an array, or an object with a "questions" array.');
}

function normalizeLetter(v) {
  if (typeof v === 'number') return OPTION_KEYS[v] || 'A';
  if (typeof v === 'string') {
    const t = v.trim().toUpperCase();
    if (OPTION_KEYS.includes(t)) return t;
  }
  return 'A';
}

function toQuestion(raw, idx) {
  if (!raw || typeof raw !== 'object') return null;

  // FilteredMCQ: options is an array of {key, valueText, valueHtml, isCorrect}
  if (Array.isArray(raw.options) && raw.options.length && typeof raw.options[0] === 'object' && raw.options[0] !== null && !Array.isArray(raw.options[0])) {
    const byKey = (key, pos) => {
      const found = raw.options.find((o) => o && o.key === key) || raw.options[pos];
      if (!found) return '';
      return found.valueHtml || found.valueText || '';
    };
    const correctObj = raw.options.find((o) => o && o.isCorrect);
    let correctAnswer = 'A';
    if (correctObj) {
      correctAnswer = KEY_TO_LETTER[correctObj.key] || OPTION_KEYS[raw.options.indexOf(correctObj)] || 'A';
    }
    return {
      id: raw.seqNo ?? raw.qno ?? idx,
      exam: raw.exam || '', section: raw.section || '', subsection: raw.subsection || '',
      subject: raw.s || '', chapter: raw.c || '', topic: raw.t || '', subtopic: raw.st || '',
      question: raw.questionHtml || raw.questionText || '',
      optionA: byKey('#0', 0), optionB: byKey('#1', 1), optionC: byKey('#2', 2), optionD: byKey('#3', 3),
      correctAnswer,
      explanation: raw.explanationHtml || raw.explanationText || '',
      imageUrl: raw.imageUrl || '', explanationImageUrl: raw.explanationImageUrl || '',
      difficulty: raw.difficulty || '', difficulty_score: raw.difficultyScore ?? null,
    };
  }

  // RawQuestion: options = {A,B,C,D}, correct_answer
  if (raw.options && typeof raw.options === 'object' && !Array.isArray(raw.options) && 'A' in raw.options) {
    return {
      id: raw.id ?? idx,
      exam: raw.exam || '', section: raw.section || '', subsection: raw.subsection || '',
      subject: raw.subject || '', chapter: raw.chapter || '', topic: raw.topic || '', subtopic: raw.subtopic || '',
      question: raw.question || '',
      optionA: raw.options.A ?? '', optionB: raw.options.B ?? '', optionC: raw.options.C ?? '', optionD: raw.options.D ?? '',
      correctAnswer: normalizeLetter(raw.correct_answer ?? raw.correctAnswer),
      explanation: raw.explanation || '',
      imageUrl: raw.imageUrl || '', explanationImageUrl: raw.explanationImageUrl || '',
      difficulty: raw.difficulty || '', difficulty_score: raw.difficulty_score ?? null,
    };
  }

  // Flat DB-style Question row: optionA/B/C/D + correctAnswer
  if ('optionA' in raw || 'option_a' in raw) {
    return {
      id: raw.id ?? idx,
      exam: raw.exam || '', section: raw.section || '', subsection: raw.subsection || '',
      subject: raw.subject || '', chapter: raw.chapter || '', topic: raw.topic || '', subtopic: raw.subtopic || '',
      question: raw.question || '',
      optionA: raw.optionA ?? raw.option_a ?? '', optionB: raw.optionB ?? raw.option_b ?? '',
      optionC: raw.optionC ?? raw.option_c ?? '', optionD: raw.optionD ?? raw.option_d ?? '',
      correctAnswer: normalizeLetter(raw.correctAnswer ?? raw.correct_answer),
      explanation: raw.explanation || '',
      imageUrl: raw.imageUrl || '', explanationImageUrl: raw.explanationImageUrl || '',
      difficulty: raw.difficulty || '', difficulty_score: raw.difficulty_score ?? null,
    };
  }

  // Generic quiz shape: options/choices = array of strings, answer = letter|index|text
  const genericOptions = raw.options || raw.choices;
  if (Array.isArray(genericOptions) && genericOptions.length) {
    const opts = genericOptions.slice(0, 4).map((o) => (typeof o === 'string' ? o : (o?.text ?? o?.value ?? String(o ?? ''))));
    while (opts.length < 4) opts.push('');
    const ans = raw.answer ?? raw.correct ?? raw.correctAnswer ?? raw.correct_answer ?? raw.correctIndex ?? raw.answerIndex;
    let letter = 'A';
    if (typeof ans === 'number') {
      letter = OPTION_KEYS[ans] || 'A';
    } else if (typeof ans === 'string') {
      const trimmed = ans.trim();
      if (/^[A-Da-d]$/.test(trimmed)) {
        letter = trimmed.toUpperCase();
      } else {
        const foundIdx = genericOptions.findIndex((o) => (typeof o === 'string' ? o : o?.text) === ans);
        letter = foundIdx >= 0 ? (OPTION_KEYS[foundIdx] || 'A') : 'A';
      }
    }
    return {
      id: raw.id ?? idx,
      exam: raw.exam || '', section: raw.section || raw.category || '', subsection: raw.subsection || '',
      subject: raw.subject || '', chapter: raw.chapter || '', topic: raw.topic || '', subtopic: raw.subtopic || '',
      question: raw.question || raw.questionText || raw.text || raw.prompt || '',
      optionA: opts[0], optionB: opts[1], optionC: opts[2], optionD: opts[3],
      correctAnswer: letter,
      explanation: raw.explanation || raw.explanationText || raw.solution || raw.rationale || '',
      imageUrl: raw.imageUrl || raw.image || '', explanationImageUrl: raw.explanationImageUrl || '',
      difficulty: raw.difficulty || '', difficulty_score: raw.difficulty_score ?? raw.difficultyScore ?? null,
    };
  }

  return null;
}

function normalizeAll(json) {
  const arr = detectRootArray(json);
  const out = [];
  arr.forEach((item, i) => {
    const q = toQuestion(item, i + 1);
    if (q && q.question && (q.optionA || q.optionB || q.optionC || q.optionD)) out.push(q);
  });
  if (out.length === 0) {
    throw new Error('No valid questions found. Each item needs a "question" plus options (A–D, or an options[]/answer pair).');
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// Rich content rendering (HTML + KaTeX), mirrors the app's MathRenderer
// ═══════════════════════════════════════════════════════════════════════
function decodeEntities(text) {
  return (text || '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}
const hasHtmlTags = (t) => /<[a-zA-Z][^>]*>/.test(t);

function renderRich(el, raw) {
  const decoded = decodeEntities(raw);
  const isHtml = hasHtmlTags(decoded);
  el.innerHTML = isHtml ? decoded : decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  el.querySelectorAll('table').forEach((t) => {
    if (t.parentElement.classList.contains('table-scroll')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });
  try {
    window.renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
    });
  } catch (e) { /* malformed TeX in source data — ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════
// Load screen
// ═══════════════════════════════════════════════════════════════════════
function showLoadError(msg) {
  els.loadError.hidden = false;
  els.loadError.textContent = msg;
}
function clearLoadError() { els.loadError.hidden = true; els.loadError.textContent = ''; }

// ─────────────────────────────────────────────────────────────────────────
// Sessions: remembers the last few files opened (their JSON + where you were
// in each one — current question, bookmarks, score) in localStorage, so
// reopening the app resumes exactly where you left off. Sessions persist
// until the person deletes them (per-file or "Clear all").
// ─────────────────────────────────────────────────────────────────────────
const SESSIONS_KEY = 'mcq_sessions_v1';
const MAX_SESSIONS = 8;
state.activeSessionKey = null;

function sessionFingerprint(questions) {
  return `${questions.length}:${questions[0]?.id ?? ''}`;
}
function sessionKeyFor(name, questions) {
  return `${name}::${sessionFingerprint(questions)}`;
}
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || []; } catch (e) { return []; }
}
function saveSessions(sessions) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch (e) { /* quota exceeded — non-fatal */ }
}
function findSession(key) {
  return loadSessions().find((s) => s.key === key) || null;
}
function upsertSession(patch) {
  if (!state.activeSessionKey) return;
  const sessions = loadSessions();
  const i = sessions.findIndex((s) => s.key === state.activeSessionKey);
  const existing = i >= 0 ? sessions[i] : { key: state.activeSessionKey };
  const merged = { ...existing, ...patch, savedAt: Date.now() };
  if (i >= 0) sessions.splice(i, 1);
  sessions.unshift(merged);
  while (sessions.length > MAX_SESSIONS) sessions.pop();
  saveSessions(sessions);
}
function persistCurrentSession() {
  if (!state.activeSessionKey) return;
  const q = currentQuestion();
  upsertSession({
    lastQuestionId: q ? q.id : null,
    bookmarks: [...state.bookmarks],
    score: state.score,
  });
}
function deleteSession(key) {
  saveSessions(loadSessions().filter((s) => s.key !== key));
  renderRecentList();
}
function clearAllSessions() {
  saveSessions([]);
  renderRecentList();
}
function renderRecentList() {
  const sessions = loadSessions();
  els.recentSection.hidden = sessions.length === 0;
  els.recentList.innerHTML = '';
  sessions.forEach((s) => {
    const row = document.createElement('button');
    row.className = 'recent-item';
    const info = document.createElement('div');
    info.className = 'recent-item-info';
    const name = document.createElement('div');
    name.className = 'recent-item-name';
    name.textContent = s.name || 'Untitled';
    const meta = document.createElement('div');
    meta.className = 'recent-item-meta';
    const count = s.count ?? (Array.isArray(s.json) ? s.json.length : '?');
    meta.textContent = `${count} question${count === 1 ? '' : 's'} · ${timeAgo(s.savedAt)}`;
    info.appendChild(name); info.appendChild(meta);
    const del = document.createElement('button');
    del.className = 'recent-item-del';
    del.textContent = '✕';
    del.title = 'Remove from recent files';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteSession(s.key); });
    row.appendChild(info); row.appendChild(del);
    row.addEventListener('click', () => loadFromJSON(s.json, { name: s.name, session: s }));
    els.recentList.appendChild(row);
  });
}
function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
els.clearAllSessionsBtn.addEventListener('click', () => {
  armConfirm(els.clearAllSessionsBtn, 'Tap again', clearAllSessions);
});

function loadFromJSON(json, opts = {}) {
  try {
    const questions = normalizeAll(json);
    state.questions = questions;

    const name = opts.name || 'Pasted JSON';
    const key = sessionKeyFor(name, questions);
    const session = opts.session !== undefined ? opts.session : (opts.skipPersist ? null : findSession(key));

    if (session) {
      state.bookmarks = new Set(session.bookmarks || []);
      state.score = session.score || { correct: 0, total: 0 };
    } else {
      state.bookmarks = new Set();
      state.score = { correct: 0, total: 0 };
    }

    buildOrder();
    state.currentPos = 0;
    if (session && session.lastQuestionId != null) {
      const idx = state.order.findIndex((oi) => state.questions[oi].id === session.lastQuestionId);
      if (idx >= 0) state.currentPos = idx;
    }

    resetCardState();
    clearLoadError();
    els.loadScreen.hidden = true;
    els.appShell.hidden = false;
    renderQuestion();
    if (state.settings.timerDefaultOn) openTimer();
    if (state.settings.annotateDefaultOn) enterAnnotate();
    if (!opts.silent) showToast(`Loaded ${questions.length} question${questions.length === 1 ? '' : 's'}`);

    if (opts.skipPersist) {
      state.activeSessionKey = null;
    } else {
      state.activeSessionKey = key;
      upsertSession({ name, json, count: questions.length, lastQuestionId: currentQuestion()?.id ?? null, bookmarks: [...state.bookmarks], score: state.score });
    }
  } catch (err) {
    showLoadError(err.message || String(err));
  }
}

function buildOrder() {
  const idxs = state.questions.map((_, i) => i);
  if (state.settings.shuffleQuestions) shuffleArray(idxs);
  state.order = idxs;
}
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      loadFromJSON(json, { name: file.name });
    } catch (err) {
      showLoadError('This file is not valid JSON: ' + err.message);
    }
  };
  reader.onerror = () => showLoadError('Could not read that file.');
  reader.readAsText(file);
}

els.fileInput.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) handleFile(f);
});
['dragover', 'dragenter'].forEach((evt) => els.dropZone.addEventListener(evt, (e) => {
  e.preventDefault(); els.dropZone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach((evt) => els.dropZone.addEventListener(evt, (e) => {
  e.preventDefault(); els.dropZone.classList.remove('dragover');
}));
els.dropZone.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f) handleFile(f);
});

els.pasteToggleBtn.addEventListener('click', () => {
  const show = els.pasteArea.hidden;
  els.pasteArea.hidden = !show;
  els.pasteLoadBtn.hidden = !show;
  if (show) els.pasteArea.focus();
});
els.pasteLoadBtn.addEventListener('click', () => {
  try {
    const json = JSON.parse(els.pasteArea.value);
    loadFromJSON(json, { name: 'Pasted JSON' });
  } catch (err) {
    showLoadError('Pasted text is not valid JSON: ' + err.message);
  }
});

const SAMPLE_QUESTIONS = [
  {
    id: 1, section: 'Quant', subsection: 'Algebra', exam: 'Sample Set',
    question: 'If $x + \\frac{1}{x} = 3$, what is the value of $x^2 + \\frac{1}{x^2}$?',
    options: { A: '5', B: '7', C: '9', D: '11' },
    correct_answer: 'B',
    explanation: '<p><strong>Concept:</strong> Square both sides.</p><p>$(x+\\frac{1}{x})^2 = x^2 + 2 + \\frac{1}{x^2} = 9$</p><p>So $x^2+\\frac{1}{x^2} = 9-2 = 7$.</p>',
    imageUrl: '', explanationImageUrl: '',
  },
  {
    id: 2, section: 'Reasoning', subsection: 'Series', exam: 'Sample Set',
    question: 'Find the next number: 2, 6, 12, 20, 30, ?',
    options: { A: '36', B: '40', C: '42', D: '44' },
    correct_answer: 'C',
    explanation: '<p>Differences: 4, 6, 8, 10, <strong>12</strong> → 30 + 12 = <strong>42</strong>.</p>',
    imageUrl: '', explanationImageUrl: '',
  },
  {
    id: 3, section: 'English', subsection: 'Vocabulary', exam: 'Sample Set',
    question: 'Choose the word closest in meaning to <em>"Ephemeral"</em>.',
    options: { A: 'Everlasting', B: 'Fleeting', C: 'Massive', D: 'Ancient' },
    correct_answer: 'B',
    explanation: '<p><strong>Ephemeral</strong> means lasting for a very short time — synonymous with <em>fleeting</em>.</p>',
    imageUrl: '', explanationImageUrl: '',
  },
  {
    id: 4, section: 'Quant', subsection: 'Geometry', exam: 'Sample Set',
    question: 'The area of a circle is $154\\ cm^2$. Find its radius. (Use $\\pi = \\frac{22}{7}$)',
    options: { A: '5 cm', B: '6 cm', C: '7 cm', D: '8 cm' },
    correct_answer: 'C',
    explanation: '<p>$\\pi r^2 = 154 \\Rightarrow r^2 = 154 \\times \\frac{7}{22} = 49 \\Rightarrow r = 7\\ cm$</p>',
    imageUrl: '', explanationImageUrl: '',
  },
];
els.sampleBtn.addEventListener('click', () => loadFromJSON(SAMPLE_QUESTIONS, { skipPersist: true }));

// ═══════════════════════════════════════════════════════════════════════
// Practice screen — question / options / flip card
// ═══════════════════════════════════════════════════════════════════════
function currentQuestion() {
  if (!state.order.length) return null;
  return state.questions[state.order[state.currentPos]];
}

function getDisplayOrder(q) {
  if (!state.settings.shuffleOptions) return ['A', 'B', 'C', 'D'];
  if (state.optionOrderCache.has(q.id)) return state.optionOrderCache.get(q.id);
  const order = shuffleArray(['A', 'B', 'C', 'D']);
  state.optionOrderCache.set(q.id, order);
  return order;
}

function resetCardState() {
  state.selected = null;
  state.answered = false;
  state.showExplanation = false;
  els.cardFront.hidden = false;
  els.cardBack.hidden = true;
  els.flipBtn.hidden = true;
  els.nextBtn.hidden = true;
  els.flipBtn.textContent = '↩ Show Explanation';
}

function renderQuestion() {
  const q = currentQuestion();
  if (!q) return;
  const total = state.order.length;

  els.titleText.textContent = q.subsection || (q.section && q.section !== 'All' ? q.section : 'Practice');
  els.subText.textContent = `${state.currentPos + 1} / ${total}  ✓${state.score.correct}`;
  els.progressBar.style.width = `${((state.currentPos + 1) / total) * 100}%`;
  els.fsListBtn.textContent = `${state.currentPos + 1}/${total}`;

  const badgeText = [q.exam, q.section].filter(Boolean).join(' · ');
  els.sectionBadge.textContent = badgeText || (q.subject || '');
  renderRich(els.questionBody, q.question);
  els.questionBody.style.fontSize = state.settings.fontSize + 'px';

  if (state.settings.loadImages && q.imageUrl) {
    els.questionImage.src = q.imageUrl; els.questionImage.hidden = false;
  } else {
    els.questionImage.hidden = true; els.questionImage.removeAttribute('src');
  }

  updateBookmarkIcons();
  renderOptions();
  resetCardState();
  updatePrevNextState();

  if (state.timer.mode && els.autoTimerToggle.checked) resetTimer(true);
}

function renderOptions() {
  const q = currentQuestion();
  const order = getDisplayOrder(q);
  const optMap = { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD };
  els.optionsWrap.innerHTML = '';
  order.forEach((letter, i) => {
    const posLabel = OPTION_KEYS[i];
    const btn = document.createElement('button');
    btn.className = 'option-card';
    btn.disabled = state.answered;

    let stateClass = '';
    if (state.answered) {
      if (letter === q.correctAnswer) stateClass = 'correct';
      else if (letter === state.selected) stateClass = 'incorrect';
    }
    if (stateClass) btn.classList.add(stateClass);

    const label = document.createElement('div');
    label.className = 'option-label' + (stateClass ? ' ' + stateClass : '');
    label.textContent = posLabel;

    const body = document.createElement('div');
    body.className = 'option-body rich-content';
    body.style.fontSize = state.settings.fontSize + 'px';

    const mark = document.createElement('span');
    if (state.answered && letter === q.correctAnswer) { mark.className = 'option-mark correct'; mark.textContent = '✓'; }
    else if (state.answered && letter === state.selected) { mark.className = 'option-mark incorrect'; mark.textContent = '✗'; }

    btn.appendChild(label); btn.appendChild(body); if (mark.textContent) btn.appendChild(mark);
    els.optionsWrap.appendChild(btn);
    renderRich(body, optMap[letter]);

    btn.addEventListener('click', () => handleAnswer(letter));
  });
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  els.toast.style.animation = 'none';
  void els.toast.offsetWidth;
  els.toast.style.animation = '';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { els.toast.hidden = true; }, 1150);
}

function handleAnswer(letter) {
  if (state.answered) return;
  const q = currentQuestion();
  state.selected = letter;
  state.answered = true;
  const isCorrect = letter === q.correctAnswer;
  state.score.total++;
  if (isCorrect) state.score.correct++;
  els.subText.textContent = `${state.currentPos + 1} / ${state.order.length}  ✓${state.score.correct}`;
  showToast(isCorrect ? 'Correct! ✓' : `Incorrect — Answer: ${q.correctAnswer}`);
  renderOptions();
  if (q.explanation) els.flipBtn.hidden = false;
  els.nextBtn.hidden = false;
  if (state.timer.running) pauseTimer();
  persistCurrentSession();
}

function flipCard() {
  const q = currentQuestion();
  els.flipInner.style.transition = 'transform 120ms ease';
  els.flipInner.style.transform = 'scaleX(0)';
  setTimeout(() => {
    state.showExplanation = !state.showExplanation;
    if (state.showExplanation) {
      els.cardFront.hidden = true; els.cardBack.hidden = false;
      els.answerLine.textContent = `${q.correctAnswer}: `;
      const answerSpan = document.createElement('span');
      els.answerLine.appendChild(answerSpan);
      renderRich(answerSpan, ({ A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD })[q.correctAnswer]);
      renderRich(els.explanationBody, q.explanation);
      els.explanationBody.style.fontSize = state.settings.fontSize + 'px';
      if (state.settings.loadImages && q.explanationImageUrl) {
        els.explanationImage.src = q.explanationImageUrl; els.explanationImage.hidden = false;
      } else { els.explanationImage.hidden = true; }
      els.flipBtn.textContent = '↩ Back to Question';
    } else {
      els.cardFront.hidden = false; els.cardBack.hidden = true;
      els.flipBtn.textContent = '↩ Show Explanation';
    }
    els.flipInner.style.transform = 'scaleX(1)';
  }, 120);
}
els.flipBtn.addEventListener('click', flipCard);

function goTo(pos) {
  if (pos < 0 || pos >= state.order.length) return;
  state.currentPos = pos;
  renderQuestion();
  els.cardFront.scrollTop = 0;
  persistCurrentSession();
}
function next() { if (state.currentPos < state.order.length - 1) goTo(state.currentPos + 1); }
function prev() { if (state.currentPos > 0) goTo(state.currentPos - 1); }

function updatePrevNextState() {
  const atStart = state.currentPos === 0;
  els.prevBtn.disabled = atStart; els.prevBtn.style.opacity = atStart ? '.2' : '.45';
  els.fsPrevBtn.disabled = atStart; els.fsPrevBtn.style.opacity = atStart ? '.2' : '.45';
}

els.prevBtn.addEventListener('click', prev);
els.nextArrowBtn.addEventListener('click', next);
els.nextBtn.addEventListener('click', next);
els.fsPrevBtn.addEventListener('click', prev);
els.fsNextBtn.addEventListener('click', next);

function toggleBookmark() {
  const q = currentQuestion();
  if (!q) return;
  if (state.bookmarks.has(q.id)) state.bookmarks.delete(q.id); else state.bookmarks.add(q.id);
  updateBookmarkIcons();
  persistCurrentSession();
}
function updateBookmarkIcons() {
  const q = currentQuestion();
  const on = q && state.bookmarks.has(q.id);
  [els.bookmarkBtn, els.fsBookmarkBtn].forEach((b) => {
    b.textContent = on ? '★' : '☆';
    b.style.color = on ? '#E65100' : '';
  });
}
els.bookmarkBtn.addEventListener('click', toggleBookmark);
els.fsBookmarkBtn.addEventListener('click', toggleBookmark);

// ═══════════════════════════════════════════════════════════════════════
// Fullscreen / presentation mode
// ═══════════════════════════════════════════════════════════════════════
function setFullscreen(on) {
  state.isFullscreen = on;
  document.body.classList.toggle('fullscreen-mode', on);
  els.fsTopBar.hidden = !on;
  els.timerWidget.classList.toggle('fs-clean', on);
  if (on) {
    els.cardFront.appendChild(els.optionsWrap);
    document.documentElement.requestFullscreen?.().catch(() => {});
    if (state.settings.autoTimerFullscreen) openTimer();
  } else {
    els.stage.insertBefore(els.optionsWrap, els.flipBtn);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
}
// Fullscreen-only: tap the question to flip to the explanation, tap the
// explanation to flip back — mirrors the app's fullscreen flashcard gesture.
els.questionBody.addEventListener('click', () => {
  if (state.isFullscreen && state.answered && currentQuestion()?.explanation) flipCard();
});
els.cardBack.addEventListener('click', (e) => {
  if (state.isFullscreen && !e.target.closest('img')) flipCard();
});
els.fullscreenBtn.addEventListener('click', () => setFullscreen(true));
els.fsExitBtn.addEventListener('click', () => setFullscreen(false));
// Some browsers (and most headless/automated ones) grant native fullscreen and
// then immediately auto-revoke it since there's no real window to fill. Only
// treat a fullscreenchange-driven exit as a genuine user action (e.g. they hit
// the OS's own "Exit fullscreen" control) if we were natively fullscreen for a
// little while first — otherwise our own UI mode ends up flickering straight
// back off right after the button is pressed.
let nativeFullscreenEnteredAt = 0;
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) { nativeFullscreenEnteredAt = performance.now(); return; }
  const heldLongEnough = nativeFullscreenEnteredAt && (performance.now() - nativeFullscreenEnteredAt > 500);
  if (heldLongEnough && state.isFullscreen) setFullscreen(false);
});
els.backBtn.addEventListener('click', goToLoadScreen);
els.loadNewBtn.addEventListener('click', goToLoadScreen);
function goToLoadScreen() {
  els.appShell.hidden = true;
  els.loadScreen.hidden = false;
  els.settingsOverlay.hidden = true;
  setFullscreen(false);
  renderRecentList();
}

// ═══════════════════════════════════════════════════════════════════════
// Question list sheet
// ═══════════════════════════════════════════════════════════════════════
function openQList() {
  const q = currentQuestion();
  els.qListCount.textContent = `Questions (${state.order.length})`;
  els.qListBody.innerHTML = '';
  state.order.forEach((qi, pos) => {
    const item = state.questions[qi];
    const isCurrent = pos === state.currentPos;
    const row = document.createElement('button');
    row.className = 'ql-item' + (isCurrent ? ' current' : '');
    const idx = document.createElement('div');
    idx.className = 'ql-index' + (isCurrent ? ' current' : '');
    idx.textContent = pos + 1;
    const text = document.createElement('div');
    text.className = 'ql-text';
    text.textContent = decodeEntities(item.question).replace(/<[^>]*>/g, '').trim();
    row.appendChild(idx); row.appendChild(text);
    if (state.bookmarks.has(item.id)) {
      const star = document.createElement('span'); star.textContent = '🔖'; row.appendChild(star);
    }
    row.addEventListener('click', () => { els.qListOverlay.hidden = true; goTo(pos); });
    els.qListBody.appendChild(row);
  });
  els.qListOverlay.hidden = false;
  const currentEl = els.qListBody.children[state.currentPos];
  if (currentEl) currentEl.scrollIntoView({ block: 'center' });
}
els.fsListBtn.addEventListener('click', openQList);
els.qListCloseBtn.addEventListener('click', () => { els.qListOverlay.hidden = true; });
els.qListOverlay.addEventListener('click', (e) => { if (e.target === els.qListOverlay) els.qListOverlay.hidden = true; });

// ═══════════════════════════════════════════════════════════════════════
// Settings sheet
// ═══════════════════════════════════════════════════════════════════════
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.settings.darkMode ? 'dark' : 'light');
  document.documentElement.style.setProperty('--accent', state.settings.accent);
  els.themeToggleLoad.textContent = state.settings.darkMode ? '☀️' : '🌙';
}
function persistSettings() {
  try { localStorage.setItem('mcq_settings', JSON.stringify(state.settings)); } catch (e) {}
}
function loadSettings() {
  try {
    const raw = localStorage.getItem('mcq_settings');
    if (raw) Object.assign(state.settings, JSON.parse(raw));
  } catch (e) {}
}

els.settingsBtn.addEventListener('click', () => { els.settingsOverlay.hidden = false; });
els.settingsCloseBtn.addEventListener('click', () => { els.settingsOverlay.hidden = true; });
els.settingsOverlay.addEventListener('click', (e) => { if (e.target === els.settingsOverlay) els.settingsOverlay.hidden = true; });

els.darkModeToggle.addEventListener('change', () => {
  state.settings.darkMode = els.darkModeToggle.checked;
  applyTheme(); persistSettings();
});
els.themeToggleLoad.addEventListener('click', () => {
  state.settings.darkMode = !state.settings.darkMode;
  els.darkModeToggle.checked = state.settings.darkMode;
  applyTheme(); persistSettings();
});
els.loadImagesToggle.addEventListener('change', () => {
  state.settings.loadImages = els.loadImagesToggle.checked;
  persistSettings(); renderQuestion();
});
els.shuffleToggle.addEventListener('change', () => {
  state.settings.shuffleQuestions = els.shuffleToggle.checked;
  persistSettings(); buildOrder(); state.currentPos = 0; renderQuestion();
});
els.shuffleOptToggle.addEventListener('change', () => {
  state.settings.shuffleOptions = els.shuffleOptToggle.checked;
  state.optionOrderCache.clear();
  persistSettings(); renderOptions();
});
els.autoTimerFullscreenToggle.addEventListener('change', () => {
  state.settings.autoTimerFullscreen = els.autoTimerFullscreenToggle.checked;
  persistSettings();
});
els.timerDefaultToggle.addEventListener('change', () => {
  state.settings.timerDefaultOn = els.timerDefaultToggle.checked;
  persistSettings();
});
els.annotateDefaultToggle.addEventListener('change', () => {
  state.settings.annotateDefaultOn = els.annotateDefaultToggle.checked;
  persistSettings();
});
els.timerOpacitySlider.addEventListener('input', () => {
  state.settings.timerOpacity = Number(els.timerOpacitySlider.value) / 100;
  els.timerWidget.style.setProperty('--timer-opacity', state.settings.timerOpacity);
  persistSettings();
});
els.fontSizeSlider.addEventListener('input', () => {
  state.settings.fontSize = Number(els.fontSizeSlider.value);
  els.fontSizeVal.textContent = state.settings.fontSize;
  persistSettings();
  if (currentQuestion()) { els.questionBody.style.fontSize = state.settings.fontSize + 'px'; renderOptions(); }
});
// Non-blocking "tap again to confirm" pattern — a native confirm() would
// freeze the page, which is unacceptable mid-recording during a lesson.
function armConfirm(btn, confirmLabel, onConfirm) {
  const original = btn.textContent;
  if (btn.dataset.armed) {
    delete btn.dataset.armed;
    clearTimeout(Number(btn.dataset.armTimer));
    btn.textContent = btn.dataset.original || original;
    onConfirm();
    return;
  }
  btn.dataset.original = original;
  btn.dataset.armed = '1';
  btn.textContent = confirmLabel;
  btn.dataset.armTimer = setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.original;
  }, 3000);
}

els.resetProgressBtn.addEventListener('click', () => {
  armConfirm(els.resetProgressBtn, 'Tap again to confirm', () => {
    state.score = { correct: 0, total: 0 };
    state.bookmarks.clear();
    renderQuestion();
    persistCurrentSession();
  });
});

function buildAccentSwatches() {
  els.accentSwatches.innerHTML = '';
  ACCENTS.forEach((hex) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (hex === state.settings.accent ? ' active' : '');
    b.style.background = hex;
    b.addEventListener('click', () => {
      state.settings.accent = hex; persistSettings(); applyTheme();
      [...els.accentSwatches.children].forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
    });
    els.accentSwatches.appendChild(b);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Timer — analog dial + digital stopwatch/countdown
// ═══════════════════════════════════════════════════════════════════════
function buildClockFace() {
  const ticksG = els.clockTicks, numsG = els.clockNumbers;
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
    const major = i % 5 === 0;
    const r1 = major ? 80 : 88;
    const r2 = 94;
    const x1 = 100 + r1 * Math.cos(angle), y1 = 100 + r1 * Math.sin(angle);
    const x2 = 100 + r2 * Math.cos(angle), y2 = 100 + r2 * Math.sin(angle);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('class', 'tick ' + (major ? 'tick-major' : 'tick-minor'));
    ticksG.appendChild(line);
    if (major) {
      const rn = 66;
      const nx = 100 + rn * Math.cos(angle), ny = 100 + rn * Math.sin(angle);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', nx); text.setAttribute('y', ny);
      text.setAttribute('class', 'clock-num');
      text.textContent = String(i);
      numsG.appendChild(text);
    }
  }
}

function timerNow() {
  const t = state.timer;
  const running = t.running ? performance.now() - t.startTs : 0;
  if (t.mode === 'stopwatch') return t.elapsedBeforePause + running;
  const remaining = t.countdownTotal - (t.elapsedBeforePause + running);
  return Math.max(0, remaining);
}

function formatTime(ms, withTenths) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${mm}:${ss}`;
  if (withTenths) {
    const t = Math.floor((ms % 1000) / 100);
    return `${mm}:${ss}.${t}`;
  }
  return `${mm}:${ss}`;
}
// Same as formatTime but wraps each ":" in a span so it can blink independently.
function formatTimeHTML(ms, withTenths) {
  return formatTime(ms, withTenths).replace(/:/g, '<span class="colon">:</span>');
}

function renderTimer() {
  const ms = timerNow();
  els.timerDisplay.innerHTML = formatTimeHTML(ms, state.timer.mode === 'stopwatch');
  els.timerDisplay.classList.toggle('ended', state.timer.mode === 'countdown' && ms <= 0);
  const totalSeconds = ms / 1000;
  const secAngle = (totalSeconds % 60) / 60 * 360;
  const minAngle = (totalSeconds / 60 % 60) / 60 * 360;
  els.handSecond.setAttribute('transform', `rotate(${secAngle} 100 100)`);
  els.handMinute.setAttribute('transform', `rotate(${minAngle} 100 100)`);

  if (state.timer.mode === 'countdown' && ms <= 0 && state.timer.running) {
    stopTimerAtZero();
  }
  if (state.timer.running) state.timer.rafId = requestAnimationFrame(renderTimer);
}

// Scales the digital readout's font size to the widget's current width/height
// so the "size adjustable" resize handle actually looks proportional.
function scaleTimerWidget() {
  const rect = els.timerWidget.getBoundingClientRect();
  const scale = Math.min(rect.width / 230, rect.height / 320);
  els.timerDisplay.style.fontSize = Math.max(18, Math.min(72, 34 * scale)) + 'px';
}

function startTimer() {
  const t = state.timer;
  if (t.running) return;
  t.running = true; t.ended = false; t.startTs = performance.now();
  els.timerStartBtn.hidden = true; els.timerPauseBtn.hidden = false;
  renderTimer();
}
function pauseTimer() {
  const t = state.timer;
  if (!t.running) return;
  t.elapsedBeforePause += performance.now() - t.startTs;
  t.running = false;
  cancelAnimationFrame(t.rafId);
  els.timerStartBtn.hidden = false; els.timerPauseBtn.hidden = true;
}
function resetTimer(autoStart) {
  const t = state.timer;
  cancelAnimationFrame(t.rafId);
  t.running = false; t.elapsedBeforePause = 0; t.ended = false;
  els.timerStartBtn.hidden = false; els.timerPauseBtn.hidden = true;
  renderTimer();
  if (autoStart) startTimer();
}
function stopTimerAtZero() {
  pauseTimer();
  state.timer.ended = true;
  playBeep();
  showToast("Time's up!");
}
function playBeep() {
  try {
    const ctxA = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36].forEach((delay) => {
      const o = ctxA.createOscillator(); const g = ctxA.createGain();
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctxA.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.3, ctxA.currentTime + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctxA.currentTime + delay + 0.15);
      o.connect(g); g.connect(ctxA.destination);
      o.start(ctxA.currentTime + delay); o.stop(ctxA.currentTime + delay + 0.16);
    });
  } catch (e) {}
}

els.timerStartBtn.addEventListener('click', startTimer);
els.timerPauseBtn.addEventListener('click', pauseTimer);
els.timerResetBtn.addEventListener('click', () => resetTimer(false));
// In fullscreen "clean" mode the controls are hidden — tap the clock itself instead.
els.timerBody.addEventListener('click', () => {
  if (!els.timerWidget.classList.contains('fs-clean')) return;
  state.timer.running ? pauseTimer() : startTimer();
});

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.timer.mode = btn.dataset.mode;
    els.countdownSetup.hidden = state.timer.mode !== 'countdown';
    resetTimer(false);
  });
});
document.querySelectorAll('.chip-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chip-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.timer.countdownTotal = Number(btn.dataset.secs) * 1000;
    resetTimer(false);
  });
});
els.customSecs.addEventListener('change', () => {
  const v = Number(els.customSecs.value);
  if (v > 0) {
    document.querySelectorAll('.chip-btn').forEach((b) => b.classList.remove('active'));
    state.timer.countdownTotal = v * 1000;
    resetTimer(false);
  }
});

els.timerModeBtn.addEventListener('click', () => {
  state.timer.analogMode = !state.timer.analogMode;
  els.timerAnalog.hidden = !state.timer.analogMode;
  els.timerDigital.hidden = state.timer.analogMode;
});
function openTimer() { els.timerWidget.hidden = false; scaleTimerWidget(); }
function closeTimer() { els.timerWidget.hidden = true; }
function toggleTimer() { els.timerWidget.hidden ? openTimer() : closeTimer(); }
els.timerCloseBtn.addEventListener('click', closeTimer);
els.timerBtn.addEventListener('click', toggleTimer);
els.fsTimerBtn.addEventListener('click', toggleTimer);
els.annotateBtn.addEventListener('click', () => { state.annotate.active ? exitAnnotate() : enterAnnotate(); });

// Draggable timer widget
(() => {
  let dragging = false, offX = 0, offY = 0;
  els.timerDragHandle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true;
    const rect = els.timerWidget.getBoundingClientRect();
    offX = e.clientX - rect.left; offY = e.clientY - rect.top;
    els.timerWidget.style.right = 'auto';
    try { els.timerDragHandle.setPointerCapture(e.pointerId); } catch (err) { /* stray pointerId */ }
  });
  els.timerDragHandle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const x = Math.min(window.innerWidth - 60, Math.max(0, e.clientX - offX));
    const y = Math.min(window.innerHeight - 60, Math.max(0, e.clientY - offY));
    els.timerWidget.style.left = x + 'px';
    els.timerWidget.style.top = y + 'px';
  });
  els.timerDragHandle.addEventListener('pointerup', () => { dragging = false; });
})();

// ═══════════════════════════════════════════════════════════════════════
// Annotate mode — pointer-events drawing engine (pressure-aware for stylus)
// ═══════════════════════════════════════════════════════════════════════
function normPressure(e) { return (e.pressure && e.pressure > 0) ? e.pressure : 0.5; }

function getCanvasPos(e) {
  const rect = els.annotateCanvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function drawSegment(c, p0, p1, s) {
  c.save();
  if (s.tool === 'eraser') { c.globalCompositeOperation = 'destination-out'; c.globalAlpha = 1; }
  else if (s.tool === 'highlighter') { c.globalCompositeOperation = 'source-over'; c.globalAlpha = 0.35; }
  else { c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
  c.strokeStyle = s.color;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const w = s.tool === 'highlighter' ? s.width * 2.6 : s.width * (0.4 + (p1.pressure || 0.5) * 1.1);
  c.lineWidth = Math.max(1, w);
  c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.stroke();
  c.restore();
}
// Smooths freehand ink by drawing a quadratic curve through the midpoints of
// three consecutive samples instead of straight segments — removes the
// "polygonal" look that raw point-to-point lines have on a fast stylus stroke.
function drawSmoothSegment(c, p0, p1, p2, s) {
  c.save();
  if (s.tool === 'eraser') { c.globalCompositeOperation = 'destination-out'; c.globalAlpha = 1; }
  else if (s.tool === 'highlighter') { c.globalCompositeOperation = 'source-over'; c.globalAlpha = 0.35; }
  else { c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
  c.strokeStyle = s.color;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const pressure = ((p1.pressure ?? 0.5) + (p2.pressure ?? 0.5)) / 2;
  const w = s.tool === 'highlighter' ? s.width * 2.6 : s.width * (0.4 + pressure * 1.1);
  c.lineWidth = Math.max(1, w);
  const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  c.beginPath();
  c.moveTo(mid1.x, mid1.y);
  c.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
  c.stroke();
  c.restore();
}
function drawDot(c, p, s) {
  c.save();
  if (s.tool === 'eraser') c.globalCompositeOperation = 'destination-out';
  else if (s.tool === 'highlighter') c.globalAlpha = 0.35;
  c.fillStyle = s.color;
  const w = s.tool === 'highlighter' ? s.width * 2.6 : s.width * (0.4 + (p.pressure || 0.5) * 1.1);
  c.beginPath(); c.arc(p.x, p.y, Math.max(1, w) / 2, 0, Math.PI * 2); c.fill();
  c.restore();
}
function drawArrowHead(c, x1, y1, x2, y2, width) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 8 + width * 1.5;
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  c.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  c.closePath(); c.fill();
}
function drawShape(c, s) {
  c.save();
  c.strokeStyle = s.color; c.fillStyle = s.color; c.lineWidth = s.width; c.lineCap = 'round'; c.lineJoin = 'round';
  if (s.tool === 'line' || s.tool === 'arrow') {
    c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke();
    if (s.tool === 'arrow') drawArrowHead(c, s.x1, s.y1, s.x2, s.y2, s.width);
  } else if (s.tool === 'rect') {
    c.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
  } else if (s.tool === 'ellipse') {
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2, rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
    c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
}
function drawText(c, s) {
  c.save();
  c.fillStyle = s.color;
  c.font = `600 ${s.fontSize}px ${getComputedStyle(document.body).fontFamily}`;
  c.textBaseline = 'top';
  s.text.split('\n').forEach((line, i) => c.fillText(line, s.x, s.y + i * (s.fontSize * 1.2)));
  c.restore();
}
function renderStroke(c, s) {
  if (s.tool === 'text') return drawText(c, s);
  if (s.tool === 'pen' || s.tool === 'highlighter' || s.tool === 'eraser') {
    const pts = s.points;
    if (pts.length === 1) return drawDot(c, pts[0], s);
    if (pts.length === 2) return drawSegment(c, pts[0], pts[1], s);
    for (let i = 2; i < pts.length; i++) drawSmoothSegment(c, pts[i - 2], pts[i - 1], pts[i], s);
    return;
  }
  drawShape(c, s);
}
function redrawAll() {
  if (!ctx) return;
  ctx.clearRect(0, 0, els.annotateCanvas.clientWidth, els.annotateCanvas.clientHeight);
  state.annotate.strokes.forEach((s) => renderStroke(ctx, s));
}

function resizeAnnotateCanvas() {
  const canvas = els.annotateCanvas;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * dpr);
  canvas.height = Math.max(1, rect.height * dpr);
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  redrawAll();
}
new ResizeObserver(() => { if (state.annotate.active) resizeAnnotateCanvas(); }).observe(els.stage);

function palmRejected(e) {
  if (e.pointerType === 'pen') { lastPenTs = performance.now(); return false; }
  if (e.pointerType === 'touch' && performance.now() - lastPenTs < 800) return true;
  return false;
}

function openTextEditor(pos) {
  const ta = document.createElement('textarea');
  ta.className = 'annotate-text-input';
  ta.style.left = pos.x + 'px'; ta.style.top = pos.y + 'px';
  ta.style.color = state.annotate.color;
  const fontSize = 14 + Number(els.strokeWidth.value);
  ta.style.fontSize = fontSize + 'px';
  ta.style.border = `1px dashed ${state.annotate.color}`;
  els.annotateLayer.appendChild(ta);
  ta.focus();
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    const text = ta.value;
    ta.remove();
    if (text.trim()) {
      state.annotate.strokes.push({ tool: 'text', color: state.annotate.color, x: pos.x, y: pos.y, text, fontSize });
      state.annotate.redo = [];
      redrawAll();
    }
  };
  ta.addEventListener('blur', finish);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ta.blur(); });
}

els.annotateCanvas.addEventListener('pointerdown', (e) => {
  if (!state.annotate.active || palmRejected(e)) return;
  const tool = state.annotate.tool;
  const pos = getCanvasPos(e);
  if (tool === 'text') { openTextEditor(pos); return; }
  if (tool === 'laser') { drawingPointer = true; showLaser(e); return; }
  drawingPointer = true;
  try { els.annotateCanvas.setPointerCapture(e.pointerId); } catch (err) { /* stray pointerId — drawing still works untracked */ }
  const width = Number(els.strokeWidth.value);
  if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
    currentStroke = { tool, color: state.annotate.color, width, points: [{ x: pos.x, y: pos.y, pressure: normPressure(e) }] };
    drawDot(ctx, currentStroke.points[0], currentStroke);
  } else {
    currentStroke = { tool, color: state.annotate.color, width, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
  }
});
els.annotateCanvas.addEventListener('pointermove', (e) => {
  if (!state.annotate.active) return;
  if (state.annotate.tool === 'laser') { if (drawingPointer) showLaser(e); return; }
  if (!drawingPointer || !currentStroke) return;
  if (palmRejected(e)) return;
  if (currentStroke.points) {
    // Coalesced events recover the sub-frame samples the OS captured between
    // animation frames — without them, a fast stylus stroke looks faceted.
    const rawEvents = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const events = rawEvents.length ? rawEvents : [e];
    const pts = currentStroke.points;
    for (const ev of events) {
      const p2 = getCanvasPos(ev);
      pts.push({ x: p2.x, y: p2.y, pressure: normPressure(ev) });
      const n = pts.length;
      if (n === 2) drawSegment(ctx, pts[0], pts[1], currentStroke);
      else if (n >= 3) drawSmoothSegment(ctx, pts[n - 3], pts[n - 2], pts[n - 1], currentStroke);
    }
  } else {
    const pos = getCanvasPos(e);
    currentStroke.x2 = pos.x; currentStroke.y2 = pos.y;
    redrawAll(); drawShape(ctx, currentStroke);
  }
});
function endStroke() {
  if (!drawingPointer) return;
  drawingPointer = false;
  if (state.annotate.tool === 'laser') { hideLaser(); currentStroke = null; return; }
  if (currentStroke) {
    state.annotate.strokes.push(currentStroke);
    state.annotate.redo = [];
    currentStroke = null;
  }
}
window.addEventListener('pointerup', endStroke);
window.addEventListener('pointercancel', endStroke);
els.annotateCanvas.addEventListener('pointerleave', () => {
  if (state.annotate.tool === 'laser') hideLaser();
});

function showLaser(e) {
  els.laserDot.hidden = false;
  els.laserDot.style.left = e.clientX + 'px';
  els.laserDot.style.top = e.clientY + 'px';
}
function hideLaser() { els.laserDot.hidden = true; }

document.querySelectorAll('.tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.annotate.tool = btn.dataset.tool;
  });
});
function buildAnnotateColors() {
  els.annotateColors.innerHTML = '';
  ANNOTATE_COLORS.forEach((hex, i) => {
    const b = document.createElement('button');
    b.className = 'color-swatch' + (i === 0 ? ' active' : '');
    b.style.background = hex;
    b.addEventListener('click', () => {
      state.annotate.color = hex;
      [...els.annotateColors.children].forEach((c) => c.classList.remove('active'));
      b.classList.add('active');
    });
    els.annotateColors.appendChild(b);
  });
}
els.undoBtn.addEventListener('click', () => {
  if (!state.annotate.strokes.length) return;
  state.annotate.redo.push(state.annotate.strokes.pop());
  redrawAll();
});
els.redoBtn.addEventListener('click', () => {
  if (!state.annotate.redo.length) return;
  state.annotate.strokes.push(state.annotate.redo.pop());
  redrawAll();
});
els.clearBtn.addEventListener('click', () => {
  if (!state.annotate.strokes.length) return;
  armConfirm(els.clearBtn, '⚠', () => {
    state.annotate.strokes = []; state.annotate.redo = [];
    redrawAll();
  });
});
// Fullscreen's minimal toolbar only shows pen + this button, so it clears
// immediately on a single tap — no confirm step, since it's right next to
// the pen and easy to hit by accident is an acceptable tradeoff for speed
// while teaching live.
els.fsQuickClearBtn.addEventListener('click', () => {
  state.annotate.strokes = []; state.annotate.redo = [];
  redrawAll();
});
els.verticalModeBtn.addEventListener('click', () => {
  document.body.classList.toggle('vertical-mode');
});
els.pngExportBtn.addEventListener('click', () => {
  els.annotateCanvas.toBlob((blob) => downloadBlob(blob, `annotation-${Date.now()}.png`), 'image/png');
});

function enterAnnotate() {
  state.annotate.active = true;
  els.annotateLayer.hidden = false;
  els.annotateToolbar.hidden = false;
  els.annotateBtn.classList.add('active');
  els.fsAnnotateBtn.classList.add('active');
  resizeAnnotateCanvas();
}
function exitAnnotate() {
  state.annotate.active = false;
  els.annotateLayer.hidden = true;
  els.annotateToolbar.hidden = true;
  els.annotateBtn.classList.remove('active');
  els.fsAnnotateBtn.classList.remove('active');
}
els.fsAnnotateBtn.addEventListener('click', () => {
  state.annotate.active ? exitAnnotate() : enterAnnotate();
});
els.annotateExitBtn.addEventListener('click', exitAnnotate);

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  els.downloadLink.href = url; els.downloadLink.download = filename;
  els.downloadLink.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ═══════════════════════════════════════════════════════════════════════
// Keyboard shortcuts
// ═══════════════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (els.appShell.hidden) return;

  if (e.key === 'Escape') {
    if (state.annotate.active) exitAnnotate();
    else if (!els.qListOverlay.hidden) els.qListOverlay.hidden = true;
    else if (!els.settingsOverlay.hidden) els.settingsOverlay.hidden = true;
    else if (state.isFullscreen) setFullscreen(false);
    return;
  }
  if (state.annotate.active) return; // don't hijack keys while drawing
  if (e.key === 'ArrowLeft') prev();
  else if (e.key === 'ArrowRight') next();
  else if (['1', '2', '3', '4'].includes(e.key)) {
    const order = getDisplayOrder(currentQuestion());
    handleAnswer(order[Number(e.key) - 1]);
  } else if (e.code === 'Space') { e.preventDefault(); if (state.answered) flipCard(); }
  else if (e.key.toLowerCase() === 'f') setFullscreen(!state.isFullscreen);
  else if (e.key.toLowerCase() === 'b') toggleBookmark();
  else if (e.key.toLowerCase() === 't') { els.timerWidget.hidden ? openTimer() : closeTimer(); }
  else if (e.key.toLowerCase() === 'n') { state.annotate.active ? exitAnnotate() : enterAnnotate(); }
});

// ═══════════════════════════════════════════════════════════════════════
// PWA install + service worker
// ═══════════════════════════════════════════════════════════════════════
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

if (!isStandalone) {
  if (isIOS) {
    // Safari never fires beforeinstallprompt — there's no programmatic install API,
    // so just show the manual steps.
    els.installBtn.hidden = false;
    els.installBtn.textContent = '📲 Add to Home Screen';
    els.installBtn.addEventListener('click', () => {
      els.iosInstallHint.hidden = !els.iosInstallHint.hidden;
    });
  } else {
    // Chrome/Edge/Android: capture the real prompt and trigger it from our own button
    // (calling preventDefault() without ever calling .prompt() would hide install entirely).
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      els.installBtn.hidden = false;
    });
    els.installBtn.addEventListener('click', async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      els.installBtn.hidden = true;
    });
    window.addEventListener('appinstalled', () => { els.installBtn.hidden = true; });
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════════════
function init() {
  loadSettings();
  els.darkModeToggle.checked = state.settings.darkMode;
  els.loadImagesToggle.checked = state.settings.loadImages;
  els.shuffleToggle.checked = state.settings.shuffleQuestions;
  els.shuffleOptToggle.checked = state.settings.shuffleOptions;
  els.fontSizeSlider.value = state.settings.fontSize;
  els.fontSizeVal.textContent = state.settings.fontSize;
  els.autoTimerFullscreenToggle.checked = state.settings.autoTimerFullscreen;
  els.timerDefaultToggle.checked = state.settings.timerDefaultOn;
  els.annotateDefaultToggle.checked = state.settings.annotateDefaultOn;
  els.timerOpacitySlider.value = Math.round(state.settings.timerOpacity * 100);
  els.timerWidget.style.setProperty('--timer-opacity', state.settings.timerOpacity);
  applyTheme();
  buildAccentSwatches();
  buildAnnotateColors();
  buildClockFace();
  renderTimer();
  new ResizeObserver(() => scaleTimerWidget()).observe(els.timerWidget);

  renderRecentList();

  // Boot priority: 1) a questions.json sitting next to the app in the repo,
  // 2) the most recently opened session (resumed at its saved position),
  // 3) the load screen.
  fetch('questions.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : Promise.reject()))
    .then((json) => loadFromJSON(json, { name: 'questions.json', silent: true }))
    .catch(() => {
      const sessions = loadSessions();
      if (sessions.length) {
        const latest = sessions[0];
        loadFromJSON(latest.json, { name: latest.name, session: latest, silent: true });
      }
    });
}
init();
})();
