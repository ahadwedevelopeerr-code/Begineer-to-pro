(() => {
  const stage = document.querySelector('#quiz-stage');
  if (!stage) return;
  const topicButtons = [...document.querySelectorAll('.topic-button')];
  const historyList = document.querySelector('#quiz-history-list');
  const names = { html: 'HTML', css: 'CSS', javascript: 'JavaScript', nodejs: 'Node.js' };
  const letters = ['A', 'B', 'C', 'D'];
  let topic = 'html';
  let run = null;
  let questionIndex = 0;
  let answered = 0;
  let waiting = false;

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function renderHistory(history) {
    historyList.replaceChildren();
    if (!history.length) {
      historyList.append(make('p', 'muted-copy', 'Your completed quizzes will appear here.'));
      return;
    }
    history.forEach(item => {
      const row = make('div', 'history-item');
      row.append(make('span', '', `${names[item.topic] || item.topic} · ${item.score}/${item.total} · ${item.xpEarned} XP`), make('strong', '', `${item.percentage}%`));
      historyList.append(row);
    });
  }
  function renderStudent(student) {
    document.querySelector('#guest-name').textContent = student.displayName;
    document.querySelector('#student-level').textContent = `LEVEL ${student.level}`;
    document.querySelector('#student-xp').textContent = `${student.totalXp} XP`;
    const levelProgress = student.totalXp % 100;
    document.querySelector('#student-next-level').textContent = `${100 - levelProgress} XP to next level · ${student.quizCount} quizzes`;
    document.querySelector('#student-xp-progress').style.width = `${levelProgress}%`;
    const badges = document.querySelector('#student-badges');
    badges.replaceChildren();
    student.badges.forEach(badge => badges.append(make('span', 'student-badge', badge)));
  }
  async function refreshProgress() {
    try {
      const response = await window.CodePath.fetch('quizzes/history');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load student progress.');
      renderStudent(data.student);
      renderHistory(data.results);
    } catch (error) {
      historyList.replaceChildren(make('p', 'muted-copy', error.message));
    }
  }
  function selectTopic(nextTopic) {
    topic = nextTopic;
    topicButtons.forEach(button => button.classList.toggle('selected', button.dataset.topic === topic));
    run = null;
    startQuiz();
  }
  async function startQuiz() {
    stage.replaceChildren(make('div', 'lesson-loading'));
    stage.querySelector('.lesson-loading').append(make('span', 'loader'), make('p', '', 'Preparing your questions...'));
    try {
      const response = await window.CodePath.fetch(`quizzes/${topic}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start this quiz.');
      run = data; questionIndex = 0; answered = 0; waiting = false;
      renderQuestion();
    } catch (error) {
      stage.replaceChildren(make('p', 'muted-copy', error.message));
      const retry = make('button', 'button button-outline', 'Try again');
      retry.type = 'button'; retry.addEventListener('click', startQuiz); stage.append(retry);
    }
  }
  function renderQuestion(feedback = null) {
    const item = run.questions[questionIndex];
    stage.replaceChildren();
    const top = make('div', 'quiz-topline');
    top.append(make('span', '', names[topic]), make('strong', '', `QUESTION ${String(questionIndex + 1).padStart(2, '0')} / ${run.total}`));
    stage.append(top);
    const progressTrack = make('div', 'quiz-progress');
    const progressBar = make('i'); progressBar.style.width = `${((questionIndex + 1) / run.total) * 100}%`; progressTrack.append(progressBar); stage.append(progressTrack);
    const question = make('div', 'question-block');
    const category = item.category === 'seo' ? 'SEO' : item.category;
    question.append(make('p', 'question-label', `${item.difficulty} · ${category}`), make('h2', '', item.question));
    const options = make('div', 'answer-list');
    item.options.forEach((option, index) => {
      const button = make('button', 'answer-option');
      button.type = 'button'; button.dataset.answer = String(index);
      button.append(make('span', 'answer-index', letters[index]), make('span', '', option));
      button.disabled = Boolean(feedback) || waiting;
      if (feedback && index === feedback.correctAnswer) button.classList.add('correct');
      if (feedback && index === feedback.selected && !feedback.correct) button.classList.add('incorrect');
      button.addEventListener('click', () => submitAnswer(index));
      options.append(button);
    });
    question.append(options);
    const feedbackElement = make('p', `answer-feedback${feedback ? (feedback.correct ? ' good' : ' bad') : ''}`);
    if (feedback) feedbackElement.textContent = `${feedback.correct ? 'Correct. ' : 'Not quite. '} ${feedback.explanation}`;
    question.append(feedbackElement);
    const controls = make('div', 'quiz-controls');
    const next = make('button', 'button button-primary', questionIndex === run.total - 1 ? 'Last question' : 'Next question →');
    next.type = 'button'; next.disabled = !feedback || questionIndex === run.total - 1;
    next.addEventListener('click', () => { questionIndex += 1; waiting = false; renderQuestion(); });
    const submit = make('button', 'button button-outline', 'Submit quiz');
    submit.type = 'button'; submit.disabled = answered === 0 || waiting;
    submit.addEventListener('click', submitQuiz);
    controls.append(next, submit);
    question.append(controls); stage.append(question);
  }
  async function submitAnswer(answer) {
    if (!run || waiting) return;
    waiting = true;
    renderQuestion();
    try {
      const response = await window.CodePath.fetch(`quizzes/${topic}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: run.runId, questionId: run.questions[questionIndex].id, answer })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not submit that answer.');
      answered += 1;
      waiting = false;
      renderQuestion({ ...result, selected: answer });
    } catch (error) {
      waiting = false;
      window.codePathToast(error.message, 'error');
      renderQuestion();
    }
  }
  async function submitQuiz() {
    if (!run || !answered || waiting) return;
    waiting = true;
    try {
      const response = await window.CodePath.fetch(`quizzes/${topic}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: run.runId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not submit the quiz.');
      await refreshProgress();
      showResult(result);
    } catch (error) {
      waiting = false;
      window.codePathToast(error.message, 'error');
      renderQuestion();
    }
  }
  function showResult(result) {
    run = null;
    stage.replaceChildren();
    const view = make('div', 'result-view');
    const ring = make('div', 'result-ring'); ring.append(make('strong', '', `${result.percentage}%`), make('span', '', 'YOUR SCORE'));
    const heading = result.percentage >= 80 ? 'That knowledge is sticking.' : result.percentage >= 50 ? 'A solid start. Keep going.' : 'Every try teaches you something.';
    view.append(ring, make('p', 'eyebrow', `${names[result.topic]} / QUIZ COMPLETE`), make('h2', '', heading), make('p', '', `You answered ${result.attempted} of ${result.total} questions. You got ${result.score} correct.`), make('p', 'lesson-summary', `+${result.xpEarned} XP earned · Level ${result.level}`));
    const actions = make('div', 'result-actions');
    const retake = make('button', 'button button-primary', 'Retake quiz ↻'); retake.type = 'button'; retake.addEventListener('click', startQuiz);
    const study = make('a', 'button button-outline', 'Review lessons ↗'); study.href = `./courses.html#${result.topic === 'nodejs' ? 'nodejs' : result.topic}`;
    actions.append(retake, study); view.append(actions); stage.append(view);
  }

  topicButtons.forEach(button => button.addEventListener('click', () => selectTopic(button.dataset.topic)));
  refreshProgress().finally(startQuiz);
})();