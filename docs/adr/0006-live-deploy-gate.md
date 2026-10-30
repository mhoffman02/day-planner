# 0006 HOME "Day Planner v1" moves only after a live `/dev` load

**Status:** Accepted 2026-10-30.

**Context:** HOME @337-@340 passed all 1288 unit tests and never loaded (blank tab, then out of memory): a
regex in Script.html contained HTML comment markers. Unit tests run the JS in a VM and never see what
HtmlService serves. The user found it by bisecting versions by hand.

**Decision:** `npm run deploy:home` pushes @HEAD, opens `/dev` in the CDP Chrome, and moves v1 only when
plannerApp initializes. If the check cannot run (Chrome not signed in), the deploy stops. `push:work` runs
only after it passes. The safe-chars lint also bans `<!--` and `-->` in Script.html.

**Consequences:** A deploy needs the signed-in CDP Chrome on port 9222. CI cannot run this gate; it stays
local.
