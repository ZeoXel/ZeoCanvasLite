import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeViduReferenceImages, MAX_VIDU_REFERENCE_IMAGES } from './viduReference.ts';

test('mergeViduReferenceImages keeps upstream images before subject images', () => {
  const upstreamImages = ['upstream-bg', 'upstream-style'];
  const subjects = [
    { images: ['subject-a-1', 'subject-a-2'] },
    { images: ['subject-b-1'] },
  ];

  const merged = mergeViduReferenceImages(upstreamImages, subjects);

  assert.deepEqual(merged, [
    'upstream-bg',
    'upstream-style',
    'subject-a-1',
    'subject-a-2',
    'subject-b-1',
  ]);
});

test('mergeViduReferenceImages deduplicates and truncates to max supported count', () => {
  const upstreamImages = ['same', 'upstream-2', 'upstream-3', 'upstream-4'];
  const subjects = [
    { images: ['same', 'subject-2', 'subject-3', 'subject-4', 'subject-5'] },
  ];

  const merged = mergeViduReferenceImages(upstreamImages, subjects);

  assert.equal(merged.length, MAX_VIDU_REFERENCE_IMAGES);
  assert.deepEqual(merged, [
    'same',
    'upstream-2',
    'upstream-3',
    'upstream-4',
    'subject-2',
    'subject-3',
    'subject-4',
  ]);
});

