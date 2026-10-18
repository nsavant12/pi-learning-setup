#!/usr/bin/env python3
"""Run portability, fresh/repeat install, interactive quiz, and notebook checks."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('learning_setup',ROOT/'setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


def run(*arguments, **kwargs):
    return subprocess.run([str(arg) for arg in arguments],check=True,**kwargs)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pi',type=Path,default=Path(shutil.which('pi') or Path.home()/'.pi/agent/bin/pi'))
    parser.add_argument('--learn-source',default=setup.LOCK['learnURL'])
    args=parser.parse_args()
    pi=args.pi.expanduser().resolve()
    run(sys.executable,'-m','unittest','discover','-s',ROOT/'tests','-p','test_*.py','-v')
    with tempfile.TemporaryDirectory(prefix='pi-learning-integration-') as temporary:
        root=Path(temporary)
        vault=root/'Obsidian Vault With Spaces'
        (vault/'.obsidian').mkdir(parents=True)
        agent=root/'Agent With Spaces'
        agent.mkdir()
        credentials=agent/'auth.json'
        credentials.write_text('{"synthetic":"CREDENTIAL-SENTINEL"}\n')
        personal=agent/'settings.json'
        personal.write_text('{"customSetting":"KEEP"}\n')
        catalog=agent/'models.json'
        catalog.write_text('{"providers":{"synthetic":{"apiKey":"NOT-A-REAL-KEY"}}}\n')
        kept={p:p.read_bytes() for p in [credentials,personal,catalog]}
        command=[sys.executable,ROOT/'setup.py','--vault',vault,'--agent-dir',agent,'--pi',pi,'--learn-source',args.learn_source,'--skip-models','--skip-downloads']
        run(*command)
        project=vault/'Learning'
        package=setup.pi_package(pi,agent)
        skill=project/'.pi/skills/teach/SKILL.md'
        assert hashlib.sha256(skill.read_bytes()).hexdigest()==setup.LOCK['teachingSkillSHA256']
        settings_path=project/'.pi/settings.json'
        settings=json.loads(settings_path.read_text())
        assert 'defaultModel' not in settings, 'Fresh installation picked a main teacher'
        settings.update(defaultProvider='synthetic',defaultModel='existing-teacher')
        settings_path.write_text(json.dumps(settings))
        (project/'Lessons/personal-note.md').write_text('Preserve this personal notebook.')
        state_module=(project/'.pi/extensions/learning-continuity/learning-state.mjs').as_uri()
        run('node','--input-type=module','-e',
            'const {recordEvidence}=await import(process.argv[1]);recordEvidence(process.argv[2],{topic:"synthetic",concept:"shapes",outcome:"correct",evidence:"2 by 3 times 3 by 4 gives 2 by 4",nextStep:"practice",reviewQuestion:"What is the output shape?",expectedAnswer:"2 by 4"},new Date("2026-01-01T00:00:00Z"));',state_module,project)
        evidence=project/'.pi/learning-state.json'
        prior=evidence.read_bytes()
        run(*command)
        settings=json.loads(settings_path.read_text())
        assert settings['defaultModel']=='existing-teacher' and settings['defaultProvider']=='synthetic'
        assert evidence.read_bytes()==prior
        assert (project/'Lessons/personal-note.md').read_text()=='Preserve this personal notebook.'
        assert hashlib.sha256(skill.read_bytes()).hexdigest()==setup.LOCK['teachingSkillSHA256']
        assert all(path.read_bytes()==value for path,value in kept.items())
        run('node',ROOT/'tests/check-quiz-math.mjs',project,package)
        run('node',ROOT/'tests/check-notebook.mjs',project,package)
        run(sys.executable,ROOT/'doctor.py','--config',agent/'learning-setup.json')
    print('All checks passed. Model downloads/inference, live macOS launchctl, GUI fonts and network research were not exercised.')


if __name__=='__main__':
    main()
