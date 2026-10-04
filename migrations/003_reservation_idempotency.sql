-- ============================================
-- Seat Booking System
-- Migration: 003_reservation_idempotency
-- ============================================

ALTER TABLE reservations
ADD COLUMN idempotency_key VARCHAR(200) NOT NULL;

ALTER TABLE reservations
ADD COLUMN request_fingerprint VARCHAR(64) NOT NULL;

ALTER TABLE reservations
ADD CONSTRAINT uq_reservations_user_idempotency
    UNIQUE (user_id, idempotency_key);




