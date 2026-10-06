export interface CreateShowSeatRequest {
  seatNumber: string;
  pricePaise: number;
}

export interface CreateShowRequest {
  name: string;
  startsAt?: string;
  seats: CreateShowSeatRequest[] | string[];
  price_paise?: number;
}

export interface NormalizedCreateShowRequest {
  name: string;
  startsAt: string;
  seats: CreateShowSeatRequest[];
}

export interface ReserveSeatsRequest {
  seatNumbers?: string[];
  seats?: string[];
  idempotency_key?: string;
}

export interface NormalizedReserveSeatsRequest {
  seatNumbers: string[];
}