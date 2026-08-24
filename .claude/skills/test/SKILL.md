---
name: test
description: Run unit tests for day-planner engine modules (tests/*.test.js).
tags: [test, testing, unit-tests, runner, day-planner]
version: 2.0.0
---

# Day Planner Test Suite Skill

Runs unit tests covering all core day-planner engines:
- `searchEngine.test.js`
- `calendarEngine.test.js`
- `taskEngine.test.js`
- `binderStore.test.js`
- `gasBridge.test.js`
- `syncEngine.test.js`
- `indexParser.test.js`

## Run Command

```bash
npm test
```

Or run individual test files:
```bash
node --test tests/calendarEngine.test.js
node --test tests/taskEngine.test.js
node --test tests/syncEngine.test.js
```
