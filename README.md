# LinkedIn API - Reverse Engineered Profile Scraper

A hosted REST API that accepts a LinkedIn profile URL and returns structured JSON with profile information. Built by reverse-engineering LinkedIn's internal Voyager API.

## Features

- **No browser required** - directly hits LinkedIn Voyager endpoints
- **Comprehensive data** - name, headline, location, about, experience, education, skills, certifications, languages, contact info, and profile images
- **Simple REST API** - GET requests with clean JSON responses
- **Rate limited** - built-in protection to avoid account restrictions
- **Production ready** - designed for deployment on Railway, Render, Fly.io, or any Node.js host

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Get LinkedIn credentials**

   Option A - Login helper (uses stealth browser):
   ```bash
   npm run login
   ```

   Option B - Manual (most reliable):
   1. Open LinkedIn in your browser and log in
   2. Press `F12` → Application → Cookies → `https://www.linkedin.com`
   3. Copy the values for `li_at` and `JSESSIONID`
   4. Create `.env` file:
      ```
      LINKEDIN_LI_AT=your_li_at_value
      LINKEDIN_JSESSIONID=your_jsessionid_value
      ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Test the API**
   ```bash
   curl "http://localhost:3000/api/profile?url=https://www.linkedin.com/in/satyanadella"
   ```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LINKEDIN_LI_AT` | LinkedIn session cookie (`li_at`) - auto-filled by login script |
| `LINKEDIN_JSESSIONID` | LinkedIn session cookie (`JSESSIONID`) - auto-filled by login script |
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Environment (development/production) |

## API Endpoints

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-08-30T12:00:00.000Z"
}
```

### GET /api/me
Returns the authenticated user's own profile.

**Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

### GET /api/profile?url=<linkedin-url>
Fetches a profile by URL.

**Example:**
```
/api/profile?url=https://www.linkedin.com/in/satyanadella
```

**Response Schema:**
```json
{
  "success": true,
  "profile": {
    "id": "urn:li:person:...",
    "publicIdentifier": "satyanadella",
    "name": {
      "firstName": "Satya",
      "lastName": "Nadella",
      "fullName": "Satya Nadella"
    },
    "headline": "Chairman and CEO at Microsoft",
    "location": "Redmond, Washington, United States",
    "countryCode": "US",
    "about": "...",
    "summary": "...",
    "occupation": "...",
    "currentPosition": { ... },
    "avatarUrl": "https://media.licdn.com/dms/image/...",
    "bannerUrl": "https://media.licdn.com/dms/image/...",
    "followersCount": 12345678,
    "connectionsCount": "500+",
    "experience": [
      {
        "title": "Chairman and CEO",
        "companyName": "Microsoft",
        "startTime": "2014-02-01T00:00:00Z",
        "endTime": null,
        "location": "Redmond, WA",
        "employmentType": "fullTime",
        "description": "..."
      }
    ],
    "education": [
      {
        "schoolName": "University of Wisconsin-Milwaukee",
        "degree": "MBA",
        "fieldOfStudy": "...",
        "startTime": "...",
        "endTime": "..."
      }
    ],
    "skills": [
      { "name": "Cloud Computing" },
      { "name": "Strategy" }
    ],
    "certifications": [
      {
        "title": "Certification Name",
        "authority": "Issuing Organization",
        "startTime": "...",
        "endTime": "..."
      }
    ],
    "languages": [
      { "name": "English", "proficiency": "NATIVE_OR_BILINGUAL" }
    ],
    "contactInfo": {
      "emailAddress": "...",
      "phoneNumbers": [...],
      "websites": [...],
      "twitter": "..."
    }
  },
  "meta": {
    "fetchedAt": "2026-08-30T12:00:00.000Z",
    "source": "linkedin-voyager-api",
    "identifier": "satyanadella"
  }
}
```

### GET /api/profile/:id
Fetches a profile by public identifier (the part after `linkedin.com/in/`).

**Example:**
```
/api/profile/satyanadella
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LINKEDIN_LI_AT` | LinkedIn session cookie (`li_at`) |
| `LINKEDIN_JSESSIONID` | LinkedIn session cookie (`JSESSIONID`) |
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Environment (development/production) |

## Getting LinkedIn Credentials

Use the built-in login helper instead of manually copying cookies:

```bash
npm run login
```

This opens a browser, lets you log in to LinkedIn, and automatically saves your session to `.env`.

## Deployment

### Railway (Recommended)

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Initialize project: `railway init`
4. Set environment variables:
   ```bash
   railway variables set LINKEDIN_LI_AT="your_li_at"
   railway variables set LINKEDIN_JSESSIONID="your_jsessionid"
   ```
5. Deploy: `railway up`

### Render

1. Create a new **Web Service** on Render
2. Connect your Git repository
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables in the Render dashboard

### Fly.io

```bash
fly launch
fly secrets set LINKEDIN_LI_AT="your_li_at" LINKEDIN_JSESSIONID="your_jsessionid"
fly deploy
```

## Rate Limiting

The API includes built-in rate limiting (20 requests/minute). Excessive use may trigger LinkedIn's anti-bot defenses. Use responsibly.

## Disclaimer

This project uses LinkedIn's internal Voyager API, which is not officially documented or supported by LinkedIn. Use at your own risk. Excessive or improper use may result in account restrictions.
