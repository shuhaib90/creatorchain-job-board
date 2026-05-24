import axios from 'axios';

// Initialize with provided token
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, payload } = req.body;

  if (!type || !payload) {
    return res.status(400).json({ error: 'Missing type or payload' });
  }

  // Global Settings Logic
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mwefmtmcljdsptcgowmb.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { data: settings } = await axios.get(`${SUPABASE_URL}/rest/v1/system_settings?select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    
    const broadcastEnabled = settings?.find(s => s.key === 'broadcast_enabled')?.value !== false;
    const devMode = settings?.find(s => s.key === 'developer_mode')?.value === true;

    if (!broadcastEnabled) {
      console.log('🔴 GLOBAL SHUTDOWN: Aborting Telegram notification.');
      return res.status(200).json({ success: true, message: 'Broadcast system disabled' });
    }

    if (devMode && type !== 'admin_alert') {
      console.log('🧪 DEV MODE: Skipping real send, logging message.');
      return res.status(200).json({ success: true, message: 'Dev mode active' });
    }
  } catch (err) {
    console.warn('Settings Check Bypass:', err.message);
  }

  try {
    let message = '';
    let chatIds = payload.chat_ids || process.env.ADMIN_TELEGRAM_CHAT_ID || '2127320399'; // Can be a string or array of strings

    if (type === 'admin_alert') {
      message = `🚨 <b>NEW SUBMISSION</b>\n\n` +
                `<b>Project:</b> ${payload.project_name}\n` +
                `<b>From:</b> ${payload.submitted_by}\n` +
                `<b>Category:</b> ${payload.category}\n\n` +
                `👉 <a href="https://creatorchain-admin-fo2n.vercel.app/">Open Admin Terminal</a>`;
    } else if (type === 'new_opportunity' || type === 'exclusive_opportunity') {
      const reward = payload.reward || payload.budget || 'TBA';
      const id = payload.id;
      const url = id ? `https://creatorchain.site/opportunity.html?id=${id}` : `https://creatorchain.site/`;
      const isExclusive = type === 'exclusive_opportunity' || (payload.project_name && payload.project_name.toLowerCase().includes('creatorchain'));
      
      const header = isExclusive ? `✨ <b>EXCLUSIVE LAUNCH OPPORTUNITY</b> ✨` : `🔥 <b>NEW OPPORTUNITY</b>`;

      message = `${header}\n\n` +
                `<b>${payload.project_name}</b>\n` +
                `${payload.description}\n\n` +
                `💰 <b>Reward:</b> ${reward}\n`;
      
      if (payload.prize_breakdown) {
        const tiers = Object.entries(payload.prize_breakdown)
          .filter(([k, v]) => v)
          .map(([k, v]) => `• ${k}: ${v}`)
          .join('\n');
        if (tiers) message += `\n🏆 <b>Breakdown:</b>\n${tiers}\n`;
      }

      message += `📂 <b>Category:</b> ${payload.category || 'General'}\n\n` +
                 `🚀 <a href="${url}">VIEW_DETAILS & APPLY</a>`;
    } else if (type === 'hire_request') {
      message = `💼 <b>NEW HIRE REQUEST</b>\n\n` +
                `<b>From Team:</b> ${payload.sender_name}\n` +
                `<b>Contact Email:</b> ${payload.sender_email}\n` +
                `${payload.telegram ? `<b>Telegram:</b> ${payload.telegram}\n` : ''}` +
                `\n<b>Message:</b>\n<i>${payload.message}</i>\n\n` +
                `🤝 <a href="https://creatorchain.site/talent.html">Go to CreatorChain</a>`;
    } else if (type === 'badge_update') {
      const badge = payload.badge_level || 'Verified';
      const isPro = badge.toLowerCase() === 'pro';
      const icon = isPro ? '💎' : '✅';
      message = `${icon} <b>LEVEL UP: ACHIEVEMENT UNLOCKED</b> ${icon}\n\n` +
                `Congratulations! Your profile has been upgraded to <b>${badge.toUpperCase()}</b> status.\n\n` +
                `Your new status is now visible to all teams and employers on the network. Keep building!\n\n` +
                `🚀 <a href="https://creatorchain.site/profile.html?u=${payload.username}">VIEW YOUR PROFILE</a>`;
    } else if (type === 'opportunity_approved') {
      message = `✅ <b>SUBMISSION APPROVED</b>\n\n` +
                `Great news! The opportunity you submitted for <b>${payload.project_name}</b> has been reviewed and approved.\n\n` +
                `It is now LIVE on CreatorChain and has been broadcasted to our network of builders.\n\n` +
                `🚀 <a href="https://creatorchain.site/">VIEW IT LIVE</a>`;
    } else if (type === 'custom') {
      message = payload.message;
    } else {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    if (!chatIds || (Array.isArray(chatIds) && chatIds.length === 0)) {
        return res.status(200).json({ success: true, message: 'No recipients' });
    }

    const targetChatIds = Array.isArray(chatIds) ? chatIds : [chatIds];

    // Send messages in parallel
    const results = await Promise.all(targetChatIds.map(async (chatId) => {
      try {
        let response;
        const photoUrl = payload.logo_url || payload.image_url;

        if (photoUrl) {
          try {
            // Attempt to Send as Photo
            response = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, {
              chat_id: chatId,
              photo: photoUrl,
              caption: message,
              parse_mode: 'HTML'
            });
          } catch (photoErr) {
            console.error(`Photo Send Failed to ${chatId}, falling back to text:`, photoErr.response?.data || photoErr.message);
            // Fallback to text message with image link
            const fallbackMessage = `${message}\n\n🖼️ <a href="${photoUrl}">View Logo/Image</a>`;
            response = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
              chat_id: chatId,
              text: fallbackMessage,
              parse_mode: 'HTML',
              disable_web_page_preview: false
            });
          }
        } else {
          // Send as Text (Automated Alerts or Text Broadcasts)
          response = await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: false
          });
        }
        return { chatId, success: true, messageId: response.data.result.message_id };
      } catch (err) {
        console.error(`Telegram Send Error to ${chatId}:`, err.response?.data || err.message);
        return { chatId, success: false, error: err.response?.data?.description || err.message };
      }
    }));

    res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('Telegram API Error:', error);
    res.status(500).json({ error: error.message });
  }
};
