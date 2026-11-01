/**
 * @file decisionBadge.test.js
 * @description 1A: a `#decision [Topic] what` note line renders a Decision badge (topic optional),
 * in both client copies. `#decisions` and `#index` lines are not decisions.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

    it('marks a decision line with note-line-decision on every line shape', () => {
      for (const raw of ['#decision [Budget] Approve', '- #decision Ship', '1. #decision Ship', '[ ] #decision Ship']) {
        assert.match(vm.renderCardLine(raw, false), /class="[^"]*\bnote-line-decision\b/, raw);
      }
    });

    it('does not mark non-decision lines', () => {
      for (const raw of ['plain', '- talked about #decisions', '#index [Work] Plan']) {
        assert.doesNotMatch(vm.renderCardLine(raw, false), /note-line-decision/, raw);
      }
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

const lum = (hex) => {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const tokens = (file, name) => [...fs.readFileSync(file, 'utf8').matchAll(new RegExp(`${name}:\\s*([^;!]+?)\\s*(?:!important)?;`, 'g'))].map((m) => m[1]);

describe('decision tag tokens', () => {
  const css = new URL('../src/styles.css', import.meta.url);
  const html = new URL('../gas-app/Styles.html', import.meta.url);
  for (const name of ['--decision-bg', '--decision-text', '--decision-rule', '--decision-tint']) {
    it(`${name} is defined for light and dark, identically in both stylesheets`, () => {
      const a = tokens(css, name);
      assert.equal(a.length, 2, `${name} needs a light and a dark value`);
      assert.deepEqual(tokens(html, name), a);
    });
  }
  it('badge text on badge background is >= 4.5:1 in light and dark', () => {
    const bg = tokens(css, '--decision-bg');
    const fg = tokens(css, '--decision-text');
    for (let i = 0; i < 2; i += 1) assert.ok(contrast(bg[i], fg[i]) >= 4.5, `${i ? 'dark' : 'light'}: ${contrast(bg[i], fg[i])}`);
  });
  it('the badge is a filled rectangle, not a pill', () => {
    const rule = /\.decision-badge\s*\{([^}]*)\}/.exec(fs.readFileSync(css, 'utf8'))[1];
    assert.match(rule, /background:\s*var\(--decision-bg\)/);
    assert.match(rule, /border-radius:\s*3px/);
  });
});
