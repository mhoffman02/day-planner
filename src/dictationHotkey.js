/**
 * @file dictationHotkey.js
 * @description Pure helpers for global voice typing: the double-tap Ctrl detector (same timing rule as the
 * STT-TTS dictation bookmarklet) and the rule for where dictated text lands. gas-app/Script.html carries a
 * mirrored copy (GAS cannot import modules). createDoubleCtrlDetector must stay self-contained: the dictation
 * popup embeds its source via toString(), so the popup and the host page can never drift.
 */

// Two taps of Ctrl, each released within 250 ms, the second within 400 ms of the first, no other key or click
// between. keyup returns true on the second tap; reset() is for mouse presses.
export function createDoubleCtrlDetector(now) {
  let lastTap = 0;
  let ctrlDown = 0;
  return {
    keydown(e) {
      if (e.key === 'Control') {
        if (!e.repeat) ctrlDown = now();
        return;
      }
      ctrlDown = 0;
      lastTap = 0;
    },
    keyup(e) {
      if (e.key !== 'Control' || !ctrlDown) return false;
      const t = now();
      const held = t - ctrlDown;
      ctrlDown = 0;
      if (held > 250) {
        lastTap = 0;
        return false;
      }
      if (lastTap && t - lastTap < 400) {
        lastTap = 0;
        return true;
      }
      lastTap = t;
      return false;
    },
    reset() {
      ctrlDown = 0;
      lastTap = 0;
    }
  };
}

const NON_TEXT_INPUT_TYPES = ['password', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden'];

// Kinds: focused (dictate into the field that has focus), else tasks-quick-add on the Tasks view and
// notes-default (the last note line) everywhere else.
export function dictationTargetKind({ view, activeTag, activeType, isContentEditable, readOnly, disabled }) {
  if (!readOnly && !disabled) {
    if (activeTag === 'TEXTAREA' || isContentEditable) return 'focused';
    if (activeTag === 'INPUT' && NON_TEXT_INPUT_TYPES.indexOf(String(activeType || 'text').toLowerCase()) === -1) return 'focused';
  }
  return view === 'daily' ? 'tasks-quick-add' : 'notes-default';
}
