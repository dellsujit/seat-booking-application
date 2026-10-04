"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShow = exports.createShow = void 0;
const node_crypto_1 = require("node:crypto");
const pool_js_1 = require("../../db/pool.js");
const createShow = async (request) => {
    const client = await pool_js_1.pool.connect();
    try {
        await client.query("BEGIN");
        const showId = (0, node_crypto_1.randomUUID)();
        await client.query(`
      INSERT INTO shows (
        id,
        name,
        starts_at
      )
      VALUES ($1, $2, $3)
      `, [
            showId,
            request.name,
            request.startsAt,
        ]);
        for (const seat of request.seats) {
            await client.query(`
        INSERT INTO seats (
          id,
          show_id,
          seat_number,
          price_paise
        )
        VALUES ($1, $2, $3, $4)
        `, [
                (0, node_crypto_1.randomUUID)(),
                showId,
                seat.seatNumber,
                seat.pricePaise,
            ]);
        }
        await client.query("COMMIT");
        return {
            id: showId,
            name: request.name,
            startsAt: request.startsAt,
            seatCount: request.seats.length,
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
exports.createShow = createShow;
const getShow = async (showId) => {
    const result = await pool_js_1.pool.query(`
    SELECT
      sh.id,
      sh.name,
      sh.starts_at,
      s.seat_number,
      s.price_paise,
      s.status
    FROM shows sh
    INNER JOIN seats s
      ON s.show_id = sh.id
    WHERE sh.id = $1
    ORDER BY s.seat_number
    `, [showId]);
    if (result.rows.length === 0) {
        const showResult = await pool_js_1.pool.query(`
      SELECT id
      FROM shows
      WHERE id = $1
      `, [showId]);
        if (showResult.rows.length === 0) {
            return null;
        }
    }
    const rows = result.rows;
    const counts = {
        available: 0,
        held: 0,
        confirmed: 0,
    };
    for (const seat of rows) {
        counts[seat.status]++;
    }
    return {
        id: rows[0]?.id ?? showId,
        name: rows[0]?.name ?? "",
        startsAt: rows[0]?.starts_at ?? "",
        seatCount: rows.length,
        counts,
        seats: rows.map((seat) => ({
            seatNumber: seat.seat_number,
            pricePaise: Number(seat.price_paise),
            status: seat.status,
        })),
    };
};
exports.getShow = getShow;
