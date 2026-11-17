/**
 * @file dictationHotkey.test.js
 * @description User 2026-11-16: voice typing is global. Double-tap Ctrl (the STT-TTS bookmarklet rule) toggles
 * the existing dictation popup from anywhere; the popup keeps running between toggles. Tests the pure
 * detector and target resolver, and that the popup and host share one detector definition.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDoubleCtrlDetector, dictationTargetKind } from '../src/dictationHotkey.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function rig() {
  let t = 1000;
  const d = createDoubleCtrlDetector(() => t);
  const adv = (ms) => { t += ms; };
  const down = (key = 'Control', repeat = false) => d.keydown({ key, repeat });
  const up = (key = 'Control') => d.keyup({ key });
  return { d, adv, down, up };
}

describe('createDoubleCtrlDetector', () => {
  it('fires on the second quick tap', () => {
    const r = rig();
    r.down(); r.adv(80); assert.equal(r.up(), false);
    r.adv(120); r.down(); r.adv(80);
    assert.equal(r.up(), true);
  });
  it('ignores a tap held past 250 ms', () => {
    const r = rig();
    r.down(); r.adv(300); r.up();
    r.adv(50); r.down(); r.adv(80);
    assert.equal(r.up(), false);
  });
  it('ignores a second tap 400 ms or more after the first', () => {
    const r = rig();
    r.down(); r.adv(80); r.up();
    r.adv(400); r.down(); r.adv(80);
    assert.equal(r.up(), false);
  });
  it('resets when another key comes between, so Ctrl+C then Ctrl is not a toggle', () => {
    const r = rig();
    r.down(); r.adv(40); r.down('c'); r.adv(40); r.up();
    r.adv(50); r.down(); r.adv(80);
    assert.equal(r.up(), false);
  });
  it('ignores key auto-repeat of a held Ctrl', () => {
    const r = rig();
    r.down(); r.adv(80); r.up();
    r.adv(60); r.down(); r.down('Control', true); r.adv(80);
    assert.equal(r.up(), true);
  });
  it('a third tap starts a new pair instead of firing again', () => {
    const r = rig();
    r.down(); r.adv(60); r.up(); r.adv(60); r.down(); r.adv(60); assert.equal(r.up(), true);
    r.adv(60); r.down(); r.adv(60);
    assert.equal(r.up(), false);
  });
  it('reset() (a mouse press) cancels a half-finished pair', () => {
    const r = rig();
    r.down(); r.adv(60); r.up();
    r.d.reset();
    r.adv(60); r.down(); r.adv(60);
    assert.equal(r.up(), false);
  });
  it('a keyup with no matching keydown never fires', () => {
    const r = rig();
    assert.equal(r.up(), false);
  });
});

describe('dictationTargetKind', () => {
  const base = { view: 'daily', activeTag: 'BODY', activeType: '', isContentEditable: false, readOnly: false, disabled: false };
  it('dictates into a focused text field', () => {
    assert.equal(dictationTargetKind({ ...base, activeTag: 'INPUT', activeType: 'text' }), 'focused');
    assert.equal(dictationTargetKind({ ...base, activeTag: 'TEXTAREA' }), 'focused');
    assert.equal(dictationTargetKind({ ...base, isContentEditable: true }), 'focused');
  });
  it('never dictates into a password, checkbox or read-only field', () => {
    assert.notEqual(dictationTargetKind({ ...base, activeTag: 'INPUT', activeType: 'password' }), 'focused');
    assert.notEqual(dictationTargetKind({ ...base, activeTag: 'INPUT', activeType: 'checkbox' }), 'focused');
    assert.notEqual(dictationTargetKind({ ...base, activeTag: 'INPUT', activeType: 'text', readOnly: true }), 'focused');
    assert.notEqual(dictationTargetKind({ ...base, activeTag: 'INPUT', activeType: 'text', disabled: true }), 'focused');
  });
  it('with nothing focused, the Tasks view takes the quick-add title and elsewhere the notes default line', () => {
    assert.equal(dictationTargetKind({ ...base, view: 'daily' }), 'tasks-quick-add');
    assert.equal(dictationTargetKind({ ...base, view: 'master-tasks' }), 'notes-default');
    assert.equal(dictationTargetKind({ ...base, view: 'monthly-calendar' }), 'notes-default');
  });
});

describe('Tasks header mic', () => {
  for (const file of ['index.html', 'gas-app/Index.html']) {
    it(`${file} puts a mic in the Tasks panel header that toggles global dictation`, () => {
      const html = read(file);
      const header = html.slice(html.indexOf('class="tasks-header-actions"'), html.indexOf("toggleMaximizeColumn('tasks')"));
      assert.match(header, /stt-mic-btn/);
      assert.match(header, /@mousedown\.prevent/);
      assert.match(header, /@click="toggleGlobalDictation\(\)"/);
    });
  }
  it('the mic tooltip names the double-tap Ctrl hotkey', () => {
    for (const file of ['src/app.js', 'gas-app/Script.html']) assert.match(read(file), /Start voice typing \(double-tap Ctrl or Ctrl\+Alt\+S\)/);
  });
});

describe('quiet listening cue (user 2026-11-16: popup too loud, animate the mic icon)', () => {
  it('the listening mic is a pulsing small ring, not a filled button', () => {
    const css = read('src/styles.css');
    const rule = css.slice(css.indexOf('.stt-mic-btn.stt-listening'), css.indexOf('.stt-mic-btn.stt-blocked'));
    assert.match(rule, /::after/);
    assert.match(rule, /animation:\s*sttRing/);
    assert.doesNotMatch(rule, /background:\s*var\(--binder-teal\)/);
    assert.match(css, /@keyframes sttRing/);
  });
  it('the voice popup opens small and returns focus to the app', () => {
    for (const file of ['src/app.js', 'gas-app/Script.html']) {
      const src = read(file);
      assert.match(src, /window\.open\('', 'dayPlannerDictation', `width=1[0-6]\d,height=1[0-2]\d/);
      assert.match(src, /window\.focus\(\)/);
      assert.match(src, /\.resizeTo\(36, 36\)/);
      assert.match(src, /\.moveTo\(window\.screen\.availWidth/);
    }
  });
});

describe('voice window stays visible until the mic works (user 2026-11-16: Notes mic blocked after the shrink)', () => {
  for (const file of ['src/app.js', 'gas-app/Script.html']) {
    it(`${file} starts listening on every open, parks only once listening, and reveals on error`, () => {
      const src = read(file);
      assert.doesNotMatch(src, /if \(viaHotkey\) setTimeout\(\(\) => this\.postToDictationPopup\('start'\)/);
      assert.match(src, /parkDictationPopup\(\) \{/);
      assert.match(src, /revealDictationPopup\(\) \{/);
      assert.match(src, /data\.listening\) this\.parkDictationPopup\(\)/);
      assert.match(src, /this\.revealDictationPopup\(\);\s*this\.ensureDictationScratchDoc/);
    });
  }
});

describe('popup and host share one detector', () => {
  for (const file of ['src/app.js', 'gas-app/Script.html']) {
    it(`${file} builds the popup detector from createDoubleCtrlDetector, not a second copy`, () => {
      const src = read(file);
      assert.match(src, /createDoubleCtrlDetector\.toString\(\)/);
      assert.match(src, /dictation-state/);
      assert.match(src, /day-planner-host/);
    });
  }
});
