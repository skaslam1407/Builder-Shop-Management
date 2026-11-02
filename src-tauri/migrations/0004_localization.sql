ALTER TABLE company_settings ADD COLUMN language_code TEXT NOT NULL DEFAULT 'en';

ALTER TABLE users ADD COLUMN preferred_language TEXT;
ALTER TABLE users ADD COLUMN preferred_currency_code TEXT;
