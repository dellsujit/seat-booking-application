import { test } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = "http://localhost:3000";

test("50 concurrent requests for the same seat produce exactly one winner", async () => {
  const createResponse = await fetch(`${BASE_URL}/shows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    "Authorization": "Bearer dev-admin-token",
    },
    body: JSON.stringify({
      name: `Burst Test ${Date.now()}`,
      startsAt: "2026-12-01T20:00:00Z",
      seats: [
        {
          seatNumber: "B1",
          pricePaise: 10000,
        },
      ],
    }),
  });

  assert.equal(createResponse.status, 201);

  const show = await createResponse.json();

  const requests = Array.from({ length: 50 }, (_, index) =>
    fetch(`${BASE_URL}/shows/${show.id}/reserve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer burst-user-${index}`,
        "Idempotency-Key": `burst-${index}`,
      },
      body: JSON.stringify({
        seatNumbers: ["B1"],
      }),
    }),
  );

  const responses = await Promise.all(requests);

  const results = await Promise.all(
    responses.map(async (response) => ({
      status: response.status,
      body: await response.json(),
    })),
  );

  const successful = results.filter(
    (result) => result.status === 201,
  );

  const conflicts = results.filter(
    (result) => result.status === 409,
  );

  const unexpected = results.filter(
    (result) =>
      result.status !== 201 &&
      result.status !== 409,
  );

  assert.equal(successful.length, 1);

  assert.equal(conflicts.length, 49);

  assert.equal(unexpected.length, 0);

  const showResponse = await fetch(
    `${BASE_URL}/shows/${show.id}`,
  );

  assert.equal(showResponse.status, 200);

  const state = await showResponse.json();

  assert.equal(state.counts.confirmed, 1);

  assert.equal(state.counts.available, 0);

  assert.equal(state.counts.held, 0);

  assert.equal(state.seatCount, 1);
});

test("concurrent requests cannot bypass the 4-seat user limit", async () => {
  const createResponse = await fetch(`${BASE_URL}/shows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
       "Authorization": "Bearer dev-admin-token",
    },
    body: JSON.stringify({
      name: `User Limit Burst ${Date.now()}`,
      startsAt: "2026-12-01T21:00:00Z",
      seats: [
        { seatNumber: "L1", pricePaise: 10000 },
        { seatNumber: "L2", pricePaise: 10000 },
        { seatNumber: "L3", pricePaise: 10000 },
        { seatNumber: "L4", pricePaise: 10000 },
        { seatNumber: "L5", pricePaise: 10000 },
        { seatNumber: "L6", pricePaise: 10000 },
      ],
    }),
  });

  assert.equal(createResponse.status, 201);

  const show = await createResponse.json();

  // User already owns 2 seats.
  const initial = await fetch(
    `${BASE_URL}/shows/${show.id}/reserve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer limit-user",
        "Idempotency-Key": `limit-initial-${Date.now()}`,
      },
      body: JSON.stringify({
        seatNumbers: ["L1", "L2"],
      }),
    },
  );

  assert.equal(initial.status, 201);

  const timestamp = Date.now();

  // Both requests independently try to add 2 seats.
  // Only one may succeed because the user limit is 4.
  const requests = await Promise.all([
    fetch(`${BASE_URL}/shows/${show.id}/reserve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer limit-user",
        "Idempotency-Key": `limit-a-${timestamp}`,
      },
      body: JSON.stringify({
        seatNumbers: ["L3", "L4"],
      }),
    }),

    fetch(`${BASE_URL}/shows/${show.id}/reserve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer limit-user",
        "Idempotency-Key": `limit-b-${timestamp}`,
      },
      body: JSON.stringify({
        seatNumbers: ["L5", "L6"],
      }),
    }),
  ]);

  const results = await Promise.all(
    requests.map(async (response) => ({
      status: response.status,
      body: await response.json(),
    })),
  );

  const successful = results.filter(
    (result) => result.status === 201,
  );

  const conflicts = results.filter(
    (result) => result.status === 409,
  );

  const unexpected = results.filter(
    (result) =>
      result.status !== 201 &&
      result.status !== 409,
  );

  assert.equal(successful.length, 1);
  assert.equal(conflicts.length, 1);
  assert.equal(unexpected.length, 0);

  const showResponse = await fetch(
    `${BASE_URL}/shows/${show.id}`,
  );

  assert.equal(showResponse.status, 200);

  const state = await showResponse.json();

  assert.equal(state.counts.confirmed, 4);
  assert.equal(state.seatCount, 6);
});


