require("dotenv/config");
const app = require("./app");
const { startServer } = require("../../shared/start-server");

const port = Number(process.env.STUDENTS_SERVICE_PORT || 4003);
startServer(app, { name: "Students service", port });
