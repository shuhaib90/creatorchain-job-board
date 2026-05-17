const axios = require('axios');

async function check() {
    const url = 'https://orskrxnaoscabactbwpe.supabase.co';
    try {
        console.log(`Checking ${url}...`);
        const resp = await axios.get(url);
        console.log('Response Status:', resp.status);
        console.log('Response Data:', resp.data);
    } catch (err) {
        console.error('Error:', err.message);
        if (err.response) {
            console.error('Response Status:', err.response.status);
            console.error('Response Data:', err.response.data);
        }
    }
}

check();
