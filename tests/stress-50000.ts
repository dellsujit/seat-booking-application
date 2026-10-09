async function main() {
  const BASE_URL =
  process.env.BASE_URL || "http://localhost:3000";
  const TOTAL_REQUESTS = 50_000;
  const CONCURRENCY = 500;

  const createResponse = await fetch(`${BASE_URL}/shows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.ADMIN_TOKEN || "dev-admin-token"}`,
    },
    body: JSON.stringify({
      name: `Stress Test ${Date.now()}`,
      startsAt: "2026-12-01T22:00:00Z",
      seats: [
        {
          seatNumber: "HOT1",
          pricePaise: 10000,
        },
      ],
    }),
  });

  if (createResponse.status !== 201) {
    throw new Error(
      `Failed to create show: ${createResponse.status} ${await createResponse.text()}`,
    );
  }

  const show = await createResponse.json();

  console.log(`Show: ${show.id}`);
  console.log(`Total requests: ${TOTAL_REQUESTS}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log("Starting stress test...\n");

  const start = performance.now();

  let confirmed = 0;
  let conflicts = 0;
  let serverErrors = 0;
  let other = 0;

  for (
    let batchStart = 0;
    batchStart < TOTAL_REQUESTS;
    batchStart += CONCURRENCY
  ) {
    const batchEnd = Math.min(
      batchStart + CONCURRENCY,
      TOTAL_REQUESTS,
    );

    const requests = Array.from(
      { length: batchEnd - batchStart },
      (_, offset) => {
        const index = batchStart + offset;

        return fetch(
          `${BASE_URL}/shows/${show.id}/reserve`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer stress-user-${index}`,
              "Idempotency-Key": `stress-${index}`,
            },
            body: JSON.stringify({
              seatNumbers: ["HOT1"],
            }),
          },
        );
      },
    );

    const responses = await Promise.all(requests);

    for (const response of responses) {
      if (response.status === 201) {
        confirmed++;
      } else if (response.status === 409) {
        conflicts++;
      } else if (response.status >= 500) {
        serverErrors++;
      } else {
        other++;
      }
    }

    if ((batchEnd % 5000 === 0) || batchEnd === TOTAL_REQUESTS) {
      console.log(
        `Progress: ${batchEnd}/${TOTAL_REQUESTS}`,
      );
    }
  }

  const elapsed = performance.now() - start;
  const seconds = elapsed / 1000;

  console.log("\n=== 50,000 REQUEST STRESS TEST ===");
  console.log(`Total:        ${TOTAL_REQUESTS}`);
  console.log(`Confirmed:    ${confirmed}`);
  console.log(`409 Conflict: ${conflicts}`);
  console.log(`5xx:          ${serverErrors}`);
  console.log(`Other:        ${other}`);
  console.log(`Duration:     ${seconds.toFixed(2)}s`);
  console.log(
    `Throughput:   ${(TOTAL_REQUESTS / seconds).toFixed(0)} req/s`,
  );

  const showResponse = await fetch(
    `${BASE_URL}/shows/${show.id}`,
  );

  if (showResponse.status !== 200) {
    throw new Error(
      `Failed to fetch show: ${showResponse.status}`,
    );
  }

  const state = await showResponse.json();

  console.log("\nFinal reconciliation:");
  console.log(JSON.stringify(state.counts, null, 2));

  if (
    confirmed !== 1 ||
    conflicts !== TOTAL_REQUESTS - 1 ||
    serverErrors !== 0 ||
    other !== 0
  ) {
    throw new Error("STRESS TEST FAILED");
  }

  if (
    state.counts.confirmed !== 1 ||
    state.counts.available !== 0 ||
    state.counts.held !== 0 ||
    state.seatCount !== 1
  ) {
    throw new Error("RECONCILIATION FAILED");
  }

  console.log("\n✅ 50,000-request stress test PASSED");
}

main().catch((error) => {
  console.error("\n❌ STRESS TEST FAILED");
  console.error(error);
  process.exit(1);
});
