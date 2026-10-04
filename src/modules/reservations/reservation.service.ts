import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../db/pool.js";
import type { ReserveSeatsRequest } from "../shows/show.types.js";

export class ReservationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationConflictError";
  }
}

export const reserveSeats = async (
  showId: string,
  userId: string,
  request: ReserveSeatsRequest,
  idempotencyKey: string,
) => {

  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
  `
  SELECT pg_advisory_xact_lock(
    hashtextextended($1, 0)
  )
  `,
  [`${showId}:${userId}`],
);

    const normalizedRequest = JSON.stringify({
    showId,
    seatNumbers: [...request.seatNumbers].sort(),
  });

  const requestFingerprint = createHash("sha256")
  .update(normalizedRequest)
  .digest("hex");


  const existingReservationResult = await client.query<{
  id: string;
  show_id: string;
  user_id: string;
  status: "confirmed" | "cancelled";
  amount_paise: string;
  request_fingerprint: string;
}>(
  `
  SELECT
    id,
    show_id,
    user_id,
    status,
    amount_paise,
    request_fingerprint
  FROM reservations
  WHERE user_id = $1
  AND show_id = $2
    AND idempotency_key = $3
  `,
  [userId, showId, idempotencyKey],
);

if (existingReservationResult.rows.length > 0) {
  const existingReservation = existingReservationResult.rows[0];

  if (
    existingReservation.request_fingerprint !==
    requestFingerprint
  ) {
    throw new ReservationConflictError(
      "Idempotency key was already used with a different request",
    );
  }

  const existingSeatsResult = await client.query<{
    seat_number: string;
  }>(
    `
    SELECT s.seat_number
    FROM reservation_seats rs
    INNER JOIN seats s
      ON s.id = rs.seat_id
    WHERE rs.reservation_id = $1
    ORDER BY s.seat_number
    `,
    [existingReservation.id],
  );

  await client.query("COMMIT");

  return {
    id: existingReservation.id,
    showId: existingReservation.show_id,
    userId: existingReservation.user_id,
    status: existingReservation.status,
    seatNumbers: existingSeatsResult.rows.map(
      (seat) => seat.seat_number,
    ),
    amountPaise: Number(existingReservation.amount_paise),
  };
}

    /*
     * 1. Lock the requested seats.
     *
     * FOR UPDATE means another transaction trying to
     * modify these same rows must wait for this transaction.
     */
    const seatsResult = await client.query<{
      id: string;
      seat_number: string;
      price_paise: string;
      status: "available" | "held" | "confirmed";
    }>(
      `
      SELECT
        id,
        seat_number,
        price_paise,
        status
      FROM seats
      WHERE show_id = $1
        AND seat_number = ANY($2::varchar[])
      ORDER BY seat_number
      FOR UPDATE
      `,
      [showId, request.seatNumbers],
    );

    /*
     * 2. Every requested seat must exist.
     */
    if (seatsResult.rows.length !== request.seatNumbers.length) {
      throw new ReservationConflictError(
        "One or more requested seats do not exist",
      );
    }

    /*
     * 3. Every requested seat must currently be available.
     */
    const unavailableSeat = seatsResult.rows.find(
      (seat) => seat.status !== "available",
    );

    if (unavailableSeat) {
      throw new ReservationConflictError(
        `Seat ${unavailableSeat.seat_number} is not available`,
      );
    }

    /*
     * 4. Check the user's confirmed-seat limit.
     */
    const userSeatsResult = await client.query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM reservation_seats rs
      INNER JOIN reservations r
        ON r.id = rs.reservation_id
      WHERE r.show_id = $1
        AND r.user_id = $2
        AND r.status = 'confirmed'
      `,
      [showId, userId],
    );

    const existingSeatCount = Number(userSeatsResult.rows[0].count);
    const requestedSeatCount = request.seatNumbers.length;

    if (existingSeatCount + requestedSeatCount > 4) {
      throw new ReservationConflictError(
        "User cannot reserve more than 4 seats for a show",
      );
    }

    /*
     * 5. Calculate total amount in paise.
     *
     * PostgreSQL BIGINT is returned by node-postgres as a string.
     * BigInt keeps the calculation exact.
     */
    const amountPaise = seatsResult.rows.reduce(
      (total, seat) => total + BigInt(seat.price_paise),
      0n,
    );

    /*
     * 6. Create reservation.
     */
    const reservationId = randomUUID();

    await client.query(
      `
            INSERT INTO reservations (
        id,
        show_id,
        user_id,
        status,
        amount_paise,
        idempotency_key,
        request_fingerprint
      )
      VALUES ($1, $2, $3, 'confirmed', $4, $5, $6)
            `,
          [
            reservationId,
            showId,
            userId,
            amountPaise.toString(),
            idempotencyKey,
            requestFingerprint
          ],
        );

    /*
     * 7. Associate seats with reservation.
     */
    for (const seat of seatsResult.rows) {
      await client.query(
        `
        INSERT INTO reservation_seats (
          reservation_id,
          seat_id
        )
        VALUES ($1, $2)
        `,
        [
          reservationId,
          seat.id,
        ],
      );
    }

    /*
     * 8. Mark seats as confirmed.
     */
    await client.query(
      `
      UPDATE seats
      SET status = 'confirmed'
      WHERE show_id = $1
        AND seat_number = ANY($2::varchar[])
      `,
      [showId, request.seatNumbers],
    );

    /*
     * 9. Commit EVERYTHING together.
     */
    await client.query("COMMIT");

    return {
      id: reservationId,
      showId,
      userId,
      status: "confirmed",
      seatNumbers: seatsResult.rows.map(
        (seat) => seat.seat_number,
      ),
      amountPaise: Number(amountPaise),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

};

export class ReservationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationNotFoundError";
  }
}

export class ReservationForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservationForbiddenError";
  }
}

export const cancelReservation = async (
  reservationId: string,
  userId: string,
) => {
  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");

    const reservationResult = await client.query<{
      id: string;
      user_id: string;
      status: "confirmed" | "cancelled";
      amount_paise: string;
    }>(
      `
      SELECT
        id,
        user_id,
        status,
        amount_paise
      FROM reservations
      WHERE id = $1
      FOR UPDATE
      `,
      [reservationId],
    );

    if (reservationResult.rows.length === 0) {
      throw new ReservationNotFoundError(
        "Reservation not found",
      );
    }

    const reservation = reservationResult.rows[0];

    if (reservation.user_id !== userId) {
      throw new ReservationForbiddenError(
        "You are not allowed to cancel this reservation",
      );
    }

    if (reservation.status === "cancelled") {
      await client.query("COMMIT");

      return {
        id: reservation.id,
        status: "cancelled",
        amountPaise: Number(reservation.amount_paise),
      };
    }

    const seatsResult = await client.query<{
      id: string;
      seat_number: string;
    }>(
      `
      SELECT
        s.id,
        s.seat_number
      FROM reservation_seats rs
      INNER JOIN seats s
        ON s.id = rs.seat_id
      WHERE rs.reservation_id = $1
      ORDER BY s.id
      FOR UPDATE
      `,
      [reservationId],
    );

    const seatIds = seatsResult.rows.map((seat) => seat.id);

    await client.query(
      `
      UPDATE seats
      SET status = 'available'
      WHERE id = ANY($1::uuid[])
      `,
      [seatIds],
    );

    await client.query(
      `
      UPDATE reservations
      SET
        status = 'cancelled',
        cancelled_at = NOW()
      WHERE id = $1
      `,
      [reservationId],
    );

    await client.query("COMMIT");

    return {
      id: reservation.id,
      status: "cancelled",
      amountPaise: Number(reservation.amount_paise),
      seatNumbers: seatsResult.rows.map(
        (seat) => seat.seat_number,
      ),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};