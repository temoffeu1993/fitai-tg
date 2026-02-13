---
description: Default workflow rules for all tasks
---

## General Rules

1. **No confirmations** — выполняй задачи от начала до конца без остановок на подтверждение. Планирование → реализация → верификация → коммит+пуш — одним проходом.

2. **Auto commit & push** — после завершения задачи всегда делай:
// turbo
```bash
git add -A && git commit -m "<описание изменений на английском>" && git push
```
Коммит-месседж пиши на английском, кратко и по делу (conventional commits style, например `feat: add technique accordion to workout session`).
