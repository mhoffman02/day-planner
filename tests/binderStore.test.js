/**
 * @file binderStore.test.js
 * @description Unit tests for BinderStore navigation, state management, and modal controls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BinderStore, VIEWS, getLocalDateStr } from '../src/binderStore.js';

describe('Binder Store Unit Tests', () => {
  it('should format local dates correctly using getLocalDateStr', () => {
    const sampleDate = new Date(2026, 7, 16, 22, 18, 0); // Local Aug 16, 2026 10:18 PM
    assert.equal(getLocalDateStr(sampleDate), '2026-08-16');
    assert.equal(getLocalDateStr('2026-08-16'), '2026-08-16');
  });

  it('should initialize with daily view and specified date', () => {
    const store = new BinderStore('2026-08-15');
    assert.equal(store.activeView, VIEWS.DAILY);
    assert.equal(store.selectedDate, '2026-08-15');
    assert.equal(store.selectedYear, 2026);
    assert.equal(store.selectedMonth, 8);
  });

  it('should handle view tab switching', () => {
    const store = new BinderStore();
    store.setView(VIEWS.MONTHLY_CALENDAR);
    assert.equal(store.activeView, VIEWS.MONTHLY_CALENDAR);
    store.setView(VIEWS.MASTER_TASKS);
    assert.equal(store.activeView, VIEWS.MASTER_TASKS);
  });

  it('should navigate day forward and backward correctly', () => {
    const store = new BinderStore('2026-08-15');
    store.navigateDay(1);
    assert.equal(store.selectedDate, '2026-08-16');

    store.navigateDay(-2);
    assert.equal(store.selectedDate, '2026-08-14');
  });

  it('should navigate month boundaries correctly', () => {
    const store = new BinderStore('2026-12-15');
    store.navigateMonth(1);
    assert.equal(store.selectedDate, '2027-01-01');

    store.navigateMonth(-2);
    assert.equal(store.selectedDate, '2026-11-01');
  });

  it('should control event and search modal open/close states', () => {
    const store = new BinderStore();
    assert.equal(store.eventModal.isOpen, false);

    store.openEventModal({ title: 'Test Meeting' });
    assert.equal(store.eventModal.isOpen, true);
    assert.equal(store.eventModal.event.title, 'Test Meeting');

    store.closeEventModal();
    assert.equal(store.eventModal.isOpen, false);

    store.openSearchModal();
    assert.equal(store.searchModal.isOpen, true);

    store.closeSearchModal();
    assert.equal(store.searchModal.isOpen, false);
  });

  it('should control create appointment modal state and prefill time intervals with 25, 50, and 80 min durations', () => {
    const store = new BinderStore();
    assert.equal(store.createEventModal.isOpen, false);

    // Open with default time (e.g. clicking (+) header button) -> default 25 min duration
    store.openCreateEventModal();
    assert.equal(store.createEventModal.isOpen, true);
    assert.equal(store.createEventModal.newEventData.startTime, '09:00');
    assert.equal(store.createEventModal.newEventData.endTime, '09:25');
    assert.equal(store.createEventModal.newEventData.duration, 25);
    assert.equal(store.createEventModal.newEventData.autoGoogleMeet, true);
    assert.equal(store.createEventModal.newEventData.guestsCanModify, true);
    assert.equal(store.createEventModal.newEventData.autoAgendaDoc, true);
    assert.ok(Array.isArray(store.recentAttendees));

    // Test duration switching to 50 mins
    store.setEventDuration(50);
    assert.equal(store.createEventModal.newEventData.duration, 50);
    assert.equal(store.createEventModal.newEventData.endTime, '09:50');

    // Test duration switching to 80 mins
    store.setEventDuration(80);
    assert.equal(store.createEventModal.newEventData.duration, 80);
    assert.equal(store.createEventModal.newEventData.endTime, '10:20');

    store.closeCreateEventModal();
    assert.equal(store.createEventModal.isOpen, false);

    // Open with specific slot time (e.g. clicking 07:30 AM margin link)
    store.openCreateEventModal('07:30');
    assert.equal(store.createEventModal.isOpen, true);
    assert.equal(store.createEventModal.newEventData.startTime, '07:30');
    assert.equal(store.createEventModal.newEventData.endTime, '07:55'); // 25 min later

    // Test calculateEndTime helper
    assert.equal(store.calculateEndTime('14:00', 25), '14:25');
    assert.equal(store.calculateEndTime('14:00', 50), '14:50');
    assert.equal(store.calculateEndTime('14:00', 80), '15:20');
  });

  it('should ignore invalid view names and malformed date strings', () => {
    const store = new BinderStore('2026-08-15');

    store.setView('not-a-real-view');
    assert.equal(store.activeView, VIEWS.DAILY);

    store.setSelectedDate('08/15/2026');
    assert.equal(store.selectedDate, '2026-08-15');

    store.setSelectedDate('2026-09-01');
    assert.equal(store.selectedDate, '2026-09-01');
    assert.equal(store.selectedYear, 2026);
    assert.equal(store.selectedMonth, 9);
  });

  it('should clamp calculateEndTime past 23:59 to hour 23 rather than rolling into the next day', () => {
    const store = new BinderStore();
    assert.equal(store.calculateEndTime('23:50', 25), '23:15');
  });

  it('should reset the search query but not results when closing the search modal', () => {
    const store = new BinderStore();
    store.searchModal.query = 'budget';
    store.searchModal.results.totalMatches = 3;
    store.closeSearchModal();
    assert.equal(store.searchModal.query, '');
    assert.equal(store.searchModal.isOpen, false);
    assert.equal(store.searchModal.results.totalMatches, 3);
  });
});
