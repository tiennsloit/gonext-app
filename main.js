const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, ipcMain } = require("electron");

// Dev: project .env. Packaged app: ~/Library/Application Support/goterminal/.env
(function loadEnv() {
  const dotenv = require("dotenv");
  const candidates = [
    path.join(app.getPath("userData"), ".env"),
    path.join(__dirname, ".env"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      return;
    }
  }
})();
const { spawn } = require("child_process");
const mongo = require("./mongo");

const STORE_PATH = () => path.join(app.getPath("userData"), "processes.json");
const MAX_LOG_LINES = 500;

let mainWindow = null;

// Result of the most recent MongoDB sync: { ok, error?, added?, updated?, total? }
let lastMongoStatus = null;

/** Send to the renderer, waiting for the page to finish loading if needed. */
function sendWhenReady(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const wc = mainWindow.webContents;
  if (wc.isLoading()) {
    wc.once("did-finish-load", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send(channel, payload);
    });
  } else {
    wc.send(channel, payload);
  }
}

/**
 * Runtime registry of processes.
 * Map<id, {
 *   id, name, command,
 *   status: "stopped" | "running" | "exited" | "error",
 *   child: ChildProcess | null,
 *   pid: number | null,
 *   exitCode: number | null,
 *   logs: Array<{ stream: "stdout"|"stderr"|"system", text: string, ts: number }>
 * }>
 */
const procs = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#0f1115",
    title: "GoTerminal",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

/* ----------------------------- persistence ------------------------------ */

