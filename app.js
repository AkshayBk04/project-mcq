
(() => {
  const banks = window.PROJECT_MCQ_BANKS || [];
  if (!banks.length) {
    document.body.innerHTML = "<p style='padding:2rem'>Question banks could not be loaded.</p>";
    return;
  }

  const $ = id => document.getElementById(id);
  const LETTERS = ["A","B","C","D"];
  const STORAGE_KEY = "project_mcq_v1_1";
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

  const state = {
    bankId: saved.lastBankId && banks.some(b => b.bankId === saved.lastBankId) ? saved.lastBankId : banks[0].bankId,
    quiz: [], current: 0, answers: {}, marked: new Set(),
    bookmarks: new Set(saved.bookmarks || []),
    mode: "study", startTime: null, elapsed: 0, timerId: null,
    config: null, lastResult: null
  };

  function bank(){ return banks.find(b => b.bankId === state.bankId) || banks[0]; }
  function bookmarkKey(q){ return `${state.bankId}:${q.id}`; }
  function persist(extra={}) {
    const cur = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    localStorage.setItem(STORAGE_KEY, JSON.stringify({...cur, bookmarks:[...state.bookmarks], lastBankId:state.bankId, ...extra}));
  }
  function fmt(n){ return Number(n).toLocaleString(); }
  function escapeHTML(s){ return String(s ?? "").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch])); }
  function escapeAttr(s){ return escapeHTML(s); }
  function setView(name){
    ["homeView","quizView","resultsView"].forEach(id=>$(id).classList.remove("active"));
    $(name).classList.add("active"); window.scrollTo({top:0,behavior:"instant"});
  }
  function shuffle(arr){
    const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;
  }
  function formatTime(sec){
    const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
    return h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function initHome(){
    $("totalQuestions").textContent = fmt(banks.reduce((s,b)=>s+b.questionCount,0));
    $("bankSelect").innerHTML = banks.map(b=>`<option value="${escapeAttr(b.bankId)}">${escapeHTML(b.displayTitle)}${b.unit ? " — "+escapeHTML(b.unit) : ""}</option>`).join("");
    $("bankSelect").value = state.bankId;

    $("bankCards").innerHTML = banks.map(b=>`
      <button type="button" class="bank-card ${b.bankId===state.bankId?"active":""}" data-bank="${escapeAttr(b.bankId)}">
        <div class="bank-top">
          <div><p class="eyebrow">${escapeHTML(b.courseCode || (b.kind==="book" ? "BOOK" : "QUESTION BANK"))}</p><h3>${escapeHTML(b.displayTitle)}</h3><p>${escapeHTML(b.displaySubtitle || b.author || "")}</p></div>
          <span class="pill">${fmt(b.questionCount)} MCQs</span>
        </div>
        <div class="bank-meta"><span class="pill">${b.sections?.length || 1} ${b.sections?.length===1?"section":"sections"}</span>${b.unit?`<span class="pill">${escapeHTML(b.unit)}</span>`:""}</div>
      </button>`).join("");
    $("bankCards").querySelectorAll(".bank-card").forEach(btn=>btn.addEventListener("click",()=>selectBank(btn.dataset.bank)));
    renderSelectedBank();
    updateStats();
  }

  function selectBank(id){
    state.bankId=id; persist();
    $("bankSelect").value=id;
    renderSelectedBank();
    $("bankCards").querySelectorAll(".bank-card").forEach(c=>c.classList.toggle("active",c.dataset.bank===id));
  }

  function renderSelectedBank(){
    const b=bank();
    $("bankTitle").textContent=b.displayTitle;
    $("bankSubtitle").textContent=b.displaySubtitle || b.author || "";
    $("bankCount").textContent=`${fmt(b.questionCount)} MCQs`;
    $("activeKicker").textContent=b.courseCode ? `${b.courseCode}${b.unit ? " • "+b.unit : ""}` : "SELECTED BOOK";

    const sections=b.sections || [{name:"All questions",count:b.questionCount}];
    $("sectionList").innerHTML=sections.map(s=>`<div class="section-item"><strong>${escapeHTML(s.name)}</strong><span>${fmt(s.count)} questions</span></div>`).join("");
    $("sectionSelect").innerHTML=`<option value="all">Entire ${b.unit ? b.unit : "bank"} — ${fmt(b.questionCount)} questions</option>`+
      sections.map(s=>`<option value="${escapeAttr(s.name)}">${escapeHTML(s.name)} — ${fmt(s.count)}</option>`).join("");

    if(b.sourceType==="reference"){
      $("sourceNoteTitle").textContent="Explanations + references included";
      $("sourceNoteText").textContent="Study Mode shows the explanation and the quoted Unit I reference for every question.";
    } else {
      $("sourceNoteTitle").textContent="Source-page tracking included";
      $("sourceNoteText").textContent="Each question retains the page number from the uploaded textbook.";
    }
  }

  function updateStats(){
    const history=savedHistory();
    $("attemptCount").textContent=history.length;
    $("bestScore").textContent=history.length?`${Math.max(...history.map(h=>h.percent))}%`:"—";
    $("bookmarkCount").textContent=state.bookmarks.size;
  }
  function savedHistory(){ return (JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}").history)||[]; }
  function selectedMode(){ return document.querySelector('input[name="mode"]:checked').value; }

  function prepareQuestion(q,shuffleOpts){
    const correct = q.answer ?? q.correctIndex ?? "ABCD".indexOf(q.correctLetter||"A");
    const opts=q.options.map((text,idx)=>({text,correct:idx===correct}));
    const arranged=shuffleOpts?shuffle(opts):opts;
    return {...q,displayOptions:arranged,displayCorrectIndex:arranged.findIndex(o=>o.correct)};
  }

  function startQuiz(reuse=null){
    const b=bank();
    const section=reuse?.section ?? $("sectionSelect").value;
    const countValue=reuse?.countValue ?? $("countSelect").value;
    const randomQuestions=reuse?.randomQuestions ?? $("shuffleQuestions").checked;
    const randomOptions=reuse?.randomOptions ?? $("shuffleOptions").checked;
    const mode=reuse?.mode ?? selectedMode();

    let pool=section==="all"?[...b.questions]:b.questions.filter(q=>q.section===section);
    if(randomQuestions)pool=shuffle(pool);
    const requested=countValue==="all"?pool.length:Math.min(parseInt(countValue,10),pool.length);

    state.quiz=pool.slice(0,requested).map(q=>prepareQuestion(q,randomOptions));
    state.current=0;state.answers={};state.marked=new Set();state.mode=mode;state.startTime=Date.now();state.elapsed=0;
    state.config={bankId:state.bankId,section,countValue,randomQuestions,randomOptions,mode};state.lastResult=null;
    clearInterval(state.timerId);state.timerId=setInterval(updateTimer,1000);updateTimer();

    $("modeBadge").textContent=mode==="study"?"Study mode":"Exam mode";
    $("submitBtn").textContent=mode==="exam"?"Submit Exam":"Finish Quiz";
    buildNavigator();renderQuestion();setView("quizView");
  }

  function updateTimer(){ if(state.startTime){state.elapsed=Math.floor((Date.now()-state.startTime)/1000);$("timer").textContent=formatTime(state.elapsed);} }

  function buildNavigator(){
    $("navigatorGrid").innerHTML=state.quiz.map((_,i)=>`<button class="nav-q" type="button" data-index="${i}">${i+1}</button>`).join("");
    $("navigatorGrid").querySelectorAll(".nav-q").forEach(btn=>btn.addEventListener("click",()=>{state.current=Number(btn.dataset.index);renderQuestion();}));
  }

  function renderQuestion(){
    const b=bank(),q=state.quiz[state.current]; if(!q)return;
    const answer=state.answers[q.id],locked=state.mode==="study"&&answer!==undefined,answered=Object.keys(state.answers).length;
    $("progressText").textContent=`Question ${state.current+1} of ${state.quiz.length}`;
    $("answeredText").textContent=`${answered} answered`;
    $("navigatorSummary").textContent=`${answered} / ${state.quiz.length} answered`;
    $("progressBar").style.width=`${((state.current+1)/state.quiz.length)*100}%`;
    $("sectionBadge").textContent=q.section||b.unit||"Question bank";
    $("questionText").textContent=q.question;

    const bk=bookmarkKey(q);
    $("bookmarkBtn").textContent=state.bookmarks.has(bk)?"★":"☆";
    $("bookmarkBtn").classList.toggle("active",state.bookmarks.has(bk));
    $("markBtn").textContent=state.marked.has(q.id)?"Marked for Review ✓":"Mark for Review";

    $("options").innerHTML=q.displayOptions.map((opt,idx)=>{
      let cls="option";if(answer===idx)cls+=" selected";if(locked&&idx===q.displayCorrectIndex)cls+=" correct";if(locked&&answer===idx&&idx!==q.displayCorrectIndex)cls+=" incorrect";
      return `<button class="${cls}" type="button" data-index="${idx}" ${locked?"disabled":""}><span class="letter">${LETTERS[idx]}</span><span>${escapeHTML(opt.text)}</span></button>`;
    }).join("");
    $("options").querySelectorAll(".option").forEach(btn=>btn.addEventListener("click",()=>selectAnswer(Number(btn.dataset.index))));
    renderFeedback(q,answer);
    renderSource(q,b,locked);
    $("prevBtn").disabled=state.current===0;
    $("nextBtn").textContent=state.current===state.quiz.length-1?"Finish":"Next";
    updateNavigator();
  }

  function renderFeedback(q,answer){
    const fb=$("feedback"),ex=$("explanationBox");
    if(state.mode!=="study"||answer===undefined){fb.className="feedback hidden";fb.innerHTML="";ex.className="explanation hidden";ex.innerHTML="";return;}
    const ok=answer===q.displayCorrectIndex;
    fb.className=`feedback ${ok?"good":"bad"}`;
    fb.innerHTML=ok?`✓ Correct`:`✕ Incorrect. Correct answer: <strong>${LETTERS[q.displayCorrectIndex]}. ${escapeHTML(q.displayOptions[q.displayCorrectIndex].text)}</strong>`;
    if(q.explanation||q.reference){
      ex.className="explanation";
      ex.innerHTML=`${q.explanation?`<strong>Explanation</strong><div>${escapeHTML(q.explanation)}</div>`:""}${q.reference?`<div class="ref"><b>Reference:</b> ${escapeHTML(q.reference)}</div>`:""}`;
    }else{ex.className="explanation hidden";ex.innerHTML="";}
  }

  function renderSource(q,b,locked){
    const row=$("sourceRow");
    if(b.sourceType==="page"&&q.page){
      row.innerHTML=`<a href="${escapeAttr(b.sourcePdf)}#page=${q.page}" target="_blank" rel="noopener">Open source page ${q.page} ↗</a>`;
    }else if(b.sourceType==="reference"){
      const links=[];
      if(b.sourcePdf) links.push(`<a href="${escapeAttr(b.sourcePdf)}" target="_blank" rel="noopener">Open reference notes ↗</a>`);
      if(b.sourceDocx) links.push(`<a href="${escapeAttr(b.sourceDocx)}" target="_blank" rel="noopener">Reference notes (Word) ↗</a>`);
      row.innerHTML=links.join("");
    }else row.innerHTML="";
  }

  function selectAnswer(idx){
    const q=state.quiz[state.current];
    if(state.mode==="study"&&state.answers[q.id]!==undefined)return;
    state.answers[q.id]=idx;renderQuestion();
  }
  function updateNavigator(){
    $("navigatorGrid").querySelectorAll(".nav-q").forEach((btn,i)=>{
      const q=state.quiz[i];btn.classList.toggle("current",i===state.current);btn.classList.toggle("answered",state.answers[q.id]!==undefined);btn.classList.toggle("marked",state.marked.has(q.id));
    });
  }
  function goNext(){ if(state.current<state.quiz.length-1){state.current++;renderQuestion();}else finishQuiz(); }

  function finishQuiz(){
    if(!state.quiz.length)return;clearInterval(state.timerId);updateTimer();
    const b=bank();
    const rows=state.quiz.map(q=>{const chosen=state.answers[q.id],answered=chosen!==undefined,correct=answered&&chosen===q.displayCorrectIndex;return{q,chosen,answered,correct};});
    const correct=rows.filter(r=>r.correct).length,unanswered=rows.filter(r=>!r.answered).length,wrong=state.quiz.length-correct-unanswered,percent=Math.round(correct/state.quiz.length*100);
    state.lastResult={rows,correct,wrong,unanswered,percent,elapsed:state.elapsed};

    const current=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}"),history=current.history||[];
    history.unshift({date:new Date().toISOString(),bankId:state.bankId,bankTitle:b.displayTitle,percent,correct,total:state.quiz.length,section:state.config.section,mode:state.mode,elapsed:state.elapsed});
    persist({history:history.slice(0,100)});

    $("scorePercent").textContent=`${percent}%`;
    $("scoreRing").style.background=`conic-gradient(var(--accent) ${percent}%,var(--line) ${percent}% 100%)`;
    $("scoreHeadline").textContent=`${correct} / ${state.quiz.length} correct`;
    $("scoreSubtext").textContent=`${b.displayTitle}${b.unit?" • "+b.unit:""}`;
    $("correctCount").textContent=correct;$("wrongCount").textContent=wrong;$("unansweredCount").textContent=unanswered;$("timeTaken").textContent=formatTime(state.elapsed);
    renderReview("all");updateStats();setView("resultsView");
  }

  function renderReview(filter){
    if(!state.lastResult)return;const b=bank();let rows=state.lastResult.rows;
    if(filter==="wrong")rows=rows.filter(r=>r.answered&&!r.correct);
    if(filter==="unanswered")rows=rows.filter(r=>!r.answered);
    if(filter==="bookmarked")rows=rows.filter(r=>state.bookmarks.has(`${state.bankId}:${r.q.id}`));
    $("reviewList").innerHTML=rows.length?rows.map(r=>{
      const q=r.q,user=r.answered?`${LETTERS[r.chosen]}. ${q.displayOptions[r.chosen].text}`:"Not answered",correct=`${LETTERS[q.displayCorrectIndex]}. ${q.displayOptions[q.displayCorrectIndex].text}`;
      let source=b.sourceType==="page"&&q.page?`<a href="${b.sourcePdf}#page=${q.page}" target="_blank" rel="noopener">page ${q.page} ↗</a>`:`${escapeHTML(q.reference||"")}`;
      return `<article class="review-item"><h3>${escapeHTML(q.question)}</h3><div class="review-answer">Your answer: <strong class="${r.correct?"good":"bad"}">${escapeHTML(user)}</strong></div><div class="review-answer">Correct answer: <strong class="good">${escapeHTML(correct)}</strong></div>${q.explanation?`<div class="review-explanation"><b>Explanation:</b> ${escapeHTML(q.explanation)}</div>`:""}<div class="review-meta">${escapeHTML(q.section||"")} · ${source}</div></article>`;
    }).join(""):`<p class="muted">No questions match this filter.</p>`;
  }

  function toggleBookmark(){const q=state.quiz[state.current];if(!q)return;const k=bookmarkKey(q);state.bookmarks.has(k)?state.bookmarks.delete(k):state.bookmarks.add(k);persist();updateStats();renderQuestion();}
  function toggleMark(){const q=state.quiz[state.current];if(!q)return;state.marked.has(q.id)?state.marked.delete(q.id):state.marked.add(q.id);renderQuestion();}
  function quitQuiz(){if(confirm("Exit this quiz? Your current attempt will not be scored.")){clearInterval(state.timerId);state.startTime=null;setView("homeView");}}

  document.documentElement.dataset.theme=saved.theme||"light";
  $("themeBtn").addEventListener("click",()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;persist({theme:next});});
  $("bankSelect").addEventListener("change",e=>selectBank(e.target.value));
  $("startBtn").addEventListener("click",()=>startQuiz());
  $("prevBtn").addEventListener("click",()=>{if(state.current>0){state.current--;renderQuestion();}});
  $("nextBtn").addEventListener("click",goNext);
  $("submitBtn").addEventListener("click",finishQuiz);
  $("bookmarkBtn").addEventListener("click",toggleBookmark);
  $("markBtn").addEventListener("click",toggleMark);
  $("quitBtn").addEventListener("click",quitQuiz);
  $("retryBtn").addEventListener("click",()=>{state.bankId=state.config.bankId;startQuiz(state.config);});
  $("homeBtn").addEventListener("click",()=>setView("homeView"));
  $("brandBtn").addEventListener("click",()=>{clearInterval(state.timerId);setView("homeView");});
  $("reviewFilter").addEventListener("change",e=>renderReview(e.target.value));

  initHome();
})();
