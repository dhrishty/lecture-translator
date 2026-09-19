"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { slashCommand, type BlockKind } from "@/lib/noteBlocks";
import { editorToNotes, notesToHtml } from "@/lib/richNotes";
const formats: Array<{ kind: BlockKind; label: string; text: string }> = [
  { kind: "paragraph", label: "Text", text: "Text" }, { kind: "h1", label: "Heading 1", text: "H1" },
  { kind: "h2", label: "Heading 2", text: "H2" }, { kind: "h3", label: "Heading 3", text: "H3" }, { kind: "bullet", label: "Bullet list", text: "• List" },
];
export function NotesEditor({ value, onChange, label, placeholder = "Start typing, or use / for headings and lists…" }: {
  value: string; onChange: (value: string) => void; label: string; placeholder?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const composing = useRef(false);
  const [menu, setMenu] = useState(false);
  useLayoutEffect(() => {
    if (root.current && value !== last.current) {
      root.current.innerHTML = notesToHtml(value);
      last.current = value;
    }
  }, [value]);
  const remember = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && root.current?.contains(selection.anchorNode) && root.current.contains(selection.focusNode)) savedRange.current = selection.getRangeAt(0).cloneRange();
  };
  const currentBlock = () => {
    const node = window.getSelection()?.anchorNode;
    const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
    const block = element?.closest("p, div, li, h1, h2, h3");
    return block && block !== root.current && root.current?.contains(block) ? block : null;
  };
  const save = () => {
    if (!root.current || composing.current) return;
    const next = editorToNotes(root.current);
    last.current = next;
    onChange(next);
    remember();
    setMenu((currentBlock()?.textContent ?? "").startsWith("/"));
  };
  const restore = () => {
    root.current?.focus();
    const selection = window.getSelection();
    if (savedRange.current && root.current?.contains(savedRange.current.commonAncestorContainer)) {
      selection?.removeAllRanges(); selection?.addRange(savedRange.current);
    }
  };
  // Native editing keeps Chrome's undo history and IME composition intact.
  const command = (name: string, argument?: string) => {
    restore(); document.execCommand(name, false, argument); save();
  };
  const format = (kind: BlockKind, removeShortcut = false) => {
    restore();
    const block = currentBlock();
    if (removeShortcut && block) {
      const range = document.createRange(); range.selectNodeContents(block);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      document.execCommand("delete");
    }
    if (kind === "bullet") document.execCommand("insertUnorderedList");
    else {
      if (currentBlock()?.closest("li")) document.execCommand("insertUnorderedList");
      document.execCommand("formatBlock", false, kind === "paragraph" ? "p" : kind);
    }
    save(); setMenu(false);
  };
  return <div className="notes-editor" role="group" aria-label={label}>
    <div className="editor-toolbar" role="toolbar" aria-label={`${label} formatting`}>
      {formats.map(item => <button key={item.kind} type="button" title={item.label} aria-label={`${label}: ${item.label}`} onMouseDown={e => e.preventDefault()} onClick={() => format(item.kind)}>{item.text}</button>)}
      {([['bold', 'Bold', 'B'], ['italic', 'Italic', 'I'], ['underline', 'Underline', 'U']] as const).map(([name, title, text]) => <button className={`format-${name}`} type="button" key={name} title={title} aria-label={`${label}: ${title}`} onMouseDown={e => e.preventDefault()} onClick={() => command(name)}>{text}</button>)}
    </div>
    <div ref={root} className="rich-editor" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label} data-placeholder={placeholder} data-empty={!value.trim()}
      onInput={save} onKeyUp={remember} onMouseUp={remember} onBlur={remember}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; save(); }}
      onPaste={event => { event.preventDefault(); command("insertText", event.clipboardData.getData("text/plain")); }}
      onDrop={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { setMenu(false); return; }
        if ((event.ctrlKey || event.metaKey) && ["b", "i", "u"].includes(event.key.toLowerCase())) { event.preventDefault(); command(({ b: "bold", i: "italic", u: "underline" } as Record<string, string>)[event.key.toLowerCase()]); return; }
        const text = currentBlock()?.textContent ?? "";
        const shortcut = event.key === "Enter" ? slashCommand(text) : event.key === " " ? ({ "#": "h1", "##": "h2", "###": "h3", "-": "bullet" } as Record<string, BlockKind>)[text] : null;
        if (shortcut) { event.preventDefault(); remember(); format(shortcut, true); }
      }} />
    {menu && <div className="slash-menu" aria-label="Block types">{formats.map(item => <button type="button" key={item.kind} onMouseDown={e => e.preventDefault()} onClick={() => format(item.kind, true)}>{item.label}</button>)}</div>}
  </div>;
}
