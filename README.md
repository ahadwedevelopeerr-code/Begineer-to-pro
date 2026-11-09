# CodePath

CodePath is a self-hosted web development learning platform with practical HTML, CSS, JavaScript, and Node.js lessons; server-graded MCQ quizzes; an administrator dashboard; and an optional OpenAI-powered tutor.

## Requirements

- Node.js 20 LTS or newer (npm is included with Node.js)
- A modern browser
- An OpenAI API key only if you want to enable the AI Tutor

## Setup

1. Install Node.js from [nodejs.org](https://nodejs.org/), choosing the current LTS release. On Windows, restart VS Code after installation if `node` or `npm` is not recognized.
2. Open VS Code, choose **File > Open Folder**, and select this project folder.
3. Open the integrated terminal (**Terminal > New Terminal**) and install dependencies:

   ```powershell
   npm install
   ```

4. Create your private environment file from the template:

   ```powershell
   Copy-Item .env.example .env
   ```

   Edit `.env`. Set a unique administrator username and a strong password of at least 12 characters. Replace the session-secret placeholder with a random value; for example, run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the output as `SESSION_SECRET`. Never commit or share `.env`.

5. To enable CodePath AI Tutor, set `OPENAI_API_KEY` to your own key and `OPENAI_MODEL` to a model available to your account, such as `gpt-4o-mini`. The key stays on the server and is never sent to browser code. Leave these fields empty to use the rest of the site without AI; the tutor will explain that configuration is missing.
6. Initialize the first administrator once:

   ```powershell
   npm run init-admin
   ```

   The command hashes the password and creates the ignored `data/admin.json` file. It refuses to overwrite an existing account. To intentionally replace the first account, stop the server, update `.env`, remove `data/admin.json`, then run the initializer again.
7. Start the server:

   ```powershell
   npm start
   ```

   For development with automatic Node.js reloads, use `npm run dev` instead.
8. Open [http://localhost:3000](http://localhost:3000) in your browser. The administrator sign-in page is [http://localhost:3000/login.html](http://localhost:3000/login.html); after signing in, content management is at `/admin.html`.
9. To use VS Code Live Server on port 5500, leave the Express server running on port 3000 and open the workspace-root `index.html` with **Go Live**. Live Server serves the pages; Express still handles quizzes, student sessions, admin sessions, and chatbot APIs. The app connects these local origins automatically. Do not change Express to port 5500 while Live Server owns that port.

## Using the platform

- **Courses**: choose a path, switch between three lessons, copy examples, and mark lessons complete. Progress is saved in this browser's local storage.
- **Practice MCQs**: take a ten-question quiz in any topic. The server keeps the answer key in the session, accepts only one answer per question, and calculates scores and XP server-side. Guest identity, levels, badges, and private quiz history are stored in `data/codepath.sqlite` and tied to the HTTP-only session cookie.
- **Admin**: search and filter the question bank, add/edit/delete MCQs, edit course lesson content, inspect guest/student quiz records, and export results as CSV. All management endpoints, including exports, require an authenticated admin session.
- **AI Tutor**: open the floating tutor button and ask in English, Urdu, or Roman Urdu. Requests are limited to 20 per 15 minutes per client and message size is bounded. An API key and a model name are required for responses.

## Useful commands and routes

```powershell
npm run check
npm test
npm start
```

- `GET /api/health` checks server availability.
- `GET /api/courses` returns course content.
- `GET /api/quizzes/:topic` starts a quiz for `html`, `css`, `javascript`, or `nodejs`.
- `POST /api/chat` sends a tutor conversation to the server-side OpenAI integration.
- Admin endpoints are under `/api/admin` and require a session established through `/api/admin/login`.

## Troubleshooting

- **`node`/`npm` is not recognized**: install Node.js LTS, restart the terminal or VS Code, and check `node --version` and `npm --version`.
- **Port 3000 is busy**: set a different `PORT` in `.env`, then restart the server.
- **Admin login says it is not initialized**: create `.env` with valid credentials and run `npm run init-admin`.
- **Admin login fails after changing `.env`**: the existing hash is not overwritten automatically. Follow the deliberate reset procedure above, then initialize again.
- **Tutor reports it is not configured**: set both `OPENAI_API_KEY` and `OPENAI_MODEL` in `.env`, restart the server, and confirm the model is enabled for your account. API usage may incur provider charges.
- **Tutor reports an API error**: check the server terminal for a concise diagnostic, verify the key/model and account access, then try again. The API key is not displayed to the browser.
- **Changes or progress seem missing**: lesson completion and student recent-score history use browser local storage. Server quiz statistics are stored in the local JSON file and are shared across visitors.

## Deployment notes

Guest profiles, quiz results, and Express sessions are stored in `data/codepath.sqlite`. Before public deployment, configure HTTPS, a production-strength `SESSION_SECRET`, writable persistent storage for the SQLite file, and database backups. Keep `.env`, `data/admin.json`, and the SQLite database private. The server enables secure session cookies automatically when `NODE_ENV=production`.