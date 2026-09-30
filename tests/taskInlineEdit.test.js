import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateTaskTitleText, parseTaskTitle, formatTaskTitle } from '../src/taskEngine.js';

describe('Task Inline Description Editing', () => {
  it('should parse and update task clean title while preserving priority prefix', () => {
    const original = '[A1] Review quarterly roadmap';
    const parsed = parseTaskTitle(original);
    assert.equal(parsed.cleanTitle, 'Review quarterly roadmap');

    const updated = updateTaskTitleText(original, 'Review Q3 roadmap in detail');
    assert.equal(updated, '[A1] Review Q3 roadmap in detail');
  });

  it('should handle unprioritized task title updates', () => {
    const original = 'Draft email to team';
    const updated = updateTaskTitleText(original, 'Draft update email to team');
    assert.equal(updated, 'Draft update email to team');
  });

  it('should preserve original title when new clean title is empty or whitespace', () => {
    assert.equal(updateTaskTitleText('[B2] Prepare slides', ''), '[B2] Prepare slides');
    assert.equal(updateTaskTitleText('[B2] Prepare slides', '    '), '[B2] Prepare slides');
    assert.equal(updateTaskTitleText('[B2] Prepare slides', null), '[B2] Prepare slides');
  });

  it('should trim surrounding whitespace from new clean title', () => {
    const updated = updateTaskTitleText('[C3] Clean workspace', '   Clean lab workspace   ');
    assert.equal(updated, '[C3] Clean lab workspace');
  });

  it('simulates Alpine inline editing lifecycle (start -> edit -> save)', async () => {
    let synced = false;
    let bridgeUpdated = null;

    const mockApp = {
      editingTaskId: null,
      editingTaskTitle: '',
      dailyTasks: [
        { id: 'task-1', title: '[A2] Buy groceries', status: '•', category: 'Personal' }
      ],
      masterTasks: [],
      selectedDate: '2026-09-30',
      parseTask(title) { return parseTaskTitle(title); },
      syncDailyCacheFromLiveState() { synced = true; },
      async trigger2WaySync() {},
      bridge: {
        async updateDailyTask(dateStr, taskId, updates) {
          bridgeUpdated = { dateStr, taskId, updates };
          return { id: taskId, ...updates };
        }
      },

      startEditingTask(task) {
        if (!task || !task.id) return;
        this.editingTaskId = task.id;
        const parsed = this.parseTask(task.title);
        this.editingTaskTitle = parsed.cleanTitle;
      },

      cancelEditingTask() {
        this.editingTaskId = null;
        this.editingTaskTitle = '';
      },

      async updateTaskTitle(taskId, newTitle) {
        if (!this.editingTaskId || this.editingTaskId !== taskId) return;
        this.editingTaskId = null;
        const trimmed = (newTitle || '').trim();
        this.editingTaskTitle = '';

        let task = this.dailyTasks.find(t => t.id === taskId);
        let isMaster = false;
        if (!task) {
          task = this.masterTasks.find(t => t.id === taskId);
          isMaster = true;
        }
        if (!task) return;

        const parsed = this.parseTask(task.title);
        if (!trimmed || trimmed === parsed.cleanTitle) {
          return;
        }

        const oldTitle = task.title;
        const newFullTitle = updateTaskTitleText(oldTitle, trimmed);
        task.title = newFullTitle;

        this.syncDailyCacheFromLiveState();

        if (this.bridge && typeof this.bridge.updateDailyTask === 'function') {
          await this.bridge.updateDailyTask(this.selectedDate, task.id, { title: newFullTitle });
        }
      }
    };

    // 1. Start editing
    mockApp.startEditingTask(mockApp.dailyTasks[0]);
    assert.equal(mockApp.editingTaskId, 'task-1');
    assert.equal(mockApp.editingTaskTitle, 'Buy groceries');

    // 2. Edit and save
    mockApp.editingTaskTitle = 'Buy groceries and fruit';
    await mockApp.updateTaskTitle('task-1', mockApp.editingTaskTitle);

    assert.equal(mockApp.editingTaskId, null);
    assert.equal(mockApp.editingTaskTitle, '');
    assert.equal(mockApp.dailyTasks[0].title, '[A2] Buy groceries and fruit');
    assert.equal(synced, true);
    assert.deepEqual(bridgeUpdated, {
      dateStr: '2026-09-30',
      taskId: 'task-1',
      updates: { title: '[A2] Buy groceries and fruit' }
    });

    // 3. Test double-call / blur after enter guard
    const prevBridgeCall = bridgeUpdated;
    bridgeUpdated = null;
    await mockApp.updateTaskTitle('task-1', 'Different title');
    assert.equal(bridgeUpdated, null, 'Second call while editingTaskId is null should be a no-op');

    // 4. Test cancel editing
    mockApp.startEditingTask(mockApp.dailyTasks[0]);
    assert.equal(mockApp.editingTaskId, 'task-1');
    mockApp.cancelEditingTask();
    assert.equal(mockApp.editingTaskId, null);
    assert.equal(mockApp.dailyTasks[0].title, '[A2] Buy groceries and fruit');
  });

  it('mirrors inline task title update to linked master task', async () => {
    const mockApp = {
      editingTaskId: null,
      editingTaskTitle: '',
      dailyTasks: [
        { id: 'daily-99', title: '[B1] Quarterly budget', sourceMasterId: 'master-99' }
      ],
      masterTasks: [
        { id: 'master-99', title: '[B1] Quarterly budget', movedTaskId: 'daily-99' }
      ],
      selectedDate: '2026-09-30',
      parseTask(title) { return parseTaskTitle(title); },
      syncDailyCacheFromLiveState() {},
      async trigger2WaySync() {},
      bridge: {
        async updateDailyTask() { return {}; }
      },
      startEditingTask(task) {
        this.editingTaskId = task.id;
        this.editingTaskTitle = this.parseTask(task.title).cleanTitle;
      },
      async updateTaskTitle(taskId, newTitle) {
        if (!this.editingTaskId || this.editingTaskId !== taskId) return;
        this.editingTaskId = null;
        const trimmed = (newTitle || '').trim();
        this.editingTaskTitle = '';

        let task = this.dailyTasks.find(t => t.id === taskId);
        let isMaster = false;
        if (!task) {
          task = this.masterTasks.find(t => t.id === taskId);
          isMaster = true;
        }
        if (!task) return;

        const parsed = this.parseTask(task.title);
        if (!trimmed || trimmed === parsed.cleanTitle) return;

        const oldTitle = task.title;
        const newFullTitle = updateTaskTitleText(oldTitle, trimmed);
        task.title = newFullTitle;

        const linkedMaster = !isMaster ? this.masterTasks.find(m => m.movedTaskId === task.id) : null;
        if (linkedMaster) linkedMaster.title = newFullTitle;
      }
    };

    mockApp.startEditingTask(mockApp.dailyTasks[0]);
    await mockApp.updateTaskTitle('daily-99', 'FY27 Operating Budget');

    assert.equal(mockApp.dailyTasks[0].title, '[B1] FY27 Operating Budget');
    assert.equal(mockApp.masterTasks[0].title, '[B1] FY27 Operating Budget');
  });
});
