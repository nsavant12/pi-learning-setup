"""Connect the known custom quiz/question UIs to Pi's native math renderer."""


def patch_math(original):
    if '// PI_LEARN_TERMINAL_MATH' in original:
        return original
    anchor = 'import { Type } from "@sinclair/typebox";'
    wrapped = 'for (const line of wrapTextWithAnsi(text, contentWidth)) {'
    add = 'const add = (text: string) => lines.push(truncateToWidth(text, width));'
    if (original.count(anchor) != 1 or original.count(wrapped) != 1
            or original.count(add) not in (2, 3) or 'new Text(' not in original
            or '\n\tEditor,' not in original):
        raise ValueError('Unrecognized quiz/question UI; preserved it rather than applying an unsafe patch.')
    updated = original.replace('\n\tEditor,', '\n\tEditor,\n\tMarkdown,', 1)
    updated = updated.replace(anchor, anchor + '''
import { createTerminalMath } from "./terminal-math.mjs";
// PI_LEARN_TERMINAL_MATH
const { mathLines, MathText } = createTerminalMath({ Markdown, Text, wrapTextWithAnsi });
''')
    updated = updated.replace(wrapped, 'for (const line of mathLines(text, contentWidth)) {')
    updated = updated.replace(add, 'const add = (text: string) => addWrapped(lines, text, width);')
    return updated.replace('new Text(', 'new MathText(')
