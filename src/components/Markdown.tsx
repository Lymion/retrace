"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders tutor markdown. Raw HTML in the text is dropped (skipHtml, and no
// rehype-raw), and react-markdown already strips javascript: links, so a
// reply can never inject markup or script into the page.
//
// Inline code that names a file in the project becomes a button that opens
// the file, e.g. `server/db.js` or `server/db.js:12`.

export function Markdown({
  children,
  filePaths,
  onOpenFile,
}: {
  children: string;
  filePaths?: Set<string>;
  onOpenFile?: (path: string, line: number | null) => void;
}) {
  const components: Components = {
    a: ({ href, children: label }) => (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {label}
      </a>
    ),
    code: ({ className, children: code }) => {
      const text = String(code ?? "");
      const match = /^(.+?)(?::L?(\d+))?$/.exec(text.trim());
      const path = match?.[1];
      if (!className && path && filePaths?.has(path) && onOpenFile) {
        return (
          <button
            type="button"
            className="rounded bg-surface-2 px-1 font-mono text-[0.85em] text-accent underline-offset-2 hover:underline"
            onClick={() => onOpenFile(path, match?.[2] ? Number(match[2]) : null)}
            title="Open in the code viewer"
          >
            {text}
          </button>
        );
      }
      return <code className={className}>{code}</code>;
    },
  };

  return (
    <div className="prose-tutor text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
