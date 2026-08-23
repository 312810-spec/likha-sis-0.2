/**
 * Input failed a business rule before it ever reached a repository. UI
 * code can catch this specifically to show a field-level message, as
 * opposed to an infrastructure failure (network/db/IPC) it should treat
 * as "something went wrong."
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
