require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const axios = require("axios");
const { performLogin } = require("../scripts/login");

const app = express();
const PORT = process.env.PORT || 3001;

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

let JSESSIONID = process.env.LINKEDIN_JSESSIONID ? process.env.LINKEDIN_JSESSIONID.replace(/^ajax:/, "") : "";
let isInitialized = !!(process.env.LINKEDIN_LI_AT && process.env.LINKEDIN_JSESSIONID);

function buildClient(liAt, jsessionId) {
  return axios.create({
    baseURL: "https://www.linkedin.com",
    maxRedirects: 0,
    timeout: 15000,
    validateStatus: (status) => status >= 200 && status < 400,
    headers: {
      "accept-language": "en-US,en;q=0.9",
      accept: "application/vnd.linkedin.normalized+json+2.1",
      "csrf-token": `ajax:${jsessionId}`,
      priority: "u=1, i",
      referer: "https://www.linkedin.com/preload/?_bprMode=vanilla",
      "sec-ch-prefers-color-scheme": "light",
      "sec-ch-ua": '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
      "sec-ch-ua-mobile": "?0",
      "sec-fetch-dest": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "x-li-lang": "en_US",
      "x-li-track": '{"clientVersion":"1.13.45589","mpVersion":"1.13.45589","osName":"web","timezoneOffset":-300,"timezone":"America/New_York","deviceFormFactor":"DESKTOP","mpName":"voyager-web","displayDensity":1,"displayWidth":1920,"displayHeight":1080}',
      "x-restli-protocol-version": "2.0.0",
      cookie: `li_at=${liAt}; JSESSIONID="ajax:${jsessionId}"; bcookie="v=2&6da70f95-8c0f-4f89-87ea-cd5c05db113f"; lang=v=2&lang=en`,
    },
  });
}

let client = null;
if (isInitialized) {
  client = buildClient(process.env.LINKEDIN_LI_AT, JSESSIONID);
}

let isRefreshing = false;
let refreshQueue = [];

