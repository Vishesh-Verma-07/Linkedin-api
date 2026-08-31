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

function mapProject(it) {
  return {
    title: extractText(it.title || it.multiLocaleTitle),
    description: extractText(it.description || it.multiLocaleDescription) || null,
    timePeriod: parseTimePeriod(it.dateRange),
    url: it.url || null,
    contributors: it.contributors || null,
    entityUrn: it.entityUrn || null,
  };
}

function parseSimpleDate(d) {
  if (!d) return null;
  if (typeof d !== "object") return d;
  return { year: d.year || null, month: d.month || null, day: d.day || null };
}

function mapVolunteer(it) {
  return {
    role: extractText(it.role || it.title || it.multiLocaleTitle || it.multiLocaleRole),
    organization: extractText(it.organizationName || it.companyName || it.multiLocaleOrganizationName),
    cause: extractText(it.cause || it.multiLocaleCause) || null,
    description: extractText(it.description || it.multiLocaleDescription) || null,
    timePeriod: parseTimePeriod(it.dateRange || it.timePeriod),
    entityUrn: it.entityUrn || null,
  };
}

function mapHonor(it) {
  return {
    title: extractText(it.title || it.name || it.multiLocaleTitle || it.multiLocaleName),
    issuer: extractText(it.issuer || it.presenter || it.multiLocaleIssuer) || null,
    description: extractText(it.description || it.multiLocaleDescription) || null,
    issueDate: parseTimePeriod(it.dateRange || it.issueDate)?.start || null,
    entityUrn: it.entityUrn || null,
  };
}

function mapCourse(it) {
  return {
    name: extractText(it.name || it.title || it.multiLocaleName),
    number: it.number || it.courseNumber || null,
    entityUrn: it.entityUrn || null,
  };
}

function mapOrganization(it) {
  return {
    name: extractText(it.name || it.title || it.multiLocaleName),
    position: extractText(it.position || it.role || it.multiLocalePosition) || null,
    description: extractText(it.description || it.multiLocaleDescription) || null,
    timePeriod: parseTimePeriod(it.dateRange || it.timePeriod),
    entityUrn: it.entityUrn || null,
  };
}

function mapPublication(it) {
  return {
    name: extractText(it.name || it.title || it.multiLocaleName || it.multiLocaleTitle),
    publisher: extractText(it.publisher || it.multiLocalePublisher) || null,
    description: extractText(it.description || it.multiLocaleDescription) || null,
    url: it.url || null,
    timePeriod: parseTimePeriod(it.dateRange || it.publishedOn),
    authors: it.authors || null,
    entityUrn: it.entityUrn || null,
  };
}

function mapPatent(it) {
  return {
    title: extractText(it.title || it.name || it.multiLocaleTitle || it.multiLocaleName),
    issuer: extractText(it.issuingAuthority || it.issuer || it.multiLocaleIssuingAuthority) || null,
    patentNumber: it.patentNumber || it.number || null,
    description: extractText(it.description || it.multiLocaleDescription) || null,
    url: it.url || null,
    issueDate: parseTimePeriod(it.dateRange || it.issueDate)?.start || null,
    entityUrn: it.entityUrn || null,
  };
}

