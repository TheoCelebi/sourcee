-- Extensions nécessaires au schéma : vecteurs (pgvector) et recherche sans accents.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- unaccent() n'est pas IMMUTABLE : cette enveloppe permet de l'utiliser dans une colonne générée.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
