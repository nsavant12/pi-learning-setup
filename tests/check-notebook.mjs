import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const agent = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = process.argv[3];
const actualProject = process.argv[2];
const { loadExtensions } = await import(pathToFileURL(packageRoot + '/dist/core/extensions/loader.js'));
const format = await import(pathToFileURL(agent + '/assets/structured-note-format.mjs'));
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'pi-notebook-runtime-')));
const originalCwd = process.cwd();
const originalPath = process.env.PATH;
const originalLog = process.env.PI_LEARN_LOG_FILE;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="220" viewBox="0 0 760 220">
<rect width="760" height="220" fill="#ffffff"/>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#285e9b"/></marker></defs>
<g font-family="sans-serif" text-anchor="middle" fill="#152b43">
<text x="380" y="35" font-size="22" font-weight="bold">A linear layer changes feature count</text>
<g fill="#edf4fb" stroke="#285e9b" stroke-width="2"><rect x="25" y="75" width="190" height="90" rx="10"/><rect x="285" y="75" width="190" height="90" rx="10"/><rect x="545" y="75" width="190" height="90" rx="10"/></g>
<g font-size="20" font-weight="bold"><text x="120" y="111">Input X</text><text x="380" y="111">Weights W</text><text x="640" y="111">Output Y = XW</text></g>
<g font-size="18"><text x="120" y="140">2 rows × 3 features</text><text x="380" y="140">3 × 4</text><text x="640" y="140">2 rows × 4 features</text></g>
<text x="380" y="202" font-size="17">Batch size stays 2; features change from 3 to 4.</text></g>
<g stroke="#285e9b" stroke-width="2.5" marker-end="url(#arrow)"><path d="M 223 120 H 274"/><path d="M 483 120 H 534"/></g></svg>`;
try {
  fs.mkdirSync(path.join(tmp, 'Lessons'));
  fs.mkdirSync(path.join(tmp, 'viz'));
  process.chdir(tmp);
  const file = path.join(tmp, 'Lessons', 'lesson.md');
  fs.writeFileSync(file, '');
  process.env.PI_LEARN_LOG_FILE = file;
  const loaded = await loadExtensions([agent + '/assets/notebook-log.ts', actualProject + '/.pi/extensions/visual-tools/tools/svg_tools.ts'], tmp);
  assert.deepEqual(loaded.errors, []);
  const [notebook, svgTools] = loaded.extensions;
  for (const name of ['message_end', 'tool_call', 'tool_result', 'message_update']) assert.equal(notebook.handlers.has(name), false);
  let branch = [];
  loaded.runtime.appendEntry = (customType, data) => branch.push({type: 'custom', customType, data});
  const ctx = {cwd: tmp, isIdle: () => true, sessionManager: {getBranch: () => branch}, ui: {theme: {fg: (_color, text) => text}, setStatus() {}, notify() {}}};
  const start = notebook.handlers.get('session_start')[0];
  await start({}, ctx);
  assert.ok(fs.readFileSync(file, 'utf8').startsWith(format.NOTE_MARKER));
  const writeSvg = svgTools.tools.get('write_svg').definition;
  const renderSvg = svgTools.tools.get('render_svg').definition;
  await writeSvg.execute('svg-write', {source: svg}, undefined, undefined, ctx);
  const rendered = await renderSvg.execute('svg-render', {save_as: 'linear-layer-shapes'}, undefined, undefined, ctx);
  assert.equal(rendered.details.ok, true);
  assert.ok(fs.readFileSync(rendered.details.path).subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  const tool = notebook.tools.get('lesson_notes').definition;
  const concept = {key: 'linear-layer-shapes', title: 'A linear layer changes feature count', idea: 'Each row is mapped from input features to output features.', whyItMatters: 'Tensor shapes tell us how to connect model components.', explanation: 'For $X$ with shape $(B, d_{in})$ and $W$ with shape $(d_{in}, d_{out})$, $Y=XW$ has shape $(B, d_{out})$. Each input row uses the same learned matrix. The number of rows is preserved.', example: 'With $B=2$, $d_{in}=3$, and $d_{out}=4$: $(2,3) \\times (3,4) \\rightarrow (2,4)$.', pitfall: 'The output feature count is set by the number of columns in $W$, not by the batch size.', takeaways: ['Match the inner dimensions when multiplying.', 'A linear layer changes features; it preserves the batch dimension.'], visuals: [{kind: 'image', path: rendered.details.path, caption: 'The inner dimensions match at 3; the outer dimensions give the output shape (2,4).'}], scratchpad: 'PRIVATE-SCRATCH', userMessage: 'PRIVATE-USER'};
  const first = await tool.execute('notes-1', concept, undefined, undefined, ctx);
  let note = fs.readFileSync(file, 'utf8');
  assert.ok(note.includes('### Core idea'));
  assert.ok(note.includes('](../viz/'));
  assert.ok(note.includes(rendered.details.filename));
  assert.ok(!note.includes('PRIVATE-'));
  const updated = await tool.execute('notes-2', {...concept, explanation: concept.explanation + '\n\nThe matrix acts on the final (feature) dimension.'}, undefined, undefined, ctx);
  note = fs.readFileSync(file, 'utf8');
  assert.equal(note.split('## A linear layer changes feature count').length - 1, 1);
  assert.equal(note.split('](../viz/').length - 1, 1);
  assert.ok(note.includes('final (feature) dimension'));
  const baseline = note;
  for (const visual of [
    {kind: 'image', path: path.join(tmp, 'viz', 'missing.png'), caption: 'Missing'},
    {kind: 'image', path: path.join(tmp, 'outside-notebook.svg'), caption: 'Outside'},
  ]) {
    fs.writeFileSync(path.join(tmp, 'outside-notebook.svg'), '<svg/>');
    await assert.rejects(() => tool.execute('bad-image', {...concept, visuals: [visual]}, undefined, undefined, ctx));
    assert.equal(fs.readFileSync(file, 'utf8'), baseline);
  }
  fs.symlinkSync(path.join(tmp, 'outside-notebook.svg'), path.join(tmp, 'viz', 'escaped.svg'));
  await assert.rejects(() => tool.execute('symlink', {...concept, visuals: [{kind:'image',path:'escaped.svg',caption:'Outside'}]}, undefined, undefined, ctx));
  await assert.rejects(() => tool.execute('thinking', {...concept, explanation: '<think>INTERNAL</think>'}, undefined, undefined, ctx));
  await assert.rejects(() => tool.execute('spam', {...concept, visuals: Array(3).fill(concept.visuals[0])}, undefined, undefined, ctx));
  const mermaid = await tool.execute('native', {key: 'layer-order', title: 'Layer order', idea: 'Data passes through components in a defined order.', explanation: 'A dependency graph makes the order explicit.', visuals: [{kind:'mermaid', source:'flowchart LR\n  X[Input] --> L[Linear layer]\n  L --> Y[Output]', caption:'Read arrows from input to output.'}]}, undefined, undefined, ctx);
  note = fs.readFileSync(file, 'utf8');
  assert.ok(note.includes('```mermaid\nflowchart LR'));
  assert.ok(note.includes('### A nonexistent heading') === false);
  branch.push({type:'message', message:{role:'user', content:'PRIVATE-USER-MESSAGE'}});
  branch.push({type:'message', message:{role:'assistant', content:[{type:'text',text:'PRIVATE-ASSISTANT'}, {type:'thinking',thinking:'PRIVATE-THINKING'}]}});
  branch.push({type:'message', message:{role:'toolResult',toolName:'quiz',details:{note:'PRIVATE-ANSWER',explanation:'PRIVATE-FEEDBACK'}}});
  branch.push({type:'message', message:{role:'toolResult',toolName:'ask_user_question',details:{answers:[{label:'PRIVATE-PREFERENCE'}]}}});
  branch.push({type:'message', message:{role:'toolResult',toolName:'lesson_notes',details:{markdown:'PRIVATE-LEGACY'}}});
  for (const result of [first, updated, mermaid]) branch.push({type:'message', message:{role:'toolResult',toolName:'lesson_notes',details:result.details}});
  const backfilled = path.join(tmp, 'Lessons', 'backfill.md');
  fs.writeFileSync(backfilled, '');
  await notebook.commands.get('md-log').handler('Lessons/backfill.md', ctx);
  const backfill = fs.readFileSync(backfilled, 'utf8');
  assert.ok(!backfill.includes('PRIVATE-'));
  assert.equal(backfill.split('## A linear layer changes feature count').length - 1, 1);
  assert.ok(backfill.includes('final (feature) dimension'));
  fs.writeFileSync(backfilled, backfill.replace('final (feature) dimension', 'final (feature) dimension — learner-edited'));
  await notebook.commands.get('md-log').handler('Lessons/backfill.md', ctx);
  assert.ok(fs.readFileSync(backfilled, 'utf8').includes('learner-edited'));
  const raw = path.join(tmp, 'Lessons', 'old-transcript.md');
  fs.writeFileSync(raw, '# Old transcript\nPRIVATE-USER-MESSAGE');
  process.env.PATH = '';
  await notebook.commands.get('md-log').handler('Lessons/old-transcript.md', ctx);
  process.env.PATH = originalPath;
  assert.equal(fs.readFileSync(raw, 'utf8'), '# Old transcript\nPRIVATE-USER-MESSAGE');
  const newNote = branch.at(-1).data.file;
  assert.notEqual(newNote, raw);
  assert.ok(fs.readFileSync(newNote, 'utf8').startsWith(format.NOTE_MARKER));
  assert.ok(!fs.readFileSync(newNote, 'utf8').includes('PRIVATE-'));
  await notebook.commands.get('md-unlog').handler('', ctx);
  await assert.rejects(() => tool.execute('unlinked', concept, undefined, undefined, ctx));
  await start({}, ctx);
  await assert.rejects(() => tool.execute('still-unlinked', concept, undefined, undefined, ctx));
  console.log('Passed: concept updates, image render/publish/embed, Mermaid, no chat or quiz transcript, curated backfill, preserved old notes and unlogging.');
} finally {
  process.chdir(originalCwd);
  if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
  if (originalLog === undefined) delete process.env.PI_LEARN_LOG_FILE; else process.env.PI_LEARN_LOG_FILE = originalLog;
  fs.rmSync(tmp, {recursive:true,force:true});
  fs.rmSync(path.join(tmp, 'outside-notebook.svg'), {force:true});
}
