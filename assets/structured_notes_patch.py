"""Upgrade the known transcript/read-along logger to the concept notebook."""
from pathlib import Path


def patch_logger(original):
    known = ('export default function mdLog(' in original
             or '// PI_LEARN_STRUCTURED_NOTES' in original)
    if not known:
        raise ValueError('Unrecognized note logger; preserved it rather than replacing custom code.')
    return Path(__file__).with_name('notebook-log.ts').read_text()
