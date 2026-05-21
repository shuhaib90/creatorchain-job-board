-- ============================================================
-- CreatorChain Reputation RPC Functions
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1) Atomic increment for new submissions (bounty apply / project post)
--    Adds +1 to total_submissions, +1 to reputation_score and score
CREATE OR REPLACE FUNCTION increment_submission_reputation(p_email text, p_handle text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile_id uuid;
    v_match_strategy text := 'none';
BEGIN
    -- Strategy 1: Match by email (case-insensitive)
    IF p_email IS NOT NULL AND p_email <> '' AND position('@' in p_email) > 0 THEN
        SELECT id INTO v_profile_id FROM user_profiles WHERE lower(email) = lower(p_email) LIMIT 1;
        IF v_profile_id IS NOT NULL THEN v_match_strategy := 'email'; END IF;
    END IF;

    -- Strategy 2: Match by handle (username or telegram)
    IF v_profile_id IS NULL AND p_handle IS NOT NULL AND p_handle <> '' THEN
        SELECT id INTO v_profile_id FROM user_profiles 
        WHERE lower(username) = lower(p_handle) 
           OR lower(telegram) LIKE '%' || lower(p_handle) || '%'
        LIMIT 1;
        IF v_profile_id IS NOT NULL THEN v_match_strategy := 'handle'; END IF;
    END IF;

    -- Strategy 3: Match by name field (for submitted_by matching)
    IF v_profile_id IS NULL AND p_handle IS NOT NULL AND p_handle <> '' THEN
        SELECT id INTO v_profile_id FROM user_profiles 
        WHERE lower(name) = lower(p_handle) 
        LIMIT 1;
        IF v_profile_id IS NOT NULL THEN v_match_strategy := 'name'; END IF;
    END IF;

    IF v_profile_id IS NOT NULL THEN
        UPDATE user_profiles
        SET 
            total_submissions = COALESCE(total_submissions, 0) + 1
        WHERE id = v_profile_id;
        
        PERFORM calculate_user_score(v_profile_id);
        
        RETURN jsonb_build_object('success', true, 'matched_by', v_match_strategy, 'profile_id', v_profile_id);
    ELSE
        RETURN jsonb_build_object('success', false, 'matched_by', 'none', 'profile_id', null);
    END IF;
END;
$$;

-- 2) Atomic increment for admin approvals
--    Adds +1 to approved_submissions, recalculates reputation_score = (approved*10) + total
CREATE OR REPLACE FUNCTION increment_approved_reputation(p_email text, p_handle text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile_id uuid;
    v_match_strategy text := 'none';
BEGIN
    -- Strategy 1: Match by email
    IF p_email IS NOT NULL AND p_email <> '' AND position('@' in p_email) > 0 THEN
        SELECT id INTO v_profile_id FROM user_profiles WHERE lower(email) = lower(p_email) LIMIT 1;
        IF v_profile_id IS NOT NULL THEN v_match_strategy := 'email'; END IF;
    END IF;

    -- Strategy 2: Match by handle (username or telegram)
    IF v_profile_id IS NULL AND p_handle IS NOT NULL AND p_handle <> '' THEN
        SELECT id INTO v_profile_id FROM user_profiles 
        WHERE lower(username) = lower(p_handle) 
           OR lower(telegram) LIKE '%' || lower(p_handle) || '%'
        LIMIT 1;
        IF v_profile_id IS NOT NULL THEN v_match_strategy := 'handle'; END IF;
    END IF;

    -- Strategy 3: Match by name
    IF v_profile_id IS NULL AND p_handle IS NOT NULL AND p_handle <> '' THEN
        SELECT id INTO v_profile_id FROM user_profiles 
        WHERE lower(name) = lower(p_handle) 
        LIMIT 1;
        IF v_profile_id IS NOT NULL THEN v_match_strategy := 'name'; END IF;
    END IF;

    IF v_profile_id IS NOT NULL THEN
        UPDATE user_profiles
        SET 
            approved_submissions = COALESCE(approved_submissions, 0) + 1
        WHERE id = v_profile_id;
        
        PERFORM calculate_user_score(v_profile_id);
        
        RETURN jsonb_build_object('success', true, 'matched_by', v_match_strategy, 'profile_id', v_profile_id);
    ELSE
        RETURN jsonb_build_object('success', false, 'matched_by', 'none', 'profile_id', null);
    END IF;
END;
$$;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION increment_submission_reputation(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_approved_reputation(text, text) TO anon, authenticated;
