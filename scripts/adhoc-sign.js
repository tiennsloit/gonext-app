#!/usr/bin/env node
// electron-builder afterPack hook.
//
// Without an Apple Developer ID in the keychain, electron-builder skips macOS
// signing entirely. On Apple Silicon an unsigned bundle has no sealed resources,
// so Gatekeeper hard-blocks it ("GoTerminal has been blocked because it may
// reduce your privacy…") instead of showing the normal unidentified-developer
// prompt. Applying an ad-hoc signature here keeps the bundle launchable.
//
// This is not a substitute for notarization — downloaded copies still need
// Privacy & Security → Open Anyway. See README for the Developer ID setup.
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  // Real signing already happened; don't clobber it.
  if (context.packager.platformSpecificBuildOptions.identity) return;

  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log(`  • ad-hoc signing (no Developer ID found)  file=${app}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], {
    stdio: "inherit",
  });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], {
    stdio: "inherit",
  });
};
