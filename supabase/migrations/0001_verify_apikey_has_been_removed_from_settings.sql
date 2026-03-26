
SELECT first_name, last_name, settings->>'apiKey' as api_key_value
FROM public.profiles
WHERE first_name = 'Stéphane' AND last_name = 'BERTIN';
