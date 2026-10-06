import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { metrics } from "../../config/metrics.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


import type { ReserveSeatsRequest } from "../shows/show.types.js";

import {
  ReservationConflictError,
  ReservationForbiddenError,
  ReservationNotFoundError,
  cancelReservation,
  reserveSeats,
} from "./reservation.service.js";

const reserveSeatsSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    anyOf: [
      {
        required: ["seatNumbers"],
      },
      {
        required: ["seats"],
      },
    ],
    properties: {
      seatNumbers: {
        type: "array",
        minItems: 1,
        items: {
          type: "string",
          minLength: 1,
          maxLength: 20,
        },
      },

      seats: {
        type: "array",
        minItems: 1,
        items: {
          type: "string",
          minLength: 1,
          maxLength: 20,
        },
      },

      idempotency_key: {
        type: "string",
        minLength: 1,
        maxLength: 200,
      },
    },
  },
};

export const reservationRoutes = async (app: FastifyInstance) => {
  app.post<{ Params: { showId: string }; Body: ReserveSeatsRequest }>(
    "/shows/:showId/reserve",
    {
      preHandler: authenticate,
      schema: reserveSeatsSchema,
    },
    async (request, reply) => {
      try {

   if (!UUID_REGEX.test(request.params.showId)) {
      return reply.status(400).send({
        error: "Invalid show ID",
      });
    }


        metrics.bookingRequests++;
        const seatNumbers =
        request.body.seatNumbers ??
        request.body.seats;

      if (!seatNumbers || seatNumbers.length === 0) {
        return reply.status(400).send({
          error: "seats are required",
        });
      }

        /*
         * Reject duplicate seat numbers in the same request.
         */
        const uniqueSeatNumbers = new Set(seatNumbers);

        if (uniqueSeatNumbers.size !== seatNumbers.length) {
          return reply.status(400).send({
            error: "Duplicate seat numbers are not allowed",
          });
        }

        const headerIdempotencyKey = request.headers["idempotency-key"];
        const bodyIdempotencyKey = request.body.idempotency_key;

        if (Array.isArray(headerIdempotencyKey)) {
          return reply.status(400).send({
            error: "Invalid idempotency key",
          });
        }
     
        if (
          headerIdempotencyKey &&
          bodyIdempotencyKey &&
          headerIdempotencyKey !== bodyIdempotencyKey
        ) {
          return reply.status(400).send({
            error: "Idempotency keys do not match",
          });
        }

        const idempotencyKey =
          headerIdempotencyKey ??
          bodyIdempotencyKey;

        if (!idempotencyKey) {
          return reply.status(400).send({
            error: "Idempotency key is required",
          });
        }



       const result = await reserveSeats(
        request.params.showId,
        request.userId,
        {
          seatNumbers,
        },
        idempotencyKey,
      );
        metrics.bookingSuccess++;
        return reply.status(201).send(result);
      } catch (error) {

        if (error instanceof ReservationConflictError) {
          metrics.bookingConflicts++;
          return reply.status(409).send({
            error: error.message,
          });
        }

        request.log.error(error);
        metrics.bookingErrors++;
        return reply.status(500).send({
          error: "Failed to create reservation",
        });
      }
    },
  );

  app.post<{
  Params: { reservationId: string };
}>(
  "/reservations/:reservationId/cancel",
  {
    preHandler: authenticate,
  },
  async (request, reply) => {
    try {

      if (!UUID_REGEX.test(request.params.reservationId)) {
      return reply.status(400).send({
        error: "Invalid reservation ID",
      });
    }
      metrics.cancellationRequests++;

      const result = await cancelReservation(
        request.params.reservationId,
        request.userId,
      );
      
      metrics.cancellationSuccess++;
      return reply.status(200).send(result);
    } catch (error) {

      
      if (error instanceof ReservationNotFoundError) {
        return reply.status(404).send({
          error: error.message,
        });
      }

      if (error instanceof ReservationForbiddenError) {
        return reply.status(403).send({
          error: error.message,
        });
      }

      if (error instanceof ReservationConflictError) {
        return reply.status(409).send({
          error: error.message,
        });
      }

      request.log.error(error);
      
      metrics.cancellationErrors++;

      return reply.status(500).send({
        error: "Failed to cancel reservation",
      });
    }
  },
);


};

