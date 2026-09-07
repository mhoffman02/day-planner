/**
 * @file exportEngine.test.js
 * @description Unit tests for One-Click Binder Export & Backup Engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectFullBinderState,
  exportBinderAsJson,
  exportBinderAsMarkdown,
  downloadFile,
  downloadBinderJson,
  downloadBinderMarkdown
} from '../src/exportEngine.js';

describe('Export Engine Unit Tests', () => {
  const sampleDailyData = [
    {
      dateStr: '2026-08-15',
      tasks: [
        { id: 't1', title: '[A1] Review quarterly roadmap', status: '✓', category: 'Work' },
        { id: 't2', title: '[B1] Order office supplies', status: '•', category: 'Personal' }
      ],
      calendarEvents: [
        { id: 'e1', title: 'Product Review', startTime: '2026-08-15T10:00:00Z', endTime: '2026-08-15T10:30:00Z', location: 'Zoom' }
      ],
      noteContent: '### Standup\nDiscussed deadlines.\n#index [Roadmap] Finalized Q3 deliverables'
    },
    {
      dateStr: '2026-08-16',
      tasks: [
        { id: 't3', title: '[A1] Client presentation', status: '•', category: 'Work' }
      ],
      calendarEvents: [],
      noteContent: '#index [Client] Signed contract expansion'
    }
  ];

  const sampleMasterTasks = [
    { id: 'm1', title: '[A1] Plan annual company retreat', status: '•', category: 'Operations' },
    { id: 'm2', title: 'Update emergency contact sheet', status: '✓', category: 'Admin' }
  ];

  it('collectFullBinderState aggregates daily records, master tasks, and parsed #index entries', () => {
    const state = collectFullBinderState({
      dailyData: sampleDailyData,
      masterTasks: sampleMasterTasks
    });

    assert.equal(state.version, 1);
    assert.ok(state.exportedAt);

    // 3 daily tasks + 2 master tasks = 5 tasks
    assert.equal(state.stats.totalTasks, 5);
    assert.equal(state.tasks.length, 5);
    assert.equal(state.tasks.filter(t => t.isMaster).length, 2);

    // 1 calendar appointment
    assert.equal(state.stats.totalAppointments, 1);
    assert.equal(state.appointments.length, 1);
    assert.equal(state.appointments[0].title, 'Product Review');

    // 2 daily notes
    assert.equal(state.stats.totalNotes, 2);
    assert.equal(state.notes.length, 2);

    // 2 #index records parsed
    assert.equal(state.stats.totalIndexRecords, 2);
    assert.equal(state.indexRecords.length, 2);
    assert.ok(state.indexRecords.some(r => r.topic === 'Roadmap'));
    assert.ok(state.indexRecords.some(r => r.topic === 'Client'));
  });

  it('collectFullBinderState incorporates currentDaily overrides', () => {
    const currentDaily = {
      dateStr: '2026-08-15',
      tasks: [
        { id: 't1', title: '[A1] Review quarterly roadmap - edited', status: '✓' }
      ],
      calendarEvents: [],
      noteContent: 'Replaced notes'
    };

    const state = collectFullBinderState({
      dailyData: sampleDailyData,
      currentDaily
    });

    assert.equal(state.tasks.find(t => t.id === 't1').title, '[A1] Review quarterly roadmap - edited');
    assert.equal(state.notes.find(n => n.date === '2026-08-15').content, 'Replaced notes');
  });

  it('exportBinderAsJson formats valid JSON snapshot', () => {
    const state = collectFullBinderState({
      dailyData: sampleDailyData,
      masterTasks: sampleMasterTasks
    });

    const jsonStr = exportBinderAsJson(state);
    assert.ok(typeof jsonStr === 'string');

    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.stats.totalTasks, 5);
    assert.equal(parsed.tasks.length, 5);
    assert.equal(parsed.appointments.length, 1);
    assert.equal(parsed.notes.length, 2);
    assert.equal(parsed.indexRecords.length, 2);
  });

  it('exportBinderAsMarkdown formats structured Markdown document with sections', () => {
    const state = collectFullBinderState({
      dailyData: sampleDailyData,
      masterTasks: sampleMasterTasks
    });

    const md = exportBinderAsMarkdown(state);
    assert.ok(typeof md === 'string');

    // Archive header and stats
    assert.ok(md.includes('# Day Planner Binder Archive'));
    assert.ok(md.includes('- **Total Tasks**: 5'));
    assert.ok(md.includes('- **Total Appointments**: 1'));

    // Section 1: #index Decision & Topic Registry
    assert.ok(md.includes('## 1. #index Decision & Topic Registry'));
    assert.ok(md.includes('| Roadmap | Finalized Q3 deliverables |'));
    assert.ok(md.includes('| Client | Signed contract expansion |'));

    // Section 2: Master Task List
    assert.ok(md.includes('## 2. Master Task List'));
    assert.ok(md.includes('- [ ] [A1] Plan annual company retreat *(Operations)*'));
    assert.ok(md.includes('- [x] Update emergency contact sheet *(Admin)*'));

    // Section 3: Daily Planner Records
    assert.ok(md.includes('## 3. Daily Planner Records'));
    assert.ok(md.includes('### 2026-08-15'));
    assert.ok(md.includes('#### Appointments'));
    assert.ok(md.includes('Product Review @ Zoom'));
    assert.ok(md.includes('#### Tasks'));
    assert.ok(md.includes('- [x] [A1] Review quarterly roadmap *(Work)*'));
    assert.ok(md.includes('- [ ] [B1] Order office supplies *(Personal)*'));
    assert.ok(md.includes('#### Daily Notes'));
    assert.ok(md.includes('Discussed deadlines.'));
  });

  it('exportBinderAsMarkdown handles empty binder state gracefully', () => {
    const emptyState = collectFullBinderState({});
    const md = exportBinderAsMarkdown(emptyState);

    assert.ok(md.includes('# Day Planner Binder Archive'));
    assert.ok(md.includes('*No #index records found.*'));
    assert.ok(md.includes('*No master tasks found.*'));
    assert.ok(md.includes('*No daily records found.*'));
  });

  it('downloadFile safely handles non-browser environment without throwing', () => {
    const res = downloadFile('content', 'test.json', 'application/json');
    assert.equal(res, false);
  });

  it('downloadBinderJson and downloadBinderMarkdown safely invoke in Node environment', () => {
    const state = collectFullBinderState({});
    assert.equal(downloadBinderJson(state), false);
    assert.equal(downloadBinderMarkdown(state), false);
  });
});
