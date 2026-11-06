/**
 * @file notesEditor.test.js
 * @description User 2026-11-06: click or tap the sticky note on a task to edit its notes (the text after the pipe in the
 * title line) in a small resizable plaintext popup. Save overwrites the notes only; Cancel and an unchanged outside click
 * leave them. Also guards the inline title edit against flattening multi-line notes. Runs against BOTH client copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';

const DATE = '2026-11-06';
const clients = await bothClients();

function vmWith(c, { tasks = [], master = [], bridge = {} } = {}) {
  const vm = makeVm(c.factory, {
    selectedDate: DATE, selectedYear: 2026, selectedMonth: 10,
    dailyTasks: tasks, masterTasks: master, calendarEvents: [], dailyNote: '', bridge
  });
  c.cache.setCached(DATE, { tasks: tasks.map((t) => ({ ...t })), calendarEvents: [], noteContent: '', docUrl: '' });
  c.cache.setCachedMasterTasks(master.map((t) => ({ ...t })));
  vm.applyNotesEditorAnchor = () => {};
  return vm;
}

for (const c of clients) {
  describe(`notes editor [${c.label}]`, () => {
    it('opens with the task notes, closes the hover popover and remembers the original', () => {
      const task = { id: 't1', title: '[A1] Call', status: '•', notes: 'line1\nline2' };
      const vm = vmWith(c, { tasks: [task] });
      vm.openNotesPopoverTaskId = 't1';
      vm.openNotesEditor(task, false, null);
      assert.equal(vm.openNotesPopoverTaskId, null);
      assert.equal(vm.notesEditor.open, true);
      assert.equal(vm.notesEditor.text, 'line1\nline2');
      assert.equal(vm.notesEditorDirty(), false);
      vm.notesEditor.text = 'x';
      assert.equal(vm.notesEditorDirty(), true);
    });

    it('Save overwrites only the notes, keeps the title, and submits notesEdited', async () => {
      const task = { id: 't1', title: '[A1] Call', status: '•', notes: 'old' };
      const calls = [];
      const vm = vmWith(c, { tasks: [task], bridge: { updateDailyTask: async (d, id, u) => { calls.push([d, id, u]); return { id }; } } });
      vm.openNotesEditor(task, false, null);
      vm.notesEditor.text = 'new | with pipe\nsecond line';
      await vm.saveNotesEditor();
      await settle();
      assert.equal(task.notes, 'new | with pipe\nsecond line');
      assert.equal(task.title, '[A1] Call');
      assert.equal(vm.notesEditor.open, false);
      assert.deepEqual(calls[0], [DATE, 't1', { title: '[A1] Call', notes: 'new | with pipe\nsecond line' }]);
    });

    it('Save with empty text clears the notes', async () => {
      const task = { id: 't1', title: 'a', status: '•', notes: 'old' };
      const vm = vmWith(c, { tasks: [task], bridge: { updateDailyTask: async (d, id) => ({ id }) } });
      vm.openNotesEditor(task, false, null);
      vm.notesEditor.text = '   ';
      await vm.saveNotesEditor();
      await settle();
      assert.equal(task.notes, '');
    });

    it('Save with unchanged text closes without a write', async () => {
      const task = { id: 't1', title: 'a', status: '•', notes: 'same' };
      let writes = 0;
      const vm = vmWith(c, { tasks: [task], bridge: { updateDailyTask: async () => { writes++; return {}; } } });
      vm.openNotesEditor(task, false, null);
      await vm.saveNotesEditor();
      await settle();
      assert.equal(writes, 0);
      assert.equal(vm.notesEditor.open, false);
    });

    it('Cancel leaves the notes alone', () => {
      const task = { id: 't1', title: 'a', status: '•', notes: 'keep' };
      const vm = vmWith(c, { tasks: [task] });
      vm.openNotesEditor(task, false, null);
      vm.notesEditor.text = 'discard';
      vm.cancelNotesEditor();
      assert.equal(task.notes, 'keep');
      assert.equal(vm.notesEditor.open, false);
    });

    it('an outside click closes only when nothing changed', () => {
      const task = { id: 't1', title: 'a', status: '•', notes: 'keep' };
      const vm = vmWith(c, { tasks: [task] });
      vm.openNotesEditor(task, false, null);
      vm.notesEditor.text = 'edited';
      vm.closeNotesEditorOutside();
      assert.equal(vm.notesEditor.open, true);
      vm.notesEditor.text = 'keep';
      vm.closeNotesEditorOutside();
      assert.equal(vm.notesEditor.open, false);
    });

    it('a master task save also moves its linked daily copy', async () => {
      const daily = { id: 't9', title: 'a', status: '•', notes: 'old' };
      const master = { id: 'm1', title: 'a', status: '•', notes: 'old', movedTaskId: 't9' };
      const vm = vmWith(c, { tasks: [daily], master: [master], bridge: { updateMasterTask: async (id) => ({ id }) } });
      vm.openNotesEditor(master, true, null);
      vm.notesEditor.text = 'fresh';
      await vm.saveNotesEditor();
      await settle();
      assert.equal(master.notes, 'fresh');
      assert.equal(daily.notes, 'fresh');
    });

    it('inline title edit does not flatten multi-line notes', async () => {
      const task = { id: 't1', title: 'Old', status: '•', notes: 'a\nb' };
      const vm = vmWith(c, { tasks: [task], bridge: { updateDailyTask: async (d, id) => ({ id }) } });
      vm.startEditingTask(task);
      assert.equal(vm.editingTaskTitle.includes('|'), false);
      vm.editingTaskTitle = 'New';
      await vm.updateTaskTitle('t1', vm.editingTaskTitle);
      await settle();
      assert.equal(task.notes, 'a\nb');
      assert.equal(task.title, 'New');
    });
  });
}
