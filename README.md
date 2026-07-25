# GoTerminal

A simple cross‑platform (macOS / Ubuntu) Electron app to **track, start, stop, restart, and monitor** processes that run under the terminal — each with its own live log output.

Add a process by entering any shell command, for example:

- `ping 102.111.222.0`
- `ngrok http 3000`
- a custom CLI like `cli1_tracking_1`

Each process runs in a login shell, so anything on your `PATH` works. Process definitions are saved automatically, so they persist across restarts.

## Features

- **Add / edit / delete** processes, each with a name + command
- **Start / Stop / Restart** with one click
- **Live status** (running, stopped, finished, error) and PID / exit code
- **Live stdout/stderr logs** per process (with auto‑scroll and clear)
- **Load processes from MongoDB** ("Sync from MongoDB" button)
- **Auto‑start**: processes flagged `autoStart` launch automatically on app open
- Clean tree‑kill on stop (kills the whole process group on macOS/Linux)
- Stops all running processes automatically when you quit

## Requirements

- [Node.js](https://nodejs.org/) 18+ (tested on Node 22)

## Run

```bash
npm install
cp .env.example .env   # then fill in your MongoDB password
npm start
```

That launches the app window directly — no `.dmg` or packaging needed.

## MongoDB integration

The app can load its process list from MongoDB. Connection settings come from a
`.env` file (see `.env.example`):

```
MONGODB_HOST=<your-mongodb-host>
MONGODB_PORT=27017
MONGODB_USER=goprocessUser1
MONGODB_PASSWORD=********
MONGODB_DB=goprocess_uat
MONGODB_AUTHSOURCE=goprocess_uat
MONGODB_COLLECTION=processes
```

Each document in the `processes` collection looks like:

```json
{ "name": "gonext-local-worker", "command": "gonext-local-worker", "autoStart": true }
```

- **`name`** — display name
- **`command`** — the shell command to run
- **`autoStart`** — when `true`, the process starts automatically on app launch

On launch, the app pulls the list from MongoDB, merges it with any locally‑added
processes (matched by name), and auto‑starts everything flagged `autoStart`. You
can also re‑pull at any time with the **⟳ Sync from MongoDB** button.

### Seed the default processes

A helper script inserts two auto‑starting processes into MongoDB:

```bash
npm run seed
```

This upserts:

- `gonext-local-worker` → `gonext-local-worker` (autoStart)
- `mlx_lm.server` → `mlx_lm.server --model ~/mlx-models/Llama-3.2-3B-Instruct-4bit` (autoStart)

Edit `scripts/seed-mongo.js` to change or add defaults.

## How it works

- `main.js` — Electron main process. Spawns/kills child processes with Node's
  `child_process`, streams their output, and persists the process list to
  `processes.json` in Electron's `userData` folder.
- `preload.js` — secure IPC bridge (context isolation, no node in the renderer).
- `renderer/` — the UI (HTML/CSS/JS).

## Notes

- Commands run with your home directory as the working directory and inherit
  your environment.
- Logs keep the most recent 500 entries per process to stay light.
- This is meant for local/personal use; commands run with your user's full
  permissions, so only add commands you trust.

## Release (build a distributable app)

Packaging is handled by [`electron-builder`](https://www.electron.build/).

```bash
npm install          # installs electron-builder too
npm run dist:mac     # build macOS .dmg + .zip
npm run dist:linux   # build Linux .AppImage + .deb
npm run dist         # build for the current OS
```

Output lands in the `dist/` folder, e.g.:

- macOS: `dist/GoTerminal-<version>-arm64.dmg` (drag to Applications) and a `.zip`
- Linux: `dist/GoTerminal-<version>.AppImage` (chmod +x, then double‑click) and `.deb`

### Notes on each platform

- **Build on the target OS.** Build the macOS app on a Mac and the Linux app on
  Linux (or via CI). Cross‑compiling is possible but fiddly.
- **macOS Gatekeeper:** the app has no Apple Developer ID, so `scripts/adhoc-sign.js`
  (wired up as electron-builder's `afterPack` hook) applies an **ad-hoc signature**
  to the bundle. This is not optional on Apple Silicon: without it the bundle has no
  sealed resources and macOS 15+ hard‑blocks it with *"GoTerminal has been blocked
  because it may reduce your privacy and lower the security of your Mac"* — a dialog
  that only offers **Move to Trash**, with no way to open it anyway.

  Ad-hoc signing downgrades that to the ordinary unidentified‑developer prompt.
  On first open, users still need **System Settings → Privacy & Security → Open
  Anyway** (on macOS 15+ the old right‑click → *Open* trick no longer works), or:
  ```bash
  xattr -dr com.apple.quarantine "/Applications/GoTerminal.app"
  ```
  If a copy already on disk shows the hard block, re‑sign it in place:
  ```bash
  xattr -cr "/Applications/GoTerminal.app"
  codesign --force --deep --sign - "/Applications/GoTerminal.app"
  ```
  To remove the prompt entirely you need an Apple Developer ID ($99/yr) plus
  notarization — set `CSC_LINK`/`CSC_KEY_PASSWORD` and `build.mac.notarize`, and the
  ad-hoc hook steps aside automatically once a real `identity` is configured.
- **App version** comes from the `version` field in `package.json` — bump it for
  each release.
- **App icon:** the default Electron icon is used. To customize, add an
  `icon.icns` (mac) / `icon.png` (linux) and reference it under `build.mac.icon`
  / `build.linux.icon`.

### Publishing to GitHub Releases (optional)

`electron-builder` can upload artifacts to GitHub Releases automatically. Add a
`build.publish` block and run with a `GH_TOKEN` set — see the
[publish docs](https://www.electron.build/configuration/publish).