function loadDefinitions() {
  try {
    const raw = fs.readFileSync(STORE_PATH(), "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;
  } catch (_) {
    // no store yet
  }
  return [];
}

function saveDefinitions() {
  const defs = [...procs.values()].map((p) => ({
    id: p.id,
    name: p.name,
    command: p.command,
    autoStart: !!p.autoStart,
    source: p.source || "local",
    mongoId: p.mongoId,
  }));
  try {
    fs.writeFileSync(STORE_PATH(), JSON.stringify(defs, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save processes:", err);
  }
}

function hydrate() {
  for (const def of loadDefinitions()) {
    procs.set(def.id, {
      id: def.id,
      name: def.name,
      command: def.command,
      autoStart: !!def.autoStart,
      source: def.source || "local",
      mongoId: def.mongoId,
      status: "stopped",
      child: null,
      pid: null,
      exitCode: null,
      logs: [],
    });
  }
}

/* ------------------------------ helpers --------------------------------- */

function makeId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toClient(p) {
  return {
    id: p.id,
    name: p.name,
    command: p.command,
    autoStart: !!p.autoStart,
    source: p.source || "local",
    status: p.status,
    pid: p.pid,
    exitCode: p.exitCode,
  };
}

function listClient() {
  return [...procs.values()].map(toClient);
}

function pushLog(p, stream, text) {
  const entry = { stream, text, ts: Date.now() };
  p.logs.push(entry);
  if (p.logs.length > MAX_LOG_LINES) {
    p.logs.splice(0, p.logs.length - MAX_LOG_LINES);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("proc:log", { id: p.id, entry });
  }
}

function emitStatus(p) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("proc:status", toClient(p));
  }
}

function startProcess(p) {
  if (p.child) return { ok: false, error: "Already running" };

  // Use a login shell so PATH-installed CLIs (ngrok, etc.) resolve.
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
  const args =
    process.platform === "win32" ? ["/c", p.command] : ["-lc", p.command];

  let child;
  try {
    child = spawn(shell, args, {
      detached: process.platform !== "win32", // own process group for clean tree-kill
      env: process.env,
      cwd: app.getPath("home"),
    });
  } catch (err) {
    p.status = "error";
    pushLog(p, "system", `Failed to start: ${err.message}`);
    emitStatus(p);
    return { ok: false, error: err.message };
  }

  p.child = child;
  p.pid = child.pid;
  p.status = "running";
  p.exitCode = null;
  pushLog(p, "system", `▶ Started: ${p.command} (pid ${child.pid})`);
  emitStatus(p);

  child.stdout.on("data", (d) => pushLog(p, "stdout", d.toString()));
  child.stderr.on("data", (d) => pushLog(p, "stderr", d.toString()));

  child.on("error", (err) => {
    pushLog(p, "system", `Error: ${err.message}`);
    p.status = "error";
    p.child = null;
    p.pid = null;
    emitStatus(p);
  });

  child.on("exit", (code, signal) => {
    p.exitCode = code;
    p.child = null;
    p.pid = null;
    if (signal) {
      p.status = "stopped";
      pushLog(p, "system", `■ Stopped (signal ${signal})`);
    } else if (code === 0) {
      p.status = "exited";
      pushLog(p, "system", `✓ Finished (exit code 0)`);
    } else {
      p.status = "error";
      pushLog(p, "system", `✗ Exited with code ${code}`);
    }
    emitStatus(p);
  });

  return { ok: true };
}

function stopProcess(p) {
  if (!p.child || !p.pid) return { ok: false, error: "Not running" };
  pushLog(p, "system", "Stopping…");
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"]);
    } else {
      // negative pid -> whole process group
      try {
        process.kill(-p.pid, "SIGTERM");
      } catch (_) {
        process.kill(p.pid, "SIGTERM");
      }
      const pidAtKill = p.pid;
      setTimeout(() => {
        if (p.child && p.pid === pidAtKill) {
          try {
            process.kill(-pidAtKill, "SIGKILL");
          } catch (_) {
            try {
              process.kill(pidAtKill, "SIGKILL");
            } catch (_) {}
          }
        }
      }, 4000);
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return { ok: true };
}

function stopAll() {
  for (const p of procs.values()) {
    if (p.child) stopProcess(p);
  }
}

/** Start every process flagged autoStart that isn't already running. */
function autoStartAll() {
  let started = 0;
  for (const p of procs.values()) {
    if (p.autoStart && !p.child) {
      const r = startProcess(p);
      if (r.ok) started++;
    }
  }
  return started;
}

/* ------------------------------- MongoDB -------------------------------- */

/**
 * Pull process definitions from MongoDB and merge them into the registry.
 * Matching is done by name: existing entries are updated in place, new ones
 * are added. Returns a summary plus the refreshed client list.
 */
async function syncFromMongo() {
  const docs = await mongo.fetchProcesses();
  let added = 0;
  let updated = 0;
  for (const d of docs) {
    if (!d.name && !d.command) continue;
    const existing = [...procs.values()].find(
      (p) => (d.mongoId && p.mongoId === d.mongoId) || p.name === d.name
    );
    if (existing) {
      if (!existing.child && d.command) existing.command = d.command;
      existing.name = d.name || existing.name;
      existing.autoStart = !!d.autoStart;
      existing.source = "mongo";
      existing.mongoId = d.mongoId || existing.mongoId;
      updated++;
    } else {
      const id = makeId();
      procs.set(id, {
        id,
        name: d.name || d.command,
        command: d.command,
        autoStart: !!d.autoStart,
        source: "mongo",
        mongoId: d.mongoId,
        status: "stopped",
        child: null,
        pid: null,
        exitCode: null,
        logs: [],
      });
      added++;
    }
  }
  saveDefinitions();
  return { added, updated, total: docs.length };
}

/* ------------------------------- IPC ------------------------------------ */

ipcMain.handle("mongo:sync", async () => {
  try {
    const summary = await syncFromMongo();
    const started = autoStartAll();
    lastMongoStatus = { ok: true, ...summary };
    return { ok: true, ...summary, started, list: listClient() };
  } catch (err) {
    lastMongoStatus = { ok: false, error: err.message };
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("mongo:status", () => lastMongoStatus);

ipcMain.handle("proc:list", () => listClient());

ipcMain.handle("proc:add", (_e, { name, command, autoStart }) => {
  const cmd = (command || "").trim();
  if (!cmd) return { ok: false, error: "Command is required" };
  const id = makeId();
  const p = {
    id,
    name: (name || "").trim() || cmd,
    command: cmd,
    autoStart: !!autoStart,
    source: "local",
    mongoId: undefined,
    status: "stopped",
    child: null,
    pid: null,
    exitCode: null,
    logs: [],
  };
  procs.set(id, p);
  saveDefinitions();
  return { ok: true, proc: toClient(p) };
});

ipcMain.handle("proc:update", (_e, { id, name, command, autoStart }) => {
  const p = procs.get(id);
  if (!p) return { ok: false, error: "Not found" };
  if (p.child) return { ok: false, error: "Stop the process before editing" };
  if (typeof name === "string") p.name = name.trim() || p.command;
  if (typeof command === "string" && command.trim()) {
    p.command = command.trim();
    if (!name) p.name = p.name || p.command;
  }
  if (typeof autoStart === "boolean") p.autoStart = autoStart;
  saveDefinitions();
  return { ok: true, proc: toClient(p) };
});

ipcMain.handle("proc:remove", (_e, { id }) => {
  const p = procs.get(id);
  if (!p) return { ok: false, error: "Not found" };
  if (p.child) stopProcess(p);
  procs.delete(id);
  saveDefinitions();
  return { ok: true };
});

ipcMain.handle("proc:start", (_e, { id }) => {
  const p = procs.get(id);
  if (!p) return { ok: false, error: "Not found" };
  return startProcess(p);
});

ipcMain.handle("proc:stop", (_e, { id }) => {
  const p = procs.get(id);
  if (!p) return { ok: false, error: "Not found" };
  return stopProcess(p);
});

ipcMain.handle("proc:restart", (_e, { id }) => {
  const p = procs.get(id);
  if (!p) return { ok: false, error: "Not found" };
  if (p.child) {
    stopProcess(p);
    const pidAtKill = p.pid;
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = setInterval(() => {
        if (!p.child || p.pid !== pidAtKill || Date.now() - start > 6000) {
          clearInterval(tick);
          resolve(startProcess(p));
        }
      }, 150);
    });
  }
  return startProcess(p);
});

ipcMain.handle("proc:logs", (_e, { id }) => {
  const p = procs.get(id);
  if (!p) return { ok: false, error: "Not found" };
  return { ok: true, logs: p.logs };
});

ipcMain.handle("proc:clearLogs", (_e, { id }) => {
  const p = procs.get(id);
  if (!p) return { ok: false, error: "Not found" };
  p.logs = [];
  return { ok: true };
});

/* ----------------------------- lifecycle -------------------------------- */

app.whenReady().then(() => {
  hydrate();
  createWindow();

  // Best-effort: pull the list from MongoDB, then auto-start flagged processes.
  // Auto-start runs even if Mongo is unreachable (using locally-saved defs).
  (async () => {
    try {
      const summary = await syncFromMongo();
      console.log(
        `MongoDB sync: +${summary.added} added, ${summary.updated} updated`
      );
      lastMongoStatus = { ok: true, ...summary };
    } catch (err) {
      console.warn("MongoDB sync skipped:", err.message);
      lastMongoStatus = { ok: false, error: err.message };
    } finally {
      const started = autoStartAll();
      if (started) console.log(`Auto-started ${started} process(es)`);
      sendWhenReady("proc:refresh");
      sendWhenReady("mongo:status", lastMongoStatus);
    }
  })();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopAll();
});
