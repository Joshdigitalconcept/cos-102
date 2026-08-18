/* COS 102 Quiz — App logic
   Created with love by gentlesoul.dev */
import { Analytics } from "@vercel/analytics/next"
const STORAGE = {
  user: 'cos102_user',
  history: 'cos102_history',
  leaderboard: 'cos102_lb',
  theme: 'cos102_theme'
};

// Only MCQ-style types (no typed short answers)
const ALLOWED_TYPES = new Set(['multiple_choice', 'true_false', 'tricky']);

let db = null;
let firebaseReady = false;

let state = {
  user: null,
  selectedTopics: new Set(),
  questionCount: 20,
  timerSeconds: 0,
  questions: [],
  index: 0,
  // Map of question index -> selected answer string
  selections: {},
  timerId: null,
  timeLeft: 0,
  quizActive: false,
  answers: [] // filled only on final submit
};

// ---------- BOOT ----------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initFirebase();
  const user = localStorage.getItem(STORAGE.user);
  if (user) {
    state.user = user;
    showApp();
  } else {
    showOnboard();
  }
  bindUI();
});

function showOnboard() {
  document.getElementById('onboardOverlay').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  const input = document.getElementById('usernameInput');
  const btn = document.getElementById('saveUsernameBtn');
  const hint = document.getElementById('usernameHint');

  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (v.length < 2) {
      hint.textContent = v ? 'At least 2 characters' : '';
      btn.disabled = true;
    } else if (!/^[a-zA-Z0-9_\-]+$/.test(v)) {
      hint.textContent = 'Letters, numbers, _ and - only';
      btn.disabled = true;
    } else {
      hint.textContent = '';
      btn.disabled = false;
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !btn.disabled) saveUsername();
  });
  btn.addEventListener('click', saveUsername);
}

