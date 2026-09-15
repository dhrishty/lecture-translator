export type BlockKind = "paragraph" | "h1" | "h2" | "h3" | "bullet";
export interface NoteBlock { kind: BlockKind; text: string }
const prefixes: Record<BlockKind, string> = { paragraph: "", h1: "# ", h2: "## ", h3: "### ", bullet: "- " };
export function parseNoteBlocks(value: string): NoteBlock[] {
  return value.split("\n").map(line => {
    const match = /^(#{1,3}|-) (.*)$/.exec(line);
    return match ? { kind: match[1] === "-" ? "bullet" : `h${match[1].length}` as BlockKind, text: match[2] } : { kind: "paragraph", text: line };
  });
}
export function serializeNoteBlocks(blocks: NoteBlock[]): string {
  return blocks.map(block => prefixes[block.kind] + block.text).join("\n");
}
export function slashCommand(text: string): BlockKind | null {
  const command = text.trim().toLowerCase().replace(/\s+/g, " ");
  const commands: Record<string, BlockKind> = {
    "/heading 1": "h1", "/h1": "h1", "/heading 2": "h2", "/h2": "h2",
    "/heading 3": "h3", "/h3": "h3", "/bullet": "bullet", "/bullets": "bullet",
    "/text": "paragraph", "/paragraph": "paragraph",
  };
  return commands[command] ?? null;
}
