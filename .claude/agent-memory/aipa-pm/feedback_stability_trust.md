---
name: User Trust Crisis on Stability
description: User explicitly complained about recurring crash bug multiple times - fix quality and testing thoroughness questioned
type: feedback
---

User has reported React #185 crash ("Something went wrong in chat panel") at least 3 times across multiple feedback cycles. The user's exact words show escalating frustration:

1. First report: Bug report with error details
2. Second report: "之前出现过这个bug，仔细检查对应原因，避免重复犯错"
3. Third report (current): "提过很多次这个bug，但一直修不好，leader需要好好审查前端和测试的工作"

**Why:** Two separate fix attempts (I291, I301) patched specific code paths but didn't eliminate the root cause. The user perceives this as carelessness or incompetence in the development process.

**How to apply:**
1. Never mark a crash fix as "done" based on fixing a single code path. System-wide audit is required.
2. Crash fixes must include explicit regression-prevention measures (code comments, guard patterns).
3. When a user reports the same issue twice, it becomes P0 regardless of other priorities.
4. The PRD for crash fixes should mandate "stress test" acceptance criteria (30-minute continuous use, specific trigger scenarios).
