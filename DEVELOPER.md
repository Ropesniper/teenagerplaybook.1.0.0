# TeenagerPlaybook — Developer Guide

A reference for anyone maintaining or extending this project.
Read this before making changes.

---

## Architecture at a Glance

```
TPB/
├── index.html              Landing page (public)
├── login.html              Login (public)
├── signup.html             Registration with role-card picker (public)
├── dashboard.html          Main hub for logged-in users
├── admin.html              Admin panel (admin role only)
├── history.html            Session history for users
├── bodypostures.html       Camera AI session
├── facialexpression.html   Camera AI session
├── intonation.html         Microphone AI session
├── scoring.html            Scoring explainer
├── face-visualizer.html    Face landmark visualiser
├── about.html / references.html / policies/
│
├── css/
│   └── style.css           Single stylesheet — all pages share it
│
├── js/
│   ├── auth-guard.js       Session management, fetch wrapper, popup utils
│   └── env-check.js        Pre-session agreement popup (tick & go)
│
├── server/
│   ├── server.js           Express + Mongoose backend (single file)
│   ├── package.json
│   └── .env                Secrets — never commit this
│
├── videos/                 Uploaded session videos (gitignored)
└── DEVELOPER.md            This file
```

---

## Account Types

The platform supports multiple user types. Each gets a tailored
dashboard experience (greeting, intro text, note prompt).

| accountType | Who                          | Icon |
|-------------|------------------------------|------|
| teenager    | Primary learner (default)    | 🎓  |
| parent      | Supporting a child at home   | 👨‍👩‍👧  |
| teacher     | Educator using with a class  | 📚  |
| other       | Adult / self-directed learner| ✦   |

### Adding a new account type

1. **server.js** — add the string to `ACCOUNT_TYPES` array (line ~35)
2. **signup.html** — add a `.role-card` div inside `#roleGrid`
   and a matching `<div class="context-fields" id="ctx-YOURTYPE">` block
3. **auth-guard.js** — add a `case 'YOURTYPE':` inside `getDashboardContext()`
   returning `{ greeting, intro, notePrompt, notePlaceholder }`
4. **auth-guard.js** — add to `ACCOUNT_TYPE_LABELS` object
5. **admin.html** — add a filter chip in both the Notes and Users sections
6. Deploy and test signup → dashboard flow for the new type

That is the *complete* checklist. No other files need changing.

---

## Session Storage Keys

All keys are centralised in `SESSION_KEYS` array in auth-guard.js.
Never write these strings elsewhere — use `getSession()` / `saveSession()`.

| Key              | Value                        |
|------------------|------------------------------|
| tp_token         | JWT string                   |
| tp_token_expiry  | Unix ms (remember-me only)   |
| tp_remember      | 'true' if remember-me is on  |
| tp_role          | 'user' or 'admin'            |
| tp_user          | login username               |
| tp_display       | displayName (friendly name)  |
| tp_accountType   | teenager / parent / teacher / other |

---

## Adding a New Session Type (e.g. parent-child session)

1. Add a new HTML page (e.g. `parent-session.html`) — copy the
   structure from `bodypostures.html` and strip out the AI scoring.
2. Add a new video target option in:
   - `dashboard.html` → `#dashVideoTarget` select
   - `admin.html` → `#videoTarget` select
3. Add a checkpoint definition (or leave `CHECKPOINTS = []` if no exercises).
4. Add a card in `dashboard.html` inside `.mirror-grid` for navigation.
5. The backend requires no changes — videos are just files in `/videos/`.

---

## Adding a New Backend Resource

Follow this pattern in `server.js`:

```js
// 1. Define schema
const XSchema = new mongoose.Schema({ ... });
const X = mongoose.model('X', XSchema);

// 2. CRUD routes (place in logical section)
app.get('/x',         authMiddleware,  async (req, res) => { ... });
app.post('/x',        authMiddleware,  async (req, res) => { ... });
app.delete('/x/:id',  adminMiddleware, async (req, res) => { ... });
```

The file is sectioned with `// ═══` headers — add new sections there.
Never mix auth concerns: `authMiddleware` = any logged-in user,
`adminMiddleware` = admin role only.

---

## Environment Variables (.env)

```
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/teenagerPlaybook
JWT_SECRET=<long random string — change before deploying>
ADMIN_USERNAME=<your admin login>
ADMIN_PASSWORD=<strong password>
ADMIN_EMAIL=<your email>
```

The admin account is created automatically on first start if it
doesn't already exist in the database.

---

## Video File Naming Conventions

| Session              | Expected filename          |
|----------------------|---------------------------|
| Body Postures        | BodyPostures.mp4           |
| Facial Expressions   | FacialExpressions.mp4      |
| Intonation           | Intonation.mp4             |
| Personal / custom    | Any filename (no spaces)   |

Videos live in `/videos/` — this directory is excluded from git.
Upload via Admin Panel → Video Management, or Dashboard → Upload section.

---

## Planned Future Features (placeholders already in code)

- **Parent-child account linking** — `linkedAccounts` field is in the User
  schema but commented out. Uncomment and implement a `/link-account` route
  when ready.
- **Audience-targeted polls** — `targetAudience` field is in PollSchema,
  commented out. Uncomment and filter `GET /polls` by `req.user.accountType`.
- **Teacher cohort management** — create a `Cohort` schema linking a teacher
  to multiple student accounts. One route: `GET /my-cohort`.
- **Parent dashboard view** — a read-only view of a linked child's History
  and progress stats. Reuse the existing `/history` endpoint filtered by
  `linkedAccounts`.

---

## CSS Conventions

All pages share `css/style.css`. CSS variables are defined at the top
in `:root`. Always use variables — never hardcode colours.

Common utility classes: `.wood-panel`, `.btn`, `.btn-primary`,
`.btn-secondary`, `.btn-sm`, `.form-group`, `.check-row`,
`.popup-overlay`, `.popup-box`, `.toast`, `.muted`, `.hidden`.

---

## Deployment Checklist

- [ ] Change `JWT_SECRET` in `.env` to a long random string
- [ ] Change `ADMIN_PASSWORD` to something strong
- [ ] Set `MONGO_URI` to your production MongoDB connection string
- [ ] Set `API_BASE` in `js/auth-guard.js` to your production URL
- [ ] Ensure `/videos/` directory is writable by the server process
- [ ] Upload session videos via Admin Panel before going live
