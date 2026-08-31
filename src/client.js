const axios = require("axios");
const { performLogin } = require("../scripts/login");

const state = {
  JSESSIONID: process.env.LINKEDIN_JSESSIONID ? process.env.LINKEDIN_JSESSIONID.replace(/^ajax:/, "") : "",
  isInitialized: !!(process.env.LINKEDIN_LI_AT && process.env.LINKEDIN_JSESSIONID),
  client: null,
  isRefreshing: false,
  refreshQueue: [],
};

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

async function refreshSession() {
  if (state.isRefreshing) {
    return new Promise((resolve) => state.refreshQueue.push(resolve));
  }
  state.isRefreshing = true;
  console.log("Session expired. Re-authenticating...");

  try {
    const { liAt, jsessionId } = await performLogin({ headless: true });
    if (!liAt || !jsessionId) {
      throw new Error("Re-authentication did not produce valid cookies");
    }

    state.JSESSIONID = jsessionId;
    process.env.LINKEDIN_LI_AT = liAt;
    process.env.LINKEDIN_JSESSIONID = jsessionId;
    state.isInitialized = true;
    state.client = buildClient(liAt, jsessionId);
    console.log("Session refreshed successfully!");
  } catch (err) {
    console.error("Re-authentication failed:", err.message);
    throw err;
  } finally {
    state.isRefreshing = false;
    state.refreshQueue.forEach((r) => r());
    state.refreshQueue = [];
  }
}

async function ensureInitialized() {
  if (!state.isInitialized || !state.client) {
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

function getClient() {
  return state.client;
}

if (state.isInitialized) {
  state.client = buildClient(process.env.LINKEDIN_LI_AT, state.JSESSIONID);
}

module.exports = { state, buildClient, refreshSession, ensureInitialized, isAuthError, getClient };
