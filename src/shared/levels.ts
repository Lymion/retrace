// The brief's level system: build order, not runtime order. Level 0 is the
// idea, the last level is shipping, and each level ends with a checkpoint
// that leaves the project in a state that runs.

export interface LevelTemplate {
  number: number;
  name: string;
  builds: string;
  checkpoint: string;
}

export const WEB_LEVELS: LevelTemplate[] = [
  {
    number: 0,
    name: "Idea and scope",
    builds: "User stories, core features, what is out of scope",
    checkpoint: "Explain the app in 3 sentences",
  },
  {
    number: 1,
    name: "Project setup",
    builds: "Repo, folders, package manager, env vars, linter",
    checkpoint: "An empty project runs",
  },
  {
    number: 2,
    name: "Data design",
    builds: "Schema, models, types",
    checkpoint: "Draw the tables and relationships",
  },
  {
    number: 3,
    name: "Backend core",
    builds: "Server, routes, DB connection, basic CRUD",
    checkpoint: "An endpoint returns data",
  },
  {
    number: 4,
    name: "Auth and sessions",
    builds: "Signup, login, tokens, password hashing",
    checkpoint: "A protected route rejects strangers",
  },
  {
    number: 5,
    name: "Frontend skeleton",
    builds: "Routing, layout, static components",
    checkpoint: "Click through empty screens",
  },
  {
    number: 6,
    name: "Connect the two",
    builds: "API calls, state, loading and error states",
    checkpoint: "Real data shows on screen",
  },
  {
    number: 7,
    name: "Feature logic",
    builds: "The features that make the app useful",
    checkpoint: "Use the app end to end",
  },
  {
    number: 8,
    name: "Validation and errors",
    builds: "Input checks, error handling, edge cases",
    checkpoint: "Bad input does not crash it",
  },
  {
    number: 9,
    name: "Testing",
    builds: "Unit, integration, manual test plan",
    checkpoint: "Change code without fear",
  },
  {
    number: 10,
    name: "Security hardening",
    builds: "Rate limits, CORS, secrets, injection and XSS fixes",
    checkpoint: "Pass your own security audit",
  },
  {
    number: 11,
    name: "Polish",
    builds: "Performance, accessibility, responsive design",
    checkpoint: "A stranger can use it",
  },
  {
    number: 12,
    name: "Ship and maintain",
    builds: "Deployment, CI/CD, logging, monitoring, backups",
    checkpoint: "It runs in production",
  },
];

export function templateTable(levels: LevelTemplate[] = WEB_LEVELS): string {
  return levels
    .map((l) => `${l.number} | ${l.name} | ${l.builds} | Checkpoint: ${l.checkpoint}`)
    .join("\n");
}

/**
 * Levels for Arduino/ESP32 projects. Designed now, not used yet: the upload
 * screen has no way to pick the hardware profile, and the draft roadmap's
 * file mapping is web-only (see docs/extending.md).
 */
export const HARDWARE_LEVELS: LevelTemplate[] = [
  {
    number: 0,
    name: "Idea and scope",
    builds: "What the device does, parts list, what is out of scope",
    checkpoint: "Explain the device in 3 sentences",
  },
  {
    number: 1,
    name: "Setup",
    builds: "Toolchain, board package, libraries, project folders",
    checkpoint: "A blink sketch uploads and runs",
  },
  {
    number: 2,
    name: "Wiring and pin map",
    builds: "Schematic, pin assignments, power rails",
    checkpoint: "Draw the wiring and the pin map",
  },
  {
    number: 3,
    name: "Firmware core",
    builds: "setup/loop structure, timing, state",
    checkpoint: "The main loop runs without blocking",
  },
  {
    number: 4,
    name: "Sensors and actuators",
    builds: "Reading inputs, driving outputs, drivers",
    checkpoint: "Each sensor reads a sane value",
  },
  {
    number: 5,
    name: "Communication",
    builds: "Serial, I2C/SPI, Wi-Fi/BLE, MQTT or HTTP",
    checkpoint: "Data reaches the other side",
  },
  {
    number: 6,
    name: "Logic",
    builds: "The behaviour that makes the device useful",
    checkpoint: "The device does its job end to end",
  },
  {
    number: 7,
    name: "Calibration",
    builds: "Offsets, thresholds, filtering",
    checkpoint: "Readings match a reference",
  },
  {
    number: 8,
    name: "Testing",
    builds: "Bench tests, edge cases, long runs",
    checkpoint: "It survives a long run",
  },
  {
    number: 9,
    name: "Power and enclosure",
    builds: "Battery life, sleep modes, case, mounting",
    checkpoint: "It runs on its own power in its case",
  },
];

export function levelsFor(profile: "web" | "hardware"): LevelTemplate[] {
  return profile === "hardware" ? HARDWARE_LEVELS : WEB_LEVELS;
}
