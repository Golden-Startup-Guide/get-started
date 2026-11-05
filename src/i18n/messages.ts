/**
 * Finds every text the app translates: the string literals passed to t(), msg(), and tp() in
 * the source. Used by i18n.test.ts to check that every catalog has all of them.
 */
import ts from 'typescript'

export interface Messages {
  /** Texts from t() and msg(). */
  texts: Set<string>
  /** Plural texts from tp(): the English plural (the key) and singular. */
  plurals: Map<string, string>
}

export function findMessages(files: ReadonlyArray<{ path: string; text: string }>): Messages {
  const messages: Messages = { texts: new Set(), plurals: new Map() }
  const literal = (node: ts.Node | undefined) =>
    node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined
  for (const file of files) {
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, file.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text
        if (name === 't' || name === 'msg') {
          const text = literal(node.arguments[0])
          if (text !== undefined) messages.texts.add(text)
        } else if (name === 'tp') {
          const one = literal(node.arguments[1])
          const other = literal(node.arguments[2])
          if (one !== undefined && other !== undefined) messages.plurals.set(other, one)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return messages
}
