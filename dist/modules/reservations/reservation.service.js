"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelReservation = exports.ReservationForbiddenError = exports.ReservationNotFoundError = exports.reserveSeats = exports.ReservationConflictError = void 0;
const node_crypto_1 = require("node:crypto");
const pool_js_1 = require("../../db/pool.js");
class ReservationConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = "ReservationConflictError";
    }
}
exports.ReservationConflictError = ReservationConflictError;
const reserveSeats = async (showId, userId, request, idempotencyKey) => {
    const client = await pool_js_1.pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(`
  SELECT pg_advisory_xact_lock(
    hashtextextended($1, 0)
  )
  `, [`${showId}:${userId}`]);
        const normalizedRequest = JSON.stringify({
            showId,
            seatNumbers: [...request.seatNumbers].sort(),
        });
        const requestFingerprint = (0, node_crypto_1.createHash)("sha256")
            .update(normalizedRequest)
            .digest("hex");
        const existingReservationResult = await client.query(`
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
  `, [userId, showId, idempotencyKey]);
        if (existingReservationResult.rows.length > 0) {
            const existingReservation = existingReservationResult.rows[0];
            if (existingReservation.request_fingerprint !==
                requestFingerprint) {
                throw new ReservationConflictError("Idempotency key was already used with a different request");
            }
            const existingSeatsResult = await client.query(`
    SELECT s.seat_number
    FROM reservation_seats rs
    INNER JOIN seats s
      ON s.id = rs.seat_id
    WHERE rs.reservation_id = $1
    ORDER BY s.seat_number
    `, [existingReservation.id]);
            await client.query("COMMIT");
            return {
                reservation_id: existingReservation.id,
                show_id: existingReservation.show_id,
                user_id: existingReservation.user_id,
                seats: existingSeatsResult.rows.map((seat) => seat.seat_number),
                amount_paise: Number(existingReservation.amount_paise),
                status: existingReservation.status,
            };
        }
        /*
         * 1. Lock the requested seats.
         *
         * FOR UPDATE means another transaction trying to
         * modify these same rows must wait for this transaction.
         */
        const seatsResult = await client.query(`
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
      `, [showId, request.seatNumbers]);
        /*
         * 2. Every requested seat must exist.
         */
        if (seatsResult.rows.length !== request.seatNumbers.length) {
            throw new ReservationConflictError("One or more requested seats do not exist");
        }
        /*
         * 3. Every requested seat must currently be available.
         */
        const unavailableSeat = seatsResult.rows.find((seat) => seat.status !== "available");
        if (unavailableSeat) {
            throw new ReservationConflictError(`Seat ${unavailableSeat.seat_number} is not available`);
        }
        /*
         * 4. Check the user's confirmed-seat limit.
         */
        const userSeatsResult = await client.query(`
      SELECT COUNT(*)::text AS count
      FROM reservation_seats rs
      INNER JOIN reservations r
        ON r.id = rs.reservation_id
      WHERE r.show_id = $1
        AND r.user_id = $2
        AND r.status = 'confirmed'
      `, [showId, userId]);
        const existingSeatCount = Number(userSeatsResult.rows[0].count);
        const requestedSeatCount = request.seatNumbers.length;
        if (existingSeatCount + requestedSeatCount > 4) {
            throw new ReservationConflictError("User cannot reserve more than 4 seats for a show");
        }
        /*
         * 5. Calculate total amount in paise.
         *
         * PostgreSQL BIGINT is returned by node-postgres as a string.
         * BigInt keeps the calculation exact.
         */
        const amountPaise = seatsResult.rows.reduce((total, seat) => total + BigInt(seat.price_paise), 0n);
        /*
         * 6. Create reservation.
         */
        const reservationId = (0, node_crypto_1.randomUUID)();
        await client.query(`
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
            `, [
            reservationId,
            showId,
            userId,
            amountPaise.toString(),
            idempotencyKey,
            requestFingerprint
        ]);
        /*
         * 7. Associate seats with reservation.
         */
        for (const seat of seatsResult.rows) {
            await client.query(`
        INSERT INTO reservation_seats (
          reservation_id,
          seat_id
        )
        VALUES ($1, $2)
        `, [
                reservationId,
                seat.id,
            ]);
        }
        /*
         * 8. Mark seats as confirmed.
         */
        await client.query(`
      UPDATE seats
      SET status = 'confirmed'
      WHERE show_id = $1
        AND seat_number = ANY($2::varchar[])
      `, [showId, request.seatNumbers]);
        /*
         * 9. Commit EVERYTHING together.
         */
        await client.query("COMMIT");
        return {
            reservation_id: reservationId,
            show_id: showId,
            user_id: userId,
            seats: seatsResult.rows.map((seat) => seat.seat_number),
            amount_paise: Number(amountPaise),
            status: "confirmed",
        };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.reserveSeats = reserveSeats;
class ReservationNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "ReservationNotFoundError";
    }
}
exports.ReservationNotFoundError = ReservationNotFoundError;
class ReservationForbiddenError extends Error {
    constructor(message) {
        super(message);
        this.name = "ReservationForbiddenError";
    }
}
exports.ReservationForbiddenError = ReservationForbiddenError;
const cancelReservation = async (reservationId, userId) => {
    const client = await pool_js_1.pool.connect();
    try {
        await client.query("BEGIN");
        const reservationResult = await client.query(`
      SELECT
        id,
        user_id,
        status,
        amount_paise
      FROM reservations
      WHERE id = $1
      FOR UPDATE
      `, [reservationId]);
        if (reservationResult.rows.length === 0) {
            throw new ReservationNotFoundError("Reservation not found");
        }
        const reservation = reservationResult.rows[0];
        if (reservation.user_id !== userId) {
            throw new ReservationForbiddenError("You are not allowed to cancel this reservation");
        }
        if (reservation.status === "cancelled") {
            await client.query("COMMIT");
            return {
                id: reservation.id,
                status: "cancelled",
                amountPaise: Number(reservation.amount_paise),
            };
        }
        const seatsResult = await client.query(`
      SELECT
        s.id,
        s.seat_number
      FROM reservation_seats rs
      INNER JOIN seats s
        ON s.id = rs.seat_id
      WHERE rs.reservation_id = $1
      ORDER BY s.id
      FOR UPDATE
      `, [reservationId]);
        const seatIds = seatsResult.rows.map((seat) => seat.id);
        await client.query(`
      UPDATE seats
      SET status = 'available'
      WHERE id = ANY($1::uuid[])
      `, [seatIds]);
        await client.query(`
      UPDATE reservations
      SET
        status = 'cancelled',
        cancelled_at = NOW()
      WHERE id = $1
      `, [reservationId]);
        await client.query("COMMIT");
        return {
            id: reservation.id,
            status: "cancelled",
            amountPaise: Number(reservation.amount_paise),
            seatNumbers: seatsResult.rows.map((seat) => seat.seat_number),
        };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.cancelReservation = cancelReservation;
