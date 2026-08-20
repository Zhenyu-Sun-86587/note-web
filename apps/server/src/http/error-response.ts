import type { Response } from "express";

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
  };
  [key: string]: unknown;
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): void {
  res.status(statusCode).json({
    error: {
      code,
      message,
    },
    ...extra,
  });
}
