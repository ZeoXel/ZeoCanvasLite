import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeViduReferenceImages, buildViduReferencePreviewAssets } from './viduReferencePreview.ts';

test('buildViduReferencePreviewAssets keeps upstream first, then subjects', () => {
  const assets = buildViduReferencePreviewAssets(
    [
      { id: 'up-1', type: 'image', src: 'bg.png' },
    ],
    [
      { subjectId: 's1', imageUrls: ['s1.png'] },
      { subjectId: 's2', imageUrls: ['s2.png'] },
      { subjectId: 's3', imageUrls: ['s3.png'] },
    ]
  );

  assert.deepEqual(
    assets.map((a) => a.src),
    ['bg.png', 's1.png', 's2.png', 's3.png']
  );
});

test('buildViduReferencePreviewAssets deduplicates urls with merge order', () => {
  const assets = buildViduReferencePreviewAssets(
    [{ id: 'up-1', type: 'image', src: 'shared.png' }],
    [{ subjectId: 's1', imageUrls: ['shared.png', 's1-b.png'] }]
  );

  assert.deepEqual(
    assets.map((a) => a.src),
    ['shared.png', 's1-b.png']
  );
});

test('analyzeViduReferenceImages reports overflow beyond 7 limit', () => {
  const usage = analyzeViduReferenceImages(
    ['u1', 'u2'],
    [
      { subjectId: 's1', imageUrls: ['a1', 'a2', 'a3'] },
      { subjectId: 's2', imageUrls: ['b1', 'b2', 'b3'] },
    ]
  );

  assert.equal(usage.totalUniqueImages, 8);
  assert.equal(usage.isCapped, true);
  assert.equal(usage.overflowCount, 1);
  assert.deepEqual(usage.mergedImages, ['u1', 'u2', 'a1', 'a2', 'a3', 'b1', 'b2']);
});
