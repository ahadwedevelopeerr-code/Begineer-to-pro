const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const requireAdmin = require('../middleware/auth');
const db = require('../lib/database');

const router = express.Router();
const dataDir = path.join(__dirname, '..', 'data');
const adminFile = process.env.CODEPATH_ADMIN_FILE || path.join(dataDir, 'admin.json');
const questionsFile = path.join(dataDir, 'questions.json');
const coursesFile = path.join(dataDir, 'courses.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));

router.get('/status', (req, res) => res.json({ authenticated: req.session.admin === true }));
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 80 || password.length > 200) {
    return res.status(400).json({ error: 'Enter a valid username and password.' });
  }
  if (!fs.existsSync(adminFile)) return res.status(503).json({ error: 'Admin is not initialized. Run npm run init-admin first.' });
  const account = read(adminFile);
  if (username !== account.username || !(await bcrypt.compare(password, account.passwordHash))) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  req.session.regenerate(error => {
    if (error) return res.status(500).json({ error: 'Unable to create a secure session.' });
    req.session.admin = true;
    req.session.adminUsername = account.username;
    return res.json({ authenticated: true, username: account.username });
  });
});
router.post('/logout', requireAdmin, (req, res) => req.session.destroy(() => res.json({ ok: true })));
router.use(requireAdmin);

router.get('/stats', (req, res) => {
  const questions = read(questionsFile);
  const lessons = read(coursesFile).reduce((count, course) => count + course.lessons.length, 0);
  const results = db.prepare('SELECT COUNT(*) AS count, COALESCE(AVG(percentage), 0) AS average FROM quiz_results').get();
  const students = db.prepare('SELECT COUNT(*) AS count FROM students').get().count;
  res.json({
    questions: Object.values(questions).reduce((count, topic) => count + topic.length, 0),
    lessons, quizzes: results.count, students,
    averageScore: Math.round(results.average)
  });
});

router.get('/questions', (req, res) => res.json(read(questionsFile)));
router.post('/questions', (req, res) => {
  const error = validateQuestion(req.body);
  if (error) return res.status(400).json({ error });
  const questions = read(questionsFile);
  const question = { ...req.body, id: crypto.randomUUID() };
  questions[question.topic].push(question);
  write(questionsFile, questions);
  return res.status(201).json(question);
});
router.put('/questions/:id', (req, res) => {
  const error = validateQuestion(req.body);
  if (error) return res.status(400).json({ error });
  const questions = read(questionsFile);
  let found = null;
  for (const topic of Object.keys(questions)) {
    const index = questions[topic].findIndex(item => item.id === req.params.id);
    if (index >= 0) {
      questions[topic].splice(index, 1);
      found = { ...req.body, id: req.params.id };
      break;
    }
  }
  if (!found) return res.status(404).json({ error: 'Question not found.' });
  questions[found.topic].push(found);
  write(questionsFile, questions);
  return res.json(found);
});
router.delete('/questions/:id', (req, res) => {
  const questions = read(questionsFile);
  for (const topic of Object.keys(questions)) {
    const index = questions[topic].findIndex(item => item.id === req.params.id);
    if (index >= 0) {
      questions[topic].splice(index, 1);
      write(questionsFile, questions);
      return res.json({ ok: true });
    }
  }
  return res.status(404).json({ error: 'Question not found.' });
});

router.get('/lessons', (req, res) => res.json(read(coursesFile)));
router.put('/lessons/:course/:lessonId', (req, res) => {
  const { title, level, summary, content, example, exercise } = req.body || {};
  if (![title, summary, content, example, exercise].every(value => typeof value === 'string' && value.trim().length > 0) ||
      !['beginner', 'intermediate', 'advanced'].includes(level)) {
    return res.status(400).json({ error: 'Provide a title, valid level, summary, lesson content, example, and exercise.' });
  }
  const courses = read(coursesFile);
  const course = courses.find(item => item.slug === req.params.course);
  const lesson = course && course.lessons.find(item => item.id === req.params.lessonId);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
  Object.assign(lesson, { title, level, summary, content, example, exercise });
  write(coursesFile, courses);
  return res.json(lesson);
});
router.get('/students', (req, res) => {
  const students = db.prepare(`SELECT s.display_name AS displayName, s.total_xp AS totalXp,
      s.quiz_count AS quizCount, s.last_active_at AS lastActiveAt,
      COUNT(r.id) AS resultCount, COALESCE(SUM(r.score), 0) AS correctAnswers,
      COALESCE(SUM(r.total), 0) AS totalQuestions
    FROM students s LEFT JOIN quiz_results r ON r.student_id = s.id
    GROUP BY s.id ORDER BY s.total_xp DESC, s.last_active_at DESC`).all();
  res.json(students.map(student => ({ ...student, level: Math.floor(student.totalXp / 100) + 1 })));
});

const resultColumns = `SELECT id, student_name AS studentName, topic, score, total, percentage,
  attempted, xp_earned AS xpEarned, completed_at AS completedAt FROM quiz_results`;
router.get('/quiz-results', (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 1000);
  res.json(db.prepare(`${resultColumns} ORDER BY completed_at DESC LIMIT ?`).all(limit));
});
router.get('/quiz-results.csv', (req, res) => {
  const results = db.prepare(`${resultColumns} ORDER BY completed_at DESC`).all();
  const columns = ['studentName', 'topic', 'score', 'total', 'percentage', 'attempted', 'xpEarned', 'completedAt'];
  const escapeCell = value => {
    let text = String(value ?? '');
    if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [columns.join(','), ...results.map(result => columns.map(column => escapeCell(result[column])).join(','))].join('\r\n') + '\r\n';
  res.type('text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="codepath-quiz-results.csv"');
  return res.send(csv);
});

function validateQuestion(question) {
  if (!question || !['html', 'css', 'javascript', 'nodejs'].includes(question.topic)) return 'Choose a valid topic.';
  if (!['beginner', 'intermediate', 'advanced'].includes(question.difficulty)) return 'Choose a valid difficulty.';
  if (!['conceptual', 'practical', 'seo'].includes(question.category)) return 'Choose a valid category.';
  if (typeof question.question !== 'string' || question.question.trim().length < 8 || question.question.length > 1000) return 'Question must be between 8 and 1000 characters.';
  if (!Array.isArray(question.options) || question.options.length !== 4 || question.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 300)) return 'Provide exactly four non-empty options.';
  if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) return 'Select one correct option.';
  if (typeof question.explanation !== 'string' || question.explanation.trim().length < 5 || question.explanation.length > 1000) return 'Add an explanation between 5 and 1000 characters.';
  return null;
}

module.exports = router;