require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const coursesRouter = require('./routes/courses');
const quizzesRouter = require('./routes/quizzes');
const adminRouter = require('./routes/admin');
const chatRouter = require('./routes/chat');
const db = require('./lib/database');
const SQLiteSessionStore = require('./middleware/sqlite-session-store');

const app = express();
const port = Number(process.env.PORT) || 3000;
const sessionSecret = process.env.SESSION_SECRET;

if (process.env.NODE_ENV === 'production' &&
    (!sessionSecret || sessionSecret.length < 32 || sessionSecret.includes('change_this'))) {
  throw new Error('Production requires a unique SESSION_SECRET of at least 32 characters.');
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
const liveServerOrigins = new Set(['http://localhost:5500', 'http://127.0.0.1:5500']);
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (liveServerOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(liveServerOrigins.has(origin) ? 204 : 403);
  return next();
});
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '8kb' }));
app.use(session({
  name: 'codepath.sid',
  secret: sessionSecret || 'development-only-change-this-secret',
  store: new SQLiteSessionStore(db),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/courses', coursesRouter);
app.use('/api/quizzes', quizzesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/chat', chatRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

if (require.main === module) {
  app.listen(port, () => console.log(`CodePath is running at http://localhost:${port}`));
}

module.exports = app;