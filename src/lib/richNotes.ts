/** Only this small formatting vocabulary is rendered; arbitrary HTML stays text. */
export function escapeNoteHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function inlineNoteHtml(text: string): string {
  const tokens = /(\*\*\*([^\n]+?)\*\*\*|\*\*([^\n]+?)\*\*|\*([^*\n]+?)\*|<u>([^\n]*?)<\/u>)/g;
  let html = "", last = 0;
  for (const match of text.matchAll(tokens)) {
    html += escapeNoteHtml(text.slice(last, match.index));
    const tag = match[3] !== undefined ? "strong" : match[4] !== undefined ? "em" : "u";
    html += match[2] !== undefined ? `<strong><em>${inlineNoteHtml(match[2])}</em></strong>` : `<${tag}>${inlineNoteHtml(match[3] ?? match[4] ?? match[5])}</${tag}>`;
    last = match.index! + match[0].length;
  }
  return html + escapeNoteHtml(text.slice(last));
}
export function notesToHtml(value: string): string {
  let list = false;
  let result = "";
  for (const line of value.split("\n")) {
    const match = /^(#{1,3}|-) (.*)$/.exec(line);
    const bullet = match?.[1] === "-";
    if (list && !bullet) result += "</ul>";
    if (bullet && !list) result += "<ul>";
    list = bullet;
    const tag = bullet ? "li" : match ? `h${match[1].length}` : "p";
    result += `<${tag}>${inlineNoteHtml(match ? match[2] : line) || "<br>"}</${tag}>`;
  }
  return result + (list ? "</ul>" : "");
}
/** Read our editable DOM back into the existing in-memory Markdown note format. */
export function editorToNotes(root: HTMLElement): string {
  function read(node: Node): string {
    if (node.nodeType === 3) return (node.textContent ?? "").replace(/\u00a0/g, " ");
    if (node.nodeType !== 1) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "img", "iframe"].includes(tag)) return "";
    if (tag === "br") return "\n";
    let text = Array.from(el.childNodes).map(read).join("");
    if (["p", "div", "li", "h1", "h2", "h3"].includes(tag)) {
      text = text.replace(/\n$/, "");
      const prefix = tag === "li" ? "- " : /^h[123]$/.test(tag) ? "#".repeat(Number(tag[1])) + " " : "";
      return prefix + text + "\n";
    }
    if ((tag === "b" || tag === "strong" || Number(el.style.fontWeight) >= 600) && text) text = `**${text}**`;
    if ((tag === "i" || tag === "em" || el.style.fontStyle === "italic") && text) text = `*${text}*`;
    if ((tag === "u" || el.style.textDecoration.includes("underline")) && text) text = `<u>${text}</u>`;
    return text;
  }
  return Array.from(root.childNodes).map(read).join("").replace(/\n$/, "");
}
