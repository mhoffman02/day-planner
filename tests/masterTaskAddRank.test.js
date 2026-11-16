/**
 * @file masterTaskAddRank.test.js
 * @description Adding a Master task gives it the next free rank in its priority group (as Daily does), never the
 * list length: past 8 tasks the length made "[A10] ...", a title parseTaskTitle cannot read, so the priority was
 * silently lost. Runs src/app.js and its gas-app/Script.html mirror.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const clients = await bothClients();

for (const c of clients) {
  describe(`addMasterTask rank [${c.label}]`, () => {
    const vmWith = (titles) => {
      const saved = [];
      const bridge = { addMasterTask: async (title, category, dueDate) => { saved.push(title); return { id: 'new', title, category, dueDate }; } };
      const masterTasks = titles.map((title, i) => ({ id: 'm' + i, title, status: '•' }));
      const vm = makeVm(c.factory, { masterTasks, bridge, newMasterTaskTitle: 'New thing', newMasterTaskPriorityGroup: 'A', newMasterTaskCategory: '', newMasterTaskDueDate: '' });
      return { vm, saved };
    };

    it('the 10th master task gets a parseable rank, not [A10]', async () => {
      const { vm, saved } = vmWith(['[A1] a', '[A2] b', '[A3] c', '[A4] d', '[A5] e', '[A6] f', '[A7] g', '[A8] h', '[B1] i']);
      await vm.addMasterTask();
      assert.deepEqual(saved, ['[A9] New thing']);
    });

    it('rank counts only the chosen group', async () => {
      const { vm, saved } = vmWith(['[B1] x', '[B2] y']);
      await vm.addMasterTask();
      assert.deepEqual(saved, ['[A1] New thing']);
    });
  });
}
