const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function saveCookies(liAt, jsessionId) {
  const envPath = path.join(__dirname, "..", ".env");
  let envContent = "";
  if (fs.existsSync(envPath)) envContent = fs.readFileSync(envPath, "utf8");

  if (envContent.includes("LINKEDIN_LI_AT=")) {
    envContent = envContent.replace(/LINKEDIN_LI_AT=.*/, `LINKEDIN_LI_AT=${liAt}`);
  } else {
    envContent += `\nLINKEDIN_LI_AT=${liAt}\n`;
  }

  if (envContent.includes("LINKEDIN_JSESSIONID=")) {
    envContent = envContent.replace(/LINKEDIN_JSESSIONID=.*/, `LINKEDIN_JSESSIONID=${jsessionId}`);
  } else {
    envContent += `LINKEDIN_JSESSIONID=${jsessionId}\n`;
  }

  fs.writeFileSync(envPath, envContent.trim() + "\n");
}

async function waitForCookies(context) {
  const cookies = await context.cookies();
  const liAt = cookies.find((c) => c.name === "li_at")?.value || "";
  const jsessionId = cookies.find((c) => c.name === "JSESSIONID")?.value || "";
  return { liAt, jsessionId };
}

async function ensureBrowserInstalled(log = console.log) {
  const { chromium } = require("patchright");
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch (e) {
    log("Chromium missing/unusable. Installing browser (this can take a minute)...");
    const { execSync } = require("child_process");
    try {
      execSync("npx patchright install chromium", { stdio: "inherit", timeout: 300000 });
    } catch (installErr) {
      log("install chromium warning:", installErr.message);
    }
    if (process.platform === "linux") {
      try {
        execSync("npx patchright install-deps chromium", { stdio: "inherit", timeout: 300000 });
      } catch (depsErr) {
        log("install-deps warning (system deps may be missing):", depsErr.message);
      }
    }
    log("Browser install finished. Attempting launch...");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  }
}

async function performLogin({ headless = false, log = console.log } = {}) {
  const env = loadEnv();
  const email = process.env.LINKEDIN_EMAIL || env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD || env.LINKEDIN_PASSWORD;

  log("========================================");
  log("  LinkedIn Session Login Helper");
  log("========================================");
  log("");

  const { chromium } = require("patchright");
  await ensureBrowserInstalled(log);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.linkedin.com/login");

  if (email && password) {
    log("Credentials found — logging in automatically...");
    try {
      const emailInput = page.locator('input[type="email"]').last();
      const passInput = page.locator('input[type="password"]').last();
      await emailInput.waitFor({ state: "attached", timeout: 15000 });
      await page.waitForTimeout(1000);
      await emailInput.click();
      await emailInput.fill(email);
      await passInput.click();
      await passInput.fill(password);
      const signInBtn = page.locator('button:has-text("Sign in")').last();
      await signInBtn.click();
      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      if (currentUrl.includes("checkpoint") || currentUrl.includes("challenge") || currentUrl.includes("captcha")) {
        log("");
        log("LinkedIn is asking for verification (CAPTCHA / 2FA).");
        log(`Please complete it in the browser${headless ? " (headless - open in headed mode)" : ""}.`);
        log("");
        if (headless) {
          await browser.close();
          throw new Error("LinkedIn requires manual verification (CAPTCHA/2FA) which cannot be completed in headless mode.");
        }
      } else {
        log("Login form submitted. Waiting for redirect...");
      }

      if (!headless) {
        try {
          await page.waitForURL("**/feed/**", { timeout: 300000 });
          log("Logged in successfully!");
        } catch {
          await browser.close();
          throw new Error("Login timeout after 5 min.");
        }
      } else {
        await page.waitForURL("**/feed/**", { timeout: 60000 });
        log("Logged in successfully!");
      }
    } catch (err) {
      await browser.close();
      throw err;
    }
  } else {
    throw new Error("Missing LINKEDIN_EMAIL / LINKEDIN_PASSWORD environment variables.");
  }

  const { liAt, jsessionId } = await waitForCookies(context);

  if (!liAt || !jsessionId) {
    await browser.close();
    throw new Error("Could not find li_at or JSESSIONID cookies.");
  }

  log("Cookies captured successfully!");
  saveCookies(liAt, jsessionId);
  await browser.close();

  return { liAt, jsessionId: jsessionId.replace(/^ajax:/, "") };
}

if (require.main === module) {
  (async () => {
    const headless = process.argv.includes("--headless");
    try {
      const { liAt, jsessionId } = await performLogin({ headless });
      console.log("Session saved to .env file!");
      if (process.argv.includes("--print")) {
        console.log(`LINKEDIN_LI_AT=${liAt}`);
        console.log(`LINKEDIN_JSESSIONID=${jsessionId}`);
      }
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    } finally {
      rl.close();
    }
  })();
}

module.exports = { performLogin };
