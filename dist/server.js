"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fastify_1 = __importDefault(require("fastify"));
const pool_js_1 = require("./db/pool.js");
const show_routes_js_1 = require("./modules/shows/show.routes.js");
const reservation_routes_js_1 = require("./modules/reservations/reservation.routes.js");
const metrics_js_1 = require("./config/metrics.js");
const app = (0, fastify_1.default)({
    logger: true,
});
const PORT = Number(process.env.PORT) || 3000;
app.get("/health/live", async () => {
    return {
        status: "ok",
    };
});
app.get("/health/ready", async (request, reply) => {
    try {
        await pool_js_1.pool.query("SELECT 1");
        return {
            status: "ready",
            database: "connected",
        };
    }
    catch (error) {
        request.log.error(error);
        return reply.status(503).send({
            status: "not_ready",
            database: "disconnected",
        });
    }
});
const startServer = async () => {
    try {
        await app.register(show_routes_js_1.showRoutes);
        await app.register(reservation_routes_js_1.reservationRoutes);
        await app.listen({
            port: PORT,
            host: "0.0.0.0",
        });
        console.log(`Seat Booking API running on port ${PORT}`);
    }
    catch (error) {
        app.log.error(error);
        process.exit(1);
    }
};
app.get("/metrics", async (_request, reply) => {
    const output = [
        "# HELP booking_requests_total Total number of booking requests",
        "# TYPE booking_requests_total counter",
        `booking_requests_total ${metrics_js_1.metrics.bookingRequests}`,
        "# HELP booking_success_total Total number of successful bookings",
        "# TYPE booking_success_total counter",
        `booking_success_total ${metrics_js_1.metrics.bookingSuccess}`,
        "# HELP booking_conflicts_total Total number of booking conflicts",
        "# TYPE booking_conflicts_total counter",
        `booking_conflicts_total ${metrics_js_1.metrics.bookingConflicts}`,
        "# HELP booking_errors_total Total number of unexpected booking errors",
        "# TYPE booking_errors_total counter",
        `booking_errors_total ${metrics_js_1.metrics.bookingErrors}`,
        "# HELP cancellation_requests_total Total number of cancellation requests",
        "# TYPE cancellation_requests_total counter",
        `cancellation_requests_total ${metrics_js_1.metrics.cancellationRequests}`,
        "# HELP cancellation_success_total Total number of successful cancellations",
        "# TYPE cancellation_success_total counter",
        `cancellation_success_total ${metrics_js_1.metrics.cancellationSuccess}`,
        "# HELP cancellation_errors_total Total number of unexpected cancellation errors",
        "# TYPE cancellation_errors_total counter",
        `cancellation_errors_total ${metrics_js_1.metrics.cancellationErrors}`,
    ].join("\n");
    return reply
        .type("text/plain; version=0.0.4")
        .send(`${output}\n`);
});
startServer();
