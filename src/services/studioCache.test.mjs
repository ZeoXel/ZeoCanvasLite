import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendCanvasToCache,
  getCache,
  invalidateCache,
  removeCanvasFromCache,
  setCache,
} from './studioCache.ts';

test('appendCanvasToCache updates cache to the newly created canvas', () => {
  invalidateCache();

  setCache({
    assets: [],
    workflows: [],
    subjects: [],
    canvases: [
      {
        id: 'canvas-old',
        title: '旧画布',
        nodes: [{ id: 'n1' }],
        connections: [{ id: 'c1' }],
        groups: [{ id: 'g1' }],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    currentCanvasId: 'canvas-old',
    nodes: [{ id: 'n1' }],
    connections: [{ id: 'c1' }],
    groups: [{ id: 'g1' }],
    nodeConfigs: {},
    taskLogs: [],
    deletedItems: {},
    timestamp: 1,
  });

  const newCanvas = {
    id: 'canvas-new',
    title: '新画布',
    nodes: [],
    connections: [],
    groups: [],
    pan: { x: 0, y: 0 },
    scale: 1,
    createdAt: 2,
    updatedAt: 2,
  };

  appendCanvasToCache(newCanvas);

  const cache = getCache();
  assert.ok(cache);
  assert.equal(cache.currentCanvasId, 'canvas-new');
  assert.equal(cache.canvases[0].id, 'canvas-new');
  assert.deepEqual(cache.nodes, []);
  assert.deepEqual(cache.connections, []);
  assert.deepEqual(cache.groups, []);
});

test('appendCanvasToCache is a no-op when cache is empty', () => {
  invalidateCache();

  appendCanvasToCache({
    id: 'canvas-new',
    title: '新画布',
    nodes: [],
    connections: [],
    groups: [],
    createdAt: 2,
    updatedAt: 2,
  });

  assert.equal(getCache(), null);
});

test('removeCanvasFromCache removes deleted canvas and switches current canvas', () => {
  invalidateCache();

  setCache({
    assets: [],
    workflows: [],
    subjects: [],
    canvases: [
      {
        id: 'canvas-a',
        title: 'A',
        nodes: [{ id: 'na' }],
        connections: [{ id: 'ca' }],
        groups: [{ id: 'ga' }],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'canvas-b',
        title: 'B',
        nodes: [{ id: 'nb' }],
        connections: [{ id: 'cb' }],
        groups: [{ id: 'gb' }],
        createdAt: 2,
        updatedAt: 2,
      },
    ],
    currentCanvasId: 'canvas-a',
    nodes: [{ id: 'na' }],
    connections: [{ id: 'ca' }],
    groups: [{ id: 'ga' }],
    nodeConfigs: {},
    taskLogs: [],
    deletedItems: {},
    timestamp: 1,
  });

  removeCanvasFromCache('canvas-a');

  const cache = getCache();
  assert.ok(cache);
  assert.equal(cache.currentCanvasId, 'canvas-b');
  assert.equal(cache.canvases.length, 1);
  assert.equal(cache.canvases[0].id, 'canvas-b');
  assert.deepEqual(cache.nodes, [{ id: 'nb' }]);
});