function saveUsername() {
  const name = document.getElementById('usernameInput').value.trim();
  if (name.length < 2) return;
  localStorage.setItem(STORAGE.user, name);
  state.user = name;

  const lb = getLocalLeaderboard();
  if (!lb.find(e => e.name === name)) {
    lb.push({ name, best: 0, attempts: 0, totalCorrect: 0, totalQuestions: 0 });
    saveLocalLeaderboard(lb);
  }

  // Register user on Firebase if available
  if (firebaseReady && db) {
    db.collection('leaderboard').doc(name.toLowerCase()).set({
      name,
      best: 0,
      attempts: 0,
      totalCorrect: 0,
      totalQuestions: 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(e => console.warn('Firebase user seed failed', e));
  }

  document.getElementById('onboardOverlay').classList.add('hidden');
  showApp();
}

function showApp() {
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userChip').textContent = state.user;
  renderHome();
  renderTopicSelect();
  goTo('home');
}

// ---------- FIREBASE ----------
function initFirebase() {
  try {
    const enabled = typeof FIREBASE_ENABLED !== 'undefined' && FIREBASE_ENABLED === true;
    const hasConfig = typeof FIREBASE_CONFIG !== 'undefined' &&
      FIREBASE_CONFIG &&
      FIREBASE_CONFIG.apiKey &&
      FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY' &&
      FIREBASE_CONFIG.projectId &&
      FIREBASE_CONFIG.projectId !== 'YOUR_PROJECT_ID';

    if (!enabled) {
      console.log('[COS102] FIREBASE_ENABLED is false — local leaderboard only');
      return;
    }
    if (!hasConfig) {
      console.warn('[COS102] Firebase config looks like placeholders. Paste real keys in js/firebase-config.js');
      return;
    }
    if (typeof firebase === 'undefined') {
      console.warn('[COS102] Firebase SDK not loaded');
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.firestore();
    // Enable offline persistence for smoother UX
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    firebaseReady = true;
    console.log('[COS102] Firebase connected ✓ project:', FIREBASE_CONFIG.projectId);

    // Test write to confirm rules allow it
    db.collection('_health').doc('ping').set({
      t: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => console.log('[COS102] Firestore write OK'))
      .catch(e => console.error('[COS102] Firestore WRITE FAILED — check security rules:', e.message));

  } catch (e) {
    console.error('[COS102] Firebase init error', e);
    firebaseReady = false;
  }
}

// ---------- THEME ----------
function initTheme() {
  const t = localStorage.getItem(STORAGE.theme) || 'light';
  document.documentElement.setAttribute('data-theme', t);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE.theme, next);
}

// ---------- NAV ----------
function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  closeSidebar();
  if (page === 'progress') renderProgress();
  if (page === 'leaderboard') renderLeaderboard();
  if (page === 'home') renderHome();
}
function goHome() { goTo('home'); }

function bindUI() {
  document.getElementById('themeBtn').addEventListener('click', toggleTheme);
  document.getElementById('menuBtn').addEventListener('click', openSidebar);
  document.getElementById('sidebarBackdrop').addEventListener('click', closeSidebar);
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => goTo(btn.dataset.page));
  });

  document.getElementById('startQuizBtn').addEventListener('click', startQuiz);

  // Topic helpers
  document.getElementById('selectAllTopics')?.addEventListener('click', () => {
    QUESTIONS_DATA.topics.forEach(t => state.selectedTopics.add(t.id));
    renderTopicSelect();
  });
  document.getElementById('clearTopics')?.addEventListener('click', () => {
    state.selectedTopics.clear();
    renderTopicSelect();
  });

  // Question count presets
  document.getElementById('countPresets')?.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#countPresets button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById('countInput').value = b.dataset.count;
      updateStartSummary();
    });
  });
  document.getElementById('countInput')?.addEventListener('input', () => {
    document.querySelectorAll('#countPresets button').forEach(x => x.classList.remove('active'));
    updateStartSummary();
  });

  // Timer presets
  document.getElementById('timerPresets')?.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#timerPresets button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById('timerInput').value = b.dataset.mins;
      updateStartSummary();
    });
  });
  document.getElementById('timerInput')?.addEventListener('input', () => {
    document.querySelectorAll('#timerPresets button').forEach(x => x.classList.remove('active'));
    updateStartSummary();
  });
  document.getElementById('exitQuizBtn').addEventListener('click', () => {
    document.getElementById('exitModal').classList.remove('hidden');
  });
  document.getElementById('stayBtn').addEventListener('click', () => {
    document.getElementById('exitModal').classList.add('hidden');
  });
  document.getElementById('leaveBtn').addEventListener('click', () => {
    document.getElementById('exitModal').classList.add('hidden');
    stopTimer();
    state.quizActive = false;
    goTo('practice');
  });

  document.getElementById('prevBtn').addEventListener('click', () => {
    if (state.index > 0) {
      state.index--;
      renderQuestion();
    }
  });
  document.getElementById('nextBtn').addEventListener('click', () => {
    if (state.index < state.questions.length - 1) {
      state.index++;
      renderQuestion();
    }
  });
  document.getElementById('finalSubmitBtn').addEventListener('click', confirmFinalSubmit);
  document.getElementById('reviewBtn').addEventListener('click', showReview);
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
}

// ---------- HOME ----------
function renderHome() {
  const hist = getHistory();
  const totalQ = hist.reduce((s, h) => s + h.total, 0);
  const totalC = hist.reduce((s, h) => s + h.correct, 0);
  const avg = totalQ ? Math.round((totalC / totalQ) * 100) : 0;

  document.getElementById('homeStats').innerHTML = `
    <div class="stat-card"><span class="num">${hist.length}</span><span class="lbl">Sessions</span></div>
    <div class="stat-card"><span class="num">${avg}%</span><span class="lbl">Avg score</span></div>
    <div class="stat-card"><span class="num">${QUESTIONS_DATA.meta.total}</span><span class="lbl">Questions</span></div>
  `;
  document.getElementById('homeTopics').innerHTML = QUESTIONS_DATA.topics.map(t =>
    `<span class="chip">${t.name}</span>`
  ).join('');
}

