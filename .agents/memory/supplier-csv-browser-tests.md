---
name: Supplier CSV browser tests
description: Browser-test behavior around Build Assist supplier-price CSV imports.
---

When testing Build Assist imports through the file control, wait for the visible price-source text to change before asserting the refreshed estimate. After a successful import, check whether the price-list disclosure remains open before editing or uploading another file.

**Why:** Browser file reading is asynchronous, and importing updates React state in a way that can close the disclosure; immediate assertions or fills against hidden controls are flaky or fail.

**How to apply:** Use a rendered-state wait after clicking Import CSV, and reopen the price-list disclosure through its summary when another import is needed.

Supplier CSV prices are entered in KWD, while Build Assist unit costs and totals display in USD. The app rounds each converted unit price before applying quantities, so a BOM subtotal can differ from a direct conversion of the KWD subtotal.

**Why:** Multi-line BOM totals accumulate per-unit cent rounding; assertions based only on converting the raw KWD sum can miss the amount the buyer actually sees.

**How to apply:** For quantity-based supplier-import tests, assert the rendered USD line totals and subtotal when exact displayed values matter, and still verify the KWD supplier prices through their expected USD unit costs.
