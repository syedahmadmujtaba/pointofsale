SET LOCAL search_path = public;

-- Preserve the original request independently of later allocations and reversals.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS request_payload jsonb;
