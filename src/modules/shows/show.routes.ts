import type { FastifyInstance } from "fastify";
import type { CreateShowRequest } from "./show.types.js";
import {
  createShow,
  getShow,
} from "./show.service.js";

const createShowSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["name", "startsAt", "seats"],
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 200,
      },

      startsAt: {
        type: "string",
        format: "date-time",
      },

      seats: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["seatNumber", "pricePaise"],
          properties: {
            seatNumber: {
              type: "string",
              minLength: 1,
              maxLength: 20,
            },

            pricePaise: {
              type: "integer",
              minimum: 0,
              maximum: Number.MAX_SAFE_INTEGER,
            },
          },
        },
      },
    },
  },
};

export const showRoutes = async (app: FastifyInstance) => {
  
  app.post<{ Body: CreateShowRequest }>(
    "/shows",
    {
      schema: createShowSchema,
    },
    async (request, reply) => {
      try {
        const seatNumbers = request.body.seats.map(
          (seat) => seat.seatNumber,
        );

        const uniqueSeatNumbers = new Set(seatNumbers);

        if (uniqueSeatNumbers.size !== seatNumbers.length) {
          return reply.status(400).send({
            error: "Duplicate seat numbers are not allowed",
          });
        }

        const result = await createShow(request.body);

        return reply.status(201).send(result);
      } catch (error) {
        request.log.error(error);

        return reply.status(500).send({
          error: "Failed to create show",
        });
      }
    },
  );

  app.get<{
  Params: { showId: string };
}>(
  "/shows/:showId",
  async (request, reply) => {
    try {
      const result = await getShow(request.params.showId);

      if (result === null) {
        return reply.status(404).send({
          error: "Show not found",
        });
      }

      return reply.status(200).send(result);
    } catch (error) {
      request.log.error(error);

      return reply.status(500).send({
        error: "Failed to get show",
      });
    }
  },
);
};
