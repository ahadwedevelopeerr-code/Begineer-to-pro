const session = require('express-session');

class SQLiteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.find = db.prepare('SELECT session_data, expires_at FROM sessions WHERE sid = ?');
    this.save = db.prepare(`INSERT INTO sessions (sid, session_data, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET session_data = excluded.session_data, expires_at = excluded.expires_at`);
    this.remove = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.removeExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
  }

  get(sid, callback) {
    try {
      const row = this.find.get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        this.remove.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.session_data));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sessionData, callback) {
    try {
      this.removeExpired.run(Date.now());
      this.save.run(sid, JSON.stringify(sessionData), this.expiry(sessionData));
      if (callback) callback(null);
    } catch (error) {
      if (callback) callback(error);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }

  destroy(sid, callback) {
    try {
      this.remove.run(sid);
      if (callback) callback(null);
    } catch (error) {
      if (callback) callback(error);
    }
  }

  expiry(sessionData) {
    const expires = sessionData.cookie && sessionData.cookie.expires;
    if (expires) return new Date(expires).getTime();
    const maxAge = sessionData.cookie && sessionData.cookie.maxAge;
    return Date.now() + (Number.isFinite(maxAge) ? maxAge : 24 * 60 * 60 * 1000);
  }
}

module.exports = SQLiteSessionStore;