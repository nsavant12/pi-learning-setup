#!/usr/bin/env python3
"""Install the learning configuration into an existing Obsidian vault."""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets'
LOCK = json.loads((ROOT / 'upstream-lock.json').read_text())
sys.path.insert(0, str(ASSETS))
from notes_install import install_notes


def run(*args, **kwargs):
    print('+', shlex.join([str(arg) for arg in args]), flush=True)
    return subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def load_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else ({} if default is None else default)


def dump(value):
    return json.dumps(value, indent=2) + '\n'


def model_id(value):
    if not re.fullmatch(r'[A-Za-z0-9_.:-]+/[A-Za-z0-9_./:@-]+', value):
        raise argparse.ArgumentTypeError('Use provider/model without whitespace, such as ollama/gemma4:26b.')
    return value


def pi_package(pi, agent):
    for parent in [pi.resolve().parent, *pi.resolve().parents]:
        manifest = parent / 'package.json'
        if manifest.is_file() and load_json(manifest).get('name') == '@earendil-works/pi-coding-agent':
            return parent
    for base in [agent, *pi.resolve().parents]:
        version_file = base / 'install/current-version'
        if version_file.exists():
            package = base / 'install/releases' / version_file.read_text().strip() / 'node_modules/@earendil-works/pi-coding-agent'
            if (package / 'dist/core/extensions/loader.js').is_file():
                return package
    raise RuntimeError('Cannot locate the Pi package. Install the documented npm version or pass --pi with its executable path.')


class Installer:
    def __init__(self, agent):
        self.agent = agent
        self.backup = agent / 'backups' / ('pi-learning-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))

    def write(self, path, content):
        path = Path(path)
        if path.exists() and path.read_text() == content:
            return
        if path.exists():
            key = hashlib.sha256(str(path).encode()).hexdigest()[:12]
            saved = self.backup / key / path.name
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, saved)
            (saved.parent / 'original-path.txt').write_text(str(path) + '\n')
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix='.' + path.name + '-', delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
        try:
            temporary.chmod((path.stat().st_mode & 0o777) if path.exists() else 0o600)
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)

    def json(self, path, value):
        self.write(path, dump(value))


