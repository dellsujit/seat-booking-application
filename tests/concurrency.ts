const showId = "d51fb21c-ff64-4971-b89c-c9eab8c3c1ba";

const reserve = async (
  idempotencyKey: string,
  seatNumbers: string[],
) => {
  const response = await fetch(
    `http://localhost:3000/shows/${showId}/reserve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer user-123",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        seatNumbers,
      }),
    },
  );

  return {
    idempotencyKey,
    seatNumbers,
    status: response.status,
    body: await response.json(),
  };
};

const main = async (): Promise<void> => {
  const results = await Promise.all([
    reserve("limit-concurrent-a", ["B3", "B4"]),
    reserve("limit-concurrent-b", ["B5"]),
  ]);

  console.log(JSON.stringify(results, null, 2));
};

main();