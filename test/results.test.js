const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { before, after, test } = require('node:test');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const SQLiteSessionStore = require('../middleware/sqlite-session-store');

const productionResultsPath = path.join(__dirname, '..', 'data', 'quiz-results.json');
const productionResultsBefore = fs.existsSync(productionResultsPath)
  ? crypto.createHash('sha256').update(fs.readFileSync(productionResultsPath)).digest('hex')
  : null;
let tempDir;
let db;
let app;
let questionBank;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepath-results-'));
  process.env.CODEPATH_DB_PATH = path.join(tempDir, 'test.sqlite');
  process.env.CODEPATH_ADMIN_FILE = path.join(tempDir, 'admin.json');
  process.env.SESSION_SECRET = 'isolated-test-session-secret-32-characters';
  process.env.NODE_ENV = 'test';
  const passwordHash = await bcrypt.hash('temporary-test-only-password', 4);
  fs.writeFileSync(process.env.CODEPATH_ADMIN_FILE, JSON.stringify({ username: 'test-admin', passwordHash }));
  app = require('../server');
  db = require('../lib/database');
  questionBank = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'questions.json'), 'utf8'));
});

after(() => {
  if (db && db.open) db.close();
  const productionResultsAfter = fs.existsSync(productionResultsPath)
    ? crypto.createHash('sha256').update(fs.readFileSync(productionResultsPath)).digest('hex')
    : null;
  assert.equal(productionResultsAfter, productionResultsBefore, 'tests must not change production JSON quiz results');
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('guest results are private, server-scored, gamified, and admin-exportable', async () => {
  const firstStore = new SQLiteSessionStore(db);
  const restartedStore = new SQLiteSessionStore(db);
  const sessionFixture = {
    cookie: { expires: new Date(Date.now() + 60_000).toISOString(), maxAge: 60_000 },
    studentId: 'restart-persistent-guest'
  };
  await new Promise((resolve, reject) => firstStore.set('restart-session', sessionFixture, error => error ? reject(error) : resolve()));
  const restoredSession = await new Promise((resolve, reject) => restartedStore.get('restart-session', (error, value) => error ? reject(error) : resolve(value)));
  assert.equal(restoredSession.studentId, sessionFixture.studentId);
  await new Promise((resolve, reject) => firstStore.destroy('restart-session', error => error ? reject(error) : resolve()));

  const studentA = request.agent(app);
  const studentB = request.agent(app);
  const initialA = await studentA.get('/api/quizzes/history').expect(200);
  const initialB = await studentB.get('/api/quizzes/history').expect(200);
  assert.match(initialA.body.student.displayName, /^Guest /);
  assert.notEqual(initialA.body.student.displayName, initialB.body.student.displayName);
  assert.deepEqual(initialA.body.results, []);
  assert.deepEqual(initialB.body.results, []);

  await studentA.post('/api/quizzes/profile').send({ displayName: 'Student Alpha' }).expect(200);
  const quizA = await studentA.get('/api/quizzes/html').expect(200);
  assert.equal(quizA.body.questions.length, 10);
  assert.equal(Object.hasOwn(quizA.body.questions[0], 'answer'), false);

  for (const [index, item] of quizA.body.questions.entries()) {
    const source = questionBank.html.find(question => question.id === item.id);
    const answer = await studentA.post('/api/quizzes/html/answer')
      .send({ runId: quizA.body.runId, questionId: item.id, answer: source.answer })
      .expect(200);
    assert.equal(answer.body.correct, true);
    if (index === 0) {
      await studentA.post('/api/quizzes/html/answer')
        .send({ runId: quizA.body.runId, questionId: item.id, answer: source.answer })
        .expect(409);
    }
  }

  const resultA = await studentA.post('/api/quizzes/html/submit').send({
    runId: quizA.body.runId,
    studentId: initialB.body.student.id,
    score: 0,
    percentage: 0,
    xpEarned: 0
  }).expect(200);
  assert.equal(resultA.body.score, 10);
  assert.equal(resultA.body.total, 10);
  assert.equal(resultA.body.percentage, 100);
  assert.equal(resultA.body.attempted, 10);
  assert.equal(resultA.body.xpEarned, 150);
  assert.equal(resultA.body.level, 2);
  await studentA.post('/api/quizzes/html/submit').send({ runId: quizA.body.runId }).expect(400);

  const studentAId = db.prepare('SELECT id FROM students WHERE display_name = ?').get('Student Alpha').id;
  const privateAttempt = await studentB.get(`/api/quizzes/history?studentId=${encodeURIComponent(studentAId)}`).expect(200);
  assert.deepEqual(privateAttempt.body.results, []);
  assert.equal(Object.hasOwn(privateAttempt.body.student, 'id'), false);
  const historyA = await studentA.get('/api/quizzes/history').expect(200);
  assert.equal(historyA.body.results.length, 1);
  assert.equal(historyA.body.results[0].id, resultA.body.id);
  assert.equal(historyA.body.student.totalXp, 150);
  assert.deepEqual(historyA.body.student.badges, ['First quiz', 'Perfect score', '100 XP']);

  await studentB.post('/api/quizzes/profile').send({ displayName: '=1+1' }).expect(200);
  const quizB = await studentB.get('/api/quizzes/javascript').expect(200);
  await studentB.post('/api/quizzes/javascript/answer')
    .send({ runId: quizB.body.runId, questionId: 'not-in-this-run', answer: 3 })
    .expect(400);
  const firstB = quizB.body.questions[0];
  const sourceB = questionBank.javascript.find(question => question.id === firstB.id);
  await studentB.post('/api/quizzes/javascript/answer')
    .send({ runId: quizB.body.runId, questionId: firstB.id, answer: sourceB.answer })
    .expect(200);
  const resultB = await studentB.post('/api/quizzes/javascript/submit')
    .send({ runId: quizB.body.runId, score: 10, total: 10, percentage: 100, xpEarned: 9999 })
    .expect(200);
  assert.equal(resultB.body.score, 1);
  assert.equal(resultB.body.total, 10);
  assert.equal(resultB.body.percentage, 10);
  assert.equal(resultB.body.attempted, 1);
  assert.equal(resultB.body.xpEarned, 15);
  assert.deepEqual((await studentB.get('/api/quizzes/history').expect(200)).body.results.map(item => item.id), [resultB.body.id]);

  await request(app).get('/api/admin/quiz-results').expect(401);
  await request(app).get('/api/admin/quiz-results.csv').expect(401);
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ username: 'test-admin', password: 'temporary-test-only-password' }).expect(200);
  const stats = await admin.get('/api/admin/stats').expect(200);
  assert.equal(stats.body.students, 2);
  assert.equal(stats.body.quizzes, 2);
  assert.equal(stats.body.averageScore, 55);
  const students = await admin.get('/api/admin/students').expect(200);
  assert.equal(students.body.length, 2);
  assert.equal(students.body.find(item => item.displayName === 'Student Alpha').totalXp, 150);
  const records = await admin.get('/api/admin/quiz-results?limit=1000').expect(200);
  assert.equal(records.body.length, 2);
  assert.equal(records.body.find(item => item.id === resultA.body.id).studentName, 'Student Alpha');
  const csv = await admin.get('/api/admin/quiz-results.csv').expect(200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.headers['content-disposition'], /codepath-quiz-results\.csv/);
  assert.match(csv.text, /Student Alpha/);
  assert.match(csv.text, /'=1\+1/);
  assert.match(csv.text, /"javascript","1","10","10","1","15"/);
});
