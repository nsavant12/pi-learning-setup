# Pi Learning

Start from a terminal with `~/.pi/agent/bin/pi-learn`. The setup installer runs
once; normal lessons do not require Python setup commands. The launcher opens
Obsidian, creates a linked concept notebook, and starts or reattaches tmux.

Use `/skill:teach` followed by the topic. Use `/login` to authenticate a teacher
provider and `/model` to choose a model. Ctrl+S in the model picker saves its
default. Local subagents use the explicit models in their profiles.

- [[Learner]]: goals, preferences and local coding project location.
- [[Progress]]: observed evidence, gaps and next steps.
- [[Review]]: suggested retrieval questions and due dates.
- `/learning-progress`: inspect saved progress in Pi.
- `/lesson-end`: save remaining evidence and a next step before `/quit`.
- `/resume`: reopen a previous Pi session on this machine.

Detach tmux with Ctrl+B then D. Reopen with `pi-learn`; detaching keeps Pi
running. Use `/quit` when finished if you want to stop the main session. Inspect
subagents and close any idle worker sessions through their Pi tools as needed.

Sync the vault privately if you want notes on another machine. Learning evidence
is stored in `.pi/learning-state.json`; your sync must include that file. Pi's
conversation history and provider login are separate, machine-local files.
