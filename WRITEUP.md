\# Seat Reservation at Scale — Engineering Write-up



\## 1. Atomic Reservation Decision



The reservation decision is performed inside a single PostgreSQL transaction.



The transaction:



1\. Starts a transaction.

2\. Acquires a transaction-scoped advisory lock for the show/user booking scope.

3\. Checks the idempotency key and request fingerprint.

4\. Locks the requested seat rows using `FOR UPDATE`.

5\. Verifies that every requested seat exists and is available.

6\. Checks the per-user seat limit.

7\. Creates the reservation.

8\. Creates the reservation-seat records.

9\. Changes the seats to `confirmed`.

10\. Commits.



The important property is that the availability check and the state transition happen inside the same transaction while the seat rows are locked.



For example:



```sql

SELECT ...

FROM seats

WHERE show\_id = $1

&#x20; AND seat\_number = ANY($2)

FOR UPDATE;

