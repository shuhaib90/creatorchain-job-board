import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mwefmtmcljdsptcgowmb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SdGsB-hhvxF2-rq_fBiM0A_y3_mQn2n';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCreatorPulse() {
    const { data, error } = await supabase
        .from('creatorpulse_posts')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error querying creatorpulse_posts:', error.message);
    } else {
        console.log('creatorpulse_posts query result:', data);
    }
}

checkCreatorPulse();
