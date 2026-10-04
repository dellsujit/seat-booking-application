-- ============================================
-- Seat Booking System
-- Migration: 002_reservations
-- ============================================

CREATE TYPE reservation_status AS ENUM (
    'confirmed',
    'cancelled'
);

CREATE TABLE reservations (
    id UUID PRIMARY KEY,
    show_id UUID NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    status reservation_status NOT NULL DEFAULT 'confirmed',
    amount_paise BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,

    CONSTRAINT fk_reservations_show
        FOREIGN KEY (show_id)
        REFERENCES shows(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_reservations_amount_non_negative
        CHECK (amount_paise >= 0),

    CONSTRAINT chk_reservations_cancelled_at
        CHECK (
            (status = 'cancelled' AND cancelled_at IS NOT NULL)
            OR
            (status = 'confirmed' AND cancelled_at IS NULL)
        )
);

CREATE INDEX idx_reservations_show_id
    ON reservations(show_id);

CREATE INDEX idx_reservations_user_id
    ON reservations(user_id);


CREATE TABLE reservation_seats (
    reservation_id UUID NOT NULL,
    seat_id UUID NOT NULL,

    CONSTRAINT pk_reservation_seats
        PRIMARY KEY (reservation_id, seat_id),

    CONSTRAINT fk_reservation_seats_reservation
        FOREIGN KEY (reservation_id)
        REFERENCES reservations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_reservation_seats_seat
        FOREIGN KEY (seat_id)
        REFERENCES seats(id)
        ON DELETE RESTRICT
);

CREATE INDEX idx_reservation_seats_seat_id
    ON reservation_seats(seat_id);