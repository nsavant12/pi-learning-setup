import * as fs from "node:fs";
import * as path from "node:path";

export const NOTE_MARKER = "<!-- pi-lesson-notes:v2 -->";
export const NOTE_HEADER = `${NOTE_MARKER}\n# Lesson notes\n\nConcepts, explanations, worked examples, and takeaways.\n`;

const text = (value) => String(value ?? "").trim();

export function conceptKey(input) {
  const value = text(input.key || input.title).normalize("NFKC").toLowerCase().replace(/\s+/g, "-");
  if (!value || value.length > 160) throw new Error("Use a short, stable key for this concept.");
  return encodeURIComponent(value);
}

export function sectionMarker(key) {
  return `<!-- pi-concept:${key}:start -->`;
}

export function upsertConcept(current, key, markdown) {
  if (!current.startsWith(NOTE_MARKER)) throw new Error("The linked file is not a concept notebook.");
  const startMarker = sectionMarker(key);
  const endMarker = `<!-- pi-concept:${key}:end -->`;
  const start = current.indexOf(startMarker);
  const block = `${startMarker}\n${markdown.trim()}\n${endMarker}`;
  if (start < 0) return current.trimEnd() + "\n\n" + block + "\n";
  const end = current.indexOf(endMarker, start);
  if (end < 0) throw new Error("This concept section has an incomplete marker; preserve the note and repair it first.");
  return current.slice(0, start) + block + current.slice(end + endMarker.length);
}

function imageEmbed(visual, options) {
  if (!options.noteFile || !options.projectRoot) throw new Error("An image needs the note and project paths.");
  const root = fs.realpathSync(path.join(options.projectRoot, "viz"));
  const supplied = text(visual.path);
  const candidate = path.isAbsolute(supplied) ? supplied
    : path.resolve(options.projectRoot, supplied.includes("/") ? supplied : path.join("viz", supplied));
  const image = fs.realpathSync(candidate);
  const relative = path.relative(root, image);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Publish the image into this learning project's viz/ folder before embedding it.");
  }
  if (!/\.(png|jpe?g|svg|webp)$/i.test(image) || !fs.statSync(image).isFile() || !fs.statSync(image).size) {
    throw new Error("The visual must be an existing, nonempty image in viz/.");
  }
  const target = path.relative(fs.realpathSync(path.dirname(options.noteFile)), image).split(path.sep)
    .map((part) => encodeURIComponent(part).replace(/\(/g, "%28").replace(/\)/g, "%29")).join("/");
  const caption = text(visual.caption).replace(/[\r\n]+/g, " ");
  const alt = caption.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  return `![${alt}](${target})\n\n${caption}`;
}

export function renderLessonNotes(input, options = {}) {
  const title = text(input.title).replace(/[\r\n]+/g, " ");
  if (!title || !text(input.idea) || !text(input.explanation)) {
    throw new Error("A note needs a title, core idea, and student-facing explanation.");
  }
  const pieces = [`## ${title}`, `### Core idea\n\n${text(input.idea)}`];
  if (text(input.whyItMatters)) pieces.push(`### Why it matters\n\n${text(input.whyItMatters)}`);
  pieces.push(`### Explanation\n\n${text(input.explanation)}`);

  const visuals = input.visuals ?? [];
  if (!Array.isArray(visuals) || visuals.length > 2) throw new Error("Use at most two purposeful visuals per concept.");
  const rendered = [];
  for (const visual of visuals) {
    if (!text(visual.caption)) throw new Error("Explain what the visual shows in a short caption.");
    if (visual.kind === "image") rendered.push(imageEmbed(visual, options));
    else if (visual.kind === "mermaid") {
      const source = text(visual.source);
      if (!source || source.includes("```")) throw new Error("Provide Mermaid source without code fences.");
      rendered.push("```mermaid\n" + source + "\n```\n\n" + text(visual.caption));
    } else throw new Error("Use an image or Mermaid visual.");
  }
  if (rendered.length) pieces.push(`### Visual explanation\n\n${rendered.join("\n\n")}`);
  for (const [key, heading] of [["example", "Worked example"], ["pitfall", "Common pitfall"], ["exercise", "Try it"]]) {
    if (text(input[key])) pieces.push(`### ${heading}\n\n${text(input[key])}`);
  }
  if (Array.isArray(input.takeaways) && input.takeaways.length) {
    pieces.push("### Takeaways\n\n" + input.takeaways.slice(0, 5).map((item) => "- " + text(item)).join("\n"));
  }
  if (Array.isArray(input.sources) && input.sources.length) {
    const urls = input.sources.filter((url) => typeof url === "string" && /^https?:\/\/[^\s<>]+$/.test(url));
    if (urls.length) pieces.push("### Sources\n\n" + urls.slice(0, 5).map((url) => `- <${url}>`).join("\n"));
  }
  if (text(input.nextStep)) pieces.push(`### Next step\n\n${text(input.nextStep)}`);
  const markdown = pieces.join("\n\n") + "\n";
  if (/<(?:think|thinking|analysis)(?:\s|>)/i.test(markdown)) {
    throw new Error("Write only the concept explanation; remove internal reasoning tags from the note fields.");
  }
  if (/<!--\s*pi-concept:/i.test(markdown)) throw new Error("Concept markers are managed by the notes tool.");
  return markdown;
}
