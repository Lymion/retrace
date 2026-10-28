import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lieAboutSizes, makeZip, tempDir, writeTempZip } from "@tests/helpers/zips";
import { ExtractError, checkEntryName, extractZip, safeJoin } from "./safe-extract";

const LIMITS = { maxBytes: 1024 * 1024, maxFiles: 100, maxFileBytes: 256 * 1024 };

async function extract(zip: Buffer, limits = LIMITS) {
  return extractZip(writeTempZip(zip), tempDir(), limits);
}

async function expectRejected(zip: Buffer, code: string, limits = LIMITS) {
  const error = await extract(zip, limits).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ExtractError);
  expect((error as ExtractError).code).toBe(code);
  // Every rejection must be a sentence the learner can act on.
  expect((error as ExtractError).message.length).toBeGreaterThan(10);
}

describe("checkEntryName", () => {
  it.each(["../evil.js", "a/../../evil.js", "..\\evil.js", "a\\..\\..\\evil.js"])(
    "rejects traversal %s",
    (name) => {
      expect(() => checkEntryName(name)).toThrowError(/outside its folder/);
    },
  );

  it.each(["/etc/passwd", "C:/Windows/system.ini", "c:\\x.txt"])(
    "rejects absolute path %s",
    (name) => {
      expect(() => checkEntryName(name)).toThrowError(/absolute path/);
    },
  );

  it("accepts normal relative paths", () => {
    expect(() => checkEntryName("src/app/page.tsx")).not.toThrow();
    expect(() => checkEntryName("a..b/file..js")).not.toThrow();
  });
});

describe("safeJoin", () => {
  it("keeps paths inside the root", () => {
    const root = tempDir();
    expect(safeJoin(root, ".git/HEAD")).toBe(path.join(root, ".git", "HEAD"));
    expect(() => safeJoin(root, "../outside")).toThrow(ExtractError);
  });
});

describe("extractZip", () => {
  it("reads files into memory and strips a shared top folder", async () => {
    const result = await extract(
      makeZip([
        { name: "proj/package.json", content: "{}" },
        { name: "proj/src/index.js", content: "console.log(1)" },
      ]),
    );
    expect(result.files.map((f) => f.path).sort()).toEqual(["package.json", "src/index.js"]);
    expect(result.files.find((f) => f.path === "src/index.js")?.data.toString()).toBe(
      "console.log(1)",
    );
    expect(result.gitDir).toBeNull();
  });

  it("rejects zip-slip entries", async () => {
    await expectRejected(makeZip([{ name: "ok.js" }, { name: "../evil.js" }]), "path_traversal");
    await expectRejected(makeZip([{ name: "proj/../../evil.js" }]), "path_traversal");
  });

  it("rejects absolute paths", async () => {
    await expectRejected(makeZip([{ name: "/etc/cron.d/evil" }]), "absolute_path");
  });

  it("rejects symlinks", async () => {
    await expectRejected(
      makeZip([
        { name: "proj/a.js" },
        { name: "proj/link", content: "/etc/passwd", symlink: true },
      ]),
      "symlink",
    );
  });

  it("rejects an entry bigger than the limit", async () => {
    await expectRejected(makeZip([{ name: "big.js", content: "x".repeat(5000) }]), "too_large", {
      ...LIMITS,
      maxBytes: 1000,
    });
  });

  it("rejects too many files", async () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ name: `src/f${i}.js` }));
    await expectRejected(makeZip(entries), "too_many_files", { ...LIMITS, maxFiles: 3 });
  });

  it("rejects an entry that is bigger than the zip claims", async () => {
    const honest = makeZip([{ name: "a.js", content: "y".repeat(10_000) }]);
    await expectRejected(lieAboutSizes(honest), "size_mismatch");
  });

  it("rejects files that are not zips", async () => {
    const file = path.join(tempDir(), "fake.zip");
    writeFileSync(file, "this is not a zip");
    const error = await extractZip(file, tempDir(), LIMITS).catch((e: unknown) => e);
    expect((error as ExtractError).code).toBe("invalid_zip");
  });

  it("skips dependency folders, binaries and lockfiles without counting them", async () => {
    const result = await extract(
      makeZip([
        { name: "src/app.js" },
        { name: "node_modules/express/index.js" },
        { name: "node_modules/express/lib/router.js" },
        { name: "logo.png" },
        { name: "package-lock.json" },
      ]),
      { ...LIMITS, maxFiles: 1 },
    );
    expect(result.files.map((f) => f.path)).toEqual(["src/app.js"]);
    expect(result.skipped).toEqual({ "dependency folder": 2, "binary or media": 1, lockfile: 1 });
  });

  it("skips (but does not reject) a source file over the per-file size", async () => {
    const result = await extract(
      makeZip([{ name: "a.js" }, { name: "huge.js", content: "z".repeat(300_000) }]),
    );
    expect(result.files.map((f) => f.path)).toEqual(["a.js"]);
    expect(result.skipped["too large"]).toBe(1);
  });

  it("writes .git internals inside the destination only", async () => {
    const dest = tempDir();
    const result = await extractZip(
      writeTempZip(
        makeZip([{ name: "p/a.js" }, { name: "p/.git/HEAD", content: "ref: refs/heads/main\n" }]),
      ),
      dest,
      LIMITS,
    );
    expect(result.gitDir).toBe(path.join(dest, ".git"));
    expect(readFileSync(path.join(dest, ".git", "HEAD"), "utf8")).toContain("refs/heads/main");
    expect(result.files.map((f) => f.path)).toEqual(["a.js"]);
    expect(existsSync(path.join(dest, "a.js"))).toBe(false);
  });
});
