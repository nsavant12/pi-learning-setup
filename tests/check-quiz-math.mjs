import assert from 'node:assert/strict';
import {pathToFileURL, fileURLToPath} from 'node:url';
import * as path from 'node:path';
const agent = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = process.argv[3];
const project = process.argv[2];
const {loadExtensions} = await import(pathToFileURL(packageRoot + '/dist/core/extensions/loader.js'));
const tui = await import(pathToFileURL(path.resolve(packageRoot, '../pi-tui/dist/index.js')));
const {createTerminalMath} = await import(pathToFileURL(agent + '/assets/terminal-math.mjs'));
const {mathLines, MathText} = createTerminalMath(tui);
const loaded = await loadExtensions([project+'/.pi/extensions/quiz.ts',project+'/.pi/extensions/ask-user-question.ts'], project);
assert.deepEqual(loaded.errors, []);
const quiz = loaded.extensions[0].tools.get('quiz').definition;
const ask = loaded.extensions[1].tools.get('ask_user_question').definition;
const theme = {fg: (_color,text)=>text, bg: (_color,text)=>text, bold: text=>text};
const marker = 'AFTER-ANSWER-ONLY';
const base = {question: String.raw`Which expression squares $x_i$?`, details: String.raw`$$r=\sqrt{\frac{1}{d}\sum_{j=1}^{d}x_j^2+\epsilon}$$`, options:[{label:String.raw`$x_i^2$`,value:'square'},{label:String.raw`$x_i^3$`,value:'cube'}], correctAnswer:'square', explanation:marker + String.raw`: $x_i^2=x_i\cdot x_i$.`, shuffle:false};
let mode = 'single';
let showedFeedback = false;
let firstScreen;
function checkWidths(component) {
  for (const width of [100,42,20,8]) {
    for (const line of component.render(width)) {
      assert.ok(!line.includes('\n') && !line.includes('\r'));
      assert.ok(tui.visibleWidth(line) <= width, 'UI line exceeds terminal width');
    }
  }
}
const ctx = {cwd:project, hasUI:true, ui:{custom: async factory=> {
  let result;
  const component = factory({requestRender(){},terminal:{rows:50,columns:100}},theme,{},value=>{result=value;});
  const before = component.render(100).join('\n');
  firstScreen = before;
  assert.ok(before.includes('xᵢ²'));
  assert.ok(!before.includes(marker), 'Explanation leaked before answering');
  assert.ok(!before.includes('Correct!'));
  checkWidths(component);
  if (mode === 'single') component.handleInput('\r');
  else if (mode === 'multi') {
    component.handleInput(' ');
    component.handleInput('\x1b[B');
    component.handleInput(' ');
    component.handleInput('\x1b[B');
    component.handleInput('\x1b[B');
    component.handleInput('\r');
  } else if (mode === 'unknown') {
    component.handleInput('\x1b[B');
    component.handleInput('\x1b[B');
    component.handleInput('\r');
  } else if (mode === 'cancel') {
    component.handleInput('\x1b');
    return result;
  }
  const feedback = component.render(100).join('\n');
  assert.ok(feedback.includes(marker));
  assert.ok(feedback.replace(/\s+/g,'').includes('xᵢ·xᵢ'));
  showedFeedback = true;
  checkWidths(component);
  component.handleInput('\r');
  return result;
}}};
const call = quiz.renderCall(base, theme).render(80).join('\n');
assert.ok(!call.includes(marker));
const single = await quiz.execute('single',base,undefined,undefined,ctx);
assert.equal(single.details.correct,true);
assert.equal(single.details.answers[0].value,'square');
assert.equal(single.details.options[0].label,base.options[0].label, 'Stored source was rewritten');
assert.equal(single.details.explanation,base.explanation);
assert.ok(showedFeedback);
const transcript = quiz.renderResult(single,{},theme);
checkWidths(transcript);
assert.ok(transcript.render(90).join('\n').includes('xᵢ²'));
mode = 'multi';
const multi = await quiz.execute('multi',{...base,multiSelect:true,correctAnswer:['square','cube']},undefined,undefined,ctx);
assert.equal(multi.details.correct,true);
mode = 'unknown';
const unknown = await quiz.execute('unknown',base,undefined,undefined,ctx);
assert.equal(unknown.details.dontKnow,true);
mode = 'cancel';
const cancelled = await quiz.execute('cancel',base,undefined,undefined,ctx);
assert.equal(cancelled.details.status,'cancelled');
const samples = [String.raw`$\alpha + \beta \leq \gamma$`, String.raw`\(x_i^2\)`, String.raw`\[\frac{x}{y}\]`, base.details];
for (const sample of samples) {
  const text = mathLines(sample,100).join('\n');
  assert.ok(!text.includes('\\'), 'Supported math was not rendered');
}
assert.ok(mathLines(String.raw`$\unsupported{x}$`,80).join('\n').includes(String.raw`$\unsupported{x}$`));
assert.ok(mathLines('Cost: $5',80).join('\n').includes('$5'));
assert.ok(mathLines('`$x_i^2$`',80).join('\n').includes('$x_i^2$'));
assert.ok(mathLines('> 1. $x_i^2$',80).join('\n').startsWith('> 1. xᵢ²'));
const colored = '\x1b[36m> 1. $x_i^2$\x1b[0m';
assert.ok(mathLines(colored,80).join('\n').includes('xᵢ²'));
const component = new MathText(String.raw`$\alpha^2$`,0,0);
assert.ok(component.render(20).join('\n').includes('α²'));
component.setText(String.raw`$\beta_1$`);
assert.ok(component.render(20).join('\n').includes('β₁'));
const preference = ask.renderCall({question:String.raw`Prefer $\alpha$ or $\beta$?`,options:[{label:String.raw`$\alpha$`,value:'a'},{label:String.raw`$\beta$`,value:'b'}]},theme).render(80).join('\n');
assert.ok(preference.includes('α') && preference.includes('β'));
console.log(JSON.stringify({ok:true, checks:['actual interactive single/multi-select quiz rendering and grading','no answer/explanation before submission','post-answer math feedback','unknown and cancelled answers','resize width limits','raw source and grading values preserved','fractions roots sums Greek sub/superscripts','unsupported/code/currency fallback','cursor retained','question-tool math'], preview:firstScreen.split('\n').slice(0,13).map(line=>line.trimEnd())}));
