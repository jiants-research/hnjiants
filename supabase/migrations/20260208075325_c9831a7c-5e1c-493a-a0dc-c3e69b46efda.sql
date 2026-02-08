
-- Drop leftover permissive policies from initial setup
DROP POLICY IF EXISTS "Allow public insert to open_loops" ON public.open_loops;
DROP POLICY IF EXISTS "Allow public read access to open_loops" ON public.open_loops;
DROP POLICY IF EXISTS "Allow public update to open_loops" ON public.open_loops;
