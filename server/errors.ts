/** Thrown by domain code; mapped to an HTTP response by the error handler in index.ts. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: Record<string, unknown>,
  ) {
    super(message);
  }
}
