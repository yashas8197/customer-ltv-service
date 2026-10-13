// An error with an HTTP status. Services throw it; errorHandler.middleware.ts turns it into the response.
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}
