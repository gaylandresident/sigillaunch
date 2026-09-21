-- SIGIL schema (shared between backend + relayer)

CREATE TABLE IF NOT EXISTS cursors (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certificates (
    robinhood_token_id NUMERIC PRIMARY KEY,
    burner TEXT NOT NULL,
    source_chain SMALLINT NOT NULL, -- 0=sol,1=eth,2=base,3=bsc,4=arb
    source_token TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    usd_value_at_burn NUMERIC NOT NULL, -- scaled 1e8
    burn_block NUMERIC NOT NULL,
    burn_tx_hash TEXT NOT NULL,
    rarity SMALLINT NOT NULL,           -- 0=common,1=rare,2=epic,3=legendary
    zsa_asset_base TEXT NOT NULL,
    zsa_issuer TEXT NOT NULL,
    minted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cert_burner ON certificates(burner);
CREATE INDEX IF NOT EXISTS idx_cert_source_chain ON certificates(source_chain);

CREATE TABLE IF NOT EXISTS inscriptions (
    robinhood_token_id NUMERIC PRIMARY KEY REFERENCES certificates(robinhood_token_id),
    robinhood_tx_hash TEXT NOT NULL,
    zcash_tx_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | written | confirmed | failed
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inscription_status ON inscriptions(status);

CREATE TABLE IF NOT EXISTS burn_attestations (
    burn_tx_hash TEXT PRIMARY KEY,
    source_chain SMALLINT NOT NULL,
    source_token TEXT NOT NULL,
    burner TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    usd_value_at_burn NUMERIC NOT NULL,
    burn_block NUMERIC NOT NULL,
    attestation_sig TEXT NOT NULL,      -- 65-byte hex (r||s||v)
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS launches (
    launch_id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    creator TEXT NOT NULL,
    quote TEXT NOT NULL,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS trades (
    id BIGSERIAL PRIMARY KEY,
    launch_id TEXT NOT NULL,
    trader TEXT NOT NULL,
    side TEXT NOT NULL, -- 'buy' | 'sell'
    token_amount NUMERIC NOT NULL,
    quote_amount NUMERIC NOT NULL,
    fee_amount NUMERIC NOT NULL,
    block_number NUMERIC NOT NULL,
    tx_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trades_launch ON trades(launch_id);
