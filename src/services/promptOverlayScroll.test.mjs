import test from 'node:test';
import assert from 'node:assert/strict';

import { computeOverlayTransform } from './promptOverlayScroll.ts';

test('computeOverlayTransform returns undefined when no scroll offset', () => {
  assert.equal(computeOverlayTransform(0, 0), undefined);
});

test('computeOverlayTransform returns translate style when textarea is scrolled', () => {
  assert.deepEqual(
    computeOverlayTransform(24, 8),
    { transform: 'translate(-8px, -24px)' }
  );
});
