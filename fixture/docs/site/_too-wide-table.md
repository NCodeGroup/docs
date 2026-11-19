---
title: Too wide a table
description: Vault beside a byte array, one column per behaviour.
---

This file is no page, since its name starts with an underscore. `test/layout.test.mjs` copies it into a page to prove that the layout check fails a Markdown table too wide for the content column.

## Compared

| Type | Allocation | Zeroing | Pinning | Pooling | Sealing | Disposal | Threading | Serialization | Comparison | Formatting | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Vault` | Unmanaged | Automatic | Permanent | Never | Always | Explicit | Synchronized | Refused | Constant-time | Redacted | Strict |
| `byte[]` | Managed | Manual | Temporary | Optional | Never | Collected | Unsynchronized | Allowed | Sequential | Hexadecimal | None |
