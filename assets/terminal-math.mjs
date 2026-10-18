/** Use Pi's own math renderer without changing stored quiz text or values. */
export function createTerminalMath({ Markdown, Text, wrapTextWithAnsi }) {
  const identity = (value) => value;
  const theme = Object.fromEntries([
    "heading", "link", "linkUrl", "code", "codeBlock", "codeBlockBorder",
    "quote", "quoteBorder", "hr", "listBullet", "bold", "italic",
    "strikethrough", "underline",
  ].map((name) => [name, identity]));

  function mathLines(source, width) {
    width = Math.max(1, width);
    if (!/\$|\\(?:\(|\[)/.test(source)) return wrapTextWithAnsi(source, width);
    // Preserve the spaces used to align an unfocused choice with its cursor.
    const indentation = !source.includes("\n") && /^( {1,2})(?=\S)/.exec(source);
    const prefix = indentation ? " ".repeat(Math.min(indentation[1].length, width - 1)) : "";
    if (indentation) source = source.slice(indentation[1].length);
    // The quiz uses '> ' as its selection cursor, not a Markdown quotation.
    const protectedSource = source.replace(/^(\s*)> /gm, "$1\\> ");
    return new Markdown(protectedSource, 0, 0, theme, undefined, {
      preserveOrderedListMarkers: true, renderLatex: true,
    }).render(Math.max(1, width - prefix.length)).map((line) => prefix + line);
  }

  class MathText extends Text {
    constructor(source = "", paddingX = 1, paddingY = 1) {
      super(source, paddingX, paddingY);
      this.source = source;
      this.mathPaddingX = paddingX;
    }
    setText(source) {
      this.source = source;
      super.setText(source);
    }
    setPaddingX(paddingX) {
      this.mathPaddingX = paddingX;
      super.setPaddingX(paddingX);
    }
    render(width) {
      const padding = Math.min(this.mathPaddingX, Math.max(0, Math.floor((width - 1) / 2)));
      super.setText(mathLines(this.source, Math.max(1, width - 2 * padding)).join("\n"));
      return super.render(width);
    }
  }
  return { mathLines, MathText };
}
