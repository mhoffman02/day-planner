import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BinderStore, VIEWS } from '../src/binderStore.js';

describe('Binder Store Unit Tests', () => {
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
});
