require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { performLogin } = require("../scripts/login");
const {
  Client,
  extractProfileIdLinkedin,
  fetchFullProfileRaw,
  getUserMiniProfile,
  getProfileSectionAbout,
  getLinkedinExperiencesFlat,
  getLinkedinEducation,
  getLinkedinSkills,
  getLinkedinCertifications,
  getLinkedinLanguages,
  getContactInfo,
  getMe,
  LinkedInAuthRedirectError,
  LinkedInUnexpectedHtmlError,
} = require("@florydev/linkedin-api-voyager");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

if (!process.env.LINKEDIN_LI_AT || !process.env.LINKEDIN_JSESSIONID) {
  console.warn("WARNING: LINKEDIN_LI_AT / LINKEDIN_JSESSIONID not set. API calls will trigger auto-login. Starting anyway...");
} else {
  Client({
    li_at: process.env.LINKEDIN_LI_AT,
    JSESSIONID: process.env.LINKEDIN_JSESSIONID.replace(/^ajax:/, ""),
  });
}

let jsessionId = process.env.LINKEDIN_JSESSIONID ? process.env.LINKEDIN_JSESSIONID.replace(/^ajax:/, "") : "";
let isInitialized = !!(process.env.LINKEDIN_LI_AT && process.env.LINKEDIN_JSESSIONID);

let isRefreshing = false;
let refreshQueue = [];

async function refreshSession() {
  if (isRefreshing) {
    return new Promise((resolve) => refreshQueue.push(resolve));
  }
  isRefreshing = true;
  console.log("Session expired. Re-authenticating...");

  try {
    const { liAt, jsessionId: newJsessionId } = await performLogin({ headless: true });
    const newLiAt = liAt;

    if (!newLiAt || !newJsessionId) {
      throw new Error("Re-authentication did not produce valid cookies");
    }

    process.env.LINKEDIN_LI_AT = newLiAt;
    process.env.LINKEDIN_JSESSIONID = newJsessionId;
    jsessionId = newJsessionId;
    isInitialized = true;

    Client({ li_at: newLiAt, JSESSIONID: newJsessionId });
    console.log("Session refreshed successfully!");
  } catch (err) {
    console.error("Re-authentication failed:", err.message);
    throw err;
  } finally {
    isRefreshing = false;
    refreshQueue.forEach((r) => r());
    refreshQueue = [];
  }
}

