#!/usr/bin/env python3
"""Verify installed learning extensions, with optional real web checks."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=Path.home() / '.pi/agent/learning-setup.json')
    parser.add_argument('--web', action='store_true', help='Also test public search and primary-source retrieval')
    args = parser.parse_args()
    config = json.loads(args.config.expanduser().read_text())
    subprocess.run(['node', str(ROOT / 'assets/check-extensions.mjs'), config['agentDir'], config['project'], config['piPackage']], check=True)
    if args.web:
        helper = Path(config['project']) / '.pi/extensions/research-web/research_web.py'
        for action, value in [('search','site:docs.ollama.com context length'),('fetch','https://docs.ollama.com/context-length')]:
            result = subprocess.run([sys.executable,str(helper),action,value], capture_output=True, text=True, timeout=45)
            details = json.loads(result.stdout)
            if result.returncode or details.get('ok') is not True:
                raise RuntimeError(f'{action} failed: {details.get("error", details)}')
            print('PASS:', action, details.get('engine',details.get('title','')))
    print('Configuration checks passed. Model execution, RAM allocation, GUI display and tmux lifecycle were not exercised.')


if __name__ == '__main__':
    try:
        main()
    except (OSError,ValueError,KeyError,RuntimeError,subprocess.SubprocessError) as exc:
        print('Check failed:',exc,file=sys.stderr)
        sys.exit(1)
