import { describe, expect, it } from "vitest";
import { buildOrder } from "./topo";

const noRank = () => 0;

describe("buildOrder", () => {
  it("puts a file after the files it imports", () => {
    const order = buildOrder(
      ["routes.js", "db.js", "app.js"],
      [
        { from: "routes.js", to: "db.js" },
        { from: "app.js", to: "routes.js" },
      ],
      noRank,
    );
    expect(order).toEqual(["db.js", "routes.js", "app.js"]);
  });

  it("keeps an import cycle together instead of failing", () => {
    const order = buildOrder(
      ["a.js", "b.js", "c.js", "main.js"],
      [
        { from: "a.js", to: "b.js" },
        { from: "b.js", to: "a.js" },
        { from: "main.js", to: "a.js" },
        { from: "a.js", to: "c.js" },
      ],
      noRank,
    );
    expect(order).toHaveLength(4);
    expect(order.indexOf("c.js")).toBeLessThan(order.indexOf("a.js"));
    expect(Math.abs(order.indexOf("a.js") - order.indexOf("b.js"))).toBe(1);
    expect(order[order.length - 1]).toBe("main.js");
  });

  it("breaks ties by rank, then by name", () => {
    const rank = (p: string) => (p.endsWith(".json") ? 0 : p.endsWith(".sql") ? 1 : 2);
    expect(buildOrder(["z.js", "a.js", "schema.sql", "package.json"], [], rank)).toEqual([
      "package.json",
      "schema.sql",
      "a.js",
      "z.js",
    ]);
  });

  it("ignores edges to files that are not in the list", () => {
    expect(buildOrder(["a.js"], [{ from: "a.js", to: "missing.js" }], noRank)).toEqual(["a.js"]);
  });

  it("handles a long chain without recursion limits", () => {
    const paths = Array.from({ length: 5000 }, (_, i) => `f${String(i).padStart(4, "0")}.js`);
    const edges = paths.slice(1).map((p, i) => ({ from: p, to: paths[i]! }));
    expect(buildOrder(paths, edges, noRank)).toEqual(paths);
  });
});
