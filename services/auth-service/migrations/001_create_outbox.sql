-- Outbox table for reliable event publishing (transactional outbox pattern)
CREATE TABLE IF NOT EXISTS outbox (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type   VARCHAR(100) NOT NULL,
    aggregate_id     VARCHAR(100) NOT NULL,
    event_type       VARCHAR(100) NOT NULL,
    payload          JSONB        NOT NULL,
    metadata         JSONB,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    published_at     TIMESTAMP,
    published        BOOLEAN      NOT NULL DEFAULT FALSE,
    publish_attempts INTEGER      NOT NULL DEFAULT 0,
    last_attempt_at  TIMESTAMP,
    last_error       TEXT,
    sequence_number  BIGSERIAL
);

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished
    ON outbox (published, created_at)
    WHERE published = FALSE;

CREATE INDEX IF NOT EXISTS idx_outbox_aggregate
    ON outbox (aggregate_type, aggregate_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_outbox_cleanup
    ON outbox (published, published_at);

-- DLQ for events that exceed max publish attempts
CREATE TABLE IF NOT EXISTS outbox_dlq (
    id                  UUID        PRIMARY KEY,
    original_event_type VARCHAR(100),
    payload             JSONB,
    error               TEXT,
    retry_count         INTEGER,
    moved_at            TIMESTAMP   DEFAULT NOW()
);

-- Archive for successfully published events older than 7 days
CREATE TABLE IF NOT EXISTS outbox_archive (
    id               UUID        PRIMARY KEY,
    aggregate_type   VARCHAR(100),
    aggregate_id     VARCHAR(100),
    event_type       VARCHAR(100),
    payload          JSONB,
    created_at       TIMESTAMP,
    published_at     TIMESTAMP,
    archived_at      TIMESTAMP   DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION archive_old_outbox_events() RETURNS void AS $$
BEGIN
    INSERT INTO outbox_archive (id, aggregate_type, aggregate_id, event_type, payload, created_at, published_at)
    SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at, published_at
    FROM outbox
    WHERE published = TRUE AND published_at < NOW() - INTERVAL '7 days';

    DELETE FROM outbox
    WHERE published = TRUE AND published_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