async function refreshSession() {
  if (isRefreshing) {
    return new Promise((resolve) => refreshQueue.push(resolve));
  }
  isRefreshing = true;
  console.log("Session expired. Re-authenticating...");

  try {
    const { liAt, jsessionId } = await performLogin({ headless: true });
    if (!liAt || !jsessionId) {
      throw new Error("Re-authentication did not produce valid cookies");
    }

    JSESSIONID = jsessionId;
    process.env.LINKEDIN_LI_AT = liAt;
    process.env.LINKEDIN_JSESSIONID = jsessionId;
    isInitialized = true;
    client = buildClient(liAt, jsessionId);
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

async function ensureInitialized() {
  if (!isInitialized || !client) {
    await refreshSession();
  }
}

function isAuthError(err) {
  return (
    err?.response?.status === 302 ||
    String(err?.message || "").includes("HTTP 302") ||
    String(err?.message || "").includes("authentication required")
  );
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
    const endpoint = `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(identifier)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`;
    const raw = await client.get(endpoint);
    const included = Array.isArray(raw?.data?.included) ? raw.data.included : [];
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
    console.error("fetchRawProfile error:", err.message);
    if (isAuthError(err)) {
      throw new Error(`LinkedIn authentication required (HTTP 302) -> ${err.response?.headers?.location || "redirect"}`);
    }
    return {};
  }
}

async function fetchSection(profileId, starredKey, mapper) {
  try {
    const urn = `urn:li:fsd_profile:${profileId}`;
    const endpoint = `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(profileId)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`;
    const raw = await client.get(endpoint);
    const included = Array.isArray(raw?.data?.included) ? raw.data.included : [];
    const profileEntry = included.find((i) => i.entityUrn === `urn:li:fsd_profile:${profileId}`) || included[0];
    if (!profileEntry) return [];

    const starredUrn = profileEntry[starredKey] || profileEntry[`*${starredKey}`];
    if (!starredUrn) return [];
    const shell = included.find((i) => i.entityUrn === starredUrn);
    if (!shell) return [];

    const elementsUrns = shell["*elements"] || shell.elements || [];
    const elements = elementsUrns.map((u) => included.find((i) => i.entityUrn === u)).filter(Boolean);
    return elements.map(mapper).filter(Boolean);
  } catch (err) {
    console.error(`fetchSection ${starredKey} error:`, err.message);
    if (isAuthError(err)) {
      throw new Error(`LinkedIn authentication required (HTTP 302) -> ${err.response?.headers?.location || "redirect"}`);
    }
    return [];
  }
}

function mapSkill(it) {
  return {
    name: extractText(it.name || it.multiLocaleName),
    entityUrn: it.entityUrn || null,
    endorsementCount: it.endorsementCount || it.numEndorsements || null,
  };
}

function mapEducation(it) {
  return {
    schoolName: extractText(it.schoolName || it.multiLocaleSchoolName),
    degreeName: extractText(it.degreeName || it.multiLocaleDegreeName),
    fieldOfStudy: extractText(it.fieldOfStudy || it.multiLocaleFieldOfStudy) || null,
    grade: extractText(it.grade || it.multiLocaleGrade) || null,
    activities: extractText(it.activities || it.multiLocaleActivities) || null,
    description: extractText(it.description || it.multiLocaleDescription) || null,
    schoolUrn: it.schoolUrn || null,
    timePeriod: parseTimePeriod(it.dateRange),
  };
}

function mapCertification(it) {
  return {
    name: extractText(it.name || it.multiLocaleName),
    authority: extractText(it.authority || it.multiLocaleAuthority) || null,
    licenseNumber: it.licenseNumber || null,
    displaySource: it.displaySource || null,
    url: it.url || null,
    companyUrn: it.companyUrn || null,
    timePeriod: parseTimePeriod(it.dateRange),
  };
}

function mapLanguage(it) {
  return {
    name: extractText(it.name || it.multiLocaleName),
    proficiency: it.proficiency || null,
    entityUrn: it.entityUrn || null,
  };
}

function mapPosition(pos) {
  return {
    title: extractText(pos.title || pos.multiLocaleTitle),
    companyName: extractText(pos.companyName || pos.multiLocaleCompanyName),
    companyUrn: pos.companyUrn || null,
    locationName: pos.locationName || pos.geoLocationName || null,
    geoUrn: pos.geoUrn || null,
    employmentTypeUrn: pos.employmentTypeUrn || null,
    entityUrn: pos.entityUrn || null,
    description: extractText(pos.description || pos.multiLocaleDescription) || null,
    timePeriod: parseTimePeriod(pos.dateRange),
  };
}

async function fetchProfileData(identifier) {
  const [raw, experiences, education, skills, certifications, languages] = await Promise.allSettled([
    fetchRawProfile(identifier),
    fetchSection(identifier, "profilePositionGroups", (grp) => {
      const nestedCol = grp["*profilePositionInPositionGroup"];
      const positions = nestedCol
        ? nestedCol.map((u) => ({ ...mapPosition(u), companyName: u.companyName || grp.companyName, companyUrn: u.companyUrn || grp.companyUrn }))
        : [];
      return {
        companyName: extractText(grp.companyName || grp.multiLocaleCompanyName),
        companyUrn: grp.companyUrn || null,
        entityUrn: grp.entityUrn || null,
        timePeriod: parseTimePeriod(grp.dateRange),
        positions: positions.length ? positions : null,
      };
    }),
    fetchSection(identifier, "profileEducations", mapEducation),
    fetchSection(identifier, "profileSkills", mapSkill),
    fetchSection(identifier, "profileCertifications", mapCertification),
    fetchSection(identifier, "profileLanguages", mapLanguage),
  ]);

  const results = [raw, experiences, education, skills, certifications, languages];
  for (const r of results) {
    if (r.status === "rejected" && isAuthError(r.reason)) {
      throw r.reason;
    }
  }

  const data = raw.status === "fulfilled" ? raw.value : {};

  if (experiences.status === "fulfilled") data.experiences = experiences.value || [];
  if (education.status === "fulfilled") data.education = education.value || [];
  if (skills.status === "fulfilled") data.skills = skills.value || [];
  if (certifications.status === "fulfilled") data.certifications = certifications.value || [];
  if (languages.status === "fulfilled") data.languages = languages.value || [];

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
      about: data.summary,
      summary: data.summary,
      occupation: data.occupation,
      avatarUrl: data.profilePicture,
      bannerUrl: data.backgroundPicture,
      followersCount: data.followersCount,
      connectionsCount: data.connectionsCount,
      experience: data.experiences || [],
      education: data.education || [],
      skills: data.skills || [],
      certifications: data.certifications || [],
      languages: data.languages || [],
      contactInfo: {},
    },
    meta: {
      fetchedAt: new Date().toISOString(),
      source: "linkedin-voyager-api-native",
      identifier,
    },
  };
}

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

async function getMe() {
  const res = await client.get("/voyager/api/me");
  const included = Array.isArray(res?.data?.included) ? res.data.included : [];
  const profile = included[0] || res.data;
  const nameOf = (field) => {
    const v = profile[field];
    if (!v) return null;
    if (typeof v === "string") return v;
    if (v.localized?.en_US) return v.localized.en_US;
    if (v.localized && typeof v.localized === "object") {
      const first = Object.values(v.localized)[0];
      if (typeof first === "string") return first;
    }
    return null;
  };
  const firstName = nameOf("firstName");
  const lastName = nameOf("lastName");
  return {
    publicIdentifier: profile.publicIdentifier || null,
    profileId: (profile.entityUrn || profile.dashEntityUrn || "").replace(/^urn:li:(fsd_)?profile:/, "") || null,
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" ") || null,
    headline: nameOf("headline"),
    occupation: nameOf("occupation"),
    vanityName: profile.vanityName || null,
  };
}

app.get("/api/me", async (req, res) => {
  try {
    await ensureInitialized();
    const profile = await getMe();
    res.json({ success: true, data: profile });
  } catch (error) {
    if (isAuthError(error)) {
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

    const slugMatch = url.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/);
    if (!slugMatch) {
      return res.status(400).json({ success: false, error: "Invalid LinkedIn profile URL" });
    }

    await ensureInitialized();

    const identifier = slugMatch[1];
    const profileData = await fetchProfileData(identifier);
    res.json(buildResponse(profileData, identifier));
  } catch (error) {
    if (isAuthError(error)) {
      try {
        await refreshSession();
        const { url } = req.query;
        const slugMatch = url.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/);
        const identifier = slugMatch[1];
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

    await ensureInitialized();

    const profileData = await fetchProfileData(id);
    res.json(buildResponse(profileData, id));
  } catch (error) {
    if (isAuthError(error)) {
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
  console.log(`LinkedIn API (native) server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
