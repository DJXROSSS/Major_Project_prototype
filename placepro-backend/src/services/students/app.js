const routes = require("./routes/students.routes");
const { createServiceApp } = require("../shared/create-service-app");

module.exports = createServiceApp(routes, { name: "students" });
