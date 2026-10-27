-- The "П or Б" letter (travel or business) becomes a code; letters and words people typed before are read as the same thing.
UPDATE "Contact" SET "typeTag" = 'TRAVEL' WHERE lower(btrim("typeTag")) IN ('п', 'p', 'путешествия', 'путешествие', 'travel');
UPDATE "Contact" SET "typeTag" = 'BUSINESS' WHERE lower(btrim("typeTag")) IN ('б', 'b', 'бизнес', 'business');
