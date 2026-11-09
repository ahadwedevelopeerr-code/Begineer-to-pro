(() => {
  const nav = document.querySelector('#course-nav');
  const area = document.querySelector('#lesson-area');
  if (!nav || !area) return;

  const progressKey = 'codepath-lesson-progress';
  let courses = [];
  let activeCourse = null;
  let activeLessonIndex = 0;
  let progress = readProgress();
  const symbols = { html: '</>', css: '✳', javascript: '{ }', nodejs: '↗' };

  function readProgress() {
    try { return JSON.parse(localStorage.getItem(progressKey) || '{}'); } catch { return {}; }
  }
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function setProgress() {
    const completeCount = Object.values(progress).filter(Boolean).length;
    const total = courses.reduce((count, course) => count + course.lessons.length, 0);
    const percent = total ? Math.round((completeCount / total) * 100) : 0;
    document.querySelector('#overall-progress-label').textContent = `${percent}%`;
    document.querySelector('#overall-progress-bar').style.width = `${percent}%`;
    nav.querySelectorAll('button[data-course]').forEach(button => {
      const course = courses.find(item => item.slug === button.dataset.course);
      const count = course.lessons.filter(lesson => progress[lesson.id]).length;
      button.querySelector('.nav-progress').textContent = `${count}/${course.lessons.length}`;
    });
  }
  function renderNav() {
    nav.replaceChildren();
    courses.forEach(course => {
      const button = make('button');
      button.type = 'button';
      button.dataset.course = course.slug;
      button.classList.toggle('selected', activeCourse && activeCourse.slug === course.slug);
      const icon = make('span', 'nav-symbol', symbols[course.slug]);
      const title = make('span', 'nav-title', course.title.replace(/ Foundations| Essentials| & Layout| & APIs/, ''));
      const count = make('span', 'nav-progress');
      button.append(icon, title, count);
      button.addEventListener('click', () => selectCourse(course.slug, 0));
      nav.append(button);
    });
    setProgress();
  }
  function selectCourse(slug, lessonIndex = 0) {
    activeCourse = courses.find(course => course.slug === slug) || courses[0];
    activeLessonIndex = Math.max(0, Math.min(lessonIndex, activeCourse.lessons.length - 1));
    renderNav();
    renderCourse();
    if (window.history.replaceState) window.history.replaceState(null, '', `#${activeCourse.slug}`);
  }
  function renderCourse() {
    const course = activeCourse;
    const lesson = course.lessons[activeLessonIndex];
    const completed = course.lessons.filter(item => progress[item.id]).length;
    area.replaceChildren();

    const overview = make('div', 'course-overview');
    const intro = make('div');
    intro.append(make('p', 'eyebrow', 'LEARNING PATH'), make('h2', '', course.title), make('p', '', course.description));
    const progressBadge = make('strong', 'course-progress-badge', `${completed}/${course.lessons.length} complete`);
    overview.append(intro, progressBadge);
    area.append(overview);

    const objectives = make('ul', 'objective-list');
    course.objectives.forEach(objective => objectives.append(make('li', '', `✓ ${objective}`)));
    area.append(objectives);

    const tabs = make('div', 'lesson-selector');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', `${course.title} lessons`);
    course.lessons.forEach((item, index) => {
      const tab = make('button', `lesson-tab${index === activeLessonIndex ? ' selected' : ''}`);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(index === activeLessonIndex));
      tab.append(make('span', '', `${progress[item.id] ? '✓ ' : ''}${item.title}`), make('small', '', item.level));
      tab.addEventListener('click', () => { activeLessonIndex = index; renderCourse(); });
      tabs.append(tab);
    });
    area.append(tabs);

    const content = make('article', 'lesson-content');
    content.append(make('div', 'lesson-meta', `LESSON ${String(activeLessonIndex + 1).padStart(2, '0')} / ${course.lessons.length} · `));
    content.querySelector('.lesson-meta').append(make('span', 'level-badge', lesson.level));
    content.append(make('h3', '', lesson.title), make('p', 'lesson-summary', lesson.summary), make('p', 'lesson-prose', lesson.content));
    const code = make('div', 'code-example');
    const pre = make('pre');
    pre.textContent = lesson.example;
    const copy = make('button', 'copy-code', 'Copy code');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(lesson.example);
        copy.textContent = 'Copied';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        copy.textContent = 'Select and copy';
      }
      window.setTimeout(() => { copy.textContent = 'Copy code'; }, 1400);
    });
    code.append(pre, copy);
    content.append(code);
    const exercise = make('div', 'exercise-box');
    exercise.append(make('strong', '', 'Try it yourself'), make('p', '', lesson.exercise));
    content.append(exercise);
    area.append(content);

    const actions = make('div', 'lesson-actions');
    const previous = make('button', 'button button-outline', '← Previous');
    previous.type = 'button'; previous.disabled = activeLessonIndex === 0;
    previous.addEventListener('click', () => { activeLessonIndex -= 1; renderCourse(); });
    const completion = make('button', `button button-complete${progress[lesson.id] ? ' is-complete' : ''}`, progress[lesson.id] ? '✓ Completed' : 'Mark complete');
    completion.type = 'button';
    completion.addEventListener('click', () => {
      progress[lesson.id] = !progress[lesson.id];
      localStorage.setItem(progressKey, JSON.stringify(progress));
      renderNav(); renderCourse();
      window.codePathToast(progress[lesson.id] ? 'Lesson marked complete.' : 'Lesson marked as in progress.');
    });
    const next = make('button', 'button button-primary', activeLessonIndex === course.lessons.length - 1 ? 'Next course →' : 'Next lesson →');
    next.type = 'button';
    next.addEventListener('click', () => {
      if (activeLessonIndex < course.lessons.length - 1) activeLessonIndex += 1;
      else {
        const nextCourse = courses[(courses.indexOf(course) + 1) % courses.length];
        activeCourse = nextCourse; activeLessonIndex = 0;
      }
      renderNav(); renderCourse();
    });
    actions.append(previous, completion, next);
    area.append(actions);
  }

  window.CodePath.fetch('courses')
    .then(response => { if (!response.ok) throw new Error('Course content could not be loaded.'); return response.json(); })
    .then(data => {
      courses = data;
      const requested = location.hash.slice(1);
      activeCourse = courses.find(course => course.slug === requested) || courses[0];
      renderNav(); renderCourse();
    })
    .catch(error => {
      area.replaceChildren(make('p', 'muted-copy', `${error.message} Please refresh to try again.`));
    });
})();