"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showRoutes = void 0;
const show_service_js_1 = require("./show.service.js");
const createShowSchema = {
    body: {
        type: "object",
        additionalProperties: false,
        required: ["name", "seats"],
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
            price_paise: {
                type: "integer",
                minimum: 0,
                maximum: Number.MAX_SAFE_INTEGER,
            },
            seats: {
                type: "array",
                minItems: 1,
                items: {
                    anyOf: [
                        {
                            type: "string",
                            minLength: 1,
                            maxLength: 20,
                        },
                        {
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
                    ],
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
            const body = request.body;
            /*
             * Support assignment format:
             *
             * {
             *   name: "Friday Night",
             *   seats: ["A1", "A2"],
             *   price_paise: 25000
             * }
             */
            let normalizedSeats;
            if (body.seats.length > 0 &&
                typeof body.seats[0] === "string") {
                if (body.price_paise === undefined) {
                    return reply.status(400).send({
                        error: "price_paise is required when seats are strings",
                    });
                }
                normalizedSeats = body.seats.map((seatNumber) => ({
                    seatNumber,
                    pricePaise: body.price_paise,
                }));
            }
            else {
                /*
                 * Existing format:
                 *
                 * {
                 *   seats: [
                 *     { seatNumber: "A1", pricePaise: 25000 }
                 *   ]
                 * }
                 */
                normalizedSeats = body.seats;
                if (body.price_paise !== undefined) {
                    return reply.status(400).send({
                        error: "price_paise is only valid when seats are seat names",
                    });
                }
            }
            const seatNumbers = normalizedSeats.map((seat) => seat.seatNumber);
            const uniqueSeatNumbers = new Set(seatNumbers);
            if (uniqueSeatNumbers.size !== seatNumbers.length) {
                return reply.status(400).send({
                    error: "Duplicate seat numbers are not allowed",
                });
            }
            const normalizedRequest = {
                name: body.name,
                startsAt: body.startsAt ??
                    new Date().toISOString(),
                seats: normalizedSeats,
            };
            const result = await (0, show_service_js_1.createShow)(normalizedRequest);
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
