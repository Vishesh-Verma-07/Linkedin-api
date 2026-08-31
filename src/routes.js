const { ensureInitialized, refreshSession, isAuthError } = require("./client");
const { fetchProfileData, buildResponse, getMe } = require("./fetchers");

function createRoutes(app) {
  app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

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
}

module.exports = { createRoutes };
