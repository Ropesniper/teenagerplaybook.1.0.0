# 🎓 TeenagerPlaybook - YouTube-Style Video System

## ✨ What's New

Your TeenagerPlaybook now has **full data persistence** and a **YouTube-like video player** with professional controls!

### 🎬 Video Features

**For Users:**
- **YouTube-style video library** with grid layout and thumbnails
- **Professional video player** with native controls
- **Keyboard shortcuts** just like YouTube:
  - `Space` or `K` - Play/Pause
  - `←` / `→` - Rewind/Forward 5 seconds
  - `J` / `L` - Rewind/Forward 10 seconds
  - `↑` / `↓` - Volume control
  - `M` - Mute/Unmute
  - `F` - Fullscreen
  - `0-9` - Jump to percentage
  - `Esc` - Close player
- **Responsive design** - works on mobile, tablet, desktop
- **Auto-generated thumbnails** from Cloudinary
- **Video metadata** display (duration, upload date, size)

**For Admins:**
- Upload videos via admin panel
- Videos stored permanently on Cloudinary (25GB free)
- Publish videos to all users or specific users
- Video library management interface
- Automatic video transcoding for optimal streaming

### 💾 Data Persistence

**Everything persists forever:**
- ✅ User accounts, passwords, profiles (MongoDB Atlas)
- ✅ Quiz history and scores (MongoDB Atlas)
- ✅ Polls, votes, and announcements (MongoDB Atlas)
- ✅ Notes and admin replies (MongoDB Atlas)
- ✅ **Videos and files** (Cloudinary - 25GB free tier)

**Render's ephemeral storage issue = SOLVED!** 🎉

---

## 🚀 Quick Start Guide

### Step 1: Set Up Cloudinary (5 minutes)

1. **Create free account**: https://cloudinary.com/users/register_free
2. **Get credentials** from dashboard:
   - Cloud Name: `dxxxxxxxx`
   - API Key: `123456789012345`
   - API Secret: `abcdef...`
3. **Create upload preset**:
   - Go to Settings → Upload → Upload presets
   - Click "Add upload preset"
   - Set:
     - Name: `teenager_playbook_videos`
     - Signing mode: **Unsigned**
     - Folder: `teenagerplaybook/videos`
     - Allowed formats: `mp4,webm,mov,avi,mkv,pdf,jpg,png,gif`

### Step 2: Update Render Environment Variables

In your Render dashboard → Your service → Environment, add:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
CLOUDINARY_UPLOAD_PRESET=teenager_playbook_videos
```

Keep existing variables:
```env
MONGO_URI=mongodb+srv://...
JWT_SECRET=your_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password
ADMIN_EMAIL=your_email
PORT=10000
NODE_ENV=production
```

### Step 3: Deploy

```bash
# Install new dependencies
npm install

# Deploy to GitHub (Render auto-deploys)
git add .
git commit -m "Add YouTube-style video system with Cloudinary"
git push origin main
```

### Step 4: Test

1. **Upload a video:**
   - Login as admin
   - Admin Panel → File Library tab
   - Click "Upload File"
   - Select a video file
   - Wait for upload (progress shown)

2. **Publish to users:**
   - Admin Panel → Published Files tab
   - Click "Publish New File"
   - Select the uploaded video
   - Set visibility (everyone or specific users)
   - Add label and description
   - Save

3. **View as user:**
   - Logout and login as regular user
   - Dashboard → "Browse Video Library" button
   - Click any video to play
   - Test keyboard shortcuts (Space, J, L, K, F, M, etc.)

4. **Verify persistence:**
   - Render dashboard → Manual Deploy (to restart server)
   - Video should still be accessible after restart ✅

---

## 📂 File Structure

```
TPB/
├── video-library.html         ← NEW: YouTube-style video player page
├── dashboard.html             ← Updated: Video library button added
├── admin.html                 ← Existing: Admin panel
├── server/
│   ├── server.js              ← Updated: Cloudinary integration
│   ├── package.json           ← Updated: New dependencies
│   └── .env.example           ← Reference for env vars
├── DEPLOYMENT_GUIDE.md        ← NEW: Complete deployment guide
└── README.md                  ← This file
```

---

## 🎥 How the Video System Works

### Architecture

```
User uploads video → Multer processes → Cloudinary Storage
                                              ↓
                                      Permanent cloud storage
                                      (survives Render restarts)
                                              ↓
