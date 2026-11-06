const routes = require("./routes/admin.routes");
const { createServiceApp } = require("../shared/create-service-app");

module.exports = createServiceApp(routes, { name: "admin" });
