
(() => {
  const book = window.PROJECT_MCQ_BOOK;
  if (!book) {
    document.body.innerHTML = "<p style='padding:2rem'>Question bank could not be loaded.</p>";
    return;
  }

  const $ = (id) => document.getElementById(id);
  const LETTERS = ["A","B","C","D"];
  const STORAGE_KEY = "project_mcq_v1";
  const state = {
    quiz: [],
    current: 0,
    answers: {},
    marked: new Set(),
    bookmarks: new Set(),
    mode: "study",
    startTime: null,
    elapsed: 0,
    timerId: null,
    config: null,
    lastResult: null
  };

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  state.bookmarks = new Set(saved.bookmarks || []);

  function persist(extra = {}) {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      bookmarks: [...state.bookmarks],
      ...extra
    }));
  }

  function setView(name) {
    ["homeView","quizView","resultsView"].forEach(id => $(id).classList.remove("active"));
    $(name).classList.add("active");
    window.scrollTo({top:0,behavior:"auto"});
  }

  function fmt(n) { return Number(n).toLocaleString(); }

  function shuffle(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function prepareQuestion(q, shuffleOpts) {
    const opts = q.options.map((text, idx) => ({text, correct: idx === q.correctIndex}));
    const arranged = shuffleOpts ? shuffle(opts) : opts;
    return {
      ...q,
      displayOptions: arranged,
      displayCorrectIndex: arranged.findIndex(o => o.correct)
    };
  }

  function loadHome() {
    $("totalQuestions").textContent = fmt(book.questionCount);
    $("bookCount").textContent = `${fmt(book.questionCount)} MCQs`;
    $("bookTitle").textContent = book.title;
    $("bookAuthor").textContent = book.author;

    $("sectionList").innerHTML = book.sections.map(s =>
      `<div class="section-item"><strong>${escapeHTML(s.name)}</strong><span>${fmt(s.count)} questions</span></div>`
    ).join("");

    $("sectionSelect").innerHTML =
      `<option value="all">Entire book — ${fmt(book.questionCount)} questions</option>` +
      book.sections.map(s => `<option value="${escapeAttr(s.name)}">${escapeHTML(s.name)} — ${fmt(s.count)}</option>`).join("");

    const latestSaved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const history = latestSaved.history || [];
    $("attemptCount").textContent = history.length;
    $("bestScore").textContent = history.length ? `${Math.max(...history.map(h => h.percent))}%` : "—";
    $("bookmarkCount").textContent = state.bookmarks.size;
  }

  function selectedMode() {
    return document.querySelector('input[name="mode"]:checked').value;
  }

  function startQuiz(reuseConfig = null) {
    const section = reuseConfig?.section ?? $("sectionSelect").value;
    const countValue = reuseConfig?.countValue ?? $("countSelect").value;
    const randomQuestions = reuseConfig?.randomQuestions ?? $("shuffleQuestions").checked;
    const randomOptions = reuseConfig?.randomOptions ?? $("shuffleOptions").checked;
    const mode = reuseConfig?.mode ?? selectedMode();

    let pool = section === "all" ? [...book.questions] : book.questions.filter(q => q.section === section);
    if (randomQuestions) pool = shuffle(pool);

    const requested = countValue === "all" ? pool.length : Math.min(parseInt(countValue,10), pool.length);
    const chosen = pool.slice(0, requested).map(q => prepareQuestion(q, randomOptions));

    state.quiz = chosen;
    state.current = 0;
    state.answers = {};
    state.marked = new Set();
    state.mode = mode;
    state.startTime = Date.now();
    state.elapsed = 0;
    state.config = {section, countValue, randomQuestions, randomOptions, mode};
    state.lastResult = null;

    clearInterval(state.timerId);
    state.timerId = setInterval(updateTimer, 1000);
    updateTimer();

    $("modeBadge").textContent = mode === "study" ? "Study mode" : "Exam mode";
    $("submitBtn").textContent = mode === "exam" ? "Submit Exam" : "Finish Quiz";

    buildNavigator();
    renderQuestion();
    setView("quizView");
  }

  function updateTimer() {
    if (!state.startTime) return;
    state.elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    $("timer").textContent = formatTime(state.elapsed);
  }

  function formatTime(sec) {
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    const s = sec%60;
    return h > 0
      ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
      : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function buildNavigator() {
    $("navigatorGrid").innerHTML = state.quiz.map((_,i) =>
      `<button class="nav-q" type="button" data-index="${i}">${i+1}</button>`
    ).join("");
    $("navigatorGrid").querySelectorAll(".nav-q").forEach(btn => {
      btn.addEventListener("click", () => {
        state.current = Number(btn.dataset.index);
        renderQuestion();
      });
    });
  }

  function renderQuestion() {
    const q = state.quiz[state.current];
    if (!q) return;

    const answer = state.answers[q.id];
    const studyLocked = state.mode === "study" && answer !== undefined;

    $("progressText").textContent = `Question ${state.current + 1} of ${state.quiz.length}`;
    const answered = Object.keys(state.answers).length;
    $("answeredText").textContent = `${answered} answered`;
    $("navigatorSummary").textContent = `${answered} / ${state.quiz.length} answered`;
    $("progressBar").style.width = `${((state.current+1)/state.quiz.length)*100}%`;

    $("sectionBadge").textContent = q.section;
    $("questionText").textContent = q.question;

    $("bookmarkBtn").textContent = state.bookmarks.has(q.id) ? "★" : "☆";
    $("bookmarkBtn").classList.toggle("active", state.bookmarks.has(q.id));

    $("markBtn").textContent = state.marked.has(q.id) ? "Marked for Review ✓" : "Mark for Review";

    $("sourceLink").href = `${book.sourcePdf}#page=${q.page}`;
    $("sourceLink").textContent = `Source: page ${q.page} ↗`;

    $("options").innerHTML = q.displayOptions.map((opt, idx) => {
      let cls = "option";
      if (answer === idx) cls += " selected";
      if (studyLocked && idx === q.displayCorrectIndex) cls += " correct";
      if (studyLocked && answer === idx && idx !== q.displayCorrectIndex) cls += " incorrect";
      return `<button class="${cls}" type="button" data-index="${idx}" ${studyLocked ? "disabled" : ""}>
        <span class="letter">${LETTERS[idx]}</span>
        <span>${escapeHTML(opt.text)}</span>
      </button>`;
    }).join("");

    $("options").querySelectorAll(".option").forEach(btn => {
      btn.addEventListener("click", () => selectAnswer(Number(btn.dataset.index)));
    });

    renderFeedback(q, answer);
    $("prevBtn").disabled = state.current === 0;
    $("nextBtn").textContent = state.current === state.quiz.length - 1 ? "Finish" : "Next";

    updateNavigator();
  }

  function selectAnswer(idx) {
    const q = state.quiz[state.current];
    if (state.mode === "study" && state.answers[q.id] !== undefined) return;
    state.answers[q.id] = idx;
    renderQuestion();
  }

  function renderFeedback(q, answer) {
    const box = $("feedback");
    if (state.mode !== "study" || answer === undefined) {
      box.className = "feedback hidden";
      box.innerHTML = "";
      return;
    }
    const isCorrect = answer === q.displayCorrectIndex;
    box.className = `feedback ${isCorrect ? "good" : "bad"}`;
    box.innerHTML = isCorrect
      ? `✓ Correct`
      : `✕ Incorrect. Correct answer: <strong>${LETTERS[q.displayCorrectIndex]}. ${escapeHTML(q.displayOptions[q.displayCorrectIndex].text)}</strong>`;
  }

  function updateNavigator() {
    $("navigatorGrid").querySelectorAll(".nav-q").forEach((btn, i) => {
      const q = state.quiz[i];
      btn.classList.toggle("current", i === state.current);
      btn.classList.toggle("answered", state.answers[q.id] !== undefined);
      btn.classList.toggle("marked", state.marked.has(q.id));
    });
  }

  function goNext() {
    if (state.current < state.quiz.length - 1) {
      state.current++;
      renderQuestion();
    } else {
      finishQuiz();
    }
  }

  function finishQuiz() {
    if (!state.quiz.length) return;
    clearInterval(state.timerId);
    updateTimer();

    const resultRows = state.quiz.map(q => {
      const chosen = state.answers[q.id];
      const answered = chosen !== undefined;
      const correct = answered && chosen === q.displayCorrectIndex;
      return {q, chosen, answered, correct};
    });

    const correct = resultRows.filter(r => r.correct).length;
    const unanswered = resultRows.filter(r => !r.answered).length;
    const wrong = state.quiz.length - correct - unanswered;
    const percent = Math.round((correct/state.quiz.length)*100);

    state.lastResult = {rows:resultRows, correct, wrong, unanswered, percent, elapsed:state.elapsed};

    const currentSaved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const history = currentSaved.history || [];
    history.unshift({
      date: new Date().toISOString(),
      percent,
      correct,
      total: state.quiz.length,
      section: state.config.section,
      mode: state.mode,
      elapsed: state.elapsed
    });
    persist({history: history.slice(0,50)});

    $("scorePercent").textContent = `${percent}%`;
    $("scoreRing").style.background = `conic-gradient(var(--accent) ${percent}%, var(--line) ${percent}% 100%)`;
    $("scoreHeadline").textContent = `${correct} / ${state.quiz.length} correct`;
    $("scoreSubtext").textContent = state.config.section === "all" ? book.title : state.config.section;
    $("correctCount").textContent = correct;
    $("wrongCount").textContent = wrong;
    $("unansweredCount").textContent = unanswered;
    $("timeTaken").textContent = formatTime(state.elapsed);

    renderReview("all");
    loadHome();
    setView("resultsView");
  }

  function renderReview(filter) {
    if (!state.lastResult) return;
    let rows = state.lastResult.rows;
    if (filter === "wrong") rows = rows.filter(r => r.answered && !r.correct);
    if (filter === "unanswered") rows = rows.filter(r => !r.answered);
    if (filter === "bookmarked") rows = rows.filter(r => state.bookmarks.has(r.q.id));

    $("reviewList").innerHTML = rows.length ? rows.map((r, idx) => {
      const q = r.q;
      const user = r.answered ? `${LETTERS[r.chosen]}. ${q.displayOptions[r.chosen].text}` : "Not answered";
      const correct = `${LETTERS[q.displayCorrectIndex]}. ${q.displayOptions[q.displayCorrectIndex].text}`;
      return `<article class="review-item">
        <h3>${escapeHTML(q.question)}</h3>
        <div class="review-answer">Your answer: <strong class="${r.correct ? "good" : "bad"}">${escapeHTML(user)}</strong></div>
        <div class="review-answer">Correct answer: <strong class="good">${escapeHTML(correct)}</strong></div>
        <div class="review-meta">${escapeHTML(q.section)} · <a href="${book.sourcePdf}#page=${q.page}" target="_blank" rel="noopener">page ${q.page} ↗</a></div>
      </article>`;
    }).join("") : `<p class="muted">No questions match this filter.</p>`;
  }

  function toggleBookmark() {
    const q = state.quiz[state.current];
    if (!q) return;
    state.bookmarks.has(q.id) ? state.bookmarks.delete(q.id) : state.bookmarks.add(q.id);
    persist();
    $("bookmarkCount").textContent = state.bookmarks.size;
    renderQuestion();
  }

  function toggleMark() {
    const q = state.quiz[state.current];
    if (!q) return;
    state.marked.has(q.id) ? state.marked.delete(q.id) : state.marked.add(q.id);
    renderQuestion();
  }

  function quitQuiz() {
    if (confirm("Exit this quiz? Your current attempt will not be scored.")) {
      clearInterval(state.timerId);
      state.startTime = null;
      setView("homeView");
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
  }
  function escapeAttr(s) { return escapeHTML(s); }

  // Theme
  const initialTheme = saved.theme || "light";
  document.documentElement.dataset.theme = initialTheme;
  $("themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    persist({theme:next});
  });

  $("startBtn").addEventListener("click", () => startQuiz());
  $("prevBtn").addEventListener("click", () => { if (state.current > 0) { state.current--; renderQuestion(); } });
  $("nextBtn").addEventListener("click", goNext);
  $("submitBtn").addEventListener("click", finishQuiz);
  $("bookmarkBtn").addEventListener("click", toggleBookmark);
  $("markBtn").addEventListener("click", toggleMark);
  $("quitBtn").addEventListener("click", quitQuiz);
  $("retryBtn").addEventListener("click", () => startQuiz(state.config));
  $("homeBtn").addEventListener("click", () => setView("homeView"));
  $("brandBtn").addEventListener("click", () => {
    clearInterval(state.timerId);
    setView("homeView");
  });
  $("reviewFilter").addEventListener("change", e => renderReview(e.target.value));

  loadHome();
})();
