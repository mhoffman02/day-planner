/**
 * @file eventDescriptionSanitizer.test.js
 * @description Calendar event descriptions are attacker-controlled (anyone can send an invite) and
 * reach the DOM through x-html (gas-app/Index.html event popover and event modal). The old regex
 * sanitizer was bypassable (slash-separated handlers, iframe srcdoc, entity-encoded and unquoted
 * javascript: hrefs, split script tags, Alpine x-init/@click/:attr directives, which x-html
 * initializes). The sanitizer is now an allowlist that rebuilds the markup: only a, br, p, b, i, u,
 * ul, ol, li, span survive, with no attributes except a vetted http/https/mailto href on a.
 * Every implementation is checked: src/calendarEngine.js, and the formatEventDescription method of
 * both client copies (src/app.js and gas-app/Script.html).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatEventDescriptionHtml } from '../src/calendarEngine.js';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const ALLOWED_PLAIN = /^<\/?(?:p|b|i|u|ul|ol|li|span|a|pre)>$/;
const ALLOWED_ANCHOR = /^<a(?: href="([^"<>]*)")? target="_blank" rel="noopener noreferrer">$/;

function decodeAttr(v) {
  return v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Independent structural check: every tag is on the allowlist, every href is http(s)/mailto, text has no markup. */
function assertSafe(out, label) {
  for (const m of out.matchAll(/<[^>]*>?/g)) {
    const tag = m[0];
    if (tag === '<br>' || ALLOWED_PLAIN.test(tag)) continue;
    const a = ALLOWED_ANCHOR.exec(tag);
    assert.ok(a, `${label}: tag not on the allowlist: ${tag}\nfull output: ${out}`);
    if (a[1] !== undefined) {
      const href = decodeAttr(a[1]).trim().replace(/[\t\n\r]/g, '');
      assert.match(href, /^(?:https?|mailto):/i, `${label}: href scheme not allowed: ${a[1]}`);
    }
  }
  const text = out.replace(/<[^>]*>/g, '');
  assert.ok(!/[<>]/.test(text), `${label}: raw < or > left in text: ${out}`);
}

