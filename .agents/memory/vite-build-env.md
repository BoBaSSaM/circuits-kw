---
name: Vite deployment build environment
description: Vite build commands may run without the environment values supplied to Replit preview workflows.
---

Production builders that invoke the workspace build can evaluate artifact Vite configs without Replit's workflow-injected `PORT` and `BASE_PATH`. A build does not need to open a listening port; preview workflows still need their configured values.

**Why:** A Vercel root build recursively built the workspace and failed while loading Vite config because `PORT` was absent. Setting a runtime deployment variable would not address the config's build-time assumption.

**How to apply:** Make Vite config validation command-aware: preserve required environment checks for dev/preview, but provide safe build-time defaults for the port and artifact base path. Verify with the root build while `PORT` and `BASE_PATH` are unset.
