// Writes samples/todo-express-react.zip (with git history) and
// samples/flask-notes.zip, ready to drag into Retrace's upload box.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { SAMPLES_DIR, buildFlaskZip, buildTodoZip } from "../tests/helpers/sample-zips";

const outputs: [string, () => Promise<Buffer>][] = [
  ["todo-express-react.zip", buildTodoZip],
  ["flask-notes.zip", buildFlaskZip],
];

for (const [name, build] of outputs) {
  const target = path.join(SAMPLES_DIR, name);
  writeFileSync(target, await build());
  console.log(`Wrote ${path.relative(process.cwd(), target)}`);
}
