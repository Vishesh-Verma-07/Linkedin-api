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

module.exports = { extractText, buildImageUrl, parseTimePeriod };
