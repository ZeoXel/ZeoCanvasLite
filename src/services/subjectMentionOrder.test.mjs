import test from 'node:test';
import assert from 'node:assert/strict';

import { collectMentionedSubjectIds } from './subjectMentionOrder.ts';

test('collectMentionedSubjectIds keeps first-match order from prompt', () => {
  const ids = collectMentionedSubjectIds(
    '背景里有 @主体2 ，前景是 @主体1 ，再回到 @主体2',
    [
      { subjectId: 's1', tokens: ['主体1'] },
      { subjectId: 's2', tokens: ['主体2'] },
    ]
  );

  assert.deepEqual(ids, ['s2', 's1']);
});

test('collectMentionedSubjectIds handles token shadowing and boundaries', () => {
  const ids = collectMentionedSubjectIds(
    '@小灰灰在跑，@小灰在看，@小灰a不应命中',
    [
      { subjectId: 'short', tokens: ['小灰'] },
      { subjectId: 'long', tokens: ['小灰灰'] },
    ]
  );

  assert.deepEqual(ids, ['long', 'short']);
});
