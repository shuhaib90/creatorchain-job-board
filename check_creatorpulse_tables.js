import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mwefmtmcljdsptcgowmb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SdGsB-hhvxF2-rq_fBiM0A_y3_mQn2n';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkTables() {
    const { data: likes, error: errorLikes } = await supabase
        .from('creatorpulse_likes')
        .select('*')
        .limit(1);

    if (errorLikes) {
        console.error('Error querying creatorpulse_likes:', errorLikes.message);
    } else {
        console.log('creatorpulse_likes query result:', likes);
    }

    const { data: comments, error: errorComments } = await supabase
        .from('creatorpulse_comments')
        .select('*')
        .limit(1);

    if (errorComments) {
        console.error('Error querying creatorpulse_comments:', errorComments.message);
    } else {
        console.log('creatorpulse_comments query result:', comments);
    }
}

checkTables();
