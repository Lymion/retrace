import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

// Tutor replies are model output about untrusted code, so they must never
// be able to put markup or script into the page.

describe("Markdown", () => {
  it("drops raw HTML and script", () => {
    const html = renderToStaticMarkup(
      <Markdown>
        {'Hello <script>alert(1)</script><img src=x onerror="alert(2)"> **world**'}
      </Markdown>,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).toContain("<strong>world</strong>");
  });

  it("neutralises javascript: links and opens real links safely", () => {
    const html = renderToStaticMarkup(
      <Markdown>{"[bad](javascript:alert(1)) [good](https://example.com)"}</Markdown>,
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("turns project file paths into buttons, leaves other code alone", () => {
    const html = renderToStaticMarkup(
      <Markdown filePaths={new Set(["server/db.js"])} onOpenFile={() => undefined}>
        {"See `server/db.js:12` and `npm start`."}
      </Markdown>,
    );
    expect(html).toContain("<button");
    expect(html).toContain("server/db.js:12");
    expect(html).toContain("<code>npm start</code>");
  });
});
