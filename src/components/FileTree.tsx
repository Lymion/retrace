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
                className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm text-muted hover:bg-surface-2"
                style={{ paddingLeft: depth * 12 + 4 }}
              >
                <span aria-hidden className="w-3 text-xs">
                  {open ? "▾" : "▸"}
                </span>
                {child.name}
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
                className={`flex w-full items-center gap-2 truncate rounded px-1 py-0.5 text-left font-mono text-[13px] ${
                  selected ? "bg-accent-strong/25 text-text" : "hover:bg-surface-2"
                } ${file.dimmed ? "opacity-40" : ""}`}
                style={{ paddingLeft: depth * 12 + 20 }}
                title={file.path}
              >
                <span className="truncate">{name}</span>
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
