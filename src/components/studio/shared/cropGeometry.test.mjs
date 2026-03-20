import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCenteredCropRect,
  recenterCropRectWithAspect,
  resizeCropRectFromAnchor,
} from './cropGeometry.ts';

test('createCenteredCropRect respects requested aspect ratio', () => {
  const rect = createCenteredCropRect({
    boundsWidth: 1000,
    boundsHeight: 500,
    aspectRatio: 1,
    coverage: 0.72,
  });

  assert.equal(Math.round(rect.width), 360);
  assert.equal(Math.round(rect.height), 360);
  assert.equal(Math.round(rect.x), 320);
  assert.equal(Math.round(rect.y), 70);
});

test('recenterCropRectWithAspect keeps center and applies ratio in bounds', () => {
  const rect = recenterCropRectWithAspect({
    rect: { x: 100, y: 120, width: 400, height: 200 },
    boundsWidth: 800,
    boundsHeight: 600,
    aspectRatio: 1,
  });

  assert.equal(Math.round(rect.width), 400);
  assert.equal(Math.round(rect.height), 400);
  assert.equal(Math.round(rect.x), 100);
  assert.equal(Math.round(rect.y), 20);
});

test('resizeCropRectFromAnchor keeps aspect ratio and fits bounds', () => {
  const rect = resizeCropRectFromAnchor({
    anchorX: 100,
    anchorY: 100,
    currentX: 700,
    currentY: 700,
    boundsWidth: 500,
    boundsHeight: 400,
    aspectRatio: 16 / 9,
    minSize: 24,
  });

  assert.equal(Math.round(rect.x), 100);
  assert.equal(Math.round(rect.y), 100);
  assert.equal(Math.round(rect.width), 400);
  assert.equal(Math.round(rect.height), 225);
});
