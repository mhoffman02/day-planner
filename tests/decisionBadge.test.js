/**
 * @file decisionBadge.test.js
 * @description 1A: a `#decision [Topic] what` note line renders a Decision badge (topic optional),
 * in both client copies. `#decisions` and `#index` lines are not decisions.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const clients = await bothClients();

for (const c of clients) {
  describe(`#decision badge [${c.label}]`, () => {
    const vm = makeVm(c.factory, {});

    it('renders "#decision [Topic]" as one Decision badge carrying the topic', () => {
      const html = vm.renderCardLine('- #decision [Budget] Approve GCP why: cost', false);
      assert.match(html, /<span class="decision-badge">Decision: Budget<\/span> Approve GCP why: cost/);
      assert.doesNotMatch(html, /#decision/);
    });

    it('renders a bare "#decision" as a Decision badge', () => {
      assert.match(vm.renderCardLine('#decision Ship Friday', false), /<span class="decision-badge">Decision<\/span> Ship Friday/);
    });

    it('leaves #decisions and #index alone', () => {
      assert.doesNotMatch(vm.renderCardLine('talked about #decisions', false), /decision-badge/);
      assert.doesNotMatch(vm.renderCardLine('#index [Work] Plan', false), /decision-badge/);
    });

    it('escapes the topic', () => {
      assert.match(vm.renderCardLine('#decision [<b>x</b>] y', false), /Decision: &lt;b&gt;x&lt;\/b&gt;/);
    });
  });
}

const TODAY = '2026-10-30';
const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };

function todayVm(c, task, { selectedDate = TODAY } = {}) {
  const vm = makeVm(c.factory, {
    selectedDate,
    todayStr: TODAY,
    selectedYear: 2026,
    selectedMonth: 10,
    dailyTasks: [task],
    masterTasks: [],
    calendarEvents: [],
    dailyNote: '### #index [Work] Plan\n- first',
    noteCards: [{ id: 'k1', heading: 'Plan', topic: 'Work', content: '- first' }],
    bridge: {
      updateDailyTask: async (d, id, u) => ({ id, ...u }),
      saveDailyDocCards: async () => ({ success: true })
    }
  });
  vm.trigger2WaySync = async () => {};
  return vm;
}

for (const c of clients) {
  describe(`completing a Decision: task [${c.label}]`, () => {
    it('pre-fills a #decision line in the last note card of today (priority code and lead stripped)', async () => {
      const task = { id: 't1', title: '[A1] Decision: Pick the hosting vendor', status: '•' };
      const vm = todayVm(c, task);
      await vm.setTaskStatus(task, '✓');
      await flush();
      assert.equal(vm.noteCards[0].content, '- first\n#decision Pick the hosting vendor');
      assert.match(vm.dailyNote, /#decision Pick the hosting vendor/);
    });

    it('matches the lead case-insensitively and ignores ordinary tasks', async () => {
      const plain = { id: 't2', title: 'Decide later about lunch', status: '•' };
      const vm = todayVm(c, plain);
      await vm.setTaskStatus(plain, '✓');
      await flush();
      assert.equal(vm.noteCards[0].content, '- first');
      const lower = { id: 't3', title: 'decision: Go with plan B', status: '•' };
      const vm2 = todayVm(c, lower);
      await vm2.setTaskStatus(lower, '✓');
      await flush();
      assert.equal(vm2.noteCards[0].content, '- first\n#decision Go with plan B');
    });

    it('does not write into the notes of another day when today is not open', async () => {
      const task = { id: 't1', title: 'Decision: X', status: '•' };
      const vm = todayVm(c, task, { selectedDate: '2026-10-28' });
      await vm.setTaskStatus(task, '✓');
      await flush();
      assert.equal(vm.noteCards[0].content, '- first');
    });

    it('a failed completion pre-fills nothing', async () => {
      const task = { id: 't1', title: 'Decision: X', status: '•' };
      const vm = todayVm(c, task);
      vm.bridge.updateDailyTask = async () => { throw new Error('Tasks 503'); };
      const orig = console.error;
      console.error = () => {};
      try {
        await vm.setTaskStatus(task, '✓');
        await flush();
      } finally { console.error = orig; }
      assert.equal(vm.noteCards[0].content, '- first');
    });
  });
}
