"use client";

import Editor, { type Monaco, type OnMount, loader } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

// Monaco loads from our own origin (copied to /public/monaco on install),
// never from a CDN, so the Content Security Policy can stay strict.
loader.config({ paths: { vs: "/monaco/vs" } });

type Editor = Parameters<OnMount>[0];

export interface ViewerNote {
  id: number;
  startLine: number;
  endLine: number;
  note: string;
  category: "concept" | "security" | "pattern" | "gotcha";
}

export interface Selection {
  startLine: number;
  endLine: number;
  text: string;
}

const CATEGORY_LABEL: Record<ViewerNote["category"], string> = {
  concept: "Concept",
  security: "Security",
  pattern: "Pattern",
  gotcha: "Gotcha",
};

export function CodeViewer({
  path,
  language,
  content,
  notes = [],
  openLine = null,
  onOpenLine,
  onSelection,
  readOnly = true,
  onChange,
}: {
  path: string;
  language: string;
  content: string;
  notes?: ViewerNote[];
  openLine?: number | null;
  onOpenLine?: (line: number | null) => void;
  onSelection?: (selection: Selection | null) => void;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  const editorRef = useRef<Editor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorations = useRef<ReturnType<Editor["createDecorationsCollection"]> | null>(null);
  const zoneId = useRef<string | null>(null);
  // Handlers change every render; refs let Monaco's listeners always call the latest one.
  const onOpenLineRef = useRef(onOpenLine);
  const onSelectionRef = useRef(onSelection);
  const notesRef = useRef(notes);
  useEffect(() => {
    onOpenLineRef.current = onOpenLine;
    onSelectionRef.current = onSelection;
    notesRef.current = notes;
  });

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    decorations.current = editor.createDecorationsCollection();

    editor.onMouseDown((event) => {
      if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const line = event.target.position?.lineNumber;
      if (!line) return;
      const hit = notesRef.current.find((n) => n.startLine === line);
      if (hit) onOpenLineRef.current?.(hit.startLine);
    });

    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (!selection || !model || selection.isEmpty()) {
        onSelectionRef.current?.(null);
        return;
      }
      onSelectionRef.current?.({
        startLine: selection.startLineNumber,
        endLine: selection.endLineNumber,
        text: model.getValueInRange(selection).slice(0, 4000),
      });
    });
    renderDecorations();
  };

  function renderDecorations() {
    const monaco = monacoRef.current;
    if (!monaco || !decorations.current) return;
    decorations.current.set(
      notes.map((n) => ({
        range: new monaco.Range(n.startLine, 1, n.endLine, 1),
        options: {
          isWholeLine: true,
          className: "annot-line",
          glyphMarginClassName: `annot-glyph annot-glyph-${n.category}`,
          glyphMarginHoverMessage: {
            value: `**${CATEGORY_LABEL[n.category]}:** ${n.note}`,
            isTrusted: false,
          },
        },
      })),
    );
  }

  useEffect(renderDecorations);

  // The open note is shown inline, right under its line (a Monaco "view zone").
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.changeViewZones((accessor) => {
      if (zoneId.current) accessor.removeZone(zoneId.current);
      zoneId.current = null;
      const note = notes.find((n) => n.startLine === openLine);
      if (!note) return;

      // Built with textContent, never innerHTML: notes come from the model.
      const node = document.createElement("div");
      node.className = "annot-zone";
      const label = document.createElement("strong");
      label.textContent = `${CATEGORY_LABEL[note.category]} · line ${note.startLine}${note.endLine > note.startLine ? `-${note.endLine}` : ""}  `;
      label.className = `annot-zone-label annot-zone-${note.category}`;
      const text = document.createElement("span");
      text.textContent = note.note;
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "×";
      close.setAttribute("aria-label", "Close note");
      close.className = "annot-zone-close";
      close.addEventListener("click", () => onOpenLineRef.current?.(null));
      node.append(label, text, close);

      const lines = Math.min(6, Math.ceil(note.note.length / 90) + 1);
      zoneId.current = accessor.addZone({
        afterLineNumber: note.endLine,
        heightInLines: lines,
        domNode: node,
      });
    });
    if (openLine) editor.revealLineInCenterIfOutsideViewport(openLine);
  }, [openLine, notes]);

  return (
    <Editor
      path={path}
      value={content}
      language={language}
      theme="vs-dark"
      onMount={handleMount}
      onChange={(value) => onChange?.(value ?? "")}
      loading={<span className="p-4 text-sm text-muted">Loading the editor…</span>}
      options={{
        readOnly,
        domReadOnly: readOnly,
        glyphMargin: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbersMinChars: 3,
        automaticLayout: true,
        renderLineHighlight: readOnly ? "none" : "line",
        wordWrap: "off",
        tabSize: 2,
      }}
    />
  );
}
