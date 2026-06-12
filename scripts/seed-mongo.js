#!/usr/bin/env node
require("dotenv").config();
const mongo = require("../mongo");

// Default processes to create in MongoDB. Both auto-start on app launch.
const DEFAULTS = [
  {
    name: "gonext-local-worker",
    command: "gonext-local-worker",
    autoStart: true,
  },
  {
    name: "mlx_lm.server",
    command: "mlx_lm.server --model ~/mlx-models/Llama-3.2-3B-Instruct-4bit",
    autoStart: true,
  },
];

(async () => {
  const c = mongo.cfg();
  console.log(`Seeding "${c.db}.${c.collection}" on ${c.host}:${c.port} …`);
  try {
    const res = await mongo.seedProcesses(DEFAULTS);
    console.log(
      `Done. inserted=${res.inserted} updated=${res.updated} total=${res.total}`
    );
    for (const d of DEFAULTS) {
      console.log(`  • ${d.name}  (autoStart=${d.autoStart})  ->  ${d.command}`);
    }
    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exit(1);
  }
})();
