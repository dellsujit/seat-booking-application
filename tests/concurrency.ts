import "dotenv/config";

const BASE_URL = "http://localhost:3000";

const createShow = async (): Promise<string> => {
  const response = await fetch(`${BASE_URL}/shows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.ADMIN_TOKEN ?? "dev-admin-token"}`,
    },
    body: JSON.stringify({
      name: `10-Way Limit Test ${Date.now()}`,
      seats: Array.from({ length: 10 }, (_, i) => `C${i + 1}`),
      price_paise: 10000,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create show: ${response.status} ${await response.text()}`,
    );
  }

  const body = await response.json();
  return body.id;
};

const reserve = async (
  showId: string,
  idempotencyKey: string,
  seatNumber: string,
) => {
  const response = await fetch(
    `${BASE_URL}/shows/${showId}/reserve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer user-10-way-test",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        seatNumbers: [seatNumber],
      }),
    },
  );

  return {
    idempotencyKey,
    seatNumber,
    status: response.status,
    body: await response.json(),
  };
};

const main = async (): Promise<void> => {
  const showId = await createShow();

  console.log(`Show: ${showId}`);
  console.log("Starting 10 concurrent requests...\n");

  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      reserve(
        showId,
        `limit-10-way-${index + 1}`,
        `C${index + 1}`,
      ),
    ),
  );

  const confirmed = results.filter((r) => r.status === 201);

  const perUserLimit = results.filter(
    (r) =>
      r.status === 409 &&
      r.body?.error ===
        "User cannot reserve more than 4 seats for a show",
  );

  const other409 = results.filter(
    (r) =>
      r.status === 409 &&
      r.body?.error !==
        "User cannot reserve more than 4 seats for a show",
  );

  const errors5xx = results.filter((r) => r.status >= 500);

  console.log(JSON.stringify(results, null, 2));

  console.log("\n=== 10-WAY PER-USER TEST ===");
  console.log(`Total:              ${results.length}`);
  console.log(`Confirmed:          ${confirmed.length}`);
  console.log(`Per-user limit:     ${perUserLimit.length}`);
  console.log(`Other 409:          ${other409.length}`);
  console.log(`5xx:                ${errors5xx.length}`);

  if (
    confirmed.length === 4 &&
    perUserLimit.length === 6 &&
    other409.length === 0 &&
    errors5xx.length === 0
  ) {
    console.log("\n✅ 10-WAY PER-USER TEST PASSED");
  } else {
    console.error("\n❌ 10-WAY PER-USER TEST FAILED");
    process.exitCode = 1;
  }
};

main();