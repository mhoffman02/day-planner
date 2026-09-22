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
