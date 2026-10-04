import { test } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = "http://localhost:3000";

const createShow = async () => {
  const response = await fetch(`${BASE_URL}/shows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `Automated Test Show ${Date.now()}`,
      startsAt: "2026-12-01T18:00:00Z",
      seats: [
        {
          seatNumber: "T1",
          pricePaise: 10000,
        },
        {
          seatNumber: "T2",
          pricePaise: 12000,
        },
        {
          seatNumber: "T3",
          pricePaise: 15000,
        },
        {
          seatNumber: "T4",
          pricePaise: 18000,
        },
        {
          seatNumber: "T5",
          pricePaise: 20000,
        },
      ],
    }),
  });

  assert.equal(response.status, 201);

  return response.json() as Promise<{
    id: string;
  }>;
};

const reserve = async (
  showId: string,
  userId: string,
  idempotencyKey: string,
  seatNumbers: string[],
) => {
  const response = await fetch(
    `${BASE_URL}/shows/${showId}/reserve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userId}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        seatNumbers,
      }),
    },
  );

  return {
    status: response.status,
    body: await response.json(),
  };
};

const cancel = async (
  reservationId: string,
  userId: string,
) => {
  const response = await fetch(
    `${BASE_URL}/reservations/${reservationId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userId}`,
      },
    },
  );

  return {
    status: response.status,
    body: await response.json(),
  };
};



test("create show", async () => {
  const show = await createShow();

  assert.ok(show.id);
});

test("reserve available seat", async () => {
  const show = await createShow();

  const result = await reserve(
    show.id,
    "test-user-1",
    `reserve-${Date.now()}`,
    ["T1"],
  );

  assert.equal(result.status, 201);
  assert.equal(result.body.status, "confirmed");
  assert.deepEqual(result.body.seatNumbers, ["T1"]);
});

test("cannot reserve already confirmed seat", async () => {
  const show = await createShow();

  const first = await reserve(
    show.id,
    "test-user-1",
    `first-${Date.now()}`,
    ["T1"],
  );

  assert.equal(first.status, 201);

  const second = await reserve(
    show.id,
    "test-user-2",
    `second-${Date.now()}`,
    ["T1"],
  );

  assert.equal(second.status, 409);
});

test("idempotent retry returns original reservation", async () => {
  const show = await createShow();

  const key = `idem-${Date.now()}`;

  const first = await reserve(
    show.id,
    "test-user-1",
    key,
    ["T1"],
  );

  const second = await reserve(
    show.id,
    "test-user-1",
    key,
    ["T1"],
  );

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  assert.equal(
    second.body.id,
    first.body.id,
  );
});

test("idempotency key cannot be reused with different request", async () => {
  const show = await createShow();

  const key = `idem-mismatch-${Date.now()}`;

  const first = await reserve(
    show.id,
    "test-user-1",
    key,
    ["T1"],
  );

  assert.equal(first.status, 201);

  const second = await reserve(
    show.id,
    "test-user-1",
    key,
    ["T2"],
  );

  assert.equal(second.status, 409);
});

test("multi-seat reservation is all-or-nothing", async () => {
  const show = await createShow();

  const first = await reserve(
    show.id,
    "test-user-1",
    `atomic-first-${Date.now()}`,
    ["T1"],
  );

  assert.equal(first.status, 201);

  const second = await reserve(
    show.id,
    "test-user-2",
    `atomic-second-${Date.now()}`,
    ["T1", "T2"],
  );

  assert.equal(second.status, 409);

  const showResponse = await fetch(
    `${BASE_URL}/shows/${show.id}`,
  );

  assert.equal(showResponse.status, 200);

  const state = await showResponse.json();

  const t2 = state.seats.find(
    (seat: { seatNumber: string }) =>
      seat.seatNumber === "T2",
  );

  assert.equal(t2.status, "available");
});

test("owner can cancel reservation", async () => {
  const show = await createShow();

  const reservation = await reserve(
    show.id,
    "test-user-1",
    `cancel-${Date.now()}`,
    ["T1"],
  );

  assert.equal(reservation.status, 201);

  const response = await fetch(
    `${BASE_URL}/reservations/${reservation.body.id}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer test-user-1",
      },
    },
  );

  assert.equal(response.status, 200);

  const body = await response.json();

  assert.equal(body.status, "cancelled");

  const showResponse = await fetch(
    `${BASE_URL}/shows/${show.id}`,
  );

  const state = await showResponse.json();

  const t1 = state.seats.find(
    (seat: { seatNumber: string }) =>
      seat.seatNumber === "T1",
  );

  assert.equal(t1.status, "available");
});

test("different user cannot cancel reservation", async () => {
  const show = await createShow();

  const reservation = await reserve(
    show.id,
    "test-user-1",
    `forbidden-${Date.now()}`,
    ["T1"],
  );

  assert.equal(reservation.status, 201);

  const response = await fetch(
    `${BASE_URL}/reservations/${reservation.body.id}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer test-user-2",
      },
    },
  );

  assert.equal(response.status, 403);
});