def api(path, payload=None, timeout=30):
    request = urllib.request.Request('http://127.0.0.1:11434' + path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def install_alias(base, alias, context):
    environment = dict(os.environ, OLLAMA_HOST='http://127.0.0.1:11434')
    try:
        info = api('/api/show', {'model': base})
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
        run('ollama', 'pull', base, env=environment)
        info = api('/api/show', {'model': base})
    if not {'tools', 'vision'}.issubset(info.get('capabilities', [])):
        raise RuntimeError(f'{base} does not advertise tools and vision; model assignments were preserved.')
    with tempfile.TemporaryDirectory(prefix='pi-learning-model-') as tmp:
        modelfile = Path(tmp) / 'Modelfile'
        modelfile.write_text(f'FROM {base}\nPARAMETER num_ctx {context}\n')
        run('ollama', 'create', alias, '-f', modelfile, env=environment)
    shown = api('/api/show', {'model': alias})
    if not re.search(r'^\s*num_ctx\s+' + str(context) + r'\s*$', shown.get('parameters', ''), re.M):
        raise RuntimeError(f'Ollama did not confirm num_ctx={context} for {alias}.')
    return {'id': alias, 'name': alias, 'input': ['text', 'image'], 'contextWindow': context, 'maxTokens': 4096}


def service_definition(ollama, home):
    return {'Label': 'io.pi-learning.ollama', 'ProgramArguments': [str(ollama), 'serve'],
        'WorkingDirectory': str(home), 'RunAtLoad': True, 'KeepAlive': True,
        'EnvironmentVariables': {'HOME': str(home), 'OLLAMA_NUM_PARALLEL': '1',
            'OLLAMA_MAX_LOADED_MODELS': '1', 'OLLAMA_CONTEXT_LENGTH': '16384',
            'PATH': str(ollama.parent) + ':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'},
        'StandardOutPath': str(home / 'Library/Logs/pi-learning-ollama.log'),
        'StandardErrorPath': str(home / 'Library/Logs/pi-learning-ollama-error.log')}


def manage_ollama(installer):
    if sys.platform != 'darwin':
        raise RuntimeError('--manage-ollama is for macOS. On Linux, use your existing Ollama service or the README server command.')
    executable = shutil.which('ollama')
    if not executable:
        raise RuntimeError('Install Ollama first; see the README Homebrew commands.')
    home = Path.home()
    unit = home / 'Library/LaunchAgents/io.pi-learning.ollama.plist'
    label = f'gui/{os.getuid()}/io.pi-learning.ollama'
    owned = subprocess.run(['launchctl', 'print', label], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    try:
        api('/api/tags', timeout=2)
        running = True
    except OSError:
        running = False
    if running and not owned:
        raise RuntimeError('Another Ollama server is already running. Quit the Ollama menu-bar app (or stop its original launcher), then rerun with --manage-ollama. No existing server was stopped.')
    if unit.exists() and load_plist(unit).get('Label') != 'io.pi-learning.ollama':
        raise RuntimeError(f'{unit} is not the expected service; preserved it.')
    definition = plistlib.dumps(service_definition(Path(executable), home), fmt=plistlib.FMT_XML).decode()
    (home / 'Library/Logs').mkdir(parents=True, exist_ok=True)
    if owned and unit.exists() and unit.read_text() == definition:
        return
    if owned:
        run('launchctl', 'bootout', label)
    installer.write(unit, definition)
    run('launchctl', 'bootstrap', f'gui/{os.getuid()}', unit)
    for _ in range(45):
        try:
            api('/api/tags', timeout=2)
            return
        except OSError:
            time.sleep(1)
    raise RuntimeError('The launch agent was installed, but Ollama is not ready. Check ~/Library/Logs/pi-learning-ollama-error.log.')


def load_plist(path):
    with path.open('rb') as handle:
        return plistlib.load(handle)


def merge_models(catalog, entries):
    provider = catalog.setdefault('providers', {}).setdefault('ollama', {})
    if provider.get('baseUrl', 'http://127.0.0.1:11434/v1').rstrip('/') not in (
            'http://localhost:11434/v1', 'http://127.0.0.1:11434/v1'):
        raise RuntimeError('The existing Ollama provider uses a different server. Preserved it; use a separate --agent-dir.')
    provider.update(baseUrl='http://127.0.0.1:11434/v1', api='openai-completions')
    provider.setdefault('apiKey', 'ollama')
    models = provider.setdefault('models', [])
    for entry in entries:
        existing = next((item for item in models if item.get('id') == entry['id']), None)
        if existing is None:
            models.append(entry)
        else:
            existing.update(entry)
    return catalog


def configure(project, installer, pi, package, research_model, diagram_model, entries, teacher=None):
    config = project / '.pi'
    skill = config / 'skills/teach/SKILL.md'
    before = skill.read_bytes()
    if hashlib.sha256(before).hexdigest() != LOCK['teachingSkillSHA256']:
        raise RuntimeError('The teaching skill differs from the pinned full version. It was preserved; inspect your custom skill before installing.')
    # Validate note/quiz patch anchors before writing project configuration.
    from structured_notes_patch import patch_logger
    from quiz_math_patch import patch_math
    patch_logger((config / 'extensions/md-log.ts').read_text())
    for name in ('quiz.ts', 'ask-user-question.ts'):
        patch_math((config / 'extensions' / name).read_text())
    catalog_path = installer.agent / 'models.json'
    catalog = merge_models(load_json(catalog_path), entries) if entries else load_json(catalog_path)
    for source, target in [('research-web.ts','extensions/research-web/index.ts'),
            ('research_web.py','extensions/research-web/research_web.py'),
            ('learning-continuity.ts','extensions/learning-continuity/index.ts'),
            ('learning-state.mjs','extensions/learning-continuity/learning-state.mjs')]:
        installer.write(config / target, (ASSETS / source).read_text())
    researcher = (ROOT / 'templates/researcher.md').read_text().replace('{{MODEL}}', research_model)
    installer.write(config / 'agents/researcher.md', researcher)
    for name in ('svg-maker', 'mermaid-maker'):
        profile = config / 'agents' / (name + '.md')
        text, count = re.subn(r'^model:.*$', 'model: ' + diagram_model, profile.read_text(), flags=re.M)
        if count != 1:
            raise RuntimeError(f'Expected one model setting in {profile}; preserved the original teaching skill.')
        installer.write(profile, re.sub(r'^thinking:.*\n', '', text, flags=re.M))
    instructions = project / 'AGENTS.md'
    if not instructions.exists():
        installer.write(instructions, (ROOT / 'templates/project-agents.md').read_text())
    continuity = '<!-- portable-learning-continuity -->'
    if continuity not in instructions.read_text():
        installer.write(instructions, instructions.read_text().rstrip() + '\n\n' + continuity + '\n' + (ROOT / 'templates/continuity.md').read_text())
    for name in ('Learner.md', 'Start Here.md'):
        if not (project / name).exists():
            installer.write(project / name, (ROOT / 'templates' / name).read_text())
    shared = installer.agent / 'AGENTS.md'
    from notes_install import managed_section
    shared_text = shared.read_text() if shared.exists() else ''
    installer.write(shared, managed_section(shared_text, '<!-- pi-learning-shared-preferences -->',
        '<!-- /pi-learning-shared-preferences -->', (ROOT / 'templates/shared-preferences.md').read_text()))
    install_notes(project, ASSETS, installer.write)
    if entries:
        installer.json(catalog_path, catalog)
    settings_path = config / 'settings.json'
    settings = load_json(settings_path)
    settings['enableSkillCommands'] = True
    overrides = settings.setdefault('compaction', {}).setdefault('modelOverrides', {})
    settings['compaction']['enabled'] = True
    for entry in entries:
        context = entry['contextWindow']
        overrides.setdefault('ollama/' + entry['id'], {}).update(reserveTokens=4096,
            keepRecentTokens=8192 if context >= 32768 else 4096)
    if teacher:
        provider, model = teacher.split('/', 1)
        settings.update(defaultProvider=provider, defaultModel=model)
    installer.json(settings_path, settings)
    visual_manifest = config / 'extensions/visual-tools/package.json'
    manifest = load_json(visual_manifest)
    manifest.pop('devDependencies', None)
    manifest.pop('peerDependencies', None)
    manifest['dependencies']['@mermaid-js/mermaid-cli'] = LOCK['mermaidCLI']
    installer.json(visual_manifest, manifest)
    for name in ('Lessons', 'viz'):
        (project / name).mkdir(exist_ok=True)
    if skill.read_bytes() != before:
        raise RuntimeError('The teaching skill changed unexpectedly; inspect it before starting Pi.')
    return settings


def install_launcher(installer, project, pi, package):
    installer.json(installer.agent / 'learning-setup.json', {'version': 1, 'project': str(project),
        'agentDir': str(installer.agent), 'pi': str(pi), 'piPackage': str(package),
        'source': str(ROOT), 'tmuxSession': 'pi-learning'})
    wrapper = installer.agent / 'bin/pi-learn'
    installer.write(wrapper, '#!/bin/sh\nexec python3 ' + shlex.quote(str(ROOT / 'launcher.py'))
        + ' --config ' + shlex.quote(str(installer.agent / 'learning-setup.json')) + ' "$@"\n')
    wrapper.chmod(0o755)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vault', required=True, type=Path, help='Existing Obsidian vault directory')
    parser.add_argument('--project-name', default='Learning')
    parser.add_argument('--agent-dir', type=Path, default=Path(os.environ.get('PI_CODING_AGENT_DIR', str(Path.home() / '.pi/agent'))))
    parser.add_argument('--pi', type=Path, help='Pi executable; discovered from PATH by default')
    parser.add_argument('--learn-source', default=LOCK['learnURL'], help='Pinned upstream URL, or a local checkout for offline testing')
    parser.add_argument('--manage-ollama', action='store_true', help='Install/start a macOS login service with one loaded model and one parallel request')
    parser.add_argument('--install-teacher', action='store_true', help='Also download optional Gemma 4 12B / 32K; never selects it')
    parser.add_argument('--teacher', type=model_id, help='Explicitly select a teacher; otherwise preserve existing defaults')
    parser.add_argument('--research-model', type=model_id, default='ollama/pi-research:26b-16k')
    parser.add_argument('--diagram-model', type=model_id, default='ollama/pi-diagram:4b-16k')
    parser.add_argument('--skip-models', action='store_true', help='Do not contact Ollama or install models; configure hosted agents with the model flags')
    parser.add_argument('--skip-downloads', action='store_true', help='Skip npm, browser, and subagent installation for an existing installation')
    args = parser.parse_args(argv)
    vault = args.vault.expanduser().resolve()
    if not (vault / '.obsidian').is_dir():
        parser.error('Open/create this directory as a vault in Obsidian first, so it contains .obsidian/.')
    if args.project_name in ('', '.', '..') or Path(args.project_name).name != args.project_name:
        parser.error('--project-name must be a single folder name inside the vault.')
    if args.skip_models and args.install_teacher:
        parser.error('--install-teacher requires model downloads; remove --skip-models.')
    for name in ('git', 'node', 'npm', 'tmux', 'rsvg-convert'):
        if not shutil.which(name):
            parser.error(f'Missing {name}. Run the README prerequisite commands first.')
    pi = (args.pi.expanduser().resolve() if args.pi else Path(shutil.which('pi') or args.agent_dir / 'bin/pi').resolve())
    if not pi.is_file():
        parser.error('Pi was not found. Install Pi first, or pass --pi /path/to/pi.')
    agent = args.agent_dir.expanduser().resolve()
    package = pi_package(pi, agent)
    version = load_json(package / 'package.json')['version']
    if tuple(int(part) for part in version.split('.')[:2]) < (1, 3):
        parser.error('Pi 1.3 or newer is required for native terminal math; use the documented pinned version.')
    project = vault / args.project_name
    config = project / '.pi'
    installer = Installer(agent)
    if args.manage_ollama:
        manage_ollama(installer)
    if not args.skip_models:
        if not shutil.which('ollama'):
            parser.error('Ollama is missing. Install it, or use --skip-models with hosted agent model IDs.')
        api('/api/tags')
    project.mkdir(parents=True, exist_ok=True)
    if not config.exists():
        run('git', 'clone', '--no-checkout', args.learn_source, config)
        run('git', '-C', config, 'checkout', '--detach', LOCK['learnCommit'])
    else:
        commit = run('git', '-C', config, 'rev-parse', 'HEAD', capture_output=True, text=True).stdout.strip()
        if commit != LOCK['learnCommit']:
            raise RuntimeError('The existing .pi checkout is at a different upstream commit. It was preserved; use a new --project-name.')
    entries = []
    if not args.skip_models:
        entries = [install_alias('gemma4:26b', 'pi-research:26b-16k', 16384),
                   install_alias('qwen3.5:4b', 'pi-diagram:4b-16k', 16384)]
        if args.install_teacher:
            entries.append(install_alias('gemma4:12b', 'pi-teacher:12b-32k', 32768))
    settings = configure(project, installer, pi, package, args.research_model, args.diagram_model, entries, args.teacher)
    environment = dict(os.environ, PI_CODING_AGENT_DIR=str(agent))
    if not args.skip_downloads:
        source = LOCK['subagentsSource']
        personal = load_json(agent / 'settings.json')
        packages = personal.get('packages', [])
        if not any((item if isinstance(item, str) else item.get('source')) == source for item in packages):
            run(pi, 'install', source, cwd=project, env=environment)
        visual = config / 'extensions/visual-tools'
        run('npm', 'install', '--omit=dev', '--package-lock=false', cwd=visual,
            env=dict(environment, PUPPETEER_SKIP_DOWNLOAD='true'))
        run('npx', '--no-install', 'puppeteer', 'browsers', 'install', 'chrome', cwd=visual, env=environment)
    install_launcher(installer, project, pi, package)
    run('node', '--input-type=module', '-e',
        'const {loadState,saveState}=await import(process.argv[1]);saveState(process.argv[2],loadState(process.argv[2]));',
        (config / 'extensions/learning-continuity/learning-state.mjs').as_uri(), project)
    run('node', ASSETS / 'check-extensions.mjs', agent, project, package, env=environment)
    print('\nInstalled:', project)
    print('Full teaching skill preserved. Existing teacher:', settings.get('defaultProvider', '(choose in Pi)'), settings.get('defaultModel', ''))
    print('Start lessons:', agent / 'bin/pi-learn')
    print('For a hosted teacher: /login, then /model. Ctrl+S in /model saves its default.')
    print('The optional 12B teacher is available only if installed; --install-teacher never selects it.')
    print('This checks configuration and extensions, not model memory use or teaching quality.')
    print('Backups for changed files:', installer.backup)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f'Setup stopped: {exc}', file=sys.stderr)
        print('Existing notes, credentials, and the full teaching skill are not replaced. Fix the reported step and rerun.', file=sys.stderr)
        sys.exit(1)
