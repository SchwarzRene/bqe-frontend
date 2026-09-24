import { esc } from "./ui.js";

/**
 * Render a small, safe Markdown subset for journal entries: headings, lists,
 * quotes, bold/italic, inline code and links. Input is escaped first, so user
 * text can never inject HTML.
 */
export function renderMarkdown(source) {
  const lines = esc(source || "").split("\n");
  const html = [];
  let list = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.*)/);
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)/);
    const quote = line.match(/^&gt;\s?(.*)/);

    if (heading || bullet || ordered || quote || !line.trim()) flushParagraph();
    if (!bullet && !ordered) closeList();

    if (heading) html.push(`<h${heading[1].length + 1}>${inline(heading[2])}</h${heading[1].length + 1}>`);
    else if (bullet || ordered) {
      const tag = bullet ? "ul" : "ol";
      if (list !== tag) { closeList(); html.push(`<${tag}>`); list = tag; }
      html.push(`<li>${inline((bullet || ordered)[1])}</li>`);
    } else if (quote) html.push(`<blockquote>${inline(quote[1])}</blockquote>`);
    else if (line.trim()) paragraph.push(line);
  }
  flushParagraph();
  closeList();
  return html.join("");
}

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    // Only http(s) links: blocks javascript: URLs even though the text is escaped.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
