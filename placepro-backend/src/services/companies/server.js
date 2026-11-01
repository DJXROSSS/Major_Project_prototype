require("dotenv/config");
const app = require("./app");
const { startServer } = require("../../shared/start-server");

const port = Number(process.env.COMPANIES_SERVICE_PORT || 4005);
startServer(app, { name: "Companies service", port });
