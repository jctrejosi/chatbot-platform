-- ============================================================================
-- file_type: ampliar de VARCHAR(50) a VARCHAR(255).
-- Los MIME types de Office (DOCX/XLSX/PPTX) superan los 50 caracteres
-- (p.ej. "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
-- = 72 chars) y hacían fallar el INSERT en /ingest con
-- "value too long for type character varying(50)".
-- Idempotente: puede ejecutarse múltiples veces sin romper nada.
-- ============================================================================

ALTER TABLE knowledge_sources ALTER COLUMN file_type TYPE VARCHAR(255);
