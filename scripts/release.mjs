// Publishes a new version of the desktop app as a GitHub release, which the
// installed apps then find and offer as an update.
//
//   npm run release            (bumps 0.1.0 → 0.1.1)
//   npm run release -- minor   (bumps 0.1.0 → 0.2.0)
//
// Uploads to the repository in package.json (build.publish). electron-builder
// uploads a draft (creating a published release directly races with itself
// and fails); this script then publishes the draft, so installed apps see it
// at their next check.
//
// The upload needs a GitHub token that may create releases there. It comes
// from GH_TOKEN in YOUR shell if set, otherwise from your GitHub CLI sign-in
// (gh auth token). Either way it is only handed to the build and to GitHub,
// never written to a file, bundled into the app, or printed.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const owner = process.env.RETRACE_GH_OWNER || pkg.build.publish[0].owner;
const repo = process.env.RETRACE_GH_REPO || pkg.build.publish[0].repo;
const tag = `v${pkg.version}`;

// electron-builder reads GH_TOKEN from the environment and uploads the
// installer, its blockmap and latest.yml (what the updater reads).
run("node scripts/build-desktop.mjs --publish always");

const api = (path, init = {}) =>
  fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
  });
const releases = await (await api("/releases?per_page=20")).json();
const draft = Array.isArray(releases)
  ? releases.find((r) => r.tag_name === tag && r.draft)
  : undefined;
if (!draft) {
  console.error(`No draft release ${tag} found in ${owner}/${repo}; publish it on GitHub by hand.`);
  process.exit(1);
}
const names = draft.assets.map((a) => a.name);
if (!names.includes("latest.yml") || !names.some((n) => n.endsWith(".exe"))) {
  console.error(`Draft ${tag} is missing the installer or latest.yml, so it was left as a draft.`);
  process.exit(1);
}
const published = await api(`/releases/${draft.id}`, {
  method: "PATCH",
  body: JSON.stringify({ draft: false, make_latest: "true" }),
});
if (!published.ok) {
  console.error(
    `Could not publish ${tag} (HTTP ${published.status}); publish it on GitHub by hand.`,
  );
  process.exit(1);
}
console.log(`Published ${tag}. Commit the new version number in package.json.`);
