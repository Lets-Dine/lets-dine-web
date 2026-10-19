import assert from 'node:assert/strict';
import { trendOf } from '../src/api/dishPerformance';

assert.equal(trendOf(4, 2).kind, 'quiet'); // 2 -> 4 is not "+100%"
assert.equal(trendOf(10, null).kind, 'quiet'); // all-time range: nothing to compare
assert.equal(trendOf(12, 0).kind, 'new');
assert.equal(trendOf(10, 10).kind, 'steady');
assert.equal(trendOf(105, 100).kind, 'steady'); // +5%
assert.deepEqual(trendOf(15, 10), { kind: 'up', pct: 0.5, delta: 5 });
assert.deepEqual(trendOf(5, 10), { kind: 'down', pct: -0.5, delta: -5 });
assert.equal(trendOf(0, 20).kind, 'down'); // sold nothing this time: the clearest slide
console.log('dish performance: ok');
