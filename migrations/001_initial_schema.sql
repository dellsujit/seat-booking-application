-- ============================================
-- Seat Booking System
-- Migration: 001_initial_schema
-- ============================================

-- --------------------------------------------
-- 1. Seat status
-- --------------------------------------------

CREATE TYPE seat_status AS ENUM (
    'available',
    'held',
    'confirmed'
);


-- --------------------------------------------
-- 2. Shows
-- --------------------------------------------

CREATE TABLE shows (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- --------------------------------------------
-- 3. Seats
-- --------------------------------------------

CREATE TABLE seats (
    id UUID PRIMARY KEY,
    show_id UUID NOT NULL,
    seat_number VARCHAR(20) NOT NULL,
    price_paise BIGINT NOT NULL,
    status seat_status NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_seats_show
        FOREIGN KEY (show_id)
        REFERENCES shows(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_seats_price_non_negative
        CHECK (price_paise >= 0),

    CONSTRAINT uq_seats_show_seat_number
        UNIQUE (show_id, seat_number)
);


-- --------------------------------------------
-- 4. Indexes
-- --------------------------------------------

CREATE INDEX idx_seats_show_id
    ON seats(show_id);

CREATE INDEX idx_seats_show_status
    ON seats(show_id, status);