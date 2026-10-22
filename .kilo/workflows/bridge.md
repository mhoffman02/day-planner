---
description: Check or send messages across the Claude Code ↔ Antigravity CLI bridge
---

Inter-harness bridge commands:

1. **Check pending messages from counterpart**:
   ```bash
   node tools/agent-bridge.js read
   ```
2. **Acknowledge / clear pending messages**:
   ```bash
   node tools/agent-bridge.js ack
   ```
3. **Send a handoff message to counterpart**:
   ```bash
   node tools/agent-bridge.js send --from <agy|claude> --to <claude|agy> --type <task|review|question|status> "<message>"
   ```
4. **Generate a continuation prompt for counterpart**:
   ```bash
   node tools/agent-bridge.js prompt --for <claude|agy>
   ```

**Full interactive switch** (only when the user wants to keep driving in the other CLI; one-shot work uses
`/consult-agy` or `/consult-claude`): run `/handoff`, send a `task` or `review` message as in 3, then tell the user
to start the other CLI (`claude` or `agy`) and resume with `node tools/agent-bridge.js read --for <claude|agy>`.
