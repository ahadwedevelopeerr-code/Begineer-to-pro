(() => {
  const loginForm = document.querySelector('#login-form');
  const dashboard = document.querySelector('#admin-dashboard');
  const loading = document.querySelector('#admin-loading');
  const api = async (url, options = {}) => {
    const apiPath = url.replace(/^(?:\.\/)?api\//, '');
    const response = await window.CodePath.fetch(apiPath, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && dashboard) window.location.replace('./login.html');
      throw new Error(data.error || 'The request could not be completed.');
    }
    return data;
  };

  if (loginForm) {
    api('./api/admin/status').then(status => {
      if (status.authenticated) window.location.replace('./admin.html');
    }).catch(() => {});
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      const errorElement = document.querySelector('#login-error');
      const submit = loginForm.querySelector('button[type="submit"]');
      errorElement.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Signing in...';
      const values = new FormData(loginForm);
      try {
        await api('./api/admin/login', { method: 'POST', body: JSON.stringify({ username: values.get('username'), password: values.get('password') }) });
        window.location.assign('./admin.html');
      } catch (error) {
        errorElement.textContent = error.message;
        submit.disabled = false;
        submit.innerHTML = 'Sign in <span aria-hidden="true">↗</span>';
      }
    });
  }

  if (!dashboard) return;
  let allQuestions = {};
  let courses = [];
  const questionForm = document.querySelector('#question-form');
  const lessonForm = document.querySelector('#lesson-form');

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function toast(message, type = 'success') {
    if (window.codePathToast) window.codePathToast(message, type);
  }
  function switchPanel(panel) {
    document.querySelectorAll('.admin-tab').forEach(button => {
      const selected = button.dataset.panel === panel;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('.admin-panel').forEach(section => { section.hidden = section.id !== `panel-${panel}`; });
  }
  document.querySelectorAll('.admin-tab').forEach(button => button.addEventListener('click', () => switchPanel(button.dataset.panel)));

  async function loadStats() {
    const stats = await api('./api/admin/stats');
    document.querySelector('#stat-questions').textContent = stats.questions;
    document.querySelector('#stat-lessons').textContent = stats.lessons;
    document.querySelector('#stat-students').textContent = stats.students;
    document.querySelector('#stat-quizzes').textContent = stats.quizzes;
    document.querySelector('#stat-average').textContent = `${stats.averageScore}%`;
  }
  function getQuestionItems() {
    return Object.entries(allQuestions).flatMap(([topic, questions]) => questions.map(question => ({ ...question, topic })));
  }
  function renderQuestions() {
    const list = document.querySelector('#admin-question-list');
    const search = document.querySelector('#question-search').value.trim().toLowerCase();
    const filter = document.querySelector('#question-filter').value;
    const all = getQuestionItems();
    const shown = all.filter(item => (filter === 'all' || item.topic === filter) && `${item.question} ${item.explanation} ${item.options.join(' ')}`.toLowerCase().includes(search));
    document.querySelector('#question-count').textContent = `${shown.length} / ${all.length}`;
    list.replaceChildren();
    if (!shown.length) { list.append(make('p', 'muted-copy', 'No questions match this search.')); return; }
    shown.forEach(item => {
      const row = make('article', 'admin-question-item');
      row.append(make('p', '', item.question));
      const meta = make('div', 'admin-question-meta');
      meta.append(make('span', '', `${item.topic} · ${item.difficulty} · ${item.category}`));
      const actions = make('span', 'admin-item-actions');
      const edit = make('button', 'text-button', 'Edit'); edit.type = 'button'; edit.addEventListener('click', () => editQuestion(item));
      const remove = make('button', 'text-button delete', 'Delete'); remove.type = 'button'; remove.addEventListener('click', () => deleteQuestion(item));
      actions.append(edit, remove); meta.append(actions); row.append(meta); list.append(row);
    });
  }
  function editQuestion(question) {
    questionForm.elements.id.value = question.id;
    questionForm.elements.topic.value = question.topic;
    questionForm.elements.difficulty.value = question.difficulty;
    questionForm.elements.category.value = question.category;
    questionForm.elements.question.value = question.question;
    question.options.forEach((option, index) => { questionForm.elements[`option${index}`].value = option; });
    questionForm.elements.answer.value = String(question.answer);
    questionForm.elements.explanation.value = question.explanation;
    document.querySelector('#question-form-title').textContent = 'Edit question';
    document.querySelector('#question-submit').innerHTML = 'Save changes <span aria-hidden="true">↗</span>';
    document.querySelector('#question-cancel').hidden = false;
    questionForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function resetQuestionForm() {
    questionForm.reset(); questionForm.elements.id.value = '';
    document.querySelector('#question-form-title').textContent = 'Add a question';
    document.querySelector('#question-submit').innerHTML = 'Add question <span aria-hidden="true">+</span>';
    document.querySelector('#question-cancel').hidden = true;
  }
  async function deleteQuestion(question) {
    if (!window.confirm('Delete this question from the bank? This cannot be undone.')) return;
    try {
      await api(`./api/admin/questions/${encodeURIComponent(question.id)}`, { method: 'DELETE' });
      await Promise.all([loadQuestions(), loadStats()]); toast('Question deleted.');
    } catch (error) { toast(error.message, 'error'); }
  }
  async function loadQuestions() {
    allQuestions = await api('./api/admin/questions');
    renderQuestions();
  }
  questionForm.addEventListener('submit', async event => {
    event.preventDefault();
    const form = questionForm.elements;
    const id = form.id.value;
    const payload = {
      topic: form.topic.value, difficulty: form.difficulty.value, category: form.category.value,
      question: form.question.value.trim(), options: [0, 1, 2, 3].map(index => form[`option${index}`].value.trim()),
      answer: Number(form.answer.value), explanation: form.explanation.value.trim()
    };
    try {
      await api(id ? `./api/admin/questions/${encodeURIComponent(id)}` : './api/admin/questions', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      resetQuestionForm(); await Promise.all([loadQuestions(), loadStats()]); toast(id ? 'Question updated.' : 'Question added.');
    } catch (error) { toast(error.message, 'error'); }
  });
  document.querySelector('#question-cancel').addEventListener('click', resetQuestionForm);
  document.querySelector('#question-search').addEventListener('input', renderQuestions);
  document.querySelector('#question-filter').addEventListener('change', renderQuestions);

  function renderLessons() {
    const list = document.querySelector('#lesson-admin-list');
    list.replaceChildren();
    courses.forEach(course => {
      list.append(make('p', 'sidebar-label', course.title));
      course.lessons.forEach(lesson => {
        const row = make('div', 'lesson-admin-row');
        const label = make('div'); label.append(make('strong', '', lesson.title), make('span', '', `${course.title} · ${lesson.level}`));
        const edit = make('button', 'text-button', 'Edit'); edit.type = 'button'; edit.addEventListener('click', () => editLesson(course, lesson));
        row.append(label, edit); list.append(row);
      });
    });
  }
  function editLesson(course, lesson) {
    lessonForm.hidden = false;
    lessonForm.elements.course.value = course.slug;
    lessonForm.elements.lessonId.value = lesson.id;
    lessonForm.elements.title.value = lesson.title;
    lessonForm.elements.level.value = lesson.level;
    lessonForm.elements.summary.value = lesson.summary;
    lessonForm.elements.content.value = lesson.content;
    lessonForm.elements.example.value = lesson.example;
    lessonForm.elements.exercise.value = lesson.exercise;
    document.querySelector('#lesson-form-title').textContent = `Edit: ${lesson.title}`;
    lessonForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  lessonForm.addEventListener('submit', async event => {
    event.preventDefault();
    const form = lessonForm.elements;
    const course = form.course.value;
    const lessonId = form.lessonId.value;
    const payload = { title: form.title.value.trim(), level: form.level.value, summary: form.summary.value.trim(), content: form.content.value.trim(), example: form.example.value.trim(), exercise: form.exercise.value.trim() };
    try {
      await api(`./api/admin/lessons/${encodeURIComponent(course)}/${encodeURIComponent(lessonId)}`, { method: 'PUT', body: JSON.stringify(payload) });
      courses = await api('./api/admin/lessons'); renderLessons();
      document.querySelector('#lesson-form-title').textContent = `Saved: ${payload.title}`;
      toast('Lesson updated.'); await loadStats();
    } catch (error) { toast(error.message, 'error'); }
  });

  function resultsTable(results, target) {
    target.replaceChildren();
    if (!results.length) { target.append(make('p', 'muted-copy', 'No quiz results yet. Results will appear after students submit a quiz.')); return; }
    const table = make('table', 'results-table');
    const head = document.createElement('thead'); const heading = document.createElement('tr');
    ['Student', 'Topic', 'Score', 'Attempted', 'XP', 'Completed'].forEach(label => heading.append(make('th', '', label)));
    head.append(heading); table.append(head);
    const body = document.createElement('tbody');
    results.forEach(result => {
      const row = document.createElement('tr');
      [result.studentName, result.topic, `${result.score}/${result.total} (${result.percentage}%)`, `${result.attempted}/${result.total}`, result.xpEarned, new Date(result.completedAt).toLocaleString()].forEach(value => row.append(make('td', '', value)));
      body.append(row);
    });
    table.append(body); target.append(table);
  }
  async function loadResults() {
    const [results, students] = await Promise.all([api('./api/admin/quiz-results?limit=1000'), api('./api/admin/students')]);
    resultsTable(results.slice(0, 5), document.querySelector('#overview-results'));
    resultsTable(results, document.querySelector('#results-table-wrap'));
    const target = document.querySelector('#students-table-wrap');
    target.replaceChildren();
    if (!students.length) {
      target.append(make('p', 'muted-copy', 'No guest students yet. Students appear after they start a quiz.'));
    } else {
      const table = make('table', 'results-table');
      const head = document.createElement('thead'); const heading = document.createElement('tr');
      ['Guest', 'Level', 'XP', 'Quizzes', 'Last active'].forEach(label => heading.append(make('th', '', label)));
      head.append(heading); table.append(head);
      const body = document.createElement('tbody');
      students.forEach(student => {
        const row = document.createElement('tr');
        [student.displayName, student.level, student.totalXp, student.quizCount, new Date(student.lastActiveAt).toLocaleString()].forEach(value => row.append(make('td', '', value)));
        body.append(row);
      });
      table.append(body); target.append(table);
    }
  }

  document.querySelector('#export-results').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await window.CodePath.fetch('admin/quiz-results.csv');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'CSV export failed.');
      }
      const url = URL.createObjectURL(await response.blob());
      const download = document.createElement('a');
      download.href = url;
      download.download = 'codepath-quiz-results.csv';
      download.click();
      URL.revokeObjectURL(url);
      toast('Quiz results exported.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
  async function loadDashboard() {
    try {
      const status = await api('./api/admin/status');
      if (!status.authenticated) { window.location.replace('./login.html'); return; }
      loading.hidden = true; dashboard.hidden = false;
      await Promise.all([loadStats(), loadQuestions(), api('./api/admin/lessons').then(data => { courses = data; renderLessons(); }), loadResults()]);
    } catch (error) {
      if (window.codePathToast) toast(error.message, 'error');
      window.location.replace('./login.html');
    }
  }
  document.querySelector('#admin-logout').addEventListener('click', async () => {
    try { await api('./api/admin/logout', { method: 'POST' }); } catch {}
    window.location.assign('./login.html');
  });
  loadDashboard();
})();