import test from 'node:test';
import assert from 'node:assert/strict';

import { removeItemWithTombstone } from './deletionUtils.ts';

test('removeItemWithTombstone removes item and records tombstone timestamp', () => {
  const now = 1700000000000;
  const items = [
    { id: 'subj_a', name: 'A' },
    { id: 'subj_b', name: 'B' },
  ];
  const deletedItems = { existing: 1699999999999 };

  const result = removeItemWithTombstone(items, deletedItems, 'subj_a', now);

  assert.deepEqual(result.items, [{ id: 'subj_b', name: 'B' }]);
  assert.equal(result.deletedItems.subj_a, now);
  assert.equal(result.deletedItems.existing, 1699999999999);
});

test('removeItemWithTombstone keeps latest tombstone timestamp when deleting same id again', () => {
  const items = [{ id: 'subj_a' }];
  const deletedItems = { subj_a: 1700000000100 };

  const result = removeItemWithTombstone(items, deletedItems, 'subj_a', 1700000000000);

  assert.equal(result.deletedItems.subj_a, 1700000000100);
});
