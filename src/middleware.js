const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

function createMiddleware(app) {
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
}

module.exports = { createMiddleware };
