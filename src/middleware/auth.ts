import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
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


export const authenticateAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
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

  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken || token !== adminToken) {
    await reply.status(403).send({
      error: "Admin access required",
    });

    return;
  }
};