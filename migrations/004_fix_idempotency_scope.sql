ALTER TABLE reservations
DROP CONSTRAINT uq_reservations_user_idempotency;

ALTER TABLE reservations
ADD CONSTRAINT uq_reservations_user_show_idempotency
    UNIQUE (user_id, show_id, idempotency_key);