Admin publishes → MongoDB stores metadata → Users access
                                              ↓
                                    video-library.html displays
                                    with YouTube-like player
```

### Video Flow

1. **Upload** (Admin):
   - Admin selects video file
   - Multer handles the upload
   - Cloudinary stores the file permanently
   - Returns URL, thumbnail, duration, dimensions

2. **Publish** (Admin):
   - Admin clicks "Publish" on uploaded video
   - Sets visibility (everyone / specific users)
   - Adds label and description
   - MongoDB stores the metadata with Cloudinary URL

3. **Access** (Users):
   - User visits Video Library page
   - Frontend fetches published videos from `/published-files`
   - Displays grid with thumbnails
   - Clicking a video opens YouTube-style player
   - Video streams from Cloudinary CDN (fast worldwide)

4. **Playback** (Users):
   - Native HTML5 video player with custom controls
   - Keyboard shortcuts for power users
   - Fullscreen support
   - Volume control
   - Seek/scrub timeline
   - Auto-generated thumbnails

---

## ⌨️ Keyboard Shortcuts (YouTube-Compatible)

| Key | Action |
|-----|--------|
| `Space` or `K` | Play / Pause |
| `←` | Rewind 5 seconds |
| `→` | Forward 5 seconds |
| `J` | Rewind 10 seconds |
| `L` | Forward 10 seconds |
| `↑` | Volume up 10% |
| `↓` | Volume down 10% |
| `M` | Mute / Unmute |
| `F` | Toggle fullscreen |
| `0` - `9` | Jump to 0% - 90% |
| `Esc` | Close player / Exit fullscreen |

---

## 📊 Free Tier Limits

### Cloudinary (Video Storage)
- **Storage**: 25 GB (hundreds of videos)
- **Bandwidth**: 25 GB/month (thousands of views)
- **Transformations**: 25,000/month (thumbnails, etc.)
- **Videos**: Unlimited uploads
- **Upgrade**: $0.10/GB over limit (optional)

### MongoDB Atlas (Database)
- **Storage**: 512 MB (thousands of users)
- **Bandwidth**: Unlimited
- **Backups**: 7-day retention

### Render (Hosting)
- **Hours**: 750/month (24/7 uptime for 1 service)
- **Bandwidth**: 100 GB/month
- **Auto-deploys**: From GitHub pushes

**Bottom line**: Free tier is enough for hundreds of users and videos! 🎉

---

## 🔧 Troubleshooting

### Videos not uploading
- **Check**: Cloudinary credentials in Render env vars
- **Check**: Upload preset is "unsigned" (not "signed")
- **Check**: Browser console for errors
- **Fix**: Re-save credentials in Render, wait for redeploy

### Videos disappear after Render restart
- **Issue**: Files uploaded to local `/files/` directory (old system)
- **Fix**: Re-upload via new admin panel (goes to Cloudinary)
- **Note**: Only Cloudinary-hosted files persist

### Video player not working
- **Check**: Video URL is Cloudinary URL (starts with `https://res.cloudinary.com/`)
- **Check**: Browser supports HTML5 video
- **Check**: Network tab in browser DevTools for 403/404 errors
- **Fix**: Re-publish video with correct Cloudinary URL

### Keyboard shortcuts not working
- **Check**: Video player modal is open
- **Check**: Focus is on the page (not browser address bar)
- **Note**: Some shortcuts (F for fullscreen) may be blocked by browser

