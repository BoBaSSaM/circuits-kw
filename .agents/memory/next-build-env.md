---
name: Next.js deployment build environment
description: Workspace production builds must not depend on preview-only PORT or BASE_PATH values.
---

Keep `PORT` and `BASE_PATH` optional during production builds. Root workspace builds should work when both are unset; preview workflows can provide them at runtime.

**Why:** A workspace deployment build previously failed when build configuration assumed a preview workflow had supplied `PORT`.

**How to apply:** When changing artifact build configuration or workspace commands, verify the root build with `PORT` and `BASE_PATH` unset. Keep listening ports and preview routing configuration in the runtime workflow.
