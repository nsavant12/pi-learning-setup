import copy
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import shlex
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


setup = module('learning_setup', 'setup.py')
launcher = module('learning_launcher', 'launcher.py')


class FinishedExec(Exception):
    pass


class PortabilityTests(unittest.TestCase):
    def test_mac_service_uses_absolute_unquoted_paths_and_memory_limits(self):
        definition = setup.service_definition(Path('/opt/homebrew/bin/ollama'), Path('/Users/A Learner'))
        restored = plistlib.loads(plistlib.dumps(definition))
        self.assertEqual(restored['WorkingDirectory'], '/Users/A Learner')
        self.assertEqual(restored['ProgramArguments'], ['/opt/homebrew/bin/ollama', 'serve'])
        self.assertEqual(restored['EnvironmentVariables']['OLLAMA_NUM_PARALLEL'], '1')
        self.assertEqual(restored['EnvironmentVariables']['OLLAMA_MAX_LOADED_MODELS'], '1')
        self.assertTrue(restored['RunAtLoad'])

    def test_mac_service_will_not_stop_someone_elses_server(self):
        installer = Mock()
        with patch.object(setup.sys, 'platform', 'darwin'), patch.object(setup.shutil, 'which', return_value='/usr/local/bin/ollama'), patch.object(setup, 'api', return_value={}), patch.object(setup.subprocess, 'run', return_value=Mock(returncode=1)) as run:
            with self.assertRaisesRegex(RuntimeError, 'already running'):
                setup.manage_ollama(installer)
        installer.write.assert_not_called()
        self.assertEqual(run.call_count, 1)  # Ownership inspection, no stop/start.

    def test_catalog_preserves_other_providers_and_model_options(self):
        catalog = {'providers': {'custom': {'apiKey': 'SYNTHETIC-ONLY'}, 'ollama': {'models': [{'id': 'custom-local', 'contextWindow': 2048}, {'id': 'test-alias', 'extra': True}]}}}
        result = setup.merge_models(copy.deepcopy(catalog), [{'id':'test-alias','contextWindow':32768}])
        self.assertEqual(result['providers']['custom'], catalog['providers']['custom'])
        self.assertEqual(result['providers']['ollama']['models'][0], catalog['providers']['ollama']['models'][0])
        self.assertTrue(result['providers']['ollama']['models'][1]['extra'])
        with self.assertRaises(RuntimeError):
            setup.merge_models({'providers':{'ollama':{'baseUrl':'https://different.example/v1'}}}, [])

    def test_configuration_writes_back_up_once_and_repeat_safely(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / 'user preferences.md'
            target.write_text('original')
            installer = setup.Installer(root / 'agent')
            installer.write(target, 'updated')
            backups = list(installer.backup.rglob('user preferences.md'))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(), 'original')
            installer.write(target, 'updated')
            self.assertEqual(len(list(installer.backup.rglob('original-path.txt'))), 1)

    def test_alias_install_does_not_generate_or_select_models(self):
        def api(endpoint, payload=None):
            self.assertEqual(endpoint, '/api/show')
            return {'capabilities':['tools','vision']} if payload['model'] == 'base:12b' else {'parameters':'num_ctx 32768\n'}
        with patch.object(setup, 'api', side_effect=api), patch.object(setup, 'run') as run:
            entry = setup.install_alias('base:12b', 'teacher:12b', 32768)
        self.assertEqual(entry['contextWindow'], 32768)
        self.assertEqual(run.call_args.args[:3], ('ollama', 'create', 'teacher:12b'))
        self.assertEqual(run.call_count, 1)

    def test_mac_launcher_uses_open_portable_date_and_preserves_arguments(self):
        with tempfile.TemporaryDirectory(prefix='pi launcher ') as tmp:
            project = Path(tmp) / 'Vault with spaces/Learning'
            skill = project / '.pi/skills/teach/SKILL.md'
            skill.parent.mkdir(parents=True)
            skill.write_text('synthetic teaching instructions')
            config = {'project':str(project),'agentDir':str(Path(tmp)/'agent'),'pi':'/opt/homebrew/bin/pi','_file':str(Path(tmp)/'config.json')}
            with patch.object(launcher.sys, 'platform', 'darwin'), patch.object(launcher.os, 'chdir'), patch.object(launcher.shutil, 'which', return_value='/usr/bin/open'), patch.object(launcher.subprocess, 'Popen') as opened, patch.object(launcher.os, 'execve', side_effect=FinishedExec) as executed:
                with self.assertRaises(FinishedExec):
                    launcher.launch(config, ['--resume'], inside=True)
            self.assertEqual(opened.call_args.args[0][0], '/usr/bin/open')
            self.assertIn('obsidian://open?', opened.call_args.args[0][1])
            executable, arguments, environment = executed.call_args.args
            self.assertEqual(arguments, ['/opt/homebrew/bin/pi','--resume'])
            self.assertEqual(environment['PI_CODING_AGENT_DIR'],config['agentDir'])
            note = Path(environment['PI_LEARN_LOG_FILE'])
            self.assertTrue(note.is_file())
            self.assertNotIn('%N', note.name)

    def test_tmux_command_quotes_paths_and_passes_resume(self):
        with tempfile.TemporaryDirectory(prefix='tmux paths ') as tmp:
            root = Path(tmp)
            skill = root / '.pi/skills/teach/SKILL.md'
            skill.parent.mkdir(parents=True)
            skill.write_text('synthetic')
            config = {'project':str(root),'agentDir':str(root/'agent'),'pi':'/usr/bin/pi','_file':str(root/'config with spaces.json')}
            with patch.dict(os.environ, {}, clear=True), patch.object(launcher.os, 'execvp', side_effect=FinishedExec) as executed:
                with self.assertRaises(FinishedExec):
                    launcher.launch(config,['--resume'])
            argv = executed.call_args.args[1]
            self.assertEqual(argv[argv.index('-c')+1],str(root))
            inner = shlex.split(argv[-1])
            self.assertIn(config['_file'],inner)
            self.assertEqual(inner[-2:],['--','--resume'])


if __name__ == '__main__':
    unittest.main()
