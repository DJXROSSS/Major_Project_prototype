const routes = require("./routes/assessments.routes");
const { createServiceApp } = require("../shared/create-service-app");

module.exports = createServiceApp(routes, { name: "assessments" });
