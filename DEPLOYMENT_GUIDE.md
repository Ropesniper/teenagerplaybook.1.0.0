# 🚀 Complete Deployment Guide - Data Persistence & Video Uploads

## Problem Statement
Your Render deployment was losing files on every restart because Render's free tier has **ephemeral storage** — the filesystem resets with each deploy or restart. This guide fixes:
1. ✅ **Persistent file storage** using Cloudinary (free tier: 25GB, video support)
2. ✅ **YouTube-like video upload interface** in admin panel
3. ✅ **Database persistence** (already working via MongoDB Atlas)
4. ✅ **Environment variables** properly configured

---

## 📦 Solution Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    RENDER WEB SERVICE                        │
│  • Ephemeral filesystem (resets on restart)                 │
│  • Only code lives here                                      │
│  • Environment variables configured in Render dashboard      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   MONGODB ATLAS (FREE)                       │
│  • Persistent database storage                              │
│  • Users, History, Polls, Notes, PublishedFiles            │
│  • 512MB free tier                                           │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   CLOUDINARY (FREE)                          │
│  • Persistent video/file storage                            │
│  • 25GB storage, 25GB bandwidth/month                        │
│  • Video transcoding & streaming                             │
│  • CDN delivery worldwide                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Step 1: Set Up Cloudinary

### 1.1 Create Free Account
1. Go to https://cloudinary.com/users/register_free
2. Sign up with email
3. After signup, you'll see your dashboard

