"use client";

import Editor, { type BeforeMount, type Monaco, type OnMount, loader } from "@monaco-editor/react";
import { useEffect, useRef } from "react";

// Monaco loads from our own origin (copied to /public/monaco on install),
// never from a CDN, so the Content Security Policy can stay strict.
loader.config({ paths: { vs: "/monaco/vs" } });

type Editor = Parameters<OnMount>[0];

// The editor's colours match the app's terminal theme (src/app/globals.css)
// and the syntax colours of the app icon.
const THEME = "retrace-terminal";
const defineTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7d8a9c", fontStyle: "italic" },
      { token: "keyword", foreground: "d2a8ff" },
      { token: "string", foreground: "7ee787" },
      { token: "string.escape", foreground: "56d4dd" },
      { token: "number", foreground: "ffa657" },
      { token: "regexp", foreground: "56d4dd" },
      { token: "type", foreground: "79c0ff" },
      { token: "type.identifier", foreground: "79c0ff" },
      { token: "constant", foreground: "ffa657" },
      { token: "variable", foreground: "ffa657" },
      { token: "delimiter", foreground: "95a1b2" },
      { token: "tag", foreground: "7ee787" },
      { token: "attribute.name", foreground: "79c0ff" },
      { token: "attribute.value", foreground: "a5d6ff" },
      { token: "key", foreground: "79c0ff" },
      { token: "string.key.json", foreground: "79c0ff" },
      { token: "string.value.json", foreground: "7ee787" },
    ],
    colors: {
      "editor.background": "#0a0d12",
      "editor.foreground": "#d7dee8",
      "editorLineNumber.foreground": "#3b475a",
      "editorLineNumber.activeForeground": "#7ee787",
      "editorCursor.foreground": "#7ee787",
      "editor.selectionBackground": "#7ee78738",
      "editor.inactiveSelectionBackground": "#7ee78720",
      "editor.lineHighlightBackground": "#161d27",
      "editor.lineHighlightBorder": "#00000000",
      "editorGutter.background": "#0a0d12",
      "editorIndentGuide.background1": "#1b2330",
      "editorIndentGuide.activeBackground1": "#2f3b4d",
      "editorWhitespace.foreground": "#263142",
      "editorWidget.background": "#0e131a",
      "editorWidget.border": "#263142",
      "editorBracketMatch.background": "#7ee78722",
      "editorBracketMatch.border": "#7ee78766",
      "scrollbarSlider.background": "#26314299",
      "scrollbarSlider.hoverBackground": "#33415599",
      "scrollbarSlider.activeBackground": "#3b4a60",
      focusBorder: "#7ee787",
    },
  });
};

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
  focusLine = null,
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
  /** A line to scroll to and highlight, e.g. from an audit finding or a tutor link. */
  focusLine?: number | null;
}) {
  const editorRef = useRef<Editor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorations = useRef<ReturnType<Editor["createDecorationsCollection"]> | null>(null);
  const zoneId = useRef<string | null>(null);
  const focusDecoration = useRef<ReturnType<Editor["createDecorationsCollection"]> | null>(null);
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
    focusDecoration.current = editor.createDecorationsCollection();

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
    applyFocus();
  };

  function applyFocus() {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !focusLine) return;
    const line = Math.min(focusLine, editor.getModel()?.getLineCount() ?? focusLine);
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    focusDecoration.current?.set([
      {
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: "focus-line" },
      },
    ]);
  }

  useEffect(applyFocus, [focusLine, content]);

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
      theme={THEME}
      beforeMount={defineTheme}
      onMount={handleMount}
      onChange={(value) => onChange?.(value ?? "")}
      loading={<span className="spinner p-4 text-sm text-muted">Loading the editor…</span>}
      options={{
        readOnly,
        domReadOnly: readOnly,
        glyphMargin: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        fontFamily: "'Cascadia Code', 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace",
        cursorStyle: "block",
        cursorBlinking: "phase",
        lineNumbersMinChars: 3,
        automaticLayout: true,
        renderLineHighlight: readOnly ? "none" : "line",
        wordWrap: "off",
        tabSize: 2,
      }}
    />
  );
}
