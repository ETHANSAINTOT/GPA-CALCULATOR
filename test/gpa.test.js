import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeSummary, formatGpa } from '../shared/gpa.js';

test('without UE, the GPA and credits are the starting ones', () => {
  assert.deepEqual(computeSummary(3.2, 120, []), { gpa: 3.2, credits: 120 });
});

test('a UE weighs its credits: 4 credits at C count as four C grades', () => {
  // (3 × 10 + 2 × 4) / (10 + 4) = 38 / 14
  const { gpa, credits } = computeSummary(3, 10, [{ credits: 4, grade: 'C' }]);
  assert.equal(formatGpa(gpa), '2.71');
  assert.equal(credits, 14);
});

test('several UEs follow the formula', () => {
  // (2.5 × 60 + 4 × 5 + 3 × 3 + 1 × 2) / (60 + 5 + 3 + 2) = 181 / 70
  const ues = [{ credits: 5, grade: 'A' }, { credits: 3, grade: 'B' }, { credits: 2, grade: 'D' }];
  const { gpa, credits } = computeSummary(2.5, 60, ues);
  assert.equal(formatGpa(gpa), '2.59');
  assert.equal(credits, 70);
});

test('an E lowers the GPA but its credits are not acquired', () => {
  // (4 × 10 + 0 × 10) / 20 = 2
  const { gpa, credits } = computeSummary(4, 10, [{ credits: 10, grade: 'E' }]);
  assert.equal(gpa, 2);
  assert.equal(credits, 10);
});

test('starting from zero credits, the GPA is the UE average', () => {
  const { gpa, credits } = computeSummary(0, 0, [{ credits: 3, grade: 'A' }, { credits: 1, grade: 'C' }]);
  assert.equal(gpa, 3.5);
  assert.equal(credits, 4);
});

test('with no credit at all, the starting GPA is kept', () => {
  assert.equal(computeSummary(3.5, 0, []).gpa, 3.5);
});
