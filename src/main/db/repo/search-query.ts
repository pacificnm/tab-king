/** Words in a search box, split the way the FTS5 `unicode61` tokenizer does (letters and digits). */
export function searchTokens(text: string, max = 8): string[] {
  return (text.normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, max)
}

/** FTS5 MATCH expression: every word as a quoted prefix term, ANDed. Null when there is nothing to search for. */
export function buildFtsQuery(text: string): string | null {
  const tokens = searchTokens(text)
  return tokens.length === 0 ? null : tokens.map((t) => `"${t}"*`).join(' ')
}

/** SQL LIKE pattern matching `token` anywhere, with LIKE wildcards in the token escaped (use `ESCAPE '\'`). */
export function likePattern(token: string): string {
  return `%${token.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