const PAYLOADS = [
  ['slash-separated handler', '<img src="x"/onerror=alert(1)>hi'],
  ['iframe srcdoc', '<b>x</b><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>'],
  ['entity-encoded javascript href', '<a href="jav&#x61;script:alert(1)">x</a>'],
  ['decimal-entity javascript href', '<a href="&#106;avascript:alert(1)">x</a>'],
  ['named-entity colon href', '<a href="javascript&colon;alert(1)">x</a>'],
  ['unquoted javascript href', '<a href=javascript:alert(1)>x</a>'],
  ['whitespace-padded javascript href', '<a href="  \tjava\nscript:alert(1)">x</a>'],
  ['data: href', '<a href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">x</a>'],
  ['split script tag', '<scr<script>x</script>ipt>alert(1)</script>'],
  ['Alpine x-init', '<b x-init="alert(1)">t</b>'],
  ['Alpine @click', '<b @click="alert(1)">t</b>'],
  ['Alpine :attr', '<span :class="alert(1)">t</span>'],
  ['Alpine x-on', '<a href="https://ok.test" x-on:click="alert(1)">t</a>'],
  ['handler on allowed anchor', '<a href="https://ok.test" onclick="alert(1)">t</a>'],
  ['quoted > inside an attribute', '<b title="a>b onmouseover=alert(1)">t</b>'],
  ['svg onload', '<svg onload=alert(1)><circle></circle></svg>ok'],
  ['style block', '<style>*{background:url(javascript:alert(1))}</style><b>t</b>'],
  ['comment hiding a tag', '<b>a</b><!-- --><img src=x onerror=alert(1)> -->'],
  ['math/mglyph mutation', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>'],
  ['object data', '<object data="javascript:alert(1)"></object><b>t</b>'],
  ['form action', '<form action="javascript:alert(1)"><button>go</button></form>'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=javascript:alert(1)"><b>t</b>'],
  ['unterminated tag at end', '<b>t</b><img src=x onerror=alert(1)'],
  ['unterminated quoted value', '<b>t</b><a href="https://x onclick=alert(1)>y'],
  ['textarea breakout', '<textarea></textarea><img src=x onerror=alert(1)>'],
  ['nested quotes in href', '<a href=\'https://x.test/"onmouseover="alert(1)\'>t</a>'],
  ['uppercase tags', '<IMG SRC=x ONERROR=alert(1)><B>t</B>']
];

const EXACT = [
  ['anchor gets forced target/rel, keeps https href',
    'Call via <a href="https://meet.example.com">this link</a><br>Bring notes',
    'Call via <a href="https://meet.example.com" target="_blank" rel="noopener noreferrer">this link</a><br>Bring notes'],
  ['existing target is overridden to _blank',
    '<a href="https://x.test" target="_self">x</a>',
    '<a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>'],
  ['mailto kept, query ampersand round-trips',
    '<a href="mailto:a@b.test">m</a> <a href=\'https://x.test/?a=1&amp;b=2\'>q</a>',
    '<a href="mailto:a@b.test" target="_blank" rel="noopener noreferrer">m</a> <a href="https://x.test/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">q</a>'],
  ['javascript href dropped, text kept',
    '<a href="javascript:alert(1)">click</a>',
    '<a target="_blank" rel="noopener noreferrer">click</a>'],
  ['relative href dropped',
    '<a href="/exec?view=x">r</a>',
    '<a target="_blank" rel="noopener noreferrer">r</a>'],
  ['formatting tags kept, attributes stripped, case folded',
    '<P class="x"><B id="k">b</B> <i style="color:red">i</i> <u>u</u> <span dir="rtl">s</span></P>',
    '<p><b>b</b> <i>i</i> <u>u</u> <span>s</span></p>'],
  ['lists kept',
    '<ul><li>one</li><li>two</li></ul><ol><li>x</li></ol>',
    '<ul><li>one</li><li>two</li></ul><ol><li>x</li></ol>'],
  ['unknown tags dropped, their text kept',
    '<div>a</div><h1>b</h1><table><tr><td>c</td></tr></table>',
    'abc'],
  ['script and style content dropped',
    '<b>a</b><script>x()\n</script>b<STYLE>q</STYLE>c',
    '<b>a</b>bc'],
  ['split script tag leaves only inert text',
    '<scr<script>x</script>ipt>alert(1)</script>',
    'xipt&gt;alert(1)'],
  ['unclosed allowed tags are closed, stray closers dropped',
    '<b><i>t</b></span>',
    '<b><i>t</i></b>'],
  ['text entities kept, bare ampersand escaped',
    '<b>a &amp; b &nbsp; c & d &lt;x&gt;</b>',
    '<b>a &amp; b &nbsp; c &amp; d &lt;x&gt;</b>'],
  ['self-closing br',
    'a<br/>b<BR >c',
    'a<br>b<br>c']
];

const impls = [{ label: 'src/calendarEngine.js formatEventDescriptionHtml', fn: formatEventDescriptionHtml }];
for (const c of await bothClients()) {
  const vm = makeVm(c.factory, {});
  impls.push({ label: `${c.label} formatEventDescription`, fn: (s) => vm.formatEventDescription(s) });
}

for (const impl of impls) {
  describe(`event description allowlist sanitizer [${impl.label}]`, () => {
    for (const [name, payload] of PAYLOADS) {
      it(`neutralizes: ${name}`, () => {
        const out = impl.fn(payload);
        assertSafe(out, name);
        // A vetted https href may legitimately carry these words as inert, escaped URL text.
        assert.doesNotMatch(out.replace(/ href="https?:[^"]*"/g, ''), /javascript|onerror|onload|onclick|onmouseover|srcdoc|x-init|x-on|@click|:class|<script|<img|<iframe|<svg|<style/i, `${name}: ${out}`);
      });
    }
    for (const [name, input, expected] of EXACT) {
      it(name, () => {
        assert.equal(impl.fn(input), expected);
      });
    }
    it('plain text still escapes into <pre>', () => {
      assert.equal(impl.fn('Line one\nLine two <not-really-a-tag'), '<pre>Line one\nLine two &lt;not-really-a-tag</pre>');
      assert.equal(impl.fn(''), '');
    });
  });
}
