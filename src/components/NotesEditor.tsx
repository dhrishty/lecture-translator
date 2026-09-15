"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { parseNoteBlocks, serializeNoteBlocks, slashCommand, type BlockKind, type NoteBlock } from "@/lib/noteBlocks";

const formats: Array<{ kind: BlockKind; label: string; shortcut: string }> = [
  { kind: "paragraph", label: "Text", shortcut: "/text" },
  { kind: "h1", label: "Heading 1", shortcut: "/heading 1" },
  { kind: "h2", label: "Heading 2", shortcut: "/heading 2" },
  { kind: "h3", label: "Heading 3", shortcut: "/heading 3" },
  { kind: "bullet", label: "Bullet list", shortcut: "/bullet" },
];

export function NotesEditor({ value, onChange, label, placeholder = "Start typing, or use / for headings and lists…" }: {
  value: string; onChange: (value: string) => void; label: string; placeholder?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const blocks = parseNoteBlocks(value);
  useLayoutEffect(() => {
    root.current?.querySelectorAll("textarea").forEach(input => {
      input.style.height = "0px";
      input.style.height = `${input.scrollHeight}px`;
    });
  }, [value]);
  const focus = (index: number, position = 0) => requestAnimationFrame(() => {
    const input = root.current?.querySelectorAll("textarea")[index];
    input?.focus(); input?.setSelectionRange(position, position);
  });
  const commit = (next: NoteBlock[]) => {
    const result = serializeNoteBlocks(next);
    if (result === value) return;
    undo.current.push(value);
    if (undo.current.length > 150) undo.current.shift();
    redo.current = [];
    onChange(result);
  };
  const applyFormat = (kind: BlockKind, index: number) => {
    const block = blocks[index];
    const text = block.text.startsWith("/") ? "" : block.text;
    commit(blocks.map((b, i) => i === index ? { kind, text } : b));
    setDismissed(true); focus(index, text.length);
  };
  const menu = active !== null && blocks[active]?.text.startsWith("/") && !dismissed;
  return <div className="notes-editor" ref={root} role="group" aria-label={label} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setActive(null);
  }}>
    <div className="editor-toolbar" aria-label={`${label} formatting`}>
      {formats.map(format => <button key={format.kind} type="button" title={format.label} aria-label={`${label}: ${format.label}`}
        onMouseDown={event => event.preventDefault()} onClick={() => applyFormat(format.kind, active ?? 0)}>
        {format.kind === "paragraph" ? "Text" : format.kind === "bullet" ? "• List" : format.kind.toUpperCase()}
      </button>)}
      <span>/ for blocks</span>
    </div>
    {blocks.map((block, index) => <div key={index} className={`note-block note-${block.kind}`}>
      {block.kind === "bullet" && <span className="bullet-marker" aria-hidden="true">•</span>}
      <textarea rows={1} aria-label={`${label}, block ${index + 1}`} value={block.text}
        placeholder={index === 0 ? placeholder : ""}
        onFocus={() => { setActive(index); setDismissed(false); }}
        onChange={event => {
          setDismissed(false);
          const text = event.target.value;
          const shortcut = /^(#{1,3}|-) $/.exec(text);
          if (shortcut) {
            const kind: BlockKind = shortcut[1] === "-" ? "bullet" : `h${shortcut[1].length}` as BlockKind;
            commit(blocks.map((b, i) => i === index ? { kind, text: "" } : b));
          } else {
            const pasted = parseNoteBlocks(text);
            if (pasted[0].kind === "paragraph") pasted[0].kind = block.kind;
            commit([...blocks.slice(0, index), ...pasted, ...blocks.slice(index + 1)]);
          }
        }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          const input = event.currentTarget;
          const start = input.selectionStart; const end = input.selectionEnd;
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            const source = event.shiftKey ? redo : undo;
            const target = event.shiftKey ? undo : redo;
            const previous = source.current.pop();
            if (previous !== undefined) { target.current.push(value); onChange(previous); }
            return;
          }
          if (event.key === "Escape") { setDismissed(true); return; }
          if (event.key === "Enter") {
            event.preventDefault();
            const command = slashCommand(block.text);
            if (command) { applyFormat(command, index); return; }
            if (block.kind === "bullet" && !block.text) { applyFormat("paragraph", index); return; }
            const next = [...blocks];
            next.splice(index, 1, { ...block, text: block.text.slice(0, start) }, {
              kind: block.kind === "bullet" ? "bullet" : "paragraph", text: block.text.slice(end),
            });
            commit(next); focus(index + 1);
          } else if (event.key === "Backspace" && start === 0 && end === 0) {
            if (block.kind !== "paragraph") { event.preventDefault(); applyFormat("paragraph", index); }
            else if (index > 0) {
              event.preventDefault(); const previous = blocks[index - 1];
              const next = [...blocks]; next.splice(index - 1, 2, { ...previous, text: previous.text + block.text });
              commit(next); focus(index - 1, previous.text.length);
            }
          } else if (event.key === "Delete" && start === block.text.length && end === start && index < blocks.length - 1) {
            event.preventDefault(); const next = [...blocks];
            next.splice(index, 2, { ...block, text: block.text + blocks[index + 1].text });
            commit(next); focus(index, start);
          }
        }} />
      {menu && active === index && <div className="slash-menu" aria-label="Block types">
        {formats.filter(format => format.shortcut.includes(block.text.toLowerCase()) || block.text === "/" || slashCommand(block.text) === format.kind).map(format => <button key={format.kind} type="button" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat(format.kind, index)}>
          <span>{format.label}</span><small>{format.shortcut}</small>
        </button>)}
      </div>}
    </div>)}
  </div>;
}
