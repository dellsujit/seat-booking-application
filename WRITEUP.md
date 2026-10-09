# Seat Reservation at Scale — Engineering Write-up

## 1. Atomic Reservation Decision

All booking steps run inside one PostgreSQL transaction. The service uses a transaction-scoped advisory lock (`pg_advisory_xact_lock`) for the same show and user, and row locks (`SELECT ... FOR UPDATE`) for seats.

These locks prevent concurrent requests from booking the same seat or exceeding the per-user limit. All reservation changes commit together or roll back on failure.

For multi-seat bookings, seats should be locked in a consistent order to reduce deadlock risk.

## 2. Idempotency

The idempotency key and request fingerprint are stored in the `reservations` table. A database unique constraint protects the key within its user and show scope.

- Same key and same request: returns the original reservation.
- Same key with different seats: returns `409 Conflict`.
- New key: processes a new reservation.

This prevents duplicate reservations when clients retry requests.

## 3. Holds and Expiry

The current system supports confirmed and cancelled reservations. Timed holds and automatic expiry are not implemented. Cancelled reservations release their seats.

## 4. Consistency vs. Availability

PostgreSQL is the source of truth. If the database is unavailable, the service fails the booking request rather than confirming a seat without checking its state. This protects consistency at the cost of availability during a database failure.

## 5. Observability

The service provides health endpoints, Prometheus metrics, and structured logs with request IDs.

I would alert on:
- Repeated HTTP 5xx errors.
- Database connection or readiness failures.
- Duplicate bookings or inconsistent seat states.
- High booking latency and resource exhaustion.

Metrics counters are currently stored in memory and reset when the service restarts.


