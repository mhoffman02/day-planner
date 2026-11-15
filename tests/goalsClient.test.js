/**
 * @file goalsClient.test.js
 * @description Goals tab client behavior in both client copies (src/app.js and gas-app/Script.html):
 * a broken-down sub-goal inherits its parent life area and value so the Balance grid counts it,
 * and the Send to Future month starts at the current month instead of blank.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';
import { GOAL_HORIZONS, GOAL_AREAS } from '../src/integration/goalPlanner.js';

const PARENT = { id: 'g1', title: 'Earn PMP certification', horizon: '1y', parentId: null, area: 'Career', value: 'Mastery', measure: '', purpose: '', ifThen: '', target: '', status: 'open' };

for (const c of await bothClients()) {
  describe(`goals client [${c.label}]`, () => {
    function vmWithParent() {
      const vm = makeVm(c.factory, { todayStr: '2026-11-15' });
      vm.goalsData = { goals: [PARENT], horizons: GOAL_HORIZONS.map(h => ({ ...h })), areas: [...GOAL_AREAS] };
      vm.goalsLoaded = true;
      vm.selectGoal('g1');
      return vm;
    }

    it('newChildGoal inherits the parent area and value, one horizon lower', () => {
      const vm = vmWithParent();
      vm.newChildGoal();
      assert.equal(vm.goalDraft.parentId, 'g1');
      assert.equal(vm.goalDraft.horizon, 'quarter');
      assert.equal(vm.goalDraft.area, 'Career');
      assert.equal(vm.goalDraft.value, 'Mastery');
    });

    it('selecting a goal starts the Send to Future month at the current month', () => {
      const vm = vmWithParent();
      assert.equal(vm.goalStepMonth, '2026-11');
    });
  });
}
