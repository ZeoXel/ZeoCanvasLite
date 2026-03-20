import test from 'node:test';
import assert from 'node:assert/strict';

import {
  seedSubjectImages,
  tryAppendSubjectImage,
  uniqueNonEmptyImageSources,
} from './subjectEditorUtils.ts';

const createImage = (src) => ({
  id: `id-${src}`,
  base64: src,
  originalBase64: src,
  createdAt: 1,
});

test('seedSubjectImages puts initial image first and keeps existing images', () => {
  const existing = [createImage('existing-1'), createImage('existing-2')];
  const seeded = seedSubjectImages(existing, 'main-image', createImage);

  assert.equal(seeded.length, 3);
  assert.equal(seeded[0].base64, 'main-image');
  assert.equal(seeded[1].base64, 'existing-1');
  assert.equal(seeded[2].base64, 'existing-2');
});

test('seedSubjectImages does not duplicate when initial image already exists', () => {
  const existing = [createImage('already-main')];
  const seeded = seedSubjectImages(existing, 'already-main', createImage);

  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].base64, 'already-main');
});

test('tryAppendSubjectImage enforces max count and deduplicates source', () => {
  const existing = [createImage('a'), createImage('b'), createImage('c')];

  const capped = tryAppendSubjectImage(existing, 'd', createImage);
  assert.equal(capped.error, 'limit');
  assert.equal(capped.images.length, 3);

  const duplicated = tryAppendSubjectImage([createImage('a')], 'a', createImage);
  assert.equal(duplicated.error, 'duplicate');
  assert.equal(duplicated.images.length, 1);
});

test('uniqueNonEmptyImageSources keeps order and removes empty/duplicates', () => {
  const result = uniqueNonEmptyImageSources([
    '',
    'img-1',
    'img-2',
    'img-1',
    '  ',
    'img-3',
  ]);

  assert.deepEqual(result, ['img-1', 'img-2', 'img-3']);
});
