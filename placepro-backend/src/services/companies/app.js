const routes = require("./routes/companies.routes").default;
const { createServiceApp } = require("../shared/create-service-app");

module.exports = createServiceApp(routes, { name: "companies" });
