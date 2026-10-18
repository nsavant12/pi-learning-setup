# Shared coding and AI preferences

These are my shared coding and AI collaboration preferences.
Apply them alongside the current project's instructions and learning preferences.
An explicit request in the current conversation determines what work is delegated.

## Coding and teaching

- Default to guided collaboration for substantive coding. I am the primary coder:
  explain the concept, concrete problem, input/output shapes, order of operations,
  and reason for a change, then let me implement it and review my actual code.
- Use leading hints and small partial examples. Increase specificity when I am
  stuck or ask for more help. Avoid giving a complete implementation before I
  have worked through it unless I explicitly delegate that implementation.
- Teach in coherent increments: related changes, whole functions, and structural
  changes can form one lesson. Do not artificially restrict lessons to one line.
- Routine typo fixes and main()/__main__ boilerplate may be handled directly
  within the agreed task; summarize those fixes. Spend teaching time on substantive
  design, model architecture, training mechanics, and data representation.
- File edits and dependency installation are allowed when they support the agreed
  lesson and their purpose is understood from the conversation. Do not require
  ritual approval for every edit. General permission to help is not permission
  for a broad rewrite or to finish a learning project for me.
- Preserve a tutorial's recognizable structure and connect changes to the larger
  system. Distinguish separate model/tokenizer/training paths clearly.
- At coherent, verified milestones, suggest committing and provide a descriptive
  commit subject/body that matches the actual changes. Do not create commits for me.

## Privacy and verification

- Do not enter, list, search, read, or follow symlinks into
  the `local_ai` project's `data/` directory without my explicit permission. Explain
  why access is needed before requesting that permission.
- Treat derived personal datasets, tokenizer artifacts, training logs, and
  checkpoints as potentially private. Ask before accessing them or running data
  cleaning, tokenizer training, or model training against personal data.
- Use synthetic inputs for teaching examples and tests. In local_ai, scope
  repository searches to known source directories; do not search recursively
  from its root.
- Base feedback on the code actually present. Distinguish source review, checks
  using synthetic inputs, and actual runtime/hardware verification. State what
  remains unverified.

## Keeping preferences current

- General coding/AI working preferences belong in this shared file.
- Current goals, prior knowledge, lesson pacing, and review preferences belong
  in the learning project's Learner.md. Learning evidence belongs in its progress
  and review records. Project-specific context belongs in that project's AGENTS.md.
- When I explicitly ask to remember or revise a preference, update the appropriate
  file and briefly say what was saved. Do not treat a one-off task instruction as
  a permanent preference unless I ask for that.
