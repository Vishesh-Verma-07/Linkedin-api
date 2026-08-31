const { state, isAuthError, getClient } = require("./client");
const { extractText, buildImageUrl, parseTimePeriod } = require("./utils/parse");

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

async function fetchRawProfile(identifier) {
  const client = getClient();
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
  const client = getClient();
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

async function getMe() {
  const client = getClient();
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

module.exports = { fetchRawProfile, fetchSection, fetchProfileData, buildResponse, getMe, mapSkill, mapEducation, mapCertification, mapLanguage, mapPosition };
