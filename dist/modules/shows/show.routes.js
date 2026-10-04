"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showRoutes = void 0;
const show_service_js_1 = require("./show.service.js");
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
const showRoutes = async (app) => {
    app.post("/shows", {
        schema: createShowSchema,
    }, async (request, reply) => {
        try {
            const seatNumbers = request.body.seats.map((seat) => seat.seatNumber);
            const uniqueSeatNumbers = new Set(seatNumbers);
            if (uniqueSeatNumbers.size !== seatNumbers.length) {
                return reply.status(400).send({
                    error: "Duplicate seat numbers are not allowed",
                });
            }
            const result = await (0, show_service_js_1.createShow)(request.body);
            return reply.status(201).send(result);
        }
        catch (error) {
            request.log.error(error);
            return reply.status(500).send({
                error: "Failed to create show",
            });
        }
    });
    app.get("/shows/:showId", async (request, reply) => {
        try {
            const result = await (0, show_service_js_1.getShow)(request.params.showId);
            if (result === null) {
                return reply.status(404).send({
                    error: "Show not found",
                });
            }
            return reply.status(200).send(result);
        }
        catch (error) {
            request.log.error(error);
            return reply.status(500).send({
                error: "Failed to get show",
            });
        }
    });
};
exports.showRoutes = showRoutes;
