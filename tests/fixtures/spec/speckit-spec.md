# Feature Specification: Partial refunds

## User Scenarios & Testing *(mandatory)*
### User Story 1 - Refund part of an order (Priority: P1)
**Acceptance Scenarios**:
1. **Given** an order of 100, **When** refunding 30, **Then** 70 remains refundable.

## Requirements *(mandatory)*
### Functional Requirements
- **FR-001**: System MUST allow refunds up to the remaining total.
- **FR-002**: System MUST record each refund in the ledger.

## Success Criteria *(mandatory)*
### Measurable Outcomes
- **SC-001**: Agents complete a partial refund in under 1 minute.
