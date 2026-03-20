import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldFetchVideoAsBlob } from './videoLoadStrategy.ts';

test('does not fetch blob/data URLs as blob again', () => {
  assert.equal(shouldFetchVideoAsBlob('blob:http://localhost:3000/abc'), false);
  assert.equal(shouldFetchVideoAsBlob('data:video/mp4;base64,AAAA'), false);
});

test('does not fetch normal public URLs through fetch blob path', () => {
  assert.equal(shouldFetchVideoAsBlob('https://example.com/video.mp4'), false);
});

test('fetches known proxy-required video URLs as blob', () => {
  assert.equal(
    shouldFetchVideoAsBlob('https://bucket.tos-cn-beijing.volces.com/demo.mp4'),
    true
  );
  assert.equal(
    shouldFetchVideoAsBlob('https://foo.aliyuncs.com/bar.mp4'),
    true
  );
  assert.equal(
    shouldFetchVideoAsBlob('https://cos.lsaigc.com/path/to/video.mp4'),
    true
  );
  assert.equal(
    shouldFetchVideoAsBlob('https://example-1250000000.cos.ap-guangzhou.myqcloud.com/a.mp4'),
    true
  );
});
