import test from 'node:test';
import assert from 'node:assert/strict';

import videoStrategies from './videoStrategies.ts';

const { processSubjectRef } = videoStrategies;

test('processSubjectRef keeps upstream images as referenceImages when subjects are selected', async () => {
  const node = {
    data: {
      selectedSubjects: [
        { id: 'hero_1', imageUrls: ['https://example.com/hero.png'] },
      ],
    },
  };

  const inputs = [
    { data: { image: 'https://example.com/upstream-1.png' } },
    { data: { croppedFrame: 'https://example.com/upstream-2.png' } },
  ];

  const result = await processSubjectRef(node, inputs, '一段动作描述');

  assert.deepEqual(result.referenceImages, [
    'https://example.com/upstream-1.png',
    'https://example.com/upstream-2.png',
  ]);
  assert.equal(result.inputImageForGeneration, null);
  assert.equal(result.generationMode, 'SUBJECT_REF');
});
