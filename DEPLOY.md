# Deployment Guide

Deploy the LinkedIn API server to a public HTTPS endpoint.

## Option 1: Railway (Recommended)

Railway offers a free tier with automatic HTTPS.

### Prerequisites
- A Railway account (sign up at [railway.app](https://railway.app))
- Your LinkedIn `li_at` and `JSESSIONID` cookies

### Steps

1. **Push code to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/linkedin-api.git
   git push -u origin main
   ```

2. **Create new project on Railway**
   - Go to [railway.app/new](https://railway.app/new)
   - Select "Deploy from GitHub repo"
   - Select your `linkedin-api` repository
   - Railway will auto-detect Node.js and deploy

3. **Set environment variables**
   In Railway dashboard → your service → Variables:
   ```
   LINKEDIN_LI_AT=your_li_at_cookie
   LINKEDIN_JSESSIONID=your_jsessionid_cookie
   NODE_ENV=production
   ```

4. **Get your public URL**
   Railway provides a public HTTPS URL like `https://linkedin-api-production.up.railway.app`

## Option 2: Render

### Prerequisites
- A Render account (sign up at [render.com](https://render.com))

### Steps

1. **Push code to GitHub** (same as above)

2. **Create new Web Service**
   - Go to [render.com/dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Set:
     - **Name**: `linkedin-api`
     - **Environment**: `Node`
     - **Build Command**: `npm install && npx patchright install chromium && npx patchright install-deps chromium`
     - **Start Command**: `npm start`

3. **Set environment variables**
   In Render dashboard → your service → Environment (all four are required for auto-refresh to work):
   ```
   LINKEDIN_EMAIL=your_linkedin_email
   LINKEDIN_PASSWORD=your_linkedin_password
   LINKEDIN_LI_AT=your_li_at_cookie
   LINKEDIN_JSESSIONID=your_jsessionid_cookie
   NODE_ENV=production
   ```

4. **Deploy**
   Render will build and deploy automatically. Your URL will be `https://linkedin-api.onrender.com`

## Option 3: Fly.io

### Prerequisites
- A Fly.io account (sign up at [fly.io](https://fly.io))
- Fly CLI installed

### Steps

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Initialize and deploy**
   ```bash
   fly launch --no-deploy
   fly secrets set LINKEDIN_LI_AT=your_li_at_cookie
   fly secrets set LINKEDIN_JSESSIONID=your_jsessionid_cookie
   fly deploy
   ```

3. **Get your URL**
   ```bash
   fly status
   ```
   Your URL will be `https://linkedin-api.fly.dev`

## Option 4: Docker

Deploy to any container platform (AWS ECS, Google Cloud Run, Azure Container Apps, etc.)

### Build and run locally
```bash
docker build -t linkedin-api .
docker run -p 3000:3000 \
  -e LINKEDIN_LI_AT=your_li_at_cookie \
  -e LINKEDIN_JSESSIONID=your_jsessionid_cookie \
  linkedin-api
```

## Getting LinkedIn Credentials

1. Log in to LinkedIn in your browser
2. Open DevTools (F12) → Application tab → Cookies
3. Select `https://www.linkedin.com`
4. Copy values for:
   - `li_at` - your main session cookie (long string starting with `AQED...`)
   - `JSESSIONID` - your session ID (format: `ajax:1234567890`, use just the numeric part)

## API Usage

Once deployed, test the API:

```bash
# Health check
curl https://your-app-url.com/health

# Fetch profile by URL
curl "https://your-app-url.com/api/profile?url=https://www.linkedin.com/in/satyanadella"

# Fetch profile by ID
curl "https://your-app-url.com/api/profile/satyanadella"

# Get authenticated user's own profile
curl https://your-app-url.com/api/me
```

## Rate Limiting

The API includes built-in rate limiting (20 requests/minute). Excessive use may trigger LinkedIn's anti-bot defenses. Use responsibly.
