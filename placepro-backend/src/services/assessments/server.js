require("dotenv/config");
const app = require("./app");
const { startServer } = require("../../shared/start-server");

const port = Number(process.env.ASSESSMENTS_SERVICE_PORT || 4004);
startServer(app, { name: "Assessments service", port });
