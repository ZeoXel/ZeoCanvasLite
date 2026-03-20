export interface SubjectMentionCandidate {
  subjectId: string;
  tokens: string[];
}

/**
 * Collect mentioned subject ids in prompt appearance order.
 * - Longest token wins in overlapping cases (e.g. 小灰灰 vs 小灰)
 * - Each subject id appears once (first appearance)
 */
export function collectMentionedSubjectIds(
  prompt: string,
  candidates: SubjectMentionCandidate[]
): string[] {
  if (!prompt || !candidates || candidates.length === 0) return [];

  const tokenToSubjectId = new Map<string, string>();
  const tokens: string[] = [];

  for (const candidate of candidates) {
    for (const token of candidate.tokens) {
      if (!token) continue;
      if (tokenToSubjectId.has(token)) continue;
      tokenToSubjectId.set(token, candidate.subjectId);
      tokens.push(token);
    }
  }

  if (tokens.length === 0) return [];

  const escapedTokens = tokens
    .sort((a, b) => b.length - a.length)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  const pattern = new RegExp(`@(?:${escapedTokens.join('|')})(?![a-zA-Z0-9_])`, 'g');
  const seen = new Set<string>();
  const orderedIds: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(prompt)) !== null) {
    const token = match[0].slice(1);
    const subjectId = tokenToSubjectId.get(token);
    if (!subjectId || seen.has(subjectId)) continue;
    seen.add(subjectId);
    orderedIds.push(subjectId);
  }

  return orderedIds;
}
