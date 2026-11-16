// Publishes a new version of the desktop app as a GitHub release, which the
// installed apps then find and offer as an update.
//
//   npm run release            (bumps 0.1.0 → 0.1.1)
//   npm run release -- minor   (bumps 0.1.0 → 0.2.0)
//
// Uploads to the repository in package.json (build.publish) as a published
// release (not a draft), so installed apps see it at their next check. The upload needs
// a GitHub token that may create releases there. It comes from GH_TOKEN in
// YOUR shell if set, otherwise from your GitHub CLI sign-in (gh auth token).
// Either way it is only handed to the build, never written to a file,
// bundled into the app, or printed.
import { execSync } from "node:child_process";

let token = process.env.GH_TOKEN;
if (!token) {
  try {
    token = execSync("gh auth token", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    token = "";
  }
}
if (!token) {
  console.error("No GitHub token: run `gh auth login`, or set GH_TOKEN in your shell.");
  process.exit(1);
}

const bump = ["patch", "minor", "major"].includes(process.argv[2]) ? process.argv[2] : "patch";
const run = (command) =>
  execSync(command, { stdio: "inherit", env: { ...process.env, GH_TOKEN: token } });

run(`npm version ${bump} --no-git-tag-version`);
// electron-builder reads GH_TOKEN from the environment and uploads the
// installer, its blockmap and latest.yml (what the updater reads).
run("node scripts/build-desktop.mjs --publish always");
console.log("Done. Commit the new version number in package.json.");
