# Spec: Partial refunds

## Summary
Support agents can refund part of an order. See request in manifest.

## Scope
### In scope
- Partial refund API and dialog.
### Out of scope
- Multi-currency refunds.

## Functional requirements
- **FR-1:** An agent can refund an amount up to the remaining refundable total.
- **FR-2:** Each refund creates a ledger entry.

## Non-functional requirements
- **NFR-1:** Refund request completes in under 2 s at p95.

## Acceptance criteria
- **AC-1** (FR-1): Given an order of 100 with 30 refunded, refunding 70 succeeds and refunding 71 fails.
- **AC-2** (FR-2, NFR-1): A successful refund writes exactly one ledger entry within 2 s.

## Edge cases
- Concurrent refunds: second one fails if it would exceed the total.

## Constraints and assumptions
- Ledger API is synchronous (confirmed).

## Validation requirements
- AC-1, AC-2: integration tests in tests/refunds.

## Open questions
- (non-blocking) Should refunds email the customer? Default: no.
