const routes = require("./routes/students.routes").default;
const { createServiceApp } = require("../shared/create-service-app");

module.exports = createServiceApp(routes, { name: "students" });
