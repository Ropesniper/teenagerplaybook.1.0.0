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

const app = express();

// ── Video storage directory (declared early — used in multiple routes) ──
const videosDir = path.join(__dirname, '..', 'videos');
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI)
  .then(() => console.log('✦ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ─────────────────────────────
// SCHEMAS
// ─────────────────────────────

const UserSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true },
  username:  { type: String, required: true, unique: true },
  password:  { type: String, required: true },
  role:      { type: String, default: 'user', enum: ['user','admin'] },
  createdAt: { type: Date, default: Date.now }
});

const HistorySchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username:  String,
  type:      { type: String, enum: ['bodypostures','facialexpression','intonation'] },
  accuracy:  Number,
  passed:    Boolean,
  timestamp: { type: Date, default: Date.now }
});

// voters[] stored per option — admin can see it, stripped for regular users
const PollSchema = new mongoose.Schema({
  question:       String,
  isAnnouncement: { type: Boolean, default: false },
  options: [{
    text:   String,
    votes:  { type: Number, default: 0 },
    voters: [{ type: String }]
  }],
  createdAt: { type: Date, default: Date.now }
});

// User sends a note/request; admin replies with a message and optional video grant
const NoteSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username:     String,
  message:      String,
  adminReply:   { type: String, default: '' },
  grantedVideo: {
    filename:    { type: String, default: '' },
    label:       { type: String, default: '' },
    description: { type: String, default: '' }
  },
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  repliedAt: { type: Date }
});

const User    = mongoose.model('User',    UserSchema);
const History = mongoose.model('History', HistorySchema);
const Poll    = mongoose.model('Poll',    PollSchema);
const Note    = mongoose.model('Note',    NoteSchema);

// ─────────────────────────────
// AUTH HELPERS
// ─────────────────────────────

function signToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ msg: 'No token provided' });
  try {
    req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    next();
  } catch(e) {
    return res.status(401).json({ msg: 'Invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Admin only' });
    next();
  });
}

async function ensureAdmin() {
  const exists = await User.findOne({ username: process.env.ADMIN_USERNAME });
  if (!exists) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await User.create({ email: process.env.ADMIN_EMAIL, username: process.env.ADMIN_USERNAME, password: hash, role: 'admin' });
    console.log('✦ Admin created:', process.env.ADMIN_USERNAME);
  }
}
mongoose.connection.once('open', ensureAdmin);

// ─────────────────────────────
// AUTH
// ─────────────────────────────

app.post('/signup', async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) return res.status(400).json({ msg: 'All fields required' });
  try {
    if (await User.findOne({ $or: [{ email }, { username }] }))
      return res.status(409).json({ msg: 'Email or username already in use' });
    const user = await User.create({ email, username, password: await bcrypt.hash(password, 12) });
    res.status(201).json({ msg: 'Account created', token: signToken(user), role: user.role });
  } catch(e) { res.status(500).json({ msg: 'Server error', error: e.message }); }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ msg: 'Fields required' });
  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ msg: 'Invalid username or password' });
    res.json({ msg: 'Login successful', token: signToken(user), role: user.role, username: user.username });
  } catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

// ─────────────────────────────
// HISTORY
// ─────────────────────────────

