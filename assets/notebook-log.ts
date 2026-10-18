/** Concept notes for Obsidian. Only lesson_notes writes lesson content. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import { NOTE_HEADER, NOTE_MARKER, conceptKey, renderLessonNotes, sectionMarker, upsertConcept } from "./structured-note-format.mjs";

// PI_LEARN_STRUCTURED_NOTES
// PI_LEARN_CONCEPT_NOTEBOOK_V2
export default function notebookLog(pi: ExtensionAPI) {
  let logFile: string | null = null;
  let writeLock: Promise<unknown> = Promise.resolve();
  function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const result = writeLock.then(fn);
    writeLock = result.catch(() => {});
    return result;
  }

  function setStatus(ctx: any) {
    ctx.ui.setStatus("md-log", logFile
      ? ctx.ui.theme.fg("accent", "🗒 ") + ctx.ui.theme.fg("dim", path.basename(logFile))
      : undefined);
  }

  async function link(file: string, ctx: any): Promise<string> {
    const current = fs.readFileSync(file, "utf8");
    if (current.trim() && !current.startsWith(NOTE_MARKER)) {
      const stem = path.basename(file, path.extname(file));
      file = path.join(path.dirname(file), stem + "-notes-" + Date.now() + ".md");
      fs.writeFileSync(file, NOTE_HEADER, { flag: "wx" });
      ctx.ui.notify("Opened concept notes; the previous note or transcript was preserved.", "info");
      await pi.exec(process.platform === "darwin" ? "open" : "xdg-open", ["obsidian://open?path=" + encodeURIComponent(file)], { timeout: 5000 }).catch(() => {});
    } else if (!current.trim()) {
      fs.writeFileSync(file, NOTE_HEADER);
    }
    logFile = file;
    pi.appendEntry("md-log", { file });
    setStatus(ctx);
    return file;
  }

  // Restore ONLY curated concept entries on the active session branch.
  function backfill(ctx: any): number {
    if (!logFile) return 0;
    const chain: any[] = ctx.sessionManager.getBranch();
    const concepts = new Map<string, string>();
    for (const entry of chain) {
      const msg = entry.type === "message" ? entry.message : undefined;
      if (msg?.role !== "toolResult" || msg.toolName !== "lesson_notes" || msg.isError || msg.details?.version !== 2) continue;
      const { key, markdown } = msg.details;
      if (typeof key === "string" && typeof markdown === "string") concepts.set(key, markdown);
    }
    let current = fs.readFileSync(logFile, "utf8");
    let count = 0;
    for (const [key, markdown] of concepts) {
      // Preserve an existing section, including any edits the learner made.
      if (current.includes(sectionMarker(key))) continue;
      current = upsertConcept(current, key, markdown);
      count++;
    }
    if (count) fs.writeFileSync(logFile, current, "utf8");
    return count;
  }

  pi.on("session_start", async (_event, ctx) => {
    await withLock(async () => {
      logFile = null;
      let saved: { file: string | null } | undefined;
      for (const entry of ctx.sessionManager.getBranch()) {
        if (entry.type === "custom" && entry.customType === "md-log") saved = entry.data;
      }
      const file = saved ? saved.file : process.env.PI_LEARN_LOG_FILE;
      if (!file) { setStatus(ctx); return; }
      if (!fs.existsSync(file)) {
        if (saved) { ctx.ui.notify("The linked note is missing. Relink with /md-log.", "warning"); return; }
        fs.writeFileSync(file, NOTE_HEADER, { flag: "wx" });
      }
      await link(file, ctx);
      backfill(ctx);
    });
  });

  // Conversation and quiz events never write prose. A misconception belongs
  // in a reusable explanation through lesson_notes, without quoting the learner.
  pi.registerTool({
    name: "lesson_notes",
    label: "Update Concept Notes",
    description: "Maintain notebook-style concept notes in Obsidian, before the concept's quiz. Include definitions, motivated explanations/derivations, worked examples, pitfalls and takeaways. Never include internal deliberation, chat transcripts, learner quotes, selected quiz answers or tool narration. Use the same key to revise a concept; pass its full updated section, retaining any useful visual. Optional visuals must explain a relationship, architecture, flow or geometry: usually zero or one, never decorative. Prefer a small native Mermaid graph; for a rendered image use the actual published viz/ path returned by the diagram worker, with a caption. Preserve the full teaching method, probe/plan/teach sequence and quiz tools.",
    parameters: Type.Object({
      key: Type.Optional(Type.String({ maxLength: 160, description: "Stable concept key; reuse it when refining the same concept." })),
      title: Type.String(), idea: Type.String(), explanation: Type.String(),
      whyItMatters: Type.Optional(Type.String()), example: Type.Optional(Type.String()),
      pitfall: Type.Optional(Type.String()), exercise: Type.Optional(Type.String()),
      takeaways: Type.Optional(Type.Array(Type.String())),
      sources: Type.Optional(Type.Array(Type.String())), nextStep: Type.Optional(Type.String()),
      visuals: Type.Optional(Type.Array(Type.Union([
        Type.Object({ kind: Type.Literal("image"), path: Type.String(), caption: Type.String() }),
        Type.Object({ kind: Type.Literal("mermaid"), source: Type.String(), caption: Type.String() }),
      ]), { maxItems: 2 })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      return withLock(() => {
        if (!logFile || !fs.existsSync(logFile)) throw new Error("No lesson note linked. Start with pi-learn or use /md-log <existing note>.");
        const markdown = renderLessonNotes(params, { noteFile: logFile, projectRoot: ctx.cwd });
        const key = conceptKey(params);
        const current = fs.readFileSync(logFile, "utf8");
        fs.writeFileSync(logFile, upsertConcept(current, key, markdown), "utf8");
        return { content: [{ type: "text", text: "Updated concept notes: " + params.title }],
          details: { version: 2, key, markdown, title: params.title } };
      });
    },
  });

  pi.registerCommand("md-log", {
    description: "Link concept notes; restore curated sections without copying conversation history",
    handler: async (args, ctx: any) => {
      if (!args.trim()) { ctx.ui.notify("Usage: /md-log <existing note>", "warning"); return; }
      if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
        ctx.ui.notify("Wait for the teacher to finish before linking a note.", "warning"); return;
      }
      const resolved = path.resolve(ctx.cwd, args.trim());
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        ctx.ui.notify("Choose an existing note file: " + resolved, "error"); return;
      }
      await withLock(async () => {
        await link(resolved, ctx);
        const count = backfill(ctx);
        ctx.ui.notify(`Linked concept notes (${count} sections restored).`, "success");
      });
    },
  });
  pi.registerCommand("md-unlog", {
    description: "Stop updating the linked concept notebook",
    handler: async (_args, ctx) => withLock(() => {
      logFile = null;
      pi.appendEntry("md-log", { file: null });
      setStatus(ctx);
      ctx.ui.notify("Concept note updates stopped.", "info");
    }),
  });
}
