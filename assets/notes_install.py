"""Install notebook-style presentation while preserving the full teaching skill."""
from structured_notes_patch import patch_logger
from quiz_math_patch import patch_math


def managed_section(text, marker, ending, body):
    block = marker + '\n' + body.strip() + '\n' + ending
    if marker not in text:
        return text.rstrip() + '\n\n' + block + '\n'
    start = text.index(marker)
    if ending in text[start:]:
        stop = text.index(ending, start) + len(ending)
    else:
        # Older versions had an opening marker and a single level-two section.
        heading = text.find('\n## ', start)
        following = text.find('\n## ', heading + 1) if heading >= 0 else -1
        stop = following if following >= 0 else len(text)
    return text[:start] + block + '\n' + text[stop:].lstrip('\n')


def install_notes(project, assets, write):
    logger = project / '.pi/extensions/md-log.ts'
    original = logger.read_text()
    updated = patch_logger(original)
    math_updates = {
        project / '.pi/extensions' / filename: patch_math((project / '.pi/extensions' / filename).read_text())
        for filename in ('quiz.ts', 'ask-user-question.ts')
    }
    archive = project / '.pi/references/md-log.original-transcript.ts'
    if not archive.exists():
        write(archive, original)
    write(project / '.pi/extensions/structured-note-format.mjs',
          (assets / 'structured-note-format.mjs').read_text())
    write(project / '.pi/extensions/terminal-math.mjs', (assets / 'terminal-math.mjs').read_text())
    for path, content in math_updates.items():
        write(path, content)
    write(logger, updated)

    instructions_path = project / 'AGENTS.md'
    instructions = instructions_path.read_text().replace(
        'The current session is automatically\nmirrored into Lessons/ by md-log; quizzes and answers are included. Do not write\nduplicate session transcripts.',
        'Concept notes are maintained in Lessons/ through lesson_notes.\nConversation messages and quiz answers stay in Pi.')
    instructions = instructions.replace(
        'Curated lesson notes are written into Lessons/ through lesson_notes; quiz\nquestions and feedback are included automatically.',
        'Concept notes are maintained in Lessons/ through lesson_notes.\nConversation messages and quiz answers stay in Pi.')
    instructions = instructions.replace('Use the local model configured here.', 'Use the teacher model selected in Pi.')
    # Remove the earlier continuity overrides that conflicted with the original
    # teaching process. Saved evidence informs that process; it cannot replace it.
    instructions = instructions.replace('''The learning-continuity extension supplies saved evidence, goals, and due review
questions. At a new lesson, use that history and ask only a short prerequisite
check for gaps relevant to today's goal. Do not repeatedly run an exhaustive
baseline assessment. The learner may skip reviews or choose a different topic.
Offer at most three due questions at the beginning and one transfer/application
question at the end. Ask for a prediction or attempt before giving the solution.''', '''The learning-continuity extension supplies saved evidence, goals, and due review
questions. Use prior evidence to inform the teaching skill's assessment. Follow
its probe, plan and teach sequence, foundation checks, dependency map, plan
checkpoint, and motivate/establish/connect/quiz-check loop. Saved records help
locate understanding; they do not replace the required teaching steps. Offer
up to three due review questions as optional additional review.''')
    instructions = instructions.replace(
        'These project-specific instructions take precedence over conflicting defaults\nin the personal teaching skill, including exhaustive repeated probing.',
        'These continuity instructions supplement the teaching skill without replacing\nits philosophy, assessment requirements, or teaching process.')
    instructions = instructions.replace('fits its 16K context', 'fits the active model context')
    instructions = managed_section(instructions, '<!-- structured-lesson-notes -->', '<!-- /structured-lesson-notes -->', '''
## Concept notes in Obsidian

Use lesson_notes to maintain notebook-style notes for the concepts being taught.
Each section should stand on its own when read later: a clear definition or core
idea, why it matters, a motivated explanation or derivation, a worked example
where useful, common pitfalls, and a few takeaways. Use LaTeX and code where they
help. Optional fields may be omitted; do not fill headings with boilerplate.
Write the current concept before its quiz, not an entire future lesson upfront.

Use a stable key for each concept. When a follow-up clarifies the same idea,
revise that section with its complete updated content and retain useful existing
visuals. Add a new section for a genuinely new concept. Distill insights from
questions into the explanation; never copy the learner's wording, wrong answers,
quiz selections, conversation, internal deliberation, tool narration or planning
chatter. Turn a misconception into a general pitfall and correct explanation.
Quiz and preference-question interfaces still work in Pi, but they are not
copied automatically into the notes. Learning evidence still belongs in
learning_record, Progress.md and Review.md, separate from concept explanations.
Use LaTeX in questions, options and explanations. Pi renders supported math as
terminal-friendly Unicode; use display math for longer standalone formulas.
Unsupported notation remains visible as source. Keep formulas focused and
preserve the quiz's rule that explanations appear only after answering.

Use visuals deliberately. Include a small architecture/data-flow diagram when
components and their relationships are central to understanding. Also consider
a diagram for sequences, dependencies, tensor shapes, comparisons or spatial
ideas that are hard to follow in prose. Usually use zero or one visual per
concept; a second needs a different explanatory purpose. Do not add a visual
every turn, decorate simple facts, or repeat an image already in the note.
Reuse and refine the existing architecture overview as the lesson builds.

Prefer a small native Mermaid diagram for a simple structure or flow. Delegate
more involved rendered structural diagrams to mermaid-maker, and geometric or
precisely placed illustrations to svg-maker. Give the worker a focused brief
with the concept, true relationships, labels/shapes and the single teaching
point. The worker must render, inspect, fix and publish into this project's
viz/ directory. Then pass the actual published path to lesson_notes.visuals;
never invent a filename, embed a temporary preview, or leave a bare file path.
Use a short caption that explains what to notice. The notes tool validates the
image exists and writes a relative image embed; Mermaid source is fenced and
renders directly in Obsidian. If rendering fails, use clear prose or a small
native diagram and report the limitation; do not pretend an image exists.

This changes presentation only. Preserve the full teaching skill's philosophy,
probe/plan/teach process, foundation checks, planning agreement and teaching
loop. Put the agreed teaching plan and dependency map in a concise note section,
without internal planning commentary. Continue using the quiz tool and allow
the learner to attempt problems before revealing their solutions. Terminal
messages should focus on the current question, interaction and essential
updates; omit internal deliberation and avoid repeating the full note.
''')
    write(instructions_path, instructions)

    state = project / '.pi/extensions/learning-continuity/learning-state.mjs'
    if state.exists():
        write(state, state.read_text().replace('Reuse prior evidence rather than repeating a long baseline assessment.',
            "Use saved evidence to inform the teaching skill's assessment; preserve its required foundation checks, planning and teaching steps."))

    learner = project / 'Learner.md'
    if learner.exists():
        text = learner.read_text().replace(
            '- Preferred notes: structured, student-facing read-along notes; omit internal deliberation and tool-use narration.\n', '')
        text = managed_section(text, '<!-- notebook-preferences -->', '<!-- /notebook-preferences -->', '''
- Preferred notes: notebook-style concept explanations, examples, pitfalls and
  takeaways; no copied chat, learner messages/answers, internal deliberation or
  tool narration. Refine a concept's existing section when understanding grows.
- Preferred visuals: purposeful architecture, flow, relationship and spatial
  diagrams beside the relevant explanation, with a caption. Usually zero or one
  per concept; avoid decoration and repeated diagrams.
- Preferred quiz math: readable LaTeX in the Pi interface as well as in notes.
''')
        write(learner, text)

    guide = project / 'Start Here.md'
    if guide.exists():
        text = guide.read_text().replace('Lesson text,\nquestions, answers and quiz feedback are mirrored live.',
                                        'Notebook-style concept sections are updated live.')
        text = text.replace('Curated lesson sections,\nquestions, answers and quiz feedback are written live.',
                            'Notebook-style concept sections are updated live.')
        text = managed_section(text, '<!-- structured-notes-guide -->', '<!-- /structured-notes-guide -->', '''
## Concept notes

Obsidian contains reusable explanations, worked examples, pitfalls and takeaways,
with an architecture diagram or other visual where it helps understanding.
Questions and answers stay in Pi; the notebook does not copy the conversation.
Questions, choices and feedback use Pi's native terminal math renderer for
supported LaTeX. It uses Unicode, including stacked display fractions, rather
than Obsidian's full typesetting; unsupported expressions remain as source.
Follow-up explanations refine the same concept section instead of accumulating
repeated chat turns. Diagrams published in viz/ are embedded beside the concept
with a caption; simple Mermaid diagrams render directly in the note.

Run /reload after installing this update. If an older transcript or read-along
note was linked, Pi opens a separate concept notebook and preserves the previous
file. Existing transcripts are not automatically rewritten. Continue with your
current model and session; no model migration or /new is required. For example:
"Continue the lesson and put notebook-style explanations and useful visuals in
my Obsidian note using lesson_notes."
''')
        write(guide, text)
