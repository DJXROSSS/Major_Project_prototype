const bcrypt = require("bcryptjs");

async function generateHash() {
  const hash = await bcrypt.hash("secret", 12);
  console.log(hash);
}

generateHash();