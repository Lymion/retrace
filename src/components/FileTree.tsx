"use client";

import { useMemo, useState } from "react";

// A collapsible file tree built from flat paths. Every row is a real button,
// so Tab, Enter and Space work without extra code.

export interface TreeFile {
  id: number;
  path: string;
  dimmed?: boolean;
  badge?: string;
}

interface Folder {
  name: string;
  path: string;
  folders: Map<string, Folder>;
  files: { name: string; file: TreeFile }[];
}

// File names coloured by type, the way `ls --color` and editors do it.
const TYPE_COLOR: [RegExp, string][] = [
  [/^\.env|\.(pem|key)$/i, "text-danger"],
  [/\.(tsx?|jsx?|mjs|cjs)$/i, "text-warn"],
  [/\.(py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php)$/i, "text-cyan"],
  [/\.(css|scss|sass|less)$/i, "text-keyword"],
  [/\.(html?|vue|svelte|astro)$/i, "text-number"],
  [/\.(json|ya?ml|toml|ini|lock|cfg)$/i, "text-ok"],
  [/\.(md|mdx|txt|rst)$/i, "text-muted"],
  [/\.(sql|sqlite|db|prisma)$/i, "text-pattern"],
];

function typeColor(name: string): string {
  return TYPE_COLOR.find(([pattern]) => pattern.test(name))?.[1] ?? "text-text";
}

function buildTree(files: TreeFile[]): Folder {
  const root: Folder = { name: "", path: "", folders: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const childPath = node.path ? `${node.path}/${part}` : part;
      let child = node.folders.get(part);
      if (!child) {
        child = { name: part, path: childPath, folders: new Map(), files: [] };
        node.folders.set(part, child);
      }
      node = child;
    }
    node.files.push({ name: parts[parts.length - 1] ?? file.path, file });
  }
  return root;
}

export function FileTree({
  files,
  selectedId,
  onSelect,
  label = "Project files",
}: {
  files: TreeFile[];
  selectedId: number | null;
  onSelect: (file: TreeFile) => void;
  label?: string;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (folderPath: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });

  const renderFolder = (folder: Folder, depth: number) => (
    <ul role={depth === 0 ? "tree" : "group"} aria-label={depth === 0 ? label : undefined}>
      {[...folder.folders.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((child) => {
          const open = !collapsed.has(child.path);
          return (
            <li key={child.path} role="treeitem" aria-expanded={open} aria-selected={false}>
              <button
                type="button"
                onClick={() => toggle(child.path)}
                className="flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-left text-[13px] font-semibold text-accent hover:bg-surface-2"
                style={{ paddingLeft: depth * 12 + 4 }}
              >
                <span aria-hidden className="w-3 text-xs text-comment">
                  {open ? "▾" : "▸"}
                </span>
                {child.name}
                <span aria-hidden className="text-comment">
                  /
                </span>
              </button>
              {open && renderFolder(child, depth + 1)}
            </li>
          );
        })}
      {folder.files
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ name, file }) => {
          const selected = file.id === selectedId;
          return (
            <li key={file.id} role="treeitem" aria-selected={selected}>
              <button
                type="button"
                onClick={() => onSelect(file)}
                aria-current={selected ? "true" : undefined}
                className={`flex w-full items-center gap-1 truncate rounded-sm px-1 py-0.5 text-left font-mono text-[13px] ${
                  selected ? "bg-ok/15" : "hover:bg-surface-2"
                } ${file.dimmed ? "opacity-40" : ""}`}
                style={{ paddingLeft: depth * 12 + 8 }}
                title={file.path}
              >
                <span aria-hidden className="w-3 shrink-0 text-xs text-ok">
                  {selected ? "❯" : ""}
                </span>
                <span
                  className={`truncate ${selected ? "glow font-semibold text-bright" : typeColor(name)}`}
                >
                  {name}
                </span>
                {file.badge && (
                  <span className="ml-auto shrink-0 rounded bg-surface-2 px-1 text-[10px] text-muted">
                    {file.badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
    </ul>
  );

  return <nav className="text-text">{renderFolder(tree, 0)}</nav>;
}
