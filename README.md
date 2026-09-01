# LinkedIn Profile Scraper API

A REST API that accepts a LinkedIn profile URL and returns structured JSON data. Built by reverse-engineering LinkedIn's internal Voyager API — no browser automation or Puppeteer needed for requests.

**[Video Demo](https://drive.google.com/drive/folders/1W8QWRfgvCezrwW4T0W6s7MkyfSodIHsg?usp=drive_link)**

## How It Works

```
Client  --->  Express Server  --->  LinkedIn Voyager API
  ^              |                        |
  |              v                        v
  +---- JSON ----+--- Axios + Cookies ----+
```

1. On startup, the server loads your LinkedIn session cookies (`li_at` and `JSESSIONID`) from environment variables and creates an authenticated Axios client that mimics LinkedIn's web app headers.
2. When a profile request arrives, the server hits LinkedIn's internal `/voyager/api/identity/dash/profiles` endpoint with the target's public identifier.
3. The raw Voyager response is parsed and normalized into a clean JSON structure — extracting name, headline, experience, education, skills, certifications, contact info, and more from the deeply nested response.
4. If the session expires (HTTP 302), the server automatically re-authenticates using saved credentials and retries the request.

## Features

- **No browser per request** — direct HTTP calls to Voyager API
- **Comprehensive data** — name, headline, location, about, experience, education, skills, certifications, languages, projects, patents, publications, honors, courses, volunteer work, test scores, organizations, contact info, and profile images
- **Auto session refresh** — re-authenticates automatically when cookies expire
- **Rate limited** — 20 requests/minute built-in
- **Production ready** — Docker support, Railway/Render/Fly.io configs included

## Project Structure

```
linkedin-api/
├── src/
│   ├── index.js          # Entry point — Express app setup
│   ├── middleware.js      # Helmet, CORS, rate limiting
│   ├── routes.js         # API route definitions
│   ├── client.js         # Axios client + session management
│   ├── fetchers.js       # Voyager API calls + response parsing
│   └── utils/
│       └── parse.js      # Text extraction, image URL building, date parsing
├── scripts/
│   └── login.js          # Browser-based login helper (saves cookies to .env)
├── public/
│   └── index.html        # Landing page served at root
├── Dockerfile            # Docker build config
├── railway.json          # Railway deployment config
├── render.yaml           # Render deployment config
└── deploy.ps1            # PowerShell deployment helper
```

## Setup

### Prerequisites

- Node.js >= 18
- A LinkedIn account

### 1. Install dependencies

```bash
npm install
```

### 2. Get LinkedIn credentials

**Option A — Automatic (recommended):**

Set your LinkedIn email and password, then run the login helper:

```bash
# Set credentials in .env or as environment variables
export LINKEDIN_EMAIL=your_email
export LINKEDIN_PASSWORD=your_password

npm run login
```

This opens a browser, logs in, captures session cookies, and saves them to `.env`.

**Option B — Manual:**

1. Log in to LinkedIn in your browser
2. Press `F12` → Application → Cookies → `https://www.linkedin.com`
3. Copy the `li_at` and `JSESSIONID` values
4. Create a `.env` file:

```
LINKEDIN_LI_AT=your_li_at_value
LINKEDIN_JSESSIONID=your_jsessionid_value
```

### 3. Start the server

```bash
npm start
```

### 4. Test it

```bash
curl "http://localhost:3000/api/profile?url=https://www.linkedin.com/in/satyanadella"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LINKEDIN_LI_AT` | Yes | LinkedIn `li_at` session cookie |
| `LINKEDIN_JSESSIONID` | Yes | LinkedIn `JSESSIONID` cookie (numeric part only) |
| `LINKEDIN_EMAIL` | No | LinkedIn email — needed only for auto-login (`npm run login`) |
| `LINKEDIN_PASSWORD` | No | LinkedIn password — needed only for auto-login |
| `PORT` | No | Server port (default: `3001`) |
| `NODE_ENV` | No | `development` or `production` |

## API Endpoints

### `GET /health`

Health check.

```json
{ "status": "ok", "timestamp": "2026-08-30T12:00:00.000Z" }
```

### `GET /api/me`

Returns the authenticated user's own profile.

```json
{
  "success": true,
  "data": {
    "publicIdentifier": "username",
    "firstName": "John",
    "lastName": "Doe",
    "fullName": "John Doe",
    "headline": "Software Engineer"
  }
}
```

### `GET /api/profile?url=<linkedin-url>`

Fetches a profile by LinkedIn URL.

```
/api/profile?url=https://www.linkedin.com/in/satyanadella
```

### `GET /api/profile/:id`

Fetches a profile by public identifier.

```
/api/profile/satyanadella
```

**Response schema** (both profile endpoints return this):

```json
{
  "success": true,
  "profile": {
    "id": "urn:li:fsd_profile:...",
    "publicIdentifier": "satyanadella",
    "name": { "firstName": "Satya", "lastName": "Nadella", "fullName": "Satya Nadella" },
    "headline": "Chairman and CEO at Microsoft",
    "location": "Redmond, Washington, United States",
    "countryCode": "US",
    "about": "...",
    "avatarUrl": "https://media.licdn.com/dms/image/...",
    "bannerUrl": "https://media.licdn.com/dms/image/...",
    "followersCount": 12345678,
    "connectionsCount": "500+",
    "experience": [{ "title": "...", "companyName": "...", "timePeriod": {...} }],
    "education": [{ "schoolName": "...", "degreeName": "...", "fieldOfStudy": "..." }],
    "skills": [{ "name": "Cloud Computing", "endorsementCount": 99 }],
    "certifications": [{ "name": "...", "authority": "..." }],
    "languages": [{ "name": "English", "proficiency": "NATIVE_OR_BILINGUAL" }],
    "projects": [],
    "patents": [],
    "publications": [],
    "honors": [],
    "courses": [],
    "volunteer": [],
    "testScores": [],
    "organizations": [],
    "contactInfo": {
      "emailAddress": "...",
      "phoneNumbers": ["..."],
      "websites": [{ "label": "...", "url": "..." }],
      "twitterHandles": [...]
    }
  },
  "meta": {
    "fetchedAt": "2026-08-30T12:00:00.000Z",
    "source": "linkedin-voyager-api-native",
    "identifier": "satyanadella"
  }
}
```

## Deployment

### Railway (Recommended)

```bash
npm i -g @railway/cli
railway login
railway init
railway variables set LINKEDIN_LI_AT="your_li_at"
railway variables set LINKEDIN_JSESSIONID="your_jsessionid"
railway up
```

Or push to GitHub and connect the repo at [railway.app/new](https://railway.app/new).

### Render

1. Create a new **Web Service** at [render.com/dashboard](https://dashboard.render.com)
2. Connect your GitHub repo
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables in the dashboard

### Fly.io

```bash
fly launch --no-deploy
fly secrets set LINKEDIN_LI_AT="your_li_at" LINKEDIN_JSESSIONID="your_jsessionid"
fly deploy
```

### Docker

```bash
docker build -t linkedin-api .
docker run -p 3000:3000 \
  -e LINKEDIN_LI_AT=your_li_at \
  -e LINKEDIN_JSESSIONID=your_jsessionid \
  linkedin-api
```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the API server |


## Important Notes

- **Session cookies expire.** The server auto-refreshes using saved credentials, but you need `LINKEDIN_EMAIL` and `LINKEDIN_PASSWORD` set for that to work. Without them, you'll need to re-run `npm run login` manually when cookies expire.
- **Rate limiting** is set to 20 requests/minute. Exceeding this will trigger a `429` response.
- **LinkedIn may block accounts** that make unusual API traffic. Use responsibly and avoid high-volume scraping.

## Disclaimer

This project uses LinkedIn's internal Voyager API, which is not officially documented or supported by LinkedIn. Use at your own risk. Excessive or improper use may result in account restrictions.

## License

MIT
