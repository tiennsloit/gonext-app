const { MongoClient } = require("mongodb");

/**
 * Standalone MongoDB helper (no Electron deps) so it can be reused by both the
 * main process and the seed script.
 *
 * A process document looks like:
 *   { name: string, command: string, autoStart: boolean, createdAt: Date }
 */

function cfg() {
  return {
    host: process.env.MONGODB_HOST || "146.190.194.104",
    port: process.env.MONGODB_PORT || "27017",
    user: process.env.MONGODB_USER || "goprocessUser1",
    pwd: process.env.MONGODB_PASSWORD || "",
    db: process.env.MONGODB_DB || "goprocess_uat",
    authSource:
      process.env.MONGODB_AUTHSOURCE ||
      process.env.MONGODB_DB ||
      "goprocess_uat",
    collection: process.env.MONGODB_COLLECTION || "processes",
  };
}

function buildUri() {
  const c = cfg();
  const credentials = c.user
    ? `${encodeURIComponent(c.user)}:${encodeURIComponent(c.pwd)}@`
    : "";
  return `mongodb://${credentials}${c.host}:${c.port}/?authSource=${encodeURIComponent(
    c.authSource
  )}`;
}

async function withDb(fn) {
  const c = cfg();
  const client = new MongoClient(buildUri(), {
    serverSelectionTimeoutMS: 6000,
    connectTimeoutMS: 6000,
  });
  try {
    await client.connect();
    return await fn(client.db(c.db), c);
  } finally {
    await client.close().catch(() => {});
  }
}

/** Fetch all process definitions from MongoDB. */
async function fetchProcesses() {
  return withDb(async (db, c) => {
    const docs = await db.collection(c.collection).find({}).toArray();
    return docs.map((d) => ({
      mongoId: d._id ? String(d._id) : undefined,
      name: d.name,
      command: d.command,
      autoStart: !!d.autoStart,
    }));
  });
}

/** Upsert process definitions by name. Used by the seed script. */
async function seedProcesses(items) {
  return withDb(async (db, c) => {
    const col = db.collection(c.collection);
    let inserted = 0;
    let updated = 0;
    for (const it of items) {
      const res = await col.updateOne(
        { name: it.name },
        {
          $set: {
            name: it.name,
            command: it.command,
            autoStart: !!it.autoStart,
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
      if (res.upsertedCount) inserted++;
      else if (res.matchedCount) updated++;
    }
    const total = await col.countDocuments();
    return { inserted, updated, total, collection: c.collection, db: c.db };
  });
}

module.exports = { fetchProcesses, seedProcesses, buildUri, cfg };
