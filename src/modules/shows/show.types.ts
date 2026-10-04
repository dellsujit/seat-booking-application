export interface CreateShowSeatRequest {
  seatNumber: string;
  pricePaise: number;
}

export interface CreateShowRequest {
  name: string;
  startsAt: string;
  seats: CreateShowSeatRequest[];
}

export interface ReserveSeatsRequest {
  seatNumbers: string[];
}