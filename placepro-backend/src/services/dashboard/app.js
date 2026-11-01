const routes = require("./routes/dashboard.routes").default;
const { createServiceApp } = require("../shared/create-service-app");

module.exports = createServiceApp(routes, { name: "dashboard" });