function extractText(field) {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object") {
    for (const k of ["text", "sourceText", "localizedText", "value"]) {
      if (typeof field[k] === "string") return field[k];
    }
    for (const v of Object.values(field || {})) {
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return "";
}

function buildImageUrl(container) {
  if (!container || typeof container !== "object") return null;
  const paths = [
    "profilePicture.displayImageReference.vectorImage",
    "profilePicture.displayImage",
    "backgroundPicture.displayImageReference.vectorImage",
    "backgroundPicture.displayImage",
  ];
  for (const path of paths) {
    const parts = path.split(".");
    let obj = container;
    for (const p of parts) {
      obj = obj?.[p];
      if (!obj) break;
    }
    if (obj?.rootUrl && obj?.artifacts?.length) {
      const artifact = obj.artifacts
        .slice()
        .sort((a, b) => (b?.width || 0) - (a?.width || 0))[0];
      return artifact ? `${obj.rootUrl}${artifact.fileIdentifyingUrlPathSegment}` : null;
    }
  }
  return null;
}

function parseTimePeriod(tp) {
  if (!tp || typeof tp !== "object") return null;
  const s = tp.start || tp.startDate;
  const e = tp.end || tp.endDate;
  const parseDate = (d) => {
    if (!d || typeof d !== "object") return null;
    return { year: d.year || null, month: d.month || null, day: d.day || null };
  };
  return { start: parseDate(s), end: parseDate(e) };
}

async function fetchRawProfile(identifier) {
  try {
    const raw = await fetchFullProfileRaw(identifier);
    const included = Array.isArray(raw?.included) ? raw.included : [];
    const entry =
      included.find((i) => i.entityUrn === `urn:li:fsd_profile:${identifier}`) ||
      included.find((i) => i.$type?.includes("Profile") && i.publicIdentifier === identifier) ||
      included[0];

    if (!entry) return {};

    const geo = entry.address || entry.geoLocation;
    const location =
      extractText(entry.locationName || entry.multiLocaleLocation || geo?.defaultLocalizedName || geo?.localizedName) ||
      null;

    return {
      firstName: entry.firstName || null,
      lastName: entry.lastName || null,
      publicIdentifier: entry.publicIdentifier || identifier,
      profileId: entry.entityUrn?.replace("urn:li:fsd_profile:", "") || null,
      headline: extractText(entry.headline) || null,
      summary: extractText(entry.summary || entry.multiLocaleSummary) || null,
      occupation: extractText(entry.occupation) || null,
      location,
      countryCode: entry.location?.countryCode || entry.geoLocation?.countryCode || null,
      followersCount: entry.followersCount ?? null,
      connectionsCount: entry.connectionsCount ?? null,
      profilePicture: buildImageUrl(entry.profilePicture || entry),
      backgroundPicture: buildImageUrl(entry.backgroundPicture || entry),
    };
  } catch (err) {
    if (err instanceof LinkedInAuthRedirectError || err instanceof LinkedInUnexpectedHtmlError) {
      throw err;
    }
    console.error("fetchRawProfile error:", err.message);
    return {};
  }
}

async function fetchProfileData(identifier) {
  const [raw, about, experiences, education, skills, certifications, languages, contactInfo] =
    await Promise.allSettled([
      fetchRawProfile(identifier),
      getProfileSectionAbout(identifier),
      getLinkedinExperiencesFlat(identifier),
      getLinkedinEducation(identifier),
      getLinkedinSkills(identifier),
      getLinkedinCertifications(identifier),
      getLinkedinLanguages(identifier),
      getContactInfo(identifier),
    ]);

  const results = [raw, about, experiences, education, skills, certifications, languages, contactInfo];

  for (const r of results) {
    if (r.status === "rejected" && (r.reason instanceof LinkedInAuthRedirectError || r.reason instanceof LinkedInUnexpectedHtmlError)) {
      throw r.reason;
    }
  }

  const data = raw.status === "fulfilled" ? raw.value : {};

  if (about.status === "fulfilled") data.about = about.value && about.value !== "N/A" ? about.value : null;
  if (experiences.status === "fulfilled") data.experiences = experiences.value?.items || [];
  if (education.status === "fulfilled") data.education = education.value?.items || [];
  if (skills.status === "fulfilled") data.skills = skills.value?.items || [];
  if (certifications.status === "fulfilled") data.certifications = certifications.value?.items || [];
  if (languages.status === "fulfilled") data.languages = languages.value?.items || [];
  if (contactInfo.status === "fulfilled") data.contactInfo = contactInfo.value || {};

  return data;
}

function buildResponse(data, identifier) {
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ") || null;
  return {
    success: true,
    profile: {
      id: data.profileId ? `urn:li:fsd_profile:${data.profileId}` : null,
      publicIdentifier: data.publicIdentifier || identifier,
      name: { firstName: data.firstName, lastName: data.lastName, fullName },
      headline: data.headline,
      location: data.location,
      countryCode: data.countryCode,
      about: data.about,
      summary: data.summary,
      occupation: data.occupation,
      avatarUrl: data.profilePicture,
      bannerUrl: data.backgroundPicture,
      followersCount: data.followersCount,
      connectionsCount: data.connectionsCount,
      experience: data.experiences,
      education: data.education,
      skills: data.skills,
      certifications: data.certifications,
      languages: data.languages,
      contactInfo: data.contactInfo,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
      source: "linkedin-voyager-api",
      identifier,
    },
  };
}

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.get("/api/me", async (req, res) => {
  try {
    if (!isInitialized) {
      await refreshSession();
    }
    const profile = await getMe();
    res.json({ success: true, data: profile });
  } catch (error) {
    if (error instanceof LinkedInAuthRedirectError || error instanceof LinkedInUnexpectedHtmlError) {
      try {
        await refreshSession();
        const profile = await getMe();
        return res.json({ success: true, data: profile });
      } catch (retryErr) {
        console.error("/api/me retry failed:", retryErr.message);
        return res.status(401).json({ success: false, error: "LinkedIn authentication failed after refresh", message: retryErr.message });
      }
    }
    console.error("/api/me error:", error.message);
    res.status(500).json({ success: false, error: "Failed to fetch profile", message: error.message });
  }
});

app.get("/api/profile", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({
        success: false,
        error: "Missing required query parameter: url",
        example: "/api/profile?url=https://www.linkedin.com/in/username",
      });
    }

    if (!isInitialized) {
      await refreshSession();
    }

    let identifier;
    try {
      identifier = await extractProfileIdLinkedin(url);
    } catch (error) {
      if (error instanceof LinkedInAuthRedirectError || error instanceof LinkedInUnexpectedHtmlError) {
        throw error;
      }
      return res.status(400).json({ success: false, error: "Invalid LinkedIn profile URL", message: error.message });
    }

    const profileData = await fetchProfileData(identifier);
    res.json(buildResponse(profileData, identifier));
  } catch (error) {
    if (error instanceof LinkedInAuthRedirectError || error instanceof LinkedInUnexpectedHtmlError) {
      try {
        await refreshSession();
        const { url } = req.query;
        const identifier = await extractProfileIdLinkedin(url);
        const profileData = await fetchProfileData(identifier);
        return res.json(buildResponse(profileData, identifier));
      } catch (retryErr) {
        console.error("/api/profile retry failed:", retryErr.message);
        return res.status(401).json({ success: false, error: "LinkedIn authentication failed after refresh", message: retryErr.message });
      }
    }
    console.error("/api/profile error:", error.message);
    res.status(500).json({ success: false, error: "Failed to fetch profile data", message: error.message });
  }
});

app.get("/api/profile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Missing profile identifier",
        example: "/api/profile/username",
      });
    }

    if (!isInitialized) {
      await refreshSession();
    }

    const profileData = await fetchProfileData(id);
    res.json(buildResponse(profileData, id));
  } catch (error) {
    if (error instanceof LinkedInAuthRedirectError || error instanceof LinkedInUnexpectedHtmlError) {
      try {
        await refreshSession();
        const { id } = req.params;
        const profileData = await fetchProfileData(id);
        return res.json(buildResponse(profileData, id));
      } catch (retryErr) {
        console.error("/api/profile/:id retry failed:", retryErr.message);
        return res.status(401).json({ success: false, error: "LinkedIn authentication failed after refresh", message: retryErr.message });
      }
    }
    console.error("/api/profile/:id error:", error.message);
    res.status(500).json({ success: false, error: "Failed to fetch profile data", message: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Not found",
    availableEndpoints: [
      "GET /health",
      "GET /api/me",
      "GET /api/profile?url=<linkedin-profile-url>",
      "GET /api/profile/:id",
    ],
  });
});

app.listen(PORT, () => {
  console.log(`LinkedIn API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
