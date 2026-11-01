require("dotenv/config");
const app = require("./app");
const { startServer } = require("../shared/start-server");

const port = Number(process.env.GATEWAY_PORT || process.env.PORT || 5000);
startServer(app, { name: "PlacePro API gateway", port });
