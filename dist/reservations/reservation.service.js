"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reserveSeats = exports.ReservationConflictError = void 0;
const node_crypto_1 = require("node:crypto");
const pool_js_1 = require("../db/pool.js");
class ReservationConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = "ReservationConflictError";
    }
}
exports.ReservationConflictError = ReservationConflictError;
const reserveSeats = async (showId, userId, request) => {
    const client = await pool_js_1.pool.connect();
    try {
        await client.query("BEGIN");
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
        amount_paise
      )
      VALUES ($1, $2, $3, 'confirmed', $4)
      `, [
            reservationId,
            showId,
            userId,
            amountPaise.toString(),
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
            id: reservationId,
            showId,
            userId,
            status: "confirmed",
            seatNumbers: seatsResult.rows.map((seat) => seat.seat_number),
            amountPaise: Number(amountPaise),
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
