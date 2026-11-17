import type { ApiError } from "@sourcee/shared";
import type { ErrorRequestHandler } from "express";

/** Erreur destinée au client, avec son code HTTP et un message en français. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    const body: ApiError = {
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
    res.status(error.status).json(body);
    return;
  }
  console.error(error);
  const body: ApiError = { error: "Erreur interne du serveur" };
  res.status(500).json(body);
};
