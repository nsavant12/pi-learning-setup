import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [agent, project, packageRoot] = process.argv.slice(2);
const version = packageRoot ? null : readFileSync(join(agent, "install/current-version"), "utf8").trim();
const loader = packageRoot
  ? join(packageRoot, "dist/core/extensions/loader.js")
  : join(agent, "install/releases", version, "node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js");
const { loadExtensions } = await import(pathToFileURL(loader).href);
const paths = [join(project, ".pi/extensions/research-web/index.ts"),
               join(project, ".pi/extensions/learning-continuity/index.ts")];
const logger = join(project, ".pi/extensions/md-log.ts");
const structuredNotes = existsSync(logger) && readFileSync(logger, "utf8").includes("// PI_LEARN_STRUCTURED_NOTES");
if (structuredNotes) paths.push(logger);
const visualIndex = join(project, ".pi/extensions/visual-tools/index.ts");
if (existsSync(visualIndex)) paths.push(visualIndex);
const mathTools = ["quiz", "ask-user-question"].filter((name) => {
  const file = join(project, ".pi/extensions", name + ".ts");
  return existsSync(file) && readFileSync(file, "utf8").includes("PI_LEARN_TERMINAL_MATH");
});
for (const name of mathTools) paths.push(join(project, ".pi/extensions", name + ".ts"));
const result = await loadExtensions(paths, project);
if (result.errors.length) throw new Error(JSON.stringify(result.errors));
const names = result.extensions.flatMap((extension) => [...extension.tools.keys()]);
for (const name of ["web_search", "web_fetch", "learning_record", ...(structuredNotes ? ["lesson_notes"] : [])]) {
  if (!names.includes(name)) throw new Error("Missing tool: " + name);
}
for (const name of mathTools) {
  const tool = name === "quiz" ? "quiz" : "ask_user_question";
  if (!names.includes(tool)) throw new Error("Missing math-enabled tool: " + tool);
}
// Confirm that the subagent extension will be told where the web tools live.
const mapping = new Map();
globalThis.__pi_interactive_subagents = { registerToolExtension: (name, path) => mapping.set(name, path) };
for (const handler of result.extensions[0].handlers.get("session_start") ?? []) await handler({}, { cwd: project });
const visuals = result.extensions.find((extension) => extension.path === visualIndex);
for (const handler of visuals?.handlers.get("session_start") ?? []) await handler({}, { cwd: project });
for (const name of ["web_search", "web_fetch"]) {
  if (mapping.get(name) !== paths[0]) throw new Error("Missing subagent web-tool mapping: " + name);
}
if (visuals) {
  for (const name of ["write_svg", "edit_svg", "render_svg", "write_mermaid", "edit_mermaid", "render_mermaid"]) {
    if (!mapping.has(name)) throw new Error("Missing diagram-worker tool mapping: " + name);
  }
}
const notebook = result.extensions.find((extension) => extension.path === logger);
if (structuredNotes && readFileSync(logger, "utf8").includes("PI_LEARN_CONCEPT_NOTEBOOK_V2")) {
  for (const event of ["message_end", "tool_call", "tool_result"]) {
    if (notebook.handlers.has(event)) throw new Error("Concept logger must not mirror chat or quiz events: " + event);
  }
}
const memoryHook = result.extensions[1].handlers.get("before_agent_start")[0];
const memory = await memoryHook({}, { cwd: project });
if (!memory?.message?.content?.includes("Recent learning evidence")) throw new Error("Learning memory was not injected");
console.log(JSON.stringify({ ok: true, tools: names, subagentMappings: [...mapping.keys()], continuityInjection: true, conceptNotes: !!notebook, mathTools }));
