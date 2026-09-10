-- Fix mutable search_path on compute_retention_expiry function
CREATE OR REPLACE FUNCTION public.compute_retention_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.retention_expires_at = NEW.upload_date + (NEW.retention_days || ' days')::interval;
  RETURN NEW;
END;
$$;
