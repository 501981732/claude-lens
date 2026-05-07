require("dotenv").config();

const express = require("express");
const path = require("path");

const { getConfig } = require("./config");
const { createRoutes } = require("./api/routes");

function createApp(config = getConfig()) {
  const app = express();
  const publicDir = path.join(__dirname, "..", "public");
  const rootDir = path.join(__dirname, "..");

  app.use(createRoutes(config));
  app.use(express.static(publicDir));
  app.use(express.static(rootDir));

  return app;
}

function start(config = getConfig()) {
  const app = createApp(config);
  return app.listen(config.port, () => {
    console.log(`AI Coding Lens running at http://localhost:${config.port}`);
  });
}

module.exports = { createApp, start };
