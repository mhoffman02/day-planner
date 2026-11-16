// Pinned-clock date guards for DST-change days and the hour either side of local midnight, where a UTC
// shift or a 23/25-hour day turns into an off-by-one date. Times are built as local wall-clock, so the
// same assertions bite in every zone `npm run test:tz` runs (America/Chicago, UTC, Pacific/Auckland).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { getLocalDateStr } from '../src/binderStore.js';
import { filterTasksByDateHorizon } from '../src/taskEngine.js';
import { GASBridge } from '../src/gasBridge.js';

// US DST starts 2026-03-08 and ends 2026-11-01; New Zealand ends 2026-04-05 and starts 2026-09-27.
const DST_DAYS = ['2026-03-08', '2026-11-01', '2026-04-05', '2026-09-27'];
const local = (dateStr, h, min) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, h, min);
};

function withClock(now, fn) {
  mock.timers.enable({ apis: ['Date'], now });
  try {
    return fn();
  } finally {
    mock.timers.reset();
  }
}

test('today key is the local date at 00:30, 12:00 and 23:30 on every DST-change day', () => {
  for (const day of DST_DAYS) {
    for (const [h, min] of [[0, 30], [12, 0], [23, 30]]) {
      assert.equal(withClock(local(day, h, min), () => getLocalDateStr()), day, `${day} ${h}:${min}`);
    }
  }
});

test('default horizon "today" follows the pinned local clock late on a DST-change day', () => {
  for (const day of DST_DAYS) {
    const tasks = [{ id: 'due', dueDate: day }, { id: 'next', dueDate: '2026-12-31' }];
    const out = withClock(local(day, 23, 30), () => filterTasksByDateHorizon(tasks, 'overdue-today'));
    assert.deepEqual(out.map((t) => t.id), ['due'], day);
  }
});

test('day-range walk across a DST change yields each date exactly once, none skipped or doubled', async () => {
  const bridge = new GASBridge(true);
  bridge.getDailyData = async (dateStr) => dateStr;
  for (const [start, end, expected] of [
    ['2026-03-07', '2026-03-09', ['2026-03-07', '2026-03-08', '2026-03-09']],
    ['2026-10-31', '2026-11-02', ['2026-10-31', '2026-11-01', '2026-11-02']],
    ['2026-04-04', '2026-04-06', ['2026-04-04', '2026-04-05', '2026-04-06']],
    ['2026-09-26', '2026-09-28', ['2026-09-26', '2026-09-27', '2026-09-28']],
  ]) {
    const { days } = await bridge.getDailyDataRange(start, end);
    assert.deepEqual(Object.keys(days), expected, `${start}..${end}`);
  }
});
