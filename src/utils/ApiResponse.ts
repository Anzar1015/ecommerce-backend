/**
 * Standard success response shape used across the entire API:
 * { success, message, data }
 */
export class ApiResponse<T = unknown> {
  public readonly success: boolean;

  constructor(
    public readonly statusCode: number,
    public readonly data: T,
    public readonly message = 'Success'
  ) {
    this.success = statusCode < 400;
  }
}
