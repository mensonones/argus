# Finding template

Fields a reviewer passes to `argus_record_finding`. Keep every field grounded in
code you actually read.

- **reviewer**: correctness | security | performance | architecture
- **category**: correctness | security | performance | architecture | tests
- **title**: short, specific (not "possible bug" — say what and where)
- **severity**: info | low | medium | high | critical
- **confidence**: low | medium | high (high only if you traced the exact path)
- **file**: repo-relative path
- **start_line** / **end_line**: the exact region
- **description**: what the problem is, concretely
- **evidence**: the exact code / call chain / taint path / cost analysis
- **evidencePackage** (optional): structured snapshot and validation observations;
  use the contract in `skills/full-review/references/evidence-package.md`.
- **impact**: what goes wrong and why it matters
- **scenario**: a concrete input or sequence that triggers it
- **recommendation**: how to fix it

Example (correctness):

```json
{
  "reviewer": "correctness",
  "category": "correctness",
  "severity": "high",
  "confidence": "high",
  "title": "Refund can execute twice after a timeout",
  "file": "src/payment/refund.ts",
  "start_line": 84,
  "end_line": 91,
  "description": "The refund request is sent before the transaction is persisted as PROCESSING.",
  "evidence": [
    "await gateway.refund(amount) at line 86",
    "db.markProcessing(txId) only at line 91"
  ],
  "impact": "The same transaction may be refunded multiple times.",
  "scenario": "Remote refund succeeds, process crashes before line 91, the operation is retried.",
  "recommendation": "Persist a unique refund intent before the external request and reuse an idempotency key on retry."
}
```
