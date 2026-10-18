# Verification

Install the README prerequisites and Pi 1.3.0 first. Run from the repository root:

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 tests/run.py --pi "$(command -v pi)"
```

The second command clones the pinned public learning repository into a temporary
vault, runs a fresh and repeated installation without downloading models, npm
packages or browsers, and exercises the actual Pi extension loader and quiz UI.
It also renders a synthetic SVG to PNG, publishes it into a temporary viz folder
and checks image embeds, concept updates and exclusion of chat/answers.

For offline verification, pass a local upstream checkout containing the pinned
commit. Its uncommitted files and personal learning state are not copied:

```bash
python3 tests/run.py --pi /absolute/path/to/pi --learn-source /path/to/learn-checkout
```

Tests check that credentials, other provider settings, the selected main teacher,
original teaching skill, personal notes and learning evidence remain intact.
The macOS launch agent definition, refusal to stop an unrelated Ollama server,
macOS opener, quoting and launcher arguments are tested with mocks. These tests
do not start launchctl, contact Ollama, run a model or open an actual GUI.

Run the same suite on the target Mac for native runtime verification. Use
`doctor.py --web` separately for actual search/fetch checks. Tool registration
is not proof that the selected model will use tools correctly, and no model
memory benchmark is performed by this suite.
