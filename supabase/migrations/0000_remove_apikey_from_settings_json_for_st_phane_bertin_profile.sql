
UPDATE public.profiles
SET settings = settings - 'apiKey',
    updated_at = now()
WHERE first_name = 'Stéphane' AND last_name = 'BERTIN';
