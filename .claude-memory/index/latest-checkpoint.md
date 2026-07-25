# Latest Checkpoint (backup)

- Session ID: 5ca10ece-2be6-456c-bdf0-75f9e76f616a
- Outcome: done
- Edits this session: 3
- Lookups this session: 2
- Key Files: scripts/adhoc-sign.js:1-33, package.json:33-36, README.md:118-138
- Next Action: resume from memory on next session
- Updated At: 2026-07-25T01:19:14+00:00
- Recap:
  - scripts/adhoc-sign.js` — new `afterPack` hook that ad-hoc signs the bundle and verifies it. It bails out early if a real `identity` is configured, so it won't c
  - package.json` — `"afterPack": "scripts/adhoc-sign.js"` in the `build` block.
  - README.md` — replaced the stale Gatekeeper note (the right-click → Open trick stopped working in macOS 15+).
  - Ad-hoc ≠ notarized.** People who *download* the dmg still get quarantined and must use System Settings → Privacy & Security → Open Anyway. Ad-hoc signing turns 
  - The 1.0.2 and earlier artifacts in `dist/` are still broken** — anyone who downloaded those hits the same wall. I left them alone; you'll want to replace them i
