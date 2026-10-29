---
name: dept-budget-frees-forecast
description: How the department cap's "frees at" forecast is derived and why it keys on unreportedRuns, not the report's unmeasured flag
metadata:
  type: project
---

Wave 66 added `freesAt` / `freesUnknown` to `AutomationDeptBudgetReport` (main `dept-budget.ts`, preload mirror, renderer `deptBudget.data.ts` + `DeptBudgetFrees.tsx`).

Two traps future work must not re-derive wrongly:

- **The rail holds at `spent + 1e-9 >= cap`, not strictly above.** A sum mathematically exactly at the cap is blocked, so the forecast's "no longer holds" test is `!(remaining + 1e-9 >= cap)`. The wave brief's parenthetical ("holds only when spend exceeds the cap") is wrong; verify against `checkDeptBudgetLimit` instead. The harness `electron-ui/.scratch/wave66b-cap-frees-harness` pins both.
- **`unmeasured` is not the test for "cannot forecast".** `AutomationDeptSpend.unmeasured` is true only when *no* in-window run reported a cost (then there is no total at all). A mixed window has a real `spentUsd` and `unmeasured: false`, but that figure is a floor, so the forecast must key on `unreportedRuns > 0` (reason `'unmeasured'`) and on `partial` (reason `'partial'`) before walking attempts.

**Why:** the whole point of the feature is not lying about when waiting helps; a lower bound would produce a time the scheduler still refuses.

**How to apply:** any future spend-window arithmetic should reuse `collectSpendWindowAttempts` / `collectDeptCostedAttempts` in `spend-guard.ts` rather than re-walking histories; the attempt list is the single definition of "inside the window" and "is an attempt". The background popover finds a held job's cap with `budgetHolding` (first stored cap whose `memberIds` contains the department), not `budgetCovers` (which is the Brief's "cap set on this node" question). See [[automation-scheduler]].
