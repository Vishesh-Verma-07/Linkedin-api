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

const CONTACT_QUERY_ID = "voyagerIdentityDashProfiles.c7452e58fa37646d09dae4920fc5b4b9";
const PROFILE_ABOUT_QUERY_ID = "voyagerIdentityDashProfileCards.55af784c21dc8640b500ab5b45937064";
const EMPTY_CONTACT = {
  address: null,
  weChatContactInfo: null,
  phoneNumbers: null,
  emailAddress: null,
  websites: null,
  twitterHandles: null,
  birthDate: null,
  ims: null,
};

function pickContact(entry) {
  if (!entry || typeof entry !== "object") return { ...EMPTY_CONTACT };
  const pick = (k) => entry[k] ?? null;
  return {
    address: extractText(entry.address || entry.locationName || entry.multiLocaleAddress) || null,
    weChatContactInfo: pick("weChatContactInfo"),
    phoneNumbers: pick("phoneNumbers")?.map?.((p) => p?.phoneNumber?.number) ?? null,
    emailAddress: typeof pick("emailAddress") === "object" ? pick("emailAddress")?.emailAddress ?? null : pick("emailAddress"),
    websites: pick("websites")?.map?.((w) => ({ label: w?.label, url: w?.url })) ?? null,
    twitterHandles: pick("twitterHandles"),
    birthDate: pick("birthDate") ?? pick("birthDateOn"),
    ims: pick("ims"),
  };
}

async function fetchContactInfo(identifier) {
  const client = getClient();
  try {
    const endpoint = `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(identifier)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`;
    const raw = await client.get(endpoint);
    const included = Array.isArray(raw?.data?.included) ? raw.data.included : [];
    const entry =
      included.find((i) => i.entityUrn === `urn:li:fsd_profile:${identifier}`) ||
      included.find((i) => i.$type?.includes("Profile") && i.publicIdentifier === identifier) ||
      included[0];

    const contact = pickContact(entry);
    const hasAny = Object.values(contact).some(
      (x) => x !== null && !(Array.isArray(x) && x.length === 0)
    );
    if (hasAny) return contact;

    const gql = await client.get(
      `/voyager/api/graphql?includeWebMetadata=true&variables=(memberIdentity:${encodeURIComponent(identifier)})&queryId=${CONTACT_QUERY_ID}`
    );
    const inc = Array.isArray(gql?.data?.included) ? gql.data.included : [];
    const d = inc.find((i) => i?.entityUrn === `urn:li:fsd_profile:${identifier}`);
    return d ? pickContact(d) : { ...EMPTY_CONTACT };
  } catch (err) {
    console.error("fetchContactInfo error:", err.message);
    if (isAuthError(err)) {
      throw new Error(`LinkedIn authentication required (HTTP 302) -> ${err.response?.headers?.location || "redirect"}`);
    }
    return { ...EMPTY_CONTACT };
  }
}

async function fetchAboutSection(identifier) {
  const client = getClient();
  try {
    const endpoint = `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(identifier)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`;
    const raw = await client.get(endpoint);
    const included = Array.isArray(raw?.data?.included) ? raw.data.included : [];
    const entry =
      included.find((i) => i.entityUrn === `urn:li:fsd_profile:${identifier}`) ||
      included.find((i) => i.$type?.includes("Profile") && i.publicIdentifier === identifier) ||
      included[0];

    const summary = extractText(entry?.summary || entry?.multiLocaleSummary);
    if (summary) return summary;

    const gql = await client.get(
      `/voyager/api/graphql?variables=(profileUrn:urn%3Ali%3Afsd_profile%3A${identifier})&queryId=${PROFILE_ABOUT_QUERY_ID}`
    );
    for (const item of (gql?.data?.included) || []) {
      for (const c of item?.topComponents || []) {
        const t = c?.components?.textComponent?.text?.text;
        if (typeof t === "string" && t.trim()) return t;
      }
    }
    return null;
  } catch (err) {
    console.error("fetchAboutSection error:", err.message);
    if (isAuthError(err)) {
      throw new Error(`LinkedIn authentication required (HTTP 302) -> ${err.response?.headers?.location || "redirect"}`);
    }
    return null;
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
  const [raw, about, contactInfo, experiences, education, skills, certifications, languages] = await Promise.allSettled([
    fetchRawProfile(identifier),
    fetchAboutSection(identifier),
    fetchContactInfo(identifier),
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

  const results = [raw, about, contactInfo, experiences, education, skills, certifications, languages];
  for (const r of results) {
    if (r.status === "rejected" && isAuthError(r.reason)) {
      throw r.reason;
    }
  }

  const data = raw.status === "fulfilled" ? raw.value : {};

  if (about.status === "fulfilled") data.about = about.value && about.value !== "N/A" ? about.value : null;
  if (contactInfo.status === "fulfilled") data.contactInfo = contactInfo.value || {};
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
      about: data.about,
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
      contactInfo: data.contactInfo || {},
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

module.exports = { fetchRawProfile, fetchSection, fetchAboutSection, fetchContactInfo, fetchProfileData, buildResponse, getMe, mapSkill, mapEducation, mapCertification, mapLanguage, mapPosition };
