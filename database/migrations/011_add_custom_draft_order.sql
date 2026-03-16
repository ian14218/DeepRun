-- Add custom_draft_order flag to leagues table
-- When true, startDraft will use the commissioner-set draft_position values
-- instead of randomly shuffling.
ALTER TABLE leagues ADD COLUMN custom_draft_order BOOLEAN DEFAULT FALSE;