### 1.2 Get Your Credentials
From dashboard (https://console.cloudinary.com/console):
- **Cloud Name**: `dxxxxxxxx` (top of dashboard)
- **API Key**: `123456789012345` (under Account Details)
- **API Secret**: `abcdefghijklmnopqrstuvwxyz` (click "reveal" to see)

### 1.3 Configure Upload Preset (for unsigned uploads from admin panel)
1. Go to Settings → Upload → Upload presets
2. Click "Add upload preset"
3. Configure:
   - **Preset name**: `teenager_playbook_videos`
   - **Signing mode**: Unsigned
   - **Folder**: `teenagerplaybook/videos`
   - **Resource type**: Auto
   - **Allowed formats**: mp4,webm,mov,avi,mkv,pdf,jpg,png,gif
   - **Max file size**: 100 MB (or your preference)
4. Save

---

## 🔧 Step 2: Update Render Environment Variables

Go to your Render dashboard → Your service → Environment

Add these NEW variables:

```env
# Cloudinary credentials
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
CLOUDINARY_UPLOAD_PRESET=teenager_playbook_videos
```

Your existing variables should remain:
```env
MONGO_URI=mongodb+srv://...
JWT_SECRET=your_secret_here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_password
ADMIN_EMAIL=your_email@example.com
PORT=10000
NODE_ENV=production
```

**Save** and Render will auto-redeploy.

---

## 🔧 Step 3: Update server/package.json

Add Cloudinary SDK:

```json
{
  "name": "teenagerplaybook-server",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mongoose": "^8.0.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "dotenv": "^16.3.1",
    "cloudinary": "^2.0.0",
    "multer-storage-cloudinary": "^4.0.0"
  }
}
```

---

## 🔧 Step 4: Deploy Updated Files

The following files have been updated:
- ✅ `server/server.js` - Cloudinary integration
- ✅ `admin.html` - YouTube-like video library UI
- ✅ `dashboard.html` - Video player with Cloudinary URLs
- ✅ `js/file-library.js` - Updated to handle Cloudinary URLs

### Deploy to Render:

```bash
# In your local project directory
git add .
git commit -m "Add persistent video storage with Cloudinary"
git push origin main
```

Render will automatically deploy (watch the logs in Render dashboard).

---

## 🎬 Step 5: Using the Video Upload System

### Admin Panel Features:

1. **Upload Videos**:
   - Go to Admin Panel → File Library tab
   - Click "Upload File" button
   - Select video file (MP4, WebM, MOV, etc.)
   - Upload progress shown
   - Videos automatically saved to Cloudinary

2. **Video Library** (YouTube-like interface):
   - Grid layout with video thumbnails
   - Each video shows:
     - Thumbnail preview
     - Filename
     - File size
     - Duration (auto-detected)
     - Upload date
   - Click thumbnail to preview
   - Delete button for each video

3. **Publish Videos to Users**:
   - Select video from library
   - Click "Publish" button
   - Set visibility:
     - **Everyone**: All logged-in users see it
     - **Specific users**: Only selected users
   - Add label and description
   - Users see it on their Dashboard

### User Dashboard Features:

- Videos appear in "Published Resources" section
- Click to play in-browser
- Responsive video player
- Works on mobile/tablet/desktop

---

## 🔒 Data Persistence Guarantees

| Data Type | Storage Location | Persistence | Free Tier Limit |
|-----------|-----------------|-------------|-----------------|
| User accounts, login data | MongoDB Atlas | ✅ Permanent | 512 MB |
| Quiz history, scores | MongoDB Atlas | ✅ Permanent | 512 MB |
| Polls, votes | MongoDB Atlas | ✅ Permanent | 512 MB |
| Notes, messages | MongoDB Atlas | ✅ Permanent | 512 MB |
| Videos, files | Cloudinary | ✅ Permanent | 25 GB storage, 25 GB bandwidth/month |
| Server code | GitHub + Render | ✅ Permanent | Unlimited |

**What resets on Render restart:**
- ❌ Local `/files/` directory (now unused)
- ✅ Everything else persists

---

## 🧪 Testing Checklist

After deployment:

- [ ] Upload a video via Admin Panel
- [ ] Verify video appears in library with thumbnail
- [ ] Publish video to all users
- [ ] Login as regular user, check Dashboard
- [ ] Play video - should stream from Cloudinary
- [ ] Restart Render service (Settings → Manual Deploy)
- [ ] Verify video still appears after restart ✅
- [ ] Check MongoDB Atlas - user data intact ✅
- [ ] Upload another file - should work ✅

---

## 📊 Monitoring & Maintenance

### Check Storage Usage:

**MongoDB Atlas:**
- Dashboard → Your cluster → Metrics
- Monitor storage usage (free tier: 512 MB)

**Cloudinary:**
- Console → Dashboard
- Monitor: Storage used, Bandwidth, Transformations
- Free tier: 25 GB storage, 25 GB bandwidth/month

**Render:**
- Dashboard → Your service → Metrics
- Monitor: CPU, Memory, Response time
- Free tier: 750 hours/month (enough for 24/7)

### Troubleshooting:

**Videos not uploading:**
1. Check Cloudinary credentials in Render env vars
2. Check browser console for errors
3. Verify upload preset is "unsigned"

**Videos disappear after restart:**
1. Files uploaded to local `/files/` directory (old system) WILL disappear
2. Files uploaded via new Cloudinary system persist forever
3. Check admin panel - only Cloudinary-hosted files show thumbnails

**Database errors:**
1. Check MongoDB Atlas - cluster running?
2. Check connection string in Render env vars
3. Whitelist IP: 0.0.0.0/0 in Atlas Network Access

---

## 🎯 Migration from Old System

If you have existing files in local `/files/` directory:

1. **Before Render restart:**
   - Download all files via admin panel
   - Save locally

2. **After Cloudinary setup:**
   - Re-upload files via new admin panel
   - They'll be saved to Cloudinary permanently

3. **Update Published Files:**
   - Admin panel → Published Files tab
   - Re-publish files that were lost
   - Users will see them again

---

## 💡 Best Practices

1. **Video Formats:**
   - Use MP4 (H.264) for best compatibility
   - Keep videos under 50 MB for free tier
   - Cloudinary auto-transcodes to optimal format

2. **File Organization:**
   - All files stored in `teenagerplaybook/videos/` folder in Cloudinary
   - Use descriptive filenames
   - Add labels/descriptions when publishing

3. **Bandwidth Management:**
   - Free tier: 25 GB/month bandwidth
   - ~500 video views (50 MB each)
   - Monitor usage in Cloudinary dashboard
   - Consider upgrading if needed ($0.10/GB over limit)

4. **Backups:**
   - MongoDB Atlas: Auto-backup enabled (7-day retention)
   - Cloudinary: Files persist forever (unless manually deleted)
   - Code: GitHub repository

---

## 🚨 Emergency Recovery

If something breaks:

1. **Server won't start:**
   - Check Render logs
   - Verify all env vars set correctly
   - Check MongoDB Atlas cluster running

2. **Files missing:**
   - Old local files: Gone (ephemeral storage)
   - Cloudinary files: Check Cloudinary console
   - Database records: Check MongoDB Atlas

3. **Users can't login:**
   - Check JWT_SECRET env var
   - Check MongoDB connection
   - Clear browser cookies

4. **Admin panel errors:**
   - Check browser console
   - Verify admin credentials
   - Check server logs in Render

---

## 📞 Support Resources

- **Render Docs**: https://render.com/docs
- **MongoDB Atlas**: https://www.mongodb.com/docs/atlas/
- **Cloudinary Docs**: https://cloudinary.com/documentation
- **This Project**: Check DEVELOPER.md for code details

---

## ✅ Success Criteria

You'll know it's working when:
1. ✅ Upload video via admin panel
2. ✅ See video in library with thumbnail
3. ✅ Publish video to users
4. ✅ Users see and play video on dashboard
5. ✅ Restart Render service
6. ✅ Video still works after restart
7. ✅ All user data intact
8. ✅ No "file not found" errors

**The system is now production-ready with full data persistence!** 🎉
