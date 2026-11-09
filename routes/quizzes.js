const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../lib/database');

const router = express.Router();
const questionsFile = path.join(__dirname, '..', 'data', 'questions.json');
const readQuestions = () => JSON.parse(fs.readFileSync(questionsFile, 'utf8'));

function ensureStudent(req) {
  if (!req.session.studentId) {
    req.session.studentId = crypto.randomUUID();
    req.session.studentName = `Guest ${req.session.studentId.slice(0, 6).toUpperCase()}`;
  }
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO students (id, display_name, created_at, last_active_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_active_at = excluded.last_active_at`)
    .run(req.session.studentId, req.session.studentName, now, now);
  return { id: req.session.studentId, name: req.session.studentName };
}

router.get('/history', (req, res) => {
  const student = ensureStudent(req);
  const profile = db.prepare(`SELECT display_name, total_xp, quiz_count FROM students WHERE id = ?`).get(student.id);
  const rows = db.prepare(`SELECT id, topic, score, total, percentage, attempted, xp_earned, completed_at
    FROM quiz_results WHERE student_id = ? ORDER BY completed_at DESC LIMIT 50`).all(student.id);
  const perfectQuizzes = db.prepare(`SELECT COUNT(*) AS count FROM quiz_results WHERE student_id = ? AND score = total`).get(student.id).count;
  const badges = [];
  if (profile.quiz_count > 0) badges.push('First quiz');
  if (perfectQuizzes > 0) badges.push('Perfect score');
  if (profile.total_xp >= 100) badges.push('100 XP');
  return res.json({
    student: {
      displayName: profile.display_name,
      totalXp: profile.total_xp,
      level: Math.floor(profile.total_xp / 100) + 1,
      quizCount: profile.quiz_count,
      badges
    },
    results: rows.map(row => ({
      id: row.id, topic: row.topic, score: row.score, total: row.total,
      percentage: row.percentage, attempted: row.attempted, xpEarned: row.xp_earned,
      completedAt: row.completed_at
    }))
  });
});

router.post('/profile', (req, res) => {
  const displayName = req.body && typeof req.body.displayName === 'string' ? req.body.displayName.trim() : '';
  if (displayName.length < 2 || displayName.length > 30 || /[\u0000-\u001f\u007f]/.test(displayName)) {
    return res.status(400).json({ error: 'Guest name must be 2 to 30 printable characters.' });
  }
  const student = ensureStudent(req);
  db.prepare('UPDATE students SET display_name = ? WHERE id = ?').run(displayName, student.id);
  req.session.studentName = displayName;
  return res.json({ displayName });
});

router.get('/:topic', (req, res) => {
  ensureStudent(req);
  const topic = req.params.topic.toLowerCase();
  const bank = readQuestions()[topic];
  if (!bank) return res.status(404).json({ error: 'Quiz topic not found.' });
  const questions = [...bank].sort(() => Math.random() - 0.5).slice(0, 10);
  const runId = crypto.randomUUID();
  req.session.quizRuns ||= {};
  req.session.quizRuns[runId] = {
    topic,
    questions: questions.map(({ id, answer }) => ({ id, answer })),
    answered: {}
  };
  res.json({
    runId,
    topic,
    total: questions.length,
    questions: questions.map(({ id, question, options, difficulty, category }) => ({
      id, question, options, difficulty, category
    }))
  });
});

router.post('/:topic/answer', (req, res) => {
  const { runId, questionId, answer } = req.body || {};
  const run = req.session.quizRuns && req.session.quizRuns[runId];
  const question = run && run.questions.find(item => item.id === questionId);
  if (!run || run.topic !== req.params.topic || !question || !Number.isInteger(answer) || answer < 0 || answer > 3) {
    return res.status(400).json({ error: 'That answer could not be matched to an active quiz.' });
  }
  if (Object.prototype.hasOwnProperty.call(run.answered, questionId)) {
    return res.status(409).json({ error: 'This question has already been answered.' });
  }
  const detail = readQuestions()[run.topic].find(item => item.id === questionId);
  const correct = answer === question.answer;
  run.answered[questionId] = { answer, correct };
  return res.json({ correct, correctAnswer: question.answer, explanation: detail.explanation });
});

router.post('/:topic/submit', (req, res) => {
  const { runId } = req.body || {};
  const run = req.session.quizRuns && req.session.quizRuns[runId];
  if (!run || run.topic !== req.params.topic) return res.status(400).json({ error: 'Quiz session expired. Start a new quiz.' });
  const student = ensureStudent(req);
  const total = run.questions.length;
  const attempted = Object.keys(run.answered).length;
  if (!attempted) return res.status(400).json({ error: 'Answer at least one question before submitting.' });
  const score = Object.values(run.answered).filter(item => item.correct).length;
  const xpEarned = (score * 10) + Math.floor((score / total) * 50);
  const completedAt = new Date().toISOString();
  const result = {
    id: crypto.randomUUID(), topic: run.topic, score, total,
    percentage: Math.round((score / total) * 100),
    attempted, xpEarned, completedAt
  };
  const saveResult = db.transaction(() => {
    db.prepare(`INSERT INTO quiz_results
      (id, student_id, student_name, topic, score, total, percentage, attempted, xp_earned, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(result.id, student.id, student.name, result.topic, result.score, result.total,
        result.percentage, result.attempted, result.xpEarned, result.completedAt);
    db.prepare(`UPDATE students SET total_xp = total_xp + ?, quiz_count = quiz_count + 1,
      last_active_at = ? WHERE id = ?`).run(xpEarned, completedAt, student.id);
  });
  saveResult();
  const profile = db.prepare('SELECT total_xp FROM students WHERE id = ?').get(student.id);
  result.totalXp = profile.total_xp;
  result.level = Math.floor(profile.total_xp / 100) + 1;
  delete req.session.quizRuns[runId];
  return res.json(result);
});

module.exports = router;