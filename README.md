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
- Clean tree‑kill on stop (kills the whole process group on macOS/Linux)
- Stops all running processes automatically when you quit

## Requirements

- [Node.js](https://nodejs.org/) 18+ (tested on Node 22)

## Run

```bash
npm install
npm start
```

That launches the app window directly — no `.dmg` or packaging needed.

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

## Optional: package as an app later

If you later want a double‑clickable app or `.dmg`, add
[`electron-builder`](https://www.electron.build/) and a `build` config — not
required to run today.
