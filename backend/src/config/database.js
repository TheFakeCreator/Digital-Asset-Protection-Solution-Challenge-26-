const mongoose = require("mongoose");
const env = require("./env");

async function connectDatabase() {
  if (!env.mongoUri) {
    console.warn("[db] MONGODB_URI not set; skipping database connection.");
    return;
  }

  await mongoose.connect(env.mongoUri);
  console.log("[db] MongoDB connected");
}

module.exports = {
  connectDatabase
};
