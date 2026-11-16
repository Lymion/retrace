// Publishes a new version of the desktop app as a GitHub release, which the
// installed apps then find and offer as an update.
//
//   npm run release            (bumps 0.1.0 → 0.1.1)
//   npm run release -- minor   (bumps 0.1.0 → 0.2.0)
//
// Needs three variables in YOUR shell only. They are never written to a
// file, bundled into the app, or printed:
//   RETRACE_GH_OWNER  the GitHub user or organisation, e.g. your username
//   RETRACE_GH_REPO   the repository name
//   GH_TOKEN          a GitHub token that may create releases in that repository
import { execSync } from "node:child_process";

const { RETRACE_GH_OWNER, RETRACE_GH_REPO, GH_TOKEN } = process.env;
const missing = [
  ["RETRACE_GH_OWNER", RETRACE_GH_OWNER],
  ["RETRACE_GH_REPO", RETRACE_GH_REPO],
  ["GH_TOKEN", GH_TOKEN],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length) {
  console.error(
    `Set ${missing.join(", ")} in your shell first (see the top of scripts/release.mjs).`,
  );
  process.exit(1);
}

const bump = ["patch", "minor", "major"].includes(process.argv[2]) ? process.argv[2] : "patch";
const run = (command) => execSync(command, { stdio: "inherit" });

run(`npm version ${bump} --no-git-tag-version`);
// electron-builder reads GH_TOKEN from the environment and uploads the
// installer, its blockmap and latest.yml (what the updater reads).
run("node scripts/build-desktop.mjs --publish always");
console.log("Done. Commit the new version number in package.json.");
