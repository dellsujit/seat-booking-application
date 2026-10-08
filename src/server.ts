import "dotenv/config";
import Fastify from "fastify";
import { pool } from "./db/pool.js";
import { showRoutes } from "./modules/shows/show.routes.js";
import { reservationRoutes } from "./modules/reservations/reservation.routes.js";
import { metrics } from "./config/metrics.js";
import crypto from "node:crypto";

const app = Fastify({
  logger: true,
  genReqId: () => crypto.randomUUID(),
});

app.addHook("onRequest", async (request, reply) => {
  reply.header("X-Request-ID", request.id);
});

const PORT = Number(process.env.PORT) || 3000;

app.get("/health/live", async () => {
  return {
    status: "ok",
  };
});

app.get("/health/ready", async (request, reply) => {
  try {
    await pool.query("SELECT 1");

    return {
      status: "ready",
      database: "connected",
    };
  } catch (error) {
    request.log.error(error);

    return reply.status(503).send({
      status: "not_ready",
      database: "disconnected",
    });
  }
});


const startServer = async (): Promise<void> => {
  try {
    
    await app.register(showRoutes);
    await app.register(reservationRoutes);
    
    await app.listen({
      port: PORT,
      host: "0.0.0.0",
    });

    console.log(`Seat Booking API running on port ${PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};


app.get("/metrics", async (_request, reply) => {
  const availableSeatsResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM seats
     WHERE status = 'available'`,
  );

  const seatsAvailable = Number(availableSeatsResult.rows[0].count);

  const output = [
    "# HELP booking_requests_total Total number of booking requests",
    "# TYPE booking_requests_total counter",
    `booking_requests_total ${metrics.bookingRequests}`,

    "# HELP booking_success_total Total number of successful bookings",
    "# TYPE booking_success_total counter",
    `booking_success_total ${metrics.bookingSuccess}`,

    "# HELP booking_conflicts_total Total number of booking conflicts",
    "# TYPE booking_conflicts_total counter",
    `booking_conflicts_total ${metrics.bookingConflicts}`,

    "# HELP booking_declined_total Total number of declined bookings by reason",
    "# TYPE booking_declined_total counter",
    `booking_declined_total{reason="seat-taken"} ${metrics.bookingDeclinedSeatTaken}`,
    `booking_declined_total{reason="per-user-limit"} ${metrics.bookingDeclinedPerUserLimit}`,
    `booking_declined_total{reason="idempotent-replay"} ${metrics.bookingDeclinedIdempotentReplay}`,

    "# HELP booking_errors_total Total number of unexpected booking errors",
    "# TYPE booking_errors_total counter",
    `booking_errors_total ${metrics.bookingErrors}`,

    "# HELP cancellation_requests_total Total number of cancellation requests",
    "# TYPE cancellation_requests_total counter",
    `cancellation_requests_total ${metrics.cancellationRequests}`,

    "# HELP cancellation_success_total Total number of successful cancellations",
    "# TYPE cancellation_success_total counter",
    `cancellation_success_total ${metrics.cancellationSuccess}`,

    "# HELP cancellation_errors_total Total number of unexpected cancellation errors",
    "# TYPE cancellation_errors_total counter",
    `cancellation_errors_total ${metrics.cancellationErrors}`,

    "# HELP seats_available Number of currently available seats",
    "# TYPE seats_available gauge",
    `seats_available ${seatsAvailable}`,
  ].join("\n");

  return reply
    .type("text/plain; version=0.0.4")
    .send(`${output}\n`);
});


startServer();