// ---------- PRACTICE SETUP ----------
function filterQuestions(list) {
  return list.filter(q => ALLOWED_TYPES.has(q.type));
}

function renderTopicSelect() {
  const box = document.getElementById('topicSelect');
  box.innerHTML = QUESTIONS_DATA.topics.map(t => {
    const count = filterQuestions(t.questions).length;
    const selected = state.selectedTopics.has(t.id);
    return `
    <button type="button" class="topic-card${selected ? ' selected' : ''}" data-id="${t.id}">
      <span class="tc-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 7"/></svg>
      </span>
      <span class="tc-body">
        <span class="tc-name">${t.name}</span>
        <span class="tc-meta">${count} questions</span>
      </span>
    </button>`;
  }).join('');

  box.querySelectorAll('.topic-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (state.selectedTopics.has(id)) {
        state.selectedTopics.delete(id);
        btn.classList.remove('selected');
      } else {
        state.selectedTopics.add(id);
        btn.classList.add('selected');
      }
      updateStartSummary();
    });
  });

  updateStartSummary();
}

function updateStartSummary() {
  const el = document.getElementById('startSummary');
  if (!el) return;
  const nTopics = state.selectedTopics.size;
  if (nTopics === 0) {
    el.innerHTML = 'Select topics to begin';
    return;
  }
  let available = 0;
  QUESTIONS_DATA.topics.forEach(t => {
    if (state.selectedTopics.has(t.id)) available += filterQuestions(t.questions).length;
  });
  const countInput = document.getElementById('countInput');
  const timerInput = document.getElementById('timerInput');
  let n = parseInt(countInput?.value, 10) || 20;
  let mins = parseInt(timerInput?.value, 10) || 0;
  n = Math.min(n, available);
  const timeText = mins > 0 ? ` · <strong>${mins} min</strong> timer` : ' · no timer';
  el.innerHTML = `<strong>${nTopics}</strong> topic${nTopics > 1 ? 's' : ''} · up to <strong>${n}</strong> questions${timeText}`;
}

