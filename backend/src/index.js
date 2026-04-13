const app = require("./app");
const env = require("./config/env");
const { connectDatabase } = require("./config/database");

async function start() {
  try {
    await connectDatabase();

    app.listen(env.port, () => {
      console.log(`[api] Server listening on http://localhost:${env.port}`);
    });
  } catch (error) {
    console.error("[api] Failed to start server", error);
    process.exit(1);
  }
}

start();
