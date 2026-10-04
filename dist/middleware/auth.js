"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const authenticate = async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization) {
        await reply.status(401).send({
            error: "Authentication required",
        });
        return;
    }
    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token) {
        await reply.status(401).send({
            error: "Invalid authorization header",
        });
        return;
    }
    request.userId = token;
};
exports.authenticate = authenticate;