function mapTestScore(it) {
  return {
    name: extractText(it.name || it.title || it.multiLocaleName || it.multiLocaleTitle),
    score: extractText(it.score || it.multiLocaleScore) || null,
    description: extractText(it.description || it.multiLocaleDescription) || null,
    timePeriod: parseTimePeriod(it.dateRange || it.issuedOn),
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
      geoUrn: entry.geoUrn || entry.address?.geoUrn || entry.geoLocation?.geoUrn || null,
      countryCode: entry.location?.countryCode || entry.geoLocation?.countryCode || null,
      industryName: extractText(entry.industryName || entry.multiLocaleIndustryName) || null,
      companyName: extractText(entry.companyName || entry.multiLocaleCompanyName) || null,
      schoolName: extractText(entry.schoolName || entry.multiLocaleSchoolName) || null,
      followersCount: entry.followersCount ?? null,
      connectionsCount: entry.connectionsCount ?? null,
      experienceCount: entry.experienceCount ?? null,
      educationCount: entry.educationCount ?? null,
      certificationsCount: entry.certificationsCount ?? null,
      projectsCount: entry.projectsCount ?? null,
      skillsCount: entry.skillsCount ?? null,
      languagesCount: entry.languagesCount ?? null,
      interestsCount: entry.interestsCount ?? null,
      versionTag: entry.versionTag || null,
      profilePicture: buildImageUrl(entry, "profilePicture"),
      backgroundPicture: buildImageUrl(entry, "backgroundPicture"),
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
    birthDate: parseSimpleDate(pick("birthDate") ?? pick("birthDateOn")),
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

function resolveIncludedItems(included, urns) {
  if (!Array.isArray(urns)) return [];
  return urns
    .map((u) => (typeof u === "string" ? included.find((i) => i.entityUrn === u) : u))
    .filter((x) => x && typeof x === "object");
}

async function fetchSection(profileId, starredKey, mapper) {
  const client = getClient();
  try {
    const endpoint = `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(profileId)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`;
    const raw = await client.get(endpoint);
    const included = Array.isArray(raw?.data?.included) ? raw.data.included : [];
    const profileEntry =
      included.find((i) => i.$type?.includes("Profile") && i.publicIdentifier === profileId) ||
      included.find((i) => i.entityUrn === `urn:li:fsd_profile:${profileId}`) ||
      included[0];
    if (!profileEntry) return [];

    const starredUrn = profileEntry[starredKey] || profileEntry[`*${starredKey}`];
    if (!starredUrn) return [];
    const shell = included.find((i) => i.entityUrn === starredUrn);
    if (!shell) return [];

    const rawElements = shell["*elements"] ?? shell["elements"] ?? shell.components?.elements ?? [];
    const elements = resolveIncludedItems(included, rawElements);
    return elements.map(mapper).filter(Boolean);
  } catch (err) {
    console.error(`fetchSection ${starredKey} error:`, err.message, "| status:", err?.response?.status, "| code:", err?.code);
    if (isAuthError(err)) {
      throw new Error(`LinkedIn authentication required (HTTP 302) -> ${err.response?.headers?.location || "redirect"}`);
    }
    return [];
  }
}

async function fetchExperiences(identifier) {
  const client = getClient();
  try {
    const endpoint = `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(identifier)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`;
    const raw = await client.get(endpoint);
    const included = Array.isArray(raw?.data?.included) ? raw.data.included : [];
    const profileEntry =
      included.find((i) => i.$type?.includes("Profile") && i.publicIdentifier === identifier) ||
      included[0];
    if (!profileEntry) return [];

    const starredUrn = profileEntry["*profilePositionGroups"] || profileEntry["profilePositionGroups"];
    if (!starredUrn) return [];
    const shell = included.find((i) => i.entityUrn === starredUrn);
    if (!shell) return [];

    const groups = resolveIncludedItems(included, shell["*elements"] ?? shell["elements"] ?? []);
    const flat = [];
    for (const grp of groups) {
      const nestedUrn = grp["*profilePositionInPositionGroup"];
      const nestedShell = nestedUrn && included.find((i) => i.entityUrn === nestedUrn);
      const nestedPos = nestedShell ? resolveIncludedItems(included, nestedShell["*elements"] ?? nestedShell["elements"] ?? []) : [];
      if (nestedPos.length) {
        for (const pos of nestedPos) {
          flat.push({
            ...mapPosition(pos),
            companyName: pos.companyName || grp.companyName,
            companyUrn: pos.companyUrn || grp.companyUrn,
            groupEntityUrn: grp.entityUrn || null,
          });
        }
      } else {
        flat.push({
          title: null,
          companyName: extractText(grp.companyName || grp.multiLocaleCompanyName),
          companyUrn: grp.companyUrn || null,
          entityUrn: grp.entityUrn || null,
          timePeriod: parseTimePeriod(grp.dateRange),
          groupEntityUrn: grp.entityUrn || null,
          positions: null,
        });
      }
    }
    return flat;
  } catch (err) {
    console.error("fetchExperiences error:", err.message);
    if (isAuthError(err)) {
      throw new Error(`LinkedIn authentication required (HTTP 302) -> ${err.response?.headers?.location || "redirect"}`);
    }
    return [];
  }
}

async function fetchProfileData(identifier) {
  const [raw, about, contactInfo, experiences, education, skills, certifications, languages, projects, patents, publications, honors, courses, volunteer, testScores, organizations] = await Promise.allSettled([
    fetchRawProfile(identifier),
    fetchAboutSection(identifier),
    fetchContactInfo(identifier),
    fetchExperiences(identifier),
    fetchSection(identifier, "profileEducations", mapEducation),
    fetchSection(identifier, "profileSkills", mapSkill),
    fetchSection(identifier, "profileCertifications", mapCertification),
    fetchSection(identifier, "profileLanguages", mapLanguage),
    fetchSection(identifier, "profileProjects", mapProject),
    fetchSection(identifier, "profilePatents", mapPatent),
    fetchSection(identifier, "profilePublications", mapPublication),
    fetchSection(identifier, "profileHonors", mapHonor),
    fetchSection(identifier, "profileCourses", mapCourse),
    fetchSection(identifier, "profileVolunteerExperiences", mapVolunteer),
    fetchSection(identifier, "profileTestScores", mapTestScore),
    fetchSection(identifier, "profileOrganizations", mapOrganization),
  ]);

  const results = [raw, about, contactInfo, experiences, education, skills, certifications, languages, projects, patents, publications, honors, courses, volunteer, testScores, organizations];
  for (const r of results) {
    if (r.status === "rejected" && isAuthError(r.reason)) {
      throw r.reason;
    }
  }

  const data = raw.status === "fulfilled" ? raw.value : {};

  if (about.status === "fulfilled") data.about = about.value && about.value !== "N/A" ? about.value : null;
  if (contactInfo.status === "fulfilled") data.contactInfo = contactInfo.value || {};
  if (experiences.status === "fulfilled") data.experiences = [].concat(...(experiences.value || []));
  if (education.status === "fulfilled") data.education = education.value || [];
  if (skills.status === "fulfilled") data.skills = skills.value || [];
  if (certifications.status === "fulfilled") data.certifications = certifications.value || [];
  if (languages.status === "fulfilled") data.languages = languages.value || [];
  if (projects.status === "fulfilled") data.projects = projects.value || [];
  if (patents.status === "fulfilled") data.patents = patents.value || [];
  if (publications.status === "fulfilled") data.publications = publications.value || [];
  if (honors.status === "fulfilled") data.honors = honors.value || [];
  if (courses.status === "fulfilled") data.courses = courses.value || [];
  if (volunteer.status === "fulfilled") data.volunteer = volunteer.value || [];
  if (testScores.status === "fulfilled") data.testScores = testScores.value || [];
  if (organizations.status === "fulfilled") data.organizations = organizations.value || [];

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
      geoUrn: data.geoUrn,
      countryCode: data.countryCode,
      industryName: data.industryName,
      companyName: data.companyName,
      schoolName: data.schoolName,
      about: data.about,
      summary: data.summary,
      occupation: data.occupation,
      avatarUrl: data.profilePicture,
      bannerUrl: data.backgroundPicture,
      followersCount: data.followersCount,
      connectionsCount: data.connectionsCount,
      experienceCount: data.experienceCount,
      educationCount: data.educationCount,
      certificationsCount: data.certificationsCount,
      projectsCount: data.projectsCount,
      skillsCount: data.skillsCount,
      languagesCount: data.languagesCount,
      interestsCount: data.interestsCount,
      experience: data.experiences || [],
      education: data.education || [],
      skills: data.skills || [],
      certifications: data.certifications || [],
      languages: data.languages || [],
      projects: data.projects || [],
      patents: data.patents || [],
      publications: data.publications || [],
      honors: data.honors || [],
      courses: data.courses || [],
      volunteer: data.volunteer || [],
      testScores: data.testScores || [],
      organizations: data.organizations || [],
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

module.exports = { fetchRawProfile, fetchSection, fetchExperiences, fetchAboutSection, fetchContactInfo, fetchProfileData, buildResponse, getMe, mapSkill, mapEducation, mapCertification, mapLanguage, mapPosition, mapProject, mapVolunteer, mapHonor, mapCourse, mapOrganization, mapPublication, mapPatent, mapTestScore, parseSimpleDate };
