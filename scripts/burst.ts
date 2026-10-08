import "dotenv/config";

import crypto from "node:crypto";
import process from "node:process";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "dev-admin-token";
const TOTAL_REQUESTS = Number(process.env.TOTAL_REQUESTS ?? 1000);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 100);

type Result = {
  status: number;
  reason?: string;
};

const uniqueShowName = `Burst Test ${Date.now()}`;

async function createShow(): Promise<string> {
  const response = await fetch(`${BASE_URL}/shows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    body: JSON.stringify({
    name: uniqueShowName,
    startsAt: new Date().toISOString(),
    seats: ["A1"],
    price_paise: 25000,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create show: ${response.status} ${await response.text()}`,
    );
  }

  const body = await response.json() as { id: string };

  return body.id;
}

async function reserve(
  showId: string,
  index: number,
): Promise<Result> {
  const userId = `burst-user-${index}`;

  const response = await fetch(
    `${BASE_URL}/shows/${showId}/reserve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userId}`,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        seats: ["A1"],
      }),
    },
  );

  if (response.status === 201) {
    return { status: 201 };
  }

  let reason = "unknown";

  try {
    const body = await response.json() as {
      error?: string;
      reason?: string;
    };

    reason = body.reason ?? body.error ?? "unknown";
  } catch {
    // Ignore non-JSON error responses.
  }

  return {
    status: response.status,
    reason,
  };
}

async function main(): Promise<void> {
  console.log("=== SEAT RESERVATION BURST TEST ===");
  console.log(`BASE_URL:       ${BASE_URL}`);
  console.log(`Total requests: ${TOTAL_REQUESTS}`);
  console.log(`Concurrency:    ${CONCURRENCY}`);
  console.log("");

  const showId = await createShow();

  console.log(`Show: ${showId}`);
  console.log("Starting burst...\n");

  const results: Result[] = [];

  for (
    let start = 0;
    start < TOTAL_REQUESTS;
    start += CONCURRENCY
  ) {
    const end = Math.min(start + CONCURRENCY, TOTAL_REQUESTS);

    const batch = Array.from(
      { length: end - start },
      (_, offset) => reserve(showId, start + offset),
    );

    results.push(...await Promise.all(batch));

    if (end % 500 === 0 || end === TOTAL_REQUESTS) {
      console.log(`Progress: ${end}/${TOTAL_REQUESTS}`);
    }
  }

  const confirmed = results.filter(
    (result) => result.status === 201,
  ).length;

  const fiveHundreds = results.filter(
    (result) => result.status >= 500,
  ).length;

  const conflicts = results.filter(
    (result) => result.status === 409,
  );

  const seatTaken = conflicts.filter(
    (result) =>
      result.reason?.toLowerCase().includes("seat"),
  ).length;

  const perUserLimit = conflicts.filter(
    (result) =>
      result.reason?.toLowerCase().includes("limit"),
  ).length;

  const idempotentReplay = conflicts.filter(
    (result) =>
      result.reason?.toLowerCase().includes("idempot"),
  ).length;

  const otherConflicts =
    conflicts.length -
    seatTaken -
    perUserLimit -
    idempotentReplay;

  const otherStatuses = results.filter(
    (result) =>
      result.status !== 201 &&
      result.status !== 409 &&
      result.status < 500,
  ).length;

  console.log("\n=== BURST TEST RESULTS ===");
  console.log(`Total:           ${results.length}`);
  console.log(`Confirmed:       ${confirmed}`);
  console.log(`Seat taken:      ${seatTaken}`);
  console.log(`Per-user limit:  ${perUserLimit}`);
  console.log(`Idempotent:      ${idempotentReplay}`);
  console.log(`Other 409:       ${otherConflicts}`);
  console.log(`5xx:             ${fiveHundreds}`);
  console.log(`Other statuses:  ${otherStatuses}`);

  const stateResponse = await fetch(
    `${BASE_URL}/shows/${showId}`,
  );

  const state = await stateResponse.json() as {
    counts?: {
      available?: number;
      held?: number;
      confirmed?: number;
    };
    seatCount?: number;
  };

  console.log("\nFinal reconciliation:");
  console.log(JSON.stringify(state, null, 2));

  const passed =
    confirmed === 1 &&
    seatTaken === TOTAL_REQUESTS - 1 &&
    fiveHundreds === 0 &&
    otherConflicts === 0 &&
    otherStatuses === 0 &&
    state.counts?.confirmed === 1 &&
    state.counts?.available === 0 &&
    state.counts?.held === 0;

  if (passed) {
    console.log("\n✅ BURST TEST PASSED");
    return;
  }

  console.error("\n❌ BURST TEST FAILED");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("\n❌ BURST TEST ERROR");
  console.error(error);
  process.exitCode = 1;
});