test("show counts reconcile", async () => {
  const show = await createShow();

  await reserve(
    show.id,
    "test-user-1",
    `count-${Date.now()}`,
    ["T1"],
  );

  const response = await fetch(
    `${BASE_URL}/shows/${show.id}`,
  );

  assert.equal(response.status, 200);

  const state = await response.json();

  const total =
    state.counts.available +
    state.counts.held +
    state.counts.confirmed;

  assert.equal(total, state.seatCount);
});

test("idempotency key is scoped to show", async () => {
  const showA = await createShow();
  const showB = await createShow();

  const key = `cross-show-${Date.now()}`;

  const first = await reserve(
    showA.id,
    "test-user-cross-show",
    key,
    ["T1"],
  );

  const second = await reserve(
    showB.id,
    "test-user-cross-show",
    key,
    ["T1"],
  );

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  assert.notEqual(
    first.body.id,
    second.body.id,
  );

  const sameShowDifferentRequest = await reserve(
    showA.id,
    "test-user-cross-show",
    key,
    ["T2"],
  );

  assert.equal(
    sameShowDifferentRequest.status,
    409,
  );
});



test("old cancellation cannot overwrite a newer confirmed reservation", async () => {
  const show = await createShow();

  // User A reserves T1
  const firstReservation = await reserve(
    show.id,
    "user-A",
    "cancel-race-1",
    ["T1"],
  );

  assert.equal(firstReservation.status, 201);

  const firstBody = firstReservation.body;

  // User A cancels T1
  const cancelResponse = await cancel(
    firstBody.id,
    "user-A",
  );

  assert.equal(cancelResponse.status, 200);

  // User B reserves the same seat
  const secondReservation = await reserve(
    show.id,
    "user-B",
    "cancel-race-2",
    ["T1"],
  );

  assert.equal(secondReservation.status, 201);

  // User A repeats the old cancellation.
  // This must NOT release T1 again.
  const repeatedCancel = await cancel(
    firstBody.id,
    "user-A",
  );

  assert.equal(repeatedCancel.status, 200);

  // Check current show state.
  const showResponse = await fetch(
    `${BASE_URL}/shows/${show.id}`,
  );

  assert.equal(showResponse.status, 200);

  const showBody = await showResponse.json();

  const t1 = showBody.seats.find(
    (seat: { seatNumber: string }) =>
      seat.seatNumber === "T1",
  );

  assert.equal(t1.seatNumber, "T1");
  assert.equal(t1.status, "confirmed");

  // T1 confirmed, remaining four seats available.
  assert.equal(showBody.counts.confirmed, 1);
  assert.equal(showBody.counts.available, 4);
});


test("reservation amount is calculated in integer paise", async () => {
  const show = await createShow();

  const reservation = await reserve(
    show.id,
    "money-user",
    "money-test-1",
    ["T1", "T2"],
  );

  assert.equal(reservation.status, 201);
  assert.equal(reservation.body.amountPaise, 22000);
});

test("reservation requires authentication", async () => {
  const show = await createShow();

  const response = await fetch(
    `${BASE_URL}/shows/${show.id}/reserve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `auth-test-${Date.now()}`,
      },
      body: JSON.stringify({
        seatNumbers: ["T1"],
      }),
    },
  );

  assert.equal(response.status, 401);
});

test("request cannot override authenticated user identity", async () => {
  const show = await createShow();

  const response = await fetch(
    `${BASE_URL}/shows/${show.id}/reserve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer real-user",
        "Idempotency-Key": `identity-test-${Date.now()}`,
      },
      body: JSON.stringify({
        userId: "attacker-user",
        seatNumbers: ["T1"],
      }),
    },
  );

  assert.equal(response.status, 201);

  const reservation = await response.json();

  const attackerCancel = await cancel(
    reservation.id,
    "attacker-user",
  );

  assert.equal(attackerCancel.status, 403);

  const ownerCancel = await cancel(
    reservation.id,
    "real-user",
  );

  assert.equal(ownerCancel.status, 200);
});

test("reservation requires authentication", async () => {
  const show = await createShow();

  const response = await fetch(
    `${BASE_URL}/shows/${show.id}/reserve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `auth-test-${Date.now()}`,
      },
      body: JSON.stringify({
        seatNumbers: ["T1"],
      }),
    },
  );

  assert.equal(response.status, 401);
});

test("invalid authentication is rejected", async () => {
  const show = await createShow();

  const response = await fetch(
    `${BASE_URL}/shows/${show.id}/reserve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic fake-token",
        "Idempotency-Key": `invalid-auth-${Date.now()}`,
      },
      body: JSON.stringify({
        seatNumbers: ["T1"],
      }),
    },
  );

  assert.equal(response.status, 401);
});



test("user cannot reserve more than 4 seats", async () => {
  const show = await createShow();

  const reservation = await reserve(
    show.id,
    "limit-user",
    `limit-${Date.now()}`,
    ["T1", "T2", "T3", "T4", "T5"],
  );

  assert.equal(reservation.status, 409);
});