// ═══════════════════════════════════════════════════════════════
//  TeenagerPlaybook — server.js  v1.0.0
//
//  SECTIONS (search ══ header):
//    SETUP & MIDDLEWARE
//    SCHEMAS
//    AUTH HELPERS
//    RATE LIMITING        (login brute-force protection)
//    AUTH ROUTES          /signup  /login  /ping
//    PROFILE              /profile
//    HISTORY              /history
//    POLLS                /polls  /vote/:id/:idx
//    FILE STORAGE SETUP
//    FILE SERVING         /files/:name  (auth-gated)
//    NOTES                /notes  /admin/notes
//    PERSONAL FILES       /personal-files
//    PUBLISHED FILES      /published-files  /admin/publish-file
//    ERROR REPORTS        /report-error  /admin/error-reports
//    ADMIN — FILES        /admin/upload-file  /admin/files
//    ADMIN — USERS        /admin/users
//    ADMIN — HISTORY      /admin/history
//    ADMIN — FILE STATS   /admin/files/stats
//    HEALTH CHECK         /health
//    START
// ═══════════════════════════════════════════════════════════════

'use strict';

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const helmet   = require('helmet');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

require('dotenv').config();

// ── Validate required env vars at startup ──
['MONGO_URI','JWT_SECRET','ADMIN_USERNAME','ADMIN_PASSWORD','ADMIN_EMAIL'].forEach(k => {
  if (!process.env[k]) { console.error(`✖ Missing required env var: ${k}`); process.exit(1); }
});

// ═══════════════════════════════════════════════════════════════
// SETUP & MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

const app = express();

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));

// Serve static files — but NOT the /files/ directory (those require auth)
// Static serves everything in TPB/ EXCEPT the 'files' subfolder
app.use(express.static(path.join(__dirname, '..'), {
  index: 'index.html',
  setHeaders: (res, filePath) => {
    // Block direct static access to the files/ directory
    if (filePath.includes(path.sep + 'files' + path.sep) ||
        filePath.endsWith(path.sep + 'files')) {
      res.status(403).end();
    }
  }
}));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✦ MongoDB connected'))
  .catch(err => { console.error('✖ MongoDB failed:', err.message); process.exit(1); });

// ═══════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════

const ACCOUNT_TYPES = ['teenager', 'parent', 'teacher', 'other'];

const UserSchema = new mongoose.Schema({
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  username:    { type: String, required: true, unique: true, trim: true },
  password:    { type: String, required: true },
  role:        { type: String, default: 'user',     enum: ['user', 'admin'] },
  accountType: { type: String, default: 'teenager', enum: ACCOUNT_TYPES },
  displayName: { type: String, default: '', trim: true },
  ageGroup:    { type: String, default: '', enum: ['','under-13','13-15','16-18','18-25','25+'] },
  profileDetails: {
    institution: { type: String, default: '' },
    bio:         { type: String, default: '' },
    goals:       { type: String, default: '' },
  },
  createdAt: { type: Date, default: Date.now },
});

const HistorySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username:  { type: String, required: true },
  type:      { type: String, required: true, enum: ['bodypostures','facialexpression','intonation'] },
  accuracy:  { type: Number, required: true, min: 0, max: 100 },
  passed:    { type: Boolean, required: true },
  timestamp: { type: Date, default: Date.now },
});

const PollSchema = new mongoose.Schema({
  question:       { type: String, required: true, trim: true },
  isAnnouncement: { type: Boolean, default: false },
  options: [{
    text:   { type: String, required: true },
    votes:  { type: Number, default: 0, min: 0 },
    voters: [{ type: String }],
  }],
  createdAt: { type: Date, default: Date.now },
});

const NoteSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username:    { type: String, required: true },
  accountType: { type: String, default: 'teenager', enum: ACCOUNT_TYPES },
  message:     { type: String, required: true },
  adminReply:  { type: String, default: '' },
  grantedFile: {
    filename:    { type: String, default: '' },
    label:       { type: String, default: '' },
    description: { type: String, default: '' },
  },
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  repliedAt: { type: Date },
});

// Published files — admin uploads and publishes with visibility control
// visibility: 'everyone'  → all logged-in users see it on dashboard
// visibility: 'specific'  → only users in allowedUsers[] see it
const PublishedFileSchema = new mongoose.Schema({
  filename:    { type: String, required: true },
  label:       { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  visibility:  { type: String, default: 'everyone', enum: ['everyone', 'specific'] },
  allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  publishedAt: { type: Date, default: Date.now },
  publishedBy: { type: String, default: '' },
});

// Error reports submitted by users via the "Report Error" button
const ErrorReportSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username:    { type: String, default: 'anonymous' },
  page:        { type: String, default: '' },   // window.location.pathname
  description: { type: String, required: true },
  userAgent:   { type: String, default: '' },
  resolved:    { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now },
});

const User          = mongoose.model('User',          UserSchema);
const History       = mongoose.model('History',       HistorySchema);
const Poll          = mongoose.model('Poll',          PollSchema);
const Note          = mongoose.model('Note',          NoteSchema);
const PublishedFile = mongoose.model('PublishedFile', PublishedFileSchema);
const ErrorReport   = mongoose.model('ErrorReport',   ErrorReportSchema);

// ═══════════════════════════════════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════════════════════════════════

function signToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role,
      accountType: user.accountType || 'teenager',
      displayName: user.displayName || user.username },
    process.env.JWT_SECRET,
    { expiresIn: '8d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ msg: 'No token provided' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ msg: 'Invalid or expired token' }); }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admin only' });
    next();
  });
}

mongoose.connection.once('open', async () => {
  try {
    if (!await User.findOne({ username: process.env.ADMIN_USERNAME })) {
      await User.create({
        email: process.env.ADMIN_EMAIL, username: process.env.ADMIN_USERNAME,
        password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12),
        role: 'admin', accountType: 'other', displayName: process.env.ADMIN_USERNAME,
      });
      console.log('✦ Admin account created:', process.env.ADMIN_USERNAME);
    }
  } catch (e) { console.error('Admin creation error:', e.message); }
});

// ═══════════════════════════════════════════════════════════════
// RATE LIMITING — login brute-force protection
// Simple in-memory map: IP → { count, resetAt }
// No npm package needed.
// ═══════════════════════════════════════════════════════════════

const _loginAttempts = new Map();
const LOGIN_MAX      = 10;    // max attempts
const LOGIN_WINDOW   = 15 * 60 * 1000; // 15 minutes

function loginRateLimit(req, res, next) {
  const ip  = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const rec = _loginAttempts.get(ip);

  if (rec) {
    if (now > rec.resetAt) {
      _loginAttempts.delete(ip); // window expired, start fresh
    } else if (rec.count >= LOGIN_MAX) {
      const retryAfter = Math.ceil((rec.resetAt - now) / 60000);
      return res.status(429).json({
        msg: `Too many login attempts. Try again in ${retryAfter} minute${retryAfter !== 1 ? 's' : ''}.`
      });
    }
  }
  next();
}

function recordLoginAttempt(ip) {
  const now = Date.now();
  const rec = _loginAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    _loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW });
  } else {
    rec.count++;
  }
}

function clearLoginAttempts(ip) {
  _loginAttempts.delete(ip);
}

// Clean up stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of _loginAttempts) {
    if (now > rec.resetAt) _loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════

// Public keepalive — used by UptimeRobot / ping services to prevent cold starts
app.get('/ping', (req, res) => res.json({ ok: true, t: Date.now() }));

app.post('/signup', async (req, res) => {
  const { email, username, password, accountType, displayName, ageGroup, profileDetails } = req.body;
  if (!email || !email.trim())                return res.status(400).json({ msg: 'Email is required' });
  if (!username || !username.trim())          return res.status(400).json({ msg: 'Username is required' });
  if (!password || password.length < 6)      return res.status(400).json({ msg: 'Password must be at least 6 characters' });
  if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username.trim()))
    return res.status(400).json({ msg: 'Username must be 2–30 chars: letters, numbers, _ or - only' });

  const type = ACCOUNT_TYPES.includes(accountType) ? accountType : 'teenager';
  try {
    if (await User.findOne({ $or: [{ email: email.trim().toLowerCase() }, { username: username.trim() }] }))
      return res.status(409).json({ msg: 'Email or username already in use' });
    const user = await User.create({
      email: email.trim().toLowerCase(), username: username.trim(),
      password: await bcrypt.hash(password, 12),
      accountType: type, displayName: (displayName || username).trim().slice(0, 60),
      ageGroup: ageGroup || '',
      profileDetails: {
        institution: (profileDetails?.institution || '').slice(0, 120),
        bio:         (profileDetails?.bio         || '').slice(0, 300),
        goals:       (profileDetails?.goals       || '').slice(0, 300),
      },
    });
    res.status(201).json({ msg: 'Account created', token: signToken(user),
      role: user.role, accountType: user.accountType,
      displayName: user.displayName, username: user.username });
  } catch (e) { console.error('Signup error:', e.message); res.status(500).json({ msg: 'Server error' }); }
});

app.post('/login', loginRateLimit, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ msg: 'Username and password required' });
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      recordLoginAttempt(ip);
      return res.status(401).json({ msg: 'Invalid username or password' });
    }
    clearLoginAttempts(ip);
    res.json({ msg: 'Login successful', token: signToken(user),
      role: user.role, accountType: user.accountType || 'teenager',
      displayName: user.displayName || user.username, username: user.username });
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════════════════════════

app.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json(user);
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.patch('/profile', authMiddleware, async (req, res) => {
  const { displayName, ageGroup, profileDetails } = req.body;
  const update = {};
  if (displayName !== undefined) update.displayName = String(displayName).trim().slice(0, 60);
  if (ageGroup    !== undefined) update.ageGroup    = ageGroup;
  if (profileDetails) {
    if (profileDetails.institution !== undefined) update['profileDetails.institution'] = String(profileDetails.institution).slice(0, 120);
    if (profileDetails.bio         !== undefined) update['profileDetails.bio']         = String(profileDetails.bio).slice(0, 300);
    if (profileDetails.goals       !== undefined) update['profileDetails.goals']       = String(profileDetails.goals).slice(0, 300);
  }
  try {
    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json(user);
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════════

app.get('/history', authMiddleware, async (req, res) => {
  try { res.json(await History.find({ userId: req.user.id }).sort({ timestamp: -1 }).limit(500)); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.post('/history', authMiddleware, async (req, res) => {
  const { type, accuracy, passed } = req.body;
  if (!['bodypostures','facialexpression','intonation'].includes(type))
    return res.status(400).json({ msg: 'Invalid session type' });
  const acc = parseFloat(accuracy);
  if (isNaN(acc) || acc < 0 || acc > 100) return res.status(400).json({ msg: 'Accuracy must be 0–100' });
  try {
    await History.create({ userId: req.user.id, username: req.user.username, type, accuracy: acc, passed: !!passed });
    res.status(201).json({ msg: 'Saved' });
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// DELETE /history — user clears their own history (also cleared from DB)
app.delete('/history', authMiddleware, async (req, res) => {
  try {
    await History.deleteMany({ userId: req.user.id });
    res.json({ msg: 'History cleared' });
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// POLLS
// ═══════════════════════════════════════════════════════════════

app.get('/polls', authMiddleware, async (req, res) => {
  try {
    const polls = await Poll.find().sort({ createdAt: -1 });
    const isAdmin = req.user.role === 'admin';
    const username = req.user.username;
    res.json(polls.map(p => {
      const obj = p.toObject();
      obj.myVote = p.options.findIndex(o => o.voters.includes(username));
      if (!isAdmin) obj.options = obj.options.map(o => ({ _id: o._id, text: o.text, votes: o.votes }));
      return obj;
    }));
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.post('/polls', adminMiddleware, async (req, res) => {
  const { question, options, isAnnouncement } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ msg: 'Question required' });
  try {
    const poll = await Poll.create({
      question: question.trim(), isAnnouncement: !!isAnnouncement,
      options: (options || []).map(o => ({ text: String(o.text || '').trim(), votes: 0, voters: [] })),
    });
    res.status(201).json(poll);
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.post('/vote/:id/:index', authMiddleware, async (req, res) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ msg: 'Poll not found' });
    const newIdx = parseInt(req.params.index, 10);
    if (isNaN(newIdx) || newIdx < 0 || newIdx >= poll.options.length)
      return res.status(400).json({ msg: 'Invalid option index' });
    const username = req.user.username;
    const prevIdx  = poll.options.findIndex(o => o.voters.includes(username));
    if (prevIdx === newIdx) return res.json({ msg: 'No change', myVote: prevIdx });
    if (prevIdx !== -1) {
      poll.options[prevIdx].voters = poll.options[prevIdx].voters.filter(u => u !== username);
      poll.options[prevIdx].votes  = Math.max(0, poll.options[prevIdx].votes - 1);
    }
    poll.options[newIdx].voters.push(username);
    poll.options[newIdx].votes += 1;
    await poll.save();
    res.json({ msg: 'Vote recorded', myVote: newIdx });
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.delete('/polls/:id', adminMiddleware, async (req, res) => {
  try { await Poll.findByIdAndDelete(req.params.id); res.json({ msg: 'Deleted' }); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// FILE STORAGE SETUP — CLOUDINARY (persistent storage)
// Files uploaded to Cloudinary for permanent storage.
// Local /files/ directory still created as fallback but not used.
// ═══════════════════════════════════════════════════════════════

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary (only if credentials provided)
const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && 
                          process.env.CLOUDINARY_API_KEY && 
                          process.env.CLOUDINARY_API_SECRET);

if (useCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('✦ Cloudinary configured for persistent storage');
} else {
  console.warn('⚠ Cloudinary credentials missing — using local storage (files will be lost on restart)');
}

// Fallback local directory (for backward compatibility)
const filesDir = path.join(__dirname, '..', 'files');
if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

// Cloudinary storage configuration
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'teenagerplaybook/videos',
    allowed_formats: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'pdf', 'jpg', 'png', 'gif', 'jpeg', 'doc', 'docx', 'ppt', 'pptx'],
    resource_type: 'auto', // auto-detect video/image/raw
    use_filename: true,
    unique_filename: true,
  },
});

// Local disk storage (fallback)
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, filesDir),
  filename: (req, file, cb) => {
    const raw = (req.body.target || 'Upload').replace(/[/\\:*?"<>|]/g, '_').slice(0, 80);
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || '';
    cb(null, raw + ext);
  },
});

// Use Cloudinary if configured, otherwise fallback to local
const storage = useCloudinary ? cloudinaryStorage : diskStorage;
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });


// ═══════════════════════════════════════════════════════════════
// FILE SERVING — auth-gated (static middleware cannot serve /files/)
// ═══════════════════════════════════════════════════════════════

app.get('/files/:name', authMiddleware, (req, res) => {
  const name = path.basename(req.params.name);
  const fp   = path.join(filesDir, name);
  if (!fs.existsSync(fp)) return res.status(404).json({ msg: 'File not found' });
  res.sendFile(fp);
});

// ═══════════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════════

app.get('/notes', authMiddleware, async (req, res) => {
  try { res.json(await Note.find({ userId: req.user.id }).sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.get('/notes/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Note.countDocuments({ userId: req.user.id, adminReply: { $ne: '' }, read: false });
    res.json({ count });
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.post('/notes', authMiddleware, async (req, res) => {
  const message = (req.body.message || '').trim();
  if (!message) return res.status(400).json({ msg: 'Message cannot be empty' });
  if (message.length > 2000) return res.status(400).json({ msg: 'Message too long (max 2000 chars)' });
  try {
    const note = await Note.create({ userId: req.user.id, username: req.user.username,
      accountType: req.user.accountType || 'teenager', message });
    res.status(201).json(note);
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.patch('/notes/:id/read', authMiddleware, async (req, res) => {
  try { await Note.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { read: true }); res.json({ msg: 'ok' }); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.get('/admin/notes', adminMiddleware, async (req, res) => {
  try { res.json(await Note.find().sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.patch('/admin/notes/:id/reply', adminMiddleware, async (req, res) => {
  const { adminReply, grantedFile } = req.body;
  if (!adminReply || !adminReply.trim()) return res.status(400).json({ msg: 'Reply cannot be empty' });
  const update = { adminReply: adminReply.trim().slice(0, 2000), repliedAt: new Date(), read: false };
  if (grantedFile && grantedFile.filename && grantedFile.filename.trim()) {
    const safe = path.basename(grantedFile.filename.trim());
    if (!fs.existsSync(path.join(filesDir, safe)))
      return res.status(400).json({ msg: `File "${safe}" not found. Upload it first.` });
    update.grantedFile = {
      filename:    safe,
      label:       (grantedFile.label       || 'Personal Session').slice(0, 100),
      description: (grantedFile.description || '').slice(0, 300),
    };
  }
  try {
    const note = await Note.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!note) return res.status(404).json({ msg: 'Note not found' });
    res.json(note);
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.delete('/admin/notes/:id', adminMiddleware, async (req, res) => {
  try { await Note.findByIdAndDelete(req.params.id); res.json({ msg: 'Deleted' }); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// PERSONAL FILES — files granted to a user via note reply
// ═══════════════════════════════════════════════════════════════

app.get('/personal-files', authMiddleware, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user.id, 'grantedFile.filename': { $nin: ['', null] } });
    res.json(notes.filter(n => n.grantedFile?.filename).map(n => ({
      noteId: n._id, filename: n.grantedFile.filename,
      label: n.grantedFile.label || 'Personal Session',
      description: n.grantedFile.description || '',
      adminReply: n.adminReply, grantedAt: n.repliedAt,
    })));
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// PUBLISHED FILES
// Admin publishes files with visibility: 'everyone' or 'specific'.
// 'everyone'  → all logged-in users see it on their dashboard
// 'specific'  → only allowedUsers[] see it
// ═══════════════════════════════════════════════════════════════

// GET /published-files — returns files this user is allowed to see
app.get('/published-files', authMiddleware, async (req, res) => {
  try {
    const files = await PublishedFile.find({
      $or: [
        { visibility: 'everyone' },
        { visibility: 'specific', allowedUsers: req.user.id },
      ],
    }).sort({ publishedAt: -1 });
    res.json(files);
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// GET /admin/published-files — all published files (for admin management)
app.get('/admin/published-files', adminMiddleware, async (req, res) => {
  try { res.json(await PublishedFile.find().sort({ publishedAt: -1 }).populate('allowedUsers', 'username displayName')); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /admin/publish-file — publish a file
app.post('/admin/publish-file', adminMiddleware, async (req, res) => {
  const { filename, label, description, visibility, allowedUserIds } = req.body;
  if (!filename || !filename.trim()) return res.status(400).json({ msg: 'Filename required' });
  if (!label    || !label.trim())    return res.status(400).json({ msg: 'Label required' });
  const safe = path.basename(filename.trim());
  if (!fs.existsSync(path.join(filesDir, safe)))
    return res.status(400).json({ msg: `File "${safe}" not found in library. Upload it first.` });
  const vis = visibility === 'specific' ? 'specific' : 'everyone';
  try {
    const pf = await PublishedFile.create({
      filename: safe, label: label.trim().slice(0, 100),
      description: (description || '').trim().slice(0, 300),
      visibility: vis,
      allowedUsers: vis === 'specific' ? (allowedUserIds || []) : [],
      publishedBy: req.user.username,
    });
    res.status(201).json(pf);
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// PATCH /admin/published-files/:id — update visibility / allowed users
app.patch('/admin/published-files/:id', adminMiddleware, async (req, res) => {
  const { label, description, visibility, allowedUserIds } = req.body;
  const update = {};
  if (label       !== undefined) update.label       = label.trim().slice(0, 100);
  if (description !== undefined) update.description = description.trim().slice(0, 300);
  if (visibility  !== undefined) {
    update.visibility   = visibility === 'specific' ? 'specific' : 'everyone';
    update.allowedUsers = update.visibility === 'specific' ? (allowedUserIds || []) : [];
  }
  try {
    const pf = await PublishedFile.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!pf) return res.status(404).json({ msg: 'Not found' });
    res.json(pf);
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// DELETE /admin/published-files/:id — unpublish
app.delete('/admin/published-files/:id', adminMiddleware, async (req, res) => {
  try { await PublishedFile.findByIdAndDelete(req.params.id); res.json({ msg: 'Unpublished' }); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// ERROR REPORTS
// Users click "Report Error" anywhere on the site.
// Admin sees all reports in the admin panel.
// ═══════════════════════════════════════════════════════════════

app.post('/report-error', authMiddleware, async (req, res) => {
  const description = (req.body.description || '').trim();
  if (!description) return res.status(400).json({ msg: 'Description required' });
  if (description.length > 1000) return res.status(400).json({ msg: 'Too long (max 1000 chars)' });
  try {
    await ErrorReport.create({
      userId:      req.user.id,
      username:    req.user.username,
      page:        (req.body.page      || '').slice(0, 200),
      description: description.slice(0, 1000),
      userAgent:   (req.body.userAgent || '').slice(0, 300),
    });
    res.status(201).json({ msg: 'Report submitted. Thank you.' });
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.get('/admin/error-reports', adminMiddleware, async (req, res) => {
  try { res.json(await ErrorReport.find().sort({ createdAt: -1 }).limit(200)); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.patch('/admin/error-reports/:id/resolve', adminMiddleware, async (req, res) => {
  try {
    await ErrorReport.findByIdAndUpdate(req.params.id, { resolved: true });
    res.json({ msg: 'Marked resolved' });
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.delete('/admin/error-reports/:id', adminMiddleware, async (req, res) => {
  try { await ErrorReport.findByIdAndDelete(req.params.id); res.json({ msg: 'Deleted' }); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — FILES
// ═══════════════════════════════════════════════════════════════

app.post('/admin/upload-file', adminMiddleware, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ msg: 'No file received' });
  
  try {
    // Cloudinary response structure
    if (req.file.path && req.file.path.startsWith('http')) {
      // File uploaded to Cloudinary
      const fileData = {
        msg: 'Uploaded to Cloudinary',
        filename: req.file.filename || req.file.originalname,
        url: req.file.path, // Cloudinary URL
        publicId: req.file.filename, // Cloudinary public_id
        size: req.file.size,
        format: req.file.format || path.extname(req.file.originalname).slice(1),
        resourceType: req.file.resource_type || 'video',
        duration: req.file.duration || null,
        width: req.file.width || null,
        height: req.file.height || null,
        createdAt: new Date().toISOString(),
      };
      return res.json(fileData);
    } else {
      // File uploaded to local disk (fallback)
      return res.json({ 
        msg: 'Uploaded locally (will be lost on restart)', 
        filename: req.file.filename,
        size: req.file.size,
        isLocal: true,
      });
    }
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ msg: 'Upload failed' });
  }
});

app.get('/admin/files', adminMiddleware, async (req, res) => {
  try {
    if (useCloudinary) {
      // Fetch files from Cloudinary
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: 'teenagerplaybook/videos',
        max_results: 500,
        resource_type: 'video',
      });
      
      const files = result.resources.map(r => ({
        name: r.public_id.split('/').pop(),
        publicId: r.public_id,
        url: r.secure_url,
        size: ((r.bytes || 0) / 1048576).toFixed(1) + ' MB',
        format: r.format,
        duration: r.duration || null,
        width: r.width || null,
        height: r.height || null,
        createdAt: r.created_at,
        thumbnail: r.resource_type === 'video' 
          ? cloudinary.url(r.public_id, { resource_type: 'video', format: 'jpg', transformation: [{ width: 300, crop: 'fill' }] })
          : r.secure_url,
        resourceType: r.resource_type,
      }));
      
      // Also get image/raw files
      const imageResult = await cloudinary.api.resources({
        type: 'upload',
        prefix: 'teenagerplaybook/videos',
        max_results: 500,
        resource_type: 'image',
      });
      
      imageResult.resources.forEach(r => {
        files.push({
          name: r.public_id.split('/').pop(),
          publicId: r.public_id,
          url: r.secure_url,
          size: ((r.bytes || 0) / 1048576).toFixed(1) + ' MB',
          format: r.format,
          width: r.width || null,
          height: r.height || null,
          createdAt: r.created_at,
          thumbnail: r.secure_url,
          resourceType: 'image',
        });
      });
      
      return res.json(files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } else {
      // Fallback: local filesystem
      const files = fs.readdirSync(filesDir).filter(f => !f.startsWith('.'))
        .map(f => { 
          const s = fs.statSync(path.join(filesDir, f)); 
          return { 
            name: f, 
            size: (s.size/1048576).toFixed(1)+' MB',
            isLocal: true,
          }; 
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return res.json(files);
    }
  } catch (e) {
    console.error('File list error:', e);
    res.json([]);
  }
});

app.delete('/admin/files/:publicId(*)', adminMiddleware, async (req, res) => {
  try {
    const publicId = req.params.publicId;
    
    if (useCloudinary && publicId.includes('/')) {
      // Delete from Cloudinary
      // Try video first, then image/raw
      let deleted = false;
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        deleted = true;
      } catch (e) {
        try {
          await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
          deleted = true;
        } catch (e2) {
          await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
          deleted = true;
        }
      }
      if (deleted) return res.json({ msg: 'Deleted from Cloudinary' });
    } else {
      // Delete from local filesystem (fallback)
      const fp = path.join(filesDir, path.basename(publicId));
      if (!fs.existsSync(fp)) return res.status(404).json({ msg: 'File not found' });
      fs.unlinkSync(fp);
      return res.json({ msg: 'Deleted locally' });
    }
  } catch (e) {
    console.error('Delete error:', e);
    res.status(500).json({ msg: 'Could not delete' });
  }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — USERS
// ═══════════════════════════════════════════════════════════════

app.get('/admin/users', adminMiddleware, async (req, res) => {
  try { res.json(await User.find().select('-password').sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

app.delete('/admin/users/:id', adminMiddleware, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ msg: 'Cannot delete your own account' });
  try {
    await User.findByIdAndDelete(req.params.id);
    await History.deleteMany({ userId: req.params.id });
    await Note.deleteMany({ userId: req.params.id });
    await PublishedFile.updateMany({ allowedUsers: req.params.id }, { $pull: { allowedUsers: req.params.id } });
    res.json({ msg: 'User removed' });
  } catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — HISTORY
// ═══════════════════════════════════════════════════════════════

app.get('/admin/history', adminMiddleware, async (req, res) => {
  try { res.json(await History.find().sort({ timestamp: -1 }).limit(1000)); }
  catch (e) { res.status(500).json({ msg: 'Server error' }); }
});

// ═══════════════════════════════════════════════════════════════
// ADMIN — FILE STATS
// ═══════════════════════════════════════════════════════════════

const FILE_EXT_MAP = {
  video:['.mp4','.webm','.mov','.avi','.mkv','.m4v','.ogv','.3gp','.flv','.wmv'],
  audio:['.mp3','.wav','.ogg','.m4a','.aac','.flac','.aiff','.aif','.opus','.wma','.mid','.midi'],
  pdf:['.pdf'], image:['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp','.tiff','.tif','.ico','.avif','.heic','.heif'],
  document:['.doc','.docx','.odt','.rtf','.pages','.ppt','.pptx','.odp','.key','.xls','.xlsx','.ods','.numbers','.csv'],
  text:['.txt','.md','.json','.xml','.yaml','.yml','.ini','.log'],
  archive:['.zip','.rar','.7z','.tar','.gz','.bz2','.xz','.tgz'],
};
const EXT_TO_CAT = {};
for (const [c,exts] of Object.entries(FILE_EXT_MAP)) exts.forEach(e => { EXT_TO_CAT[e] = c; });

app.get('/admin/files/stats', adminMiddleware, (req, res) => {
  try {
    const files = fs.readdirSync(filesDir).filter(f => !f.startsWith('.'));
    const cats = {}; let totalBytes = 0;
    files.forEach(f => {
      const cat = EXT_TO_CAT[path.extname(f).toLowerCase()] || 'other';
      cats[cat] = (cats[cat] || 0) + 1;
      try { totalBytes += fs.statSync(path.join(filesDir, f)).size; } catch (_) {}
    });
    res.json({ total: files.length, totalMB: Math.round(totalBytes / 1048576), ...cats });
  } catch (e) { res.json({ total: 0 }); }
});

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

app.get('/health', adminMiddleware, async (req, res) => {
  const warnings = [];
  const dbState  = mongoose.connection.readyState;
  const dbStatus = ({0:'disconnected',1:'connected',2:'connecting',3:'disconnecting'})[dbState]||'unknown';
  if (dbState !== 1) warnings.push({ level:'critical', msg:`Database is ${dbStatus}. Data cannot be saved.` });
  const mem    = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1048576);
  const rssMB  = Math.round(mem.rss      / 1048576);
  if (heapMB > 450) warnings.push({ level:'warning', msg:`High memory: ${heapMB} MB heap. Consider restarting.` });
  let diskNote = 'unreadable';
  try {
    const files = fs.readdirSync(filesDir).filter(f => !f.startsWith('.'));
    let bytes = 0;
    files.forEach(f => { try { bytes += fs.statSync(path.join(filesDir, f)).size; } catch (_) {} });
    const mb = Math.round(bytes / 1048576);
    diskNote = `${files.length} files, ${mb} MB`;
    if (mb > 4500) warnings.push({ level:'warning', msg:`File library is ${mb} MB — approaching storage limits on free hosting.` });
  } catch (_) { warnings.push({ level:'warning', msg:'Cannot read /files/ directory.' }); }
  const upSecs  = Math.round(process.uptime());
  const upHuman = upSecs < 60 ? upSecs+'s' : upSecs < 3600 ? Math.floor(upSecs/60)+'m' : Math.floor(upSecs/3600)+'h '+Math.floor((upSecs%3600)/60)+'m';
  if (upSecs < 120) warnings.push({ level:'info', msg:`Server just started (uptime: ${upHuman}). Cold start on free hosting.` });
  res.json({ ok: warnings.every(w=>w.level!=='critical'), uptime: upSecs, uptimeHuman: upHuman,
    memory: { heapMB, rssMB }, database: { status: dbStatus }, files: diskNote, warnings, checkedAt: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✦ TeenagerPlaybook v1.0.0 → http://localhost:${PORT}`));
