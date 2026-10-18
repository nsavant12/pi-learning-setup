#!/usr/bin/env python3
"""Start or reattach a learning session, with a linked Obsidian concept note."""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
from urllib.parse import urlencode


def launch(config, pi_args, inside=False):
    project = Path(config['project'])
    if not (project / '.pi/skills/teach/SKILL.md').is_file():
        raise RuntimeError('The learning project is missing. Rerun setup.py with your vault path.')
    if not inside and not os.environ.get('TMUX'):
        command = shlex.join([sys.executable, str(Path(__file__).resolve()), '--config', config['_file'], '--inside-tmux', '--', *pi_args])
        os.execvp('tmux', ['tmux', 'new-session', '-A', '-s', config.get('tmuxSession', 'pi-learning'), '-c', str(project), command])
    os.chdir(project)
    (project / 'Lessons').mkdir(exist_ok=True)
    (project / 'viz').mkdir(exist_ok=True)
    note = project / 'Lessons' / ('lesson-' + datetime.now().strftime('%Y-%m-%d-%H%M%S-%f') + '.md')
    note.touch(exist_ok=False)
    opener = shutil.which('open' if sys.platform == 'darwin' else 'xdg-open')
    if opener:
        subprocess.Popen([opener, 'obsidian://open?' + urlencode({'path': str(note)})], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    environment = dict(os.environ, PI_LEARN_LOG_FILE=str(note), PI_CODING_AGENT_DIR=config['agentDir'])
    os.execve(config['pi'], [config['pi'], *pi_args], environment)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=Path.home() / '.pi/agent/learning-setup.json')
    parser.add_argument('--inside-tmux', action='store_true', help=argparse.SUPPRESS)
    args, pi_args = parser.parse_known_args()
    if pi_args[:1] == ['--']:
        pi_args = pi_args[1:]
    config = json.loads(args.config.read_text())
    config['_file'] = str(args.config.resolve())
    launch(config, pi_args, args.inside_tmux)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as exc:
        print(f'Cannot start learning: {exc}', file=sys.stderr)
        sys.exit(1)
