const { chromium } = require("patchright");
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

(async () => {
  console.log("========================================");
  console.log("  LinkedIn Session Login Helper");
  console.log("========================================");
  console.log("");

  const env = loadEnv();
  const email = process.env.LINKEDIN_EMAIL || env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD || env.LINKEDIN_PASSWORD;

  const headless = process.argv.includes("--headless");

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.linkedin.com/login");

  if (email && password) {
    console.log("Credentials found in .env — logging in automatically...");
    try {
      const emailInput = page.locator('input[type="email"]').last();
      const passInput = page.locator('input[type="password"]').last();
      await emailInput.waitFor({ state: 'attached', timeout: 10000 });
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
        console.log("");
        console.log("LinkedIn is asking for verification (CAPTCHA / 2FA).");
        console.log("Please complete it in the browser. The script will continue once you reach the feed.");
        console.log("");
      } else {
        console.log("Login form submitted. Waiting for redirect...");
      }

      try {
        await page.waitForURL("**/feed/**", { timeout: 300000 });
        console.log("Logged in successfully!");
      } catch {
        console.log("Login timeout after 5 min. Please try again.");
        await browser.close();
        rl.close();
        process.exit(1);
      }
    } catch (err) {
      console.log("Auto-login failed (" + err.message + "), falling back to manual login...");
      console.log("");
      try {
        await page.waitForURL("**/feed/**", { timeout: 300000 });
      } catch {
        console.log("Login timeout. Please try again.");
        await browser.close();
        rl.close();
        process.exit(1);
      }
    }
  } else {
    console.log("No LINKEDIN_EMAIL / LINKEDIN_PASSWORD in .env — manual login.");
    console.log("");
    console.log("Tip: Add these to .env for automatic login:");
    console.log("  LINKEDIN_EMAIL=your@email.com");
    console.log("  LINKEDIN_PASSWORD=yourpassword");
    console.log("");
    console.log("Browser opened. Please log in to LinkedIn...");
    try {
      await page.waitForURL("https://www.linkedin.com/feed/", { timeout: 300000 });
    } catch {
      console.log("Login timeout. Please try again.");
      await browser.close();
      rl.close();
      process.exit(1);
    }
  }

  const { liAt, jsessionId } = await waitForCookies(context);

  if (!liAt || !jsessionId) {
    console.error("ERROR: Could not find li_at or JSESSIONID cookies.");
    await browser.close();
    rl.close();
    process.exit(1);
  }

  console.log("✓ Cookies captured successfully!");
  saveCookies(liAt, jsessionId);
  console.log("✓ Session saved to .env file!");
  console.log("");
  console.log("You can now start the server with: npm start");

  await browser.close();
  rl.close();
})();
