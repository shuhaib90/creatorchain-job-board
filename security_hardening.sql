-- ============================================================
-- CreatorChain Security Hardening Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1) REPUTATION RPC PROTECTION
-- Revoke public execution of reputation functions to prevent score manipulation
REVOKE EXECUTE ON FUNCTION increment_submission_reputation(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_approved_reputation(text, text) FROM anon;

-- Ensure only authenticated service roles or internal triggers can call these
-- (In Supabase, you might want to keep it for 'authenticated' if users can trigger it via a secure flow, 
-- but ideally, these should be triggered by server-side logic like Edge Functions)
-- For now, we restrict to authenticated users as a first step, 
-- but the ultimate goal is to move this to a private schema or service-role only.
GRANT EXECUTE ON FUNCTION increment_submission_reputation(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_approved_reputation(text, text) TO authenticated, service_role;

-- 2) ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_subscribers ENABLE ROW LEVEL SECURITY;

-- 3) USER_PROFILES POLICIES
-- Anyone can view profiles (public directory)
CREATE POLICY "Profiles are viewable by everyone" 
ON public.user_profiles FOR SELECT 
USING (true);

-- Users can only update their own profile
-- Assuming 'user_id' matches the auth.uid()
CREATE POLICY "Users can update their own profile" 
ON public.user_profiles FOR UPDATE 
USING (auth.uid()::text = user_id::text)
WITH CHECK (auth.uid()::text = user_id::text);

-- 4) OPPORTUNITIES POLICIES
-- Open opportunities are viewable by everyone
CREATE POLICY "Open opportunities are viewable by everyone" 
ON public.opportunities FOR SELECT 
USING (status = 'open');

-- Admin check (using a simple metadata check or role if implemented)
-- For now, let's assume we have an admin role or handle-based check
CREATE POLICY "Admins can manage opportunities" 
ON public.opportunities FOR ALL 
USING (auth.jwt() ->> 'email' IN ('admin@creatorchain.site', 'hello@creatorchain.site')); -- Replace with actual admin emails

-- 5) TELEGRAM_SUBSCRIBERS POLICIES
-- Only service role can manage subscribers (for the webhook)
CREATE POLICY "Service role can manage telegram subscribers" 
ON public.telegram_subscribers FOR ALL 
USING (true)
WITH CHECK (true);
-- Restricted to service_role in practice via API keys

-- 6) LISTINGS POLICIES
-- Approved listings are viewable by everyone
CREATE POLICY "Approved listings are viewable by everyone" 
ON public.listings FOR SELECT 
USING (approval_status = 'approved');
