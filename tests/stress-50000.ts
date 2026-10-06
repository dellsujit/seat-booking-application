async function main() {
  const BASE_URL = "http://localhost:3000";

  const createResponse = await fetch(`${BASE_URL}/shows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer dev-admin-token",
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
  console.log("Sending 50,000 concurrent requests...");

  const start = performance.now();

  const requests = Array.from({ length: 50_000 }, (_, index) =>
    fetch(`${BASE_URL}/shows/${show.id}/reserve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer stress-user-${index}`,
        "Idempotency-Key": `stress-${index}`,
      },
      body: JSON.stringify({
        seatNumbers: ["HOT1"],
      }),
    }),
  );

  const responses = await Promise.all(requests);

  const elapsed = performance.now() - start;

  const counts = {
    confirmed: 0,
    conflict: 0,
    serverError: 0,
    other: 0,
  };

  for (const response of responses) {
    if (response.status === 201) {
      counts.confirmed++;
    } else if (response.status === 409) {
      counts.conflict++;
    } else if (response.status >= 500) {
      counts.serverError++;
    } else {
      counts.other++;
    }
  }

  console.log("\n=== 50,000 REQUEST STRESS TEST ===");
  console.log(`Total:        ${responses.length}`);
  console.log(`Confirmed:    ${counts.confirmed}`);
  console.log(`409 Conflict: ${counts.conflict}`);
  console.log(`5xx:          ${counts.serverError}`);
  console.log(`Other:        ${counts.other}`);
  console.log(`Duration:     ${(elapsed / 1000).toFixed(2)}s`);
  console.log(
    `Throughput:   ${(responses.length / (elapsed / 1000)).toFixed(0)} req/s`,
  );

  const showResponse = await fetch(
    `${BASE_URL}/shows/${show.id}`,
  );

  console.log(`\nShow status: ${showResponse.status}`);

  const state = await showResponse.json();

  console.log("Final reconciliation:");
  console.log(JSON.stringify(state.counts, null, 2));

  if (
    counts.confirmed !== 1 ||
    counts.conflict !== 49_999 ||
    counts.serverError !== 0 ||
    counts.other !== 0
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
  console.error(error);
  process.exit(1);
});