### Thumbnails not showing
- **Check**: Video is hosted on Cloudinary (auto-generates thumbnails)
- **Check**: Video format is MP4/WebM (best support)
- **Fallback**: Placeholder thumbnail shows for local files

### Database errors
- **Check**: MongoDB Atlas cluster is running
- **Check**: IP whitelist set to 0.0.0.0/0 (allow all)
- **Check**: Connection string in Render env vars is correct
- **Fix**: Restart MongoDB cluster in Atlas dashboard

---

## 🎨 Customization

### Video Player Styling

Edit `video-library.html` styles:

```css
/* Video card appearance */
.video-card {
  background: rgba(20, 10, 4, 0.5); /* Dark background */
  border: 1px solid var(--wood-mid); /* Border color */
}

/* Thumbnail hover effect */
.video-card:hover {
  transform: translateY(-4px); /* Lift on hover */
  border-color: var(--gold-dim); /* Gold border */
}

/* Player controls */
.native-video-player::-webkit-media-controls-panel {
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
}
```

### Grid Layout

Change number of columns:

```css
.video-grid {
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); 
  /* Change 320px to 280px for more columns */
  /* Change to 400px for fewer, larger cards */
}
```

### Keyboard Shortcuts

Add/modify shortcuts in `video-library.html`:

```javascript
case 'KeyP': // Add 'P' key
  // Picture-in-picture
  player.requestPictureInPicture();
  break;
```

---

## 📈 Analytics & Monitoring

### View Usage

**Cloudinary Dashboard:**
- Storage used: Dashboard → Usage
- Bandwidth: Dashboard → Usage
- Top videos: Media Library → sort by views

**MongoDB Atlas:**
- Database size: Cluster → Metrics
- Connection count: Cluster → Metrics
- Query performance: Performance Advisor

**Render:**
- Server uptime: Service → Metrics
- Memory usage: Service → Metrics
- Response times: Service → Logs

### Set Up Alerts

**Cloudinary:**
- Settings → Usage → Set alerts at 80% of limits

**MongoDB Atlas:**
- Alerts → Create Alert → Storage/Bandwidth thresholds

**Render:**
- Settings → Notifications → Email on deploy failures

---

## 🔐 Security Best Practices

1. **Never commit `.env` file** - Use `.env.example` as template
2. **Rotate JWT_SECRET** periodically (invalidates all sessions)
3. **Use strong admin password** (12+ characters, mixed case, numbers, symbols)
4. **Whitelist IPs in MongoDB Atlas** if possible (0.0.0.0/0 for Render)
5. **Enable HTTPS** (Render provides free SSL)
6. **Set Cloudinary upload preset to "unsigned"** but restrict file types
7. **Monitor Cloudinary usage** to prevent abuse
8. **Backup MongoDB** regularly (Atlas free tier: 7-day retention)

---

## 🆘 Support

**Documentation:**
- Cloudinary: https://cloudinary.com/documentation
- MongoDB Atlas: https://www.mongodb.com/docs/atlas/
- Render: https://render.com/docs

**Issues:**
- Check server logs in Render dashboard
- Check browser console (F12)
- Check MongoDB Atlas logs
- Check Cloudinary Media Library

**Contact:**
- Create GitHub issue with error logs
- Include: Browser, OS, error message, steps to reproduce

---

## 📝 License

This project is for educational purposes. Videos and content are the property of their respective creators.

---

## 🎉 Success!

Your TeenagerPlaybook now has:
- ✅ Professional YouTube-style video player
- ✅ Permanent file storage (no more Render resets!)
- ✅ Keyboard shortcuts for power users
- ✅ Auto-generated video thumbnails
- ✅ Responsive design (mobile-friendly)
- ✅ Admin publishing workflow
- ✅ Scalable to thousands of users

**Next Steps:**
1. Upload your first video
2. Publish it to users
3. Test the video player
4. Enjoy persistent, professional video delivery! 🎬

---

**Created with ❤️ for TeenagerPlaybook**
