export type BookingDeclineReason =
  | "seat-taken"
  | "per-user-limit"
  | "idempotent-replay";

export const metrics = {
  bookingRequests: 0,
  bookingSuccess: 0,
  bookingConflicts: 0,
  bookingErrors: 0,

  bookingDeclinedSeatTaken: 0,
  bookingDeclinedPerUserLimit: 0,
  bookingDeclinedIdempotentReplay: 0,

  cancellationRequests: 0,
  cancellationSuccess: 0,
  cancellationErrors: 0,
};

export const recordBookingDeclined = (
  reason: BookingDeclineReason,
): void => {
  metrics.bookingConflicts++;

  switch (reason) {
    case "seat-taken":
      metrics.bookingDeclinedSeatTaken++;
      break;

    case "per-user-limit":
      metrics.bookingDeclinedPerUserLimit++;
      break;

    case "idempotent-replay":
      metrics.bookingDeclinedIdempotentReplay++;
      break;
  }
};