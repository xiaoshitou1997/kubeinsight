export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class KubeError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly reason?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'KubeError';
  }

  toJSON() {
    return { status: this.status, message: this.message, reason: this.reason };
  }
}
