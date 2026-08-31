require("dotenv").config();
const express = require("express");
const { createMiddleware } = require("./middleware");
const { createRoutes } = require("./routes");

const app = express();
const PORT = process.env.PORT || 3001;

createMiddleware(app);
createRoutes(app);

app.listen(PORT, () => {
  console.log(`LinkedIn API (native) server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
});
