## Burst Test — 50,000 Requests

The project includes a burst test to evaluate reservation behavior under high concurrency and verify that the same seat cannot be booked more than once.

### How to Run

Clone the repository and install dependencies:

```bash
git clone https://github.com/dellsujit/seat-booking-application.git
cd seat-booking-application
npm ci
```

Run the burst test:

```bash
npx tsx tests/stress-50000.ts
```

The test reports reservation successes, conflicts, and unexpected server errors.

**Note:** Configure the test target and use a dedicated test show before running against the deployed API. Check the script for its supported environment variables and test setup.