app.get('/history', authMiddleware, async (req, res) => {
  try { res.json(await History.find({ userId: req.user.id }).sort({ timestamp: -1 })); }
  catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

app.post('/history', authMiddleware, async (req, res) => {
  const { type, accuracy, passed } = req.body;
  try {
    await History.create({ userId: req.user.id, username: req.user.username, type, accuracy, passed });
    res.status(201).json({ msg: 'Saved' });
  } catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

// ─────────────────────────────
// POLLS
// ─────────────────────────────

// GET /polls — user sees vote counts but NOT who voted (anonymous)
// Admin sees full voters list
app.get('/polls', authMiddleware, async (req, res) => {
  try {
    const polls    = await Poll.find().sort({ createdAt: -1 });
    const isAdmin  = req.user.role === 'admin';
    const username = req.user.username;

    const result = polls.map(p => {
      const obj = p.toObject();
      // Mark which option this user voted on
      obj.myVote = p.options.findIndex(o => o.voters.includes(username));
      // Strip voters from non-admin responses (anonymous)
      if (!isAdmin) {
        obj.options = obj.options.map(o => ({ _id: o._id, text: o.text, votes: o.votes }));
      }
      return obj;
    });

    res.json(result);
  } catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /polls — admin only
app.post('/polls', adminMiddleware, async (req, res) => {
  const { question, options, isAnnouncement } = req.body;
  try {
    const poll = await Poll.create({
      question,
      isAnnouncement: !!isAnnouncement,
      options: (options || []).map(o => ({ text: o.text, votes: 0, voters: [] }))
    });
    res.status(201).json(poll);
  } catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /vote/:id/:index
// Same option → do nothing
// Different option → remove old vote, add new vote
app.post('/vote/:id/:index', authMiddleware, async (req, res) => {
  try {
    const poll     = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ msg: 'Poll not found' });
    const newIdx   = parseInt(req.params.index);
    const username = req.user.username;
    const prevIdx  = poll.options.findIndex(o => o.voters.includes(username));

    // Same option — do nothing
    if (prevIdx === newIdx) return res.json({ msg: 'No change', myVote: prevIdx });

    // Remove old vote
    if (prevIdx !== -1) {
      poll.options[prevIdx].voters = poll.options[prevIdx].voters.filter(u => u !== username);
      poll.options[prevIdx].votes  = Math.max(0, poll.options[prevIdx].votes - 1);
    }

    // Add new vote
    if (newIdx >= 0 && newIdx < poll.options.length) {
      poll.options[newIdx].voters.push(username);
      poll.options[newIdx].votes += 1;
    }

    await poll.save();
    res.json({ msg: 'Vote updated', myVote: newIdx });
  } catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

app.delete('/polls/:id', adminMiddleware, async (req, res) => {
  await Poll.findByIdAndDelete(req.params.id);
  res.json({ msg: 'Deleted' });
});

// ─────────────────────────────
// NOTES (user ↔ admin messaging + video grants)
// ─────────────────────────────

// GET /notes — user's own notes
app.get('/notes', authMiddleware, async (req, res) => {
  try { res.json(await Note.find({ userId: req.user.id }).sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

// GET /notes/unread-count — badge count for user
app.get('/notes/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Note.countDocuments({
      userId:     req.user.id,
      adminReply: { $ne: '' },
      read:       false
    });
    res.json({ count });
  } catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

// POST /notes — user submits a request
app.post('/notes', authMiddleware, async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ msg: 'Message cannot be empty' });
  try {
    const note = await Note.create({ userId: req.user.id, username: req.user.username, message: message.trim() });
    res.status(201).json(note);
  } catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

// PATCH /notes/:id/read — user marks reply as read
app.patch('/notes/:id/read', authMiddleware, async (req, res) => {
  try {
    await Note.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { read: true });
    res.json({ msg: 'Marked read' });
  } catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

// GET /admin/notes — all notes
app.get('/admin/notes', adminMiddleware, async (req, res) => {
  try { res.json(await Note.find().sort({ createdAt: -1 })); }
  catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

// PATCH /admin/notes/:id/reply — admin sends reply + optional video grant
// Fix 4: validate that the granted video file actually exists in /videos/
app.patch('/admin/notes/:id/reply', adminMiddleware, async (req, res) => {
  const { adminReply, grantedVideo } = req.body;
  try {
    const update = { adminReply: adminReply || '', repliedAt: new Date(), read: false };
    if (grantedVideo && grantedVideo.filename) {
      const safeFilename = path.basename(grantedVideo.filename); // strip any path traversal
      const filePath     = path.join(videosDir, safeFilename);
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({
          msg: `Video file "${safeFilename}" does not exist in /videos/. Upload it first, then grant access.`
        });
      }
      update.grantedVideo = { ...grantedVideo, filename: safeFilename };
    }
    res.json(await Note.findByIdAndUpdate(req.params.id, update, { new: true }));
  } catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

app.delete('/admin/notes/:id', adminMiddleware, async (req, res) => {
  await Note.findByIdAndDelete(req.params.id);
  res.json({ msg: 'Deleted' });
});

// ─────────────────────────────
// PERSONAL VIDEOS
// ─────────────────────────────

// GET /personal-videos — videos granted to this user via note replies
app.get('/personal-videos', authMiddleware, async (req, res) => {
  try {
    const notes = await Note.find({
      userId:                  req.user.id,
      'grantedVideo.filename': { $ne: '' }
    });
    const videos = notes
      .filter(n => n.grantedVideo && n.grantedVideo.filename)
      .map(n => ({
        noteId:      n._id,
        filename:    n.grantedVideo.filename,
        label:       n.grantedVideo.label       || 'Personal Session',
        description: n.grantedVideo.description || '',
        adminReply:  n.adminReply,
        grantedAt:   n.repliedAt
      }));
    res.json(videos);
  } catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

// ─────────────────────────────
// VIDEO / USER / HISTORY ADMIN
// ─────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, videosDir),
  filename:    (req, file, cb) => {
    const target = req.body.target || 'Upload';
    cb(null, target + (path.extname(file.originalname) || '.mp4'));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    ['.mp4','.webm'].includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true) : cb(new Error('Only .mp4 and .webm allowed'));
  },
  limits: { fileSize: 500 * 1024 * 1024 }
});

app.post('/admin/upload-video', adminMiddleware, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ msg: 'No file uploaded' });
  res.json({ msg: 'Uploaded', filename: req.file.filename });
});

app.get('/admin/videos', adminMiddleware, (req, res) => {
  try {
    const files = fs.readdirSync(videosDir)
      .filter(f => ['.mp4','.webm'].includes(path.extname(f).toLowerCase()))
      .map(f => {
        const stat = fs.statSync(path.join(videosDir, f));
        return { name: f, size: (stat.size / (1024*1024)).toFixed(1) + ' MB' };
      });
    res.json(files);
  } catch(e) { res.json([]); }
});

app.delete('/admin/videos/:name', adminMiddleware, (req, res) => {
  const fp = path.join(videosDir, path.basename(req.params.name));
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); res.json({ msg: 'Deleted' }); }
  else res.status(404).json({ msg: 'Not found' });
});

app.get('/admin/history', adminMiddleware, async (req, res) => {
  try { res.json(await History.find().sort({ timestamp: -1 })); }
  catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

app.get('/admin/users', adminMiddleware, async (req, res) => {
  try { res.json(await User.find().select('-password')); }
  catch(e) { res.status(500).json({ msg: 'Server error' }); }
});

app.delete('/admin/users/:id', adminMiddleware, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  await History.deleteMany({ userId: req.params.id });
  await Note.deleteMany({ userId: req.params.id });
  res.json({ msg: 'User removed' });
});

// ─────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✦ TeenagerPlaybook on http://localhost:${PORT}`));