// ---------- QUIZ (exam mode) ----------
function startQuiz() {
  if (state.selectedTopics.size === 0) {
    alert('Select at least one topic.');
    return;
  }

  const countInput = document.getElementById('countInput');
  const timerInput = document.getElementById('timerInput');
  let n = parseInt(countInput.value, 10);
  let mins = parseInt(timerInput.value, 10);
  if (isNaN(n) || n < 1) n = 10;
  if (isNaN(mins) || mins < 0) mins = 0;
  state.questionCount = n;
  state.timerSeconds = mins * 60;

  let pool = [];
  QUESTIONS_DATA.topics.forEach(t => {
    if (state.selectedTopics.has(t.id)) {
      pool = pool.concat(filterQuestions(t.questions));
    }
  });

  if (pool.length === 0) {
    alert('No multiple-choice / true-false questions in the selected topics.');
    return;
  }

  pool = shuffle(pool);
  n = Math.min(n, pool.length);
  state.questions = pool.slice(0, n);
  state.index = 0;
  state.selections = {};
  state.answers = [];
  state.quizActive = true;

  goTo('quiz');
  renderQuestion();

  if (state.timerSeconds > 0) startOverallTimer(state.timerSeconds);
  else {
    stopTimer();
    document.getElementById('quizTimer').hidden = true;
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderQuestion() {
  const q = state.questions[state.index];
  if (!q) return;

  const progress = ((state.index + 1) / state.questions.length) * 100;
  document.getElementById('quizProgressFill').style.width = progress + '%';
  document.getElementById('quizProgress').textContent =
    `${state.index + 1} / ${state.questions.length}`;

  const typeLabels = {
    multiple_choice: 'Multiple choice',
    true_false: 'True / False',
    tricky: 'Tricky'
  };
  document.getElementById('qType').textContent = typeLabels[q.type] || q.type;
  document.getElementById('qText').textContent = q.question;

  let options = q.type === 'true_false' ? ['True', 'False'] : (q.options || []);
  const selected = state.selections[state.index];

  const optsEl = document.getElementById('qOptions');
  optsEl.innerHTML = options.map((opt, i) => {
    const letter = String.fromCharCode(65 + i);
    const isSel = selected === opt;
    return `<button class="opt${isSel ? ' selected' : ''}" type="button" data-val="${escapeAttr(opt)}">
      <span class="opt-letter">${letter}</span>
      <span class="opt-text">${escapeHtml(opt)}</span>
    </button>`;
  }).join('');

  optsEl.querySelectorAll('.opt').forEach(btn => {
    btn.addEventListener('click', () => {
      optsEl.querySelectorAll('.opt').forEach(o => o.classList.remove('selected'));
      btn.classList.add('selected');
      state.selections[state.index] = btn.dataset.val;
      updateAnsweredCount();
    });
  });

  document.getElementById('prevBtn').disabled = state.index === 0;
  document.getElementById('nextBtn').disabled = state.index === state.questions.length - 1;
  updateAnsweredCount();
}

function updateAnsweredCount() {
  const answered = Object.keys(state.selections).length;
  const total = state.questions.length;
  document.getElementById('answeredCount').textContent =
    `${answered} of ${total} answered`;
}

function startOverallTimer(seconds) {
  state.timeLeft = seconds;
  const el = document.getElementById('quizTimer');
  el.hidden = false;
  updateTimerDisplay();
  state.timerId = setInterval(() => {
    state.timeLeft--;
    updateTimerDisplay();
    if (state.timeLeft <= 0) {
      stopTimer();
      gradeAndFinish(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = document.getElementById('quizTimer');
  const m = Math.floor(state.timeLeft / 60);
  const s = state.timeLeft % 60;
  el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('urgent', state.timeLeft <= 60);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function confirmFinalSubmit() {
  const answered = Object.keys(state.selections).length;
  const total = state.questions.length;
  const missing = total - answered;
  let msg = `Submit ${answered} of ${total} answered questions?`;
  if (missing > 0) msg += `\n\n${missing} question(s) are still unanswered and will be marked wrong.`;
  if (!confirm(msg)) return;
  gradeAndFinish(false);
}

function gradeAndFinish(timedOut) {
  stopTimer();
  state.quizActive = false;

  state.answers = state.questions.map((q, i) => {
    const userAns = state.selections[i] != null ? state.selections[i] : null;
    const correct = userAns != null && checkAnswer(q, userAns);
    return {
      q,
      userAns,
      correct,
      skipped: userAns == null,
      timedOut: timedOut && userAns == null
    };
  });

  finishResults(timedOut);
}

function checkAnswer(q, userAns) {
  if (q.type === 'true_false') {
    const u = String(userAns).toLowerCase();
    const c = (q.answer === true || q.answer === 'True' || q.answer === 'true') ? 'true' : 'false';
    return u === c;
  }
  return String(userAns).trim() === String(q.answer).trim();
}

function formatAns(q) {
  if (q.type === 'true_false') {
    return (q.answer === true || q.answer === 'True' || q.answer === 'true') ? 'True' : 'False';
  }
  return q.answer;
}

function finishResults(timedOut) {
  const total = state.answers.length;
  const correct = state.answers.filter(a => a.correct).length;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  // History
  const hist = getHistory();
  hist.unshift({
    date: new Date().toISOString(),
    correct,
    total,
    pct,
    topics: [...state.selectedTopics]
  });
  if (hist.length > 50) hist.length = 50;
  localStorage.setItem(STORAGE.history, JSON.stringify(hist));

  // Leaderboard (local + Firebase)
  updateLeaderboard(pct, correct, total);

  document.getElementById('scorePct').textContent = pct + '%';
  document.getElementById('scoreFraction').textContent = `${correct} / ${total}`;

  const ring = document.getElementById('ringFg');
  const circumference = 264;
  ring.style.strokeDashoffset = circumference - (circumference * pct / 100);

  let title = 'Keep going';
  if (timedOut) title = "Time's up";
  else if (pct >= 90) title = 'Outstanding';
  else if (pct >= 75) title = 'Great work';
  else if (pct >= 50) title = 'Solid effort';
  document.getElementById('resultsTitle').textContent = title;

  document.getElementById('resultsMeta').innerHTML = `
    <div class="meta-row"><span>Correct</span><span>${correct}</span></div>
    <div class="meta-row"><span>Incorrect / unanswered</span><span>${total - correct}</span></div>
    <div class="meta-row"><span>Accuracy</span><span>${pct}%</span></div>
  `;

  goTo('results');
}

function showReview() {
  const list = document.getElementById('reviewList');
  list.innerHTML = state.answers.map((a, i) => {
    const status = a.skipped ? (a.timedOut ? 'Timed out' : 'Unanswered') : (a.correct ? 'Correct' : 'Wrong');
    const cls = a.correct ? 'ok' : 'no';
    return `<div class="review-item ${cls}">
      <div class="rm">Q${i + 1} · ${a.q.type.replace('_', ' ')} · ${status}</div>
      <div class="rq">${escapeHtml(a.q.question)}</div>
      <div class="ra">
        ${a.skipped ? '<em>No answer</em><br>' : `Yours: <strong>${escapeHtml(String(a.userAns))}</strong><br>`}
        Correct: <strong>${escapeHtml(formatAns(a.q))}</strong>
      </div>
    </div>`;
  }).join('');
  goTo('review');
}

// ---------- PROGRESS ----------
function renderProgress() {
  const hist = getHistory();
  const totalQ = hist.reduce((s, h) => s + h.total, 0);
  const totalC = hist.reduce((s, h) => s + h.correct, 0);
  const avg = totalQ ? Math.round((totalC / totalQ) * 100) : 0;
  const best = hist.length ? Math.max(...hist.map(h => h.pct)) : 0;

  document.getElementById('analyticsGrid').innerHTML = `
    <div class="a-card"><div class="a-num">${hist.length}</div><div class="a-lbl">Sessions</div></div>
    <div class="a-card"><div class="a-num">${avg}%</div><div class="a-lbl">Average score</div></div>
    <div class="a-card"><div class="a-num">${best}%</div><div class="a-lbl">Best score</div></div>
    <div class="a-card"><div class="a-num">${totalQ}</div><div class="a-lbl">Questions answered</div></div>
  `;

  const list = document.getElementById('sessionHistory');
  if (!hist.length) {
    list.innerHTML = '<div class="empty-state">No sessions yet. Start practicing!</div>';
    return;
  }
  list.innerHTML = hist.slice(0, 15).map(h => {
    const d = new Date(h.date);
    const when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `<div class="session-item">
      <span class="s-left">${when}</span>
      <span class="s-score">${h.correct}/${h.total} (${h.pct}%)</span>
    </div>`;
  }).join('');
}

// ---------- LEADERBOARD ----------
function getLocalLeaderboard() {
  try { return JSON.parse(localStorage.getItem(STORAGE.leaderboard) || '[]'); }
  catch { return []; }
}
function saveLocalLeaderboard(lb) {
  localStorage.setItem(STORAGE.leaderboard, JSON.stringify(lb));
}

async function updateLeaderboard(pct, correct, total) {
  // Local always
  const lb = getLocalLeaderboard();
  let entry = lb.find(e => e.name === state.user);
  if (!entry) {
    entry = { name: state.user, best: 0, attempts: 0, totalCorrect: 0, totalQuestions: 0 };
    lb.push(entry);
  }
  entry.attempts += 1;
  entry.totalCorrect += correct;
  entry.totalQuestions += total;
  if (pct > entry.best) entry.best = pct;
  entry.updatedAt = Date.now();
  lb.sort((a, b) => b.best - a.best || b.attempts - a.attempts);
  saveLocalLeaderboard(lb);

  // Firebase
  if (!firebaseReady || !db || !state.user) {
    console.log('[COS102] Skipping Firebase sync (not ready)');
    return;
  }

  const docId = state.user.toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
  try {
    const ref = db.collection('leaderboard').doc(docId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists ? snap.data() : {
        best: 0, attempts: 0, totalCorrect: 0, totalQuestions: 0
      };
      tx.set(ref, {
        name: state.user,
        best: Math.max(Number(prev.best) || 0, pct),
        attempts: (Number(prev.attempts) || 0) + 1,
        totalCorrect: (Number(prev.totalCorrect) || 0) + correct,
        totalQuestions: (Number(prev.totalQuestions) || 0) + total,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    console.log('[COS102] Score synced to Firebase for', state.user);
  } catch (e) {
    console.error('[COS102] Firebase score sync FAILED:', e.message || e);
    alert('Could not sync score to the live leaderboard.\n\nCheck Firestore rules allow write to collection "leaderboard".\nError: ' + (e.message || e));
  }
}

async function renderLeaderboard() {
  const list = document.getElementById('leaderboardList');
  list.innerHTML = '<div class="empty-state">Loading leaderboard…</div>';

  let rows = [];
  let source = 'local';

  if (firebaseReady && db) {
    try {
      const snap = await db.collection('leaderboard')
        .orderBy('best', 'desc')
        .limit(50)
        .get();
      rows = snap.docs.map(d => d.data());
      source = 'firebase';
      console.log('[COS102] Loaded', rows.length, 'rows from Firebase');
    } catch (e) {
      console.warn('[COS102] Firebase read failed, using local:', e.message || e);
      // Fallback: try without orderBy in case index missing
      try {
        const snap2 = await db.collection('leaderboard').limit(50).get();
        rows = snap2.docs.map(d => d.data());
        rows.sort((a, b) => (b.best || 0) - (a.best || 0));
        source = 'firebase';
      } catch (e2) {
        rows = getLocalLeaderboard();
      }
    }
  } else {
    rows = getLocalLeaderboard();
  }

  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">No scores yet. Be the first!</div>
      <p class="fb-status ${firebaseReady ? 'on' : 'off'}">${firebaseReady ? '● Live (Firebase)' : '○ Local only — enable Firebase in js/firebase-config.js'}</p>`;
    return;
  }

  rows.sort((a, b) => (b.best || 0) - (a.best || 0) || (b.attempts || 0) - (a.attempts || 0));

  list.innerHTML = rows.map((e, i) => `
    <div class="lb-row ${i < 3 ? 'top' : ''}">
      <div class="lb-rank">${i + 1}</div>
      <div class="lb-name">${escapeHtml(e.name || 'Player')}${e.name === state.user ? ' (you)' : ''}</div>
      <div>
        <div class="lb-score">${e.best || 0}%</div>
        <div class="lb-meta">${e.attempts || 0} attempt${(e.attempts || 0) !== 1 ? 's' : ''}</div>
      </div>
    </div>
  `).join('') +
  `<p class="fb-status ${source === 'firebase' ? 'on' : 'off'}">${source === 'firebase' ? '● Live leaderboard (Firebase)' : '○ Local leaderboard only'}</p>`;
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE.history) || '[]'); }
  catch { return []; }
}

// ---------- HELPERS ----------
function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t == null ? '' : String(t);
  return d.innerHTML;
}
function escapeAttr(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;');
}
