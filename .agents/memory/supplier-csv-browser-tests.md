---
name: Supplier CSV browser tests
description: Browser-test behavior around Build Assist supplier-price CSV imports.
---

When testing Build Assist imports through the file control, wait for the visible price-source text to change before asserting the refreshed estimate. After a successful import, check whether the price-list disclosure remains open before editing or uploading another file.

**Why:** Browser file reading is asynchronous, and importing updates React state in a way that can close the disclosure; immediate assertions or fills against hidden controls are flaky or fail.

**How to apply:** Use a rendered-state wait after clicking Import CSV, and reopen the price-list disclosure through its summary when another import is needed.
