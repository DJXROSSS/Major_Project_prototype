const routes = require("./routes/auth.routes");
const { createServiceApp } = require("../shared/create-service-app");

module.exports = createServiceApp(routes, { name: "auth" });
