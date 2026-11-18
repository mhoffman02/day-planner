/**
 * @file dataTip.js
 * @description Callout for controls that carry data-tip (user 2026-11-18). One fixed-position bubble lives on the body and
 * is placed from the control rectangle, so a scrolling list or a panel edge cannot clip it, and it sits well clear of the
 * mouse cursor. dataTipPlacement is pure; initDataTips wires the delegated listeners. The same code is inlined in
 * gas-app/Script.html: keep both copies in sync.
 */

const TIP_GAP = 24;
const TIP_MARGIN = 8;
const TIP_DELAY_MS = 400;

/**
 * Where the bubble goes. Below the control by default, above when data-tip-pos is top or when below has no room.
 * The gap keeps the cursor, which hangs down-right of its hotspot, off the text.
 * @param {{left:number, top:number, width:number, height:number}} anchor Control rectangle in viewport pixels.
 * @param {{width:number, height:number}} bubble Bubble size.
 * @param {{width:number, height:number}} viewport Viewport size.
 * @param {string|null} [preferred] 'top' to prefer above.
 * @returns {{side:string, left:number, top:number, tailLeft:number}} Bubble corner and the tail offset inside it.
 */
export function dataTipPlacement(anchor, bubble, viewport, preferred) {
  const centerX = anchor.left + anchor.width / 2;
  const maxLeft = Math.max(TIP_MARGIN, viewport.width - bubble.width - TIP_MARGIN);
  const left = Math.round(Math.min(Math.max(centerX - bubble.width / 2, TIP_MARGIN), maxLeft));
  const fitsBelow = anchor.top + anchor.height + TIP_GAP + bubble.height + TIP_MARGIN <= viewport.height;
  const fitsAbove = anchor.top - TIP_GAP - bubble.height >= TIP_MARGIN;
  const wantTop = preferred === 'top';
  const side = (wantTop ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove) ? 'top' : 'bottom';
  const top = side === 'top' ? anchor.top - TIP_GAP - bubble.height : anchor.top + anchor.height + TIP_GAP;
  const tailLeft = Math.round(Math.min(Math.max(centerX - left, TIP_MARGIN + 4), Math.max(TIP_MARGIN + 4, bubble.width - TIP_MARGIN - 4)));
  return { side, left, top, tailLeft };
}

/**
 * Wire hover and keyboard-focus tips for every [data-tip] element, now and later.
 * @param {Document} doc Document to listen on.
 * @param {{innerWidth:number, innerHeight:number}} win Window, for the viewport size.
 * @param {{set:Function, clear:Function}} [timers] Timer pair, replaceable in tests.
 * @returns {void}
 */
export function initDataTips(doc, win, timers) {
  const t = timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };
  let bubble = null;
  let pending = null;

  const ensureBubble = () => {
    if (bubble) return bubble;
    bubble = doc.createElement('div');
    bubble.className = 'data-tip-bubble';
    bubble.setAttribute('role', 'presentation');
    doc.body.appendChild(bubble);
    return bubble;
  };

  const hide = () => {
    if (pending !== null) t.clear(pending);
    pending = null;
    if (bubble) bubble.className = 'data-tip-bubble';
  };

  const show = (el) => {
    const text = el.getAttribute('data-tip');
    if (!text) return;
    const b = ensureBubble();
    b.textContent = text;
    b.className = 'data-tip-bubble';
    b.style.left = '0px';
    b.style.top = '0px';
    const size = b.getBoundingClientRect();
    const p = dataTipPlacement(el.getBoundingClientRect(), { width: size.width, height: size.height }, { width: win.innerWidth, height: win.innerHeight }, el.getAttribute('data-tip-pos'));
    b.style.left = p.left + 'px';
    b.style.top = p.top + 'px';
    b.style.setProperty('--tip-tail-x', p.tailLeft + 'px');
    b.setAttribute('data-side', p.side);
    b.className = 'data-tip-bubble is-shown';
  };

  const arm = (target, focusOnly) => {
    const el = target && target.closest ? target.closest('[data-tip]') : null;
    hide();
    if (!el) return;
    if (focusOnly && el.matches && !el.matches(':focus-visible')) return;
    ensureBubble();
    pending = t.set(() => { pending = null; show(el); }, TIP_DELAY_MS);
  };

  doc.addEventListener('mouseover', (e) => arm(e.target, false));
  doc.addEventListener('focusin', (e) => arm(e.target, true));
  doc.addEventListener('mouseout', hide);
  doc.addEventListener('focusout', hide);
  doc.addEventListener('mousedown', hide);
  doc.addEventListener('keydown', hide);
  doc.addEventListener('scroll', hide, true);
}
