import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mwefmtmcljdsptcgowmb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13ZWZtdG1jbGpkc3B0Y2dvd21iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDM1MTIsImV4cCI6MjA5MDM3OTUxMn0.MWkosFtcKB5UAQGvNTB6fABEIMfkgzXgnwb_17pJabU';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8299168473:AAF0yDJtR0B34y_Xc3_TbmzkMzFN7I1-eh8';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyCQ03BwZHXIQnxXQjdM3CZubhx4zKNrFkA';

let lastError = null;

export default async (req, res) => {
  // Handle incoming Telegram Webhook
  console.log('--- TELEGRAM WEBHOOK RECEIVED ---');
  
  if (req.method === 'GET') {
      return res.status(200).json({ status: 'live', last_error: lastError });
  }

  const body = req.body || {};
  const { message } = body;
  
  if (!message || !message.chat) {
    console.log('No valid message in body:', body);
    return res.status(200).send('OK (ping)');
  }

  const chatId = message.chat.id;
  const text = message.text || '';
  const tgHandle = message.from ? message.from.username : null;
  const command = text.split(' ')[0].split('@')[0]; // Handle /command@botname

  console.log(`Command: ${command}, ChatId: ${chatId}, From: ${tgHandle}`);

  if (command === '/start') {
    try {
        if (!SUPABASE_KEY) {
            throw new Error('SUPABASE_KEY is missing');
        }

        const headers = { 
            'apikey': SUPABASE_KEY, 
            'Authorization': `Bearer ${SUPABASE_KEY}`, 
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        };

        // 1. Register user as a global subscriber (upsert)
        await axios.post(`${SUPABASE_URL}/rest/v1/telegram_subscribers`, {
            chat_id: chatId.toString(),
            username: tgHandle || 'anonymous'
        }, { headers });

        // 2. Try to link to a profile if handle exists
        if (tgHandle) {
            const searchResp = await axios.get(`${SUPABASE_URL}/rest/v1/user_profiles?telegram=ilike.*${tgHandle}*`, { headers });
            const profiles = searchResp.data;

            if (profiles && profiles.length > 0) {
                const profile = profiles[0];
                await axios.patch(`${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${profile.user_id}`, {
                    telegram_id: chatId.toString(),
                    telegram_notifications: true
                }, { headers });
                
                await sendSimpleMessage(chatId, `✅ <b>Connection Active!</b>\n\nHi ${profile.name || tgHandle}, your account is linked. You'll receive real-time notifications for ALL new listings!\n\nUse /opportunities to see what's live.`);
                return res.status(200).send('OK');
            }
        }

        // Default response for non-profile users
        await sendSimpleMessage(chatId, `🚀 <b>Welcome to CreatorChain!</b>\n\nYou're now subscribed to all new Web3 opportunities. Alerts will be sent here the moment they go live!\n\nUse /opportunities to see live gigs.`);
        
    } catch (err) {
        const errMsg = err.response?.data?.message || err.message;
        lastError = `Start Error: ${errMsg}`;
        console.error('Webhook /start error:', errMsg);
        await sendSimpleMessage(chatId, `❌ <b>Initialization Error:</b> ${errMsg}`);
    }
  } else if (command === '/opportunities' || command === '/oopportunities') {
    try {
        if (!SUPABASE_KEY) {
            throw new Error('SUPABASE_KEY is missing');
        }

        const headers = { 
            'apikey': SUPABASE_KEY, 
            'Authorization': `Bearer ${SUPABASE_KEY}`
        };

        // Fetch active opportunities and listings (filter for open/approved status)
        const [oppsResp, listingsResp] = await Promise.all([
            axios.get(`${SUPABASE_URL}/rest/v1/opportunities?status=eq.open&select=*`, { headers }),
            axios.get(`${SUPABASE_URL}/rest/v1/listings?approval_status=eq.approved&status=eq.Open&select=*`, { headers })
        ]);

        const opportunities = oppsResp.data || [];
        const listings = listingsResp.data || [];
        
        // Combine and add metadata
        let allItems = [
            ...opportunities.map(o => ({...o, item_type: 'opp', is_exclusive: (o.project_name || '').toLowerCase().includes('creatorchain')})), 
            ...listings.map(l => ({...l, item_type: 'list', is_exclusive: (l.project || '').toLowerCase().includes('creatorchain')}))
        ];

        // Sort: Exclusive first, then Featured, then Newest
        allItems.sort((a, b) => {
            // 1. Exclusive (CreatorChain projects)
            if (a.is_exclusive && !b.is_exclusive) return -1;
            if (!a.is_exclusive && b.is_exclusive) return 1;

            // 2. Featured
            const aFeatured = a.featured === true;
            const bFeatured = b.featured === true;
            if (aFeatured && !bFeatured) return -1;
            if (!aFeatured && bFeatured) return 1;

            // 3. Date (Newest first)
            const aDate = new Date(a.created_at || 0);
            const bDate = new Date(b.created_at || 0);
            return bDate - aDate;
        });

        if (allItems.length === 0) {
            await sendSimpleMessage(chatId, `📭 <b>No active opportunities found at the moment.</b>\n\nCheck back later or visit <a href="https://creatorchain.site/">CreatorChain</a>.`);
            return res.status(200).send('OK');
        }

        let responseText = `🔥 <b>LIVE OPPORTUNITIES</b>\n\n`;
        
        // Show top 10 to avoid hitting message length limits
        const displayItems = allItems.slice(0, 10);

        displayItems.forEach((item, index) => {
            const title = item.title || item.project_name || 'Untitled';
            const project = item.project_name || item.project || 'Web3 Project';
            const reward = item.reward || 'TBA';
            const id = item.id;
            const url = `https://creatorchain.site/opportunity.html?id=${id}`;
            const exclusiveTag = item.is_exclusive ? '⭐️ <b>EXCLUSIVE</b>\n' : '';
            
            responseText += `${index + 1}. ${exclusiveTag}<b>${project}</b>\n`;
            responseText += `🔹 ${title}\n`;
            responseText += `💰 <b>Reward:</b> ${reward}\n`;
            responseText += `🔗 <a href="${url}">VIEW_DETAILS & APPLY</a>\n\n`;
        });

        if (allItems.length > 10) {
            responseText += `...and ${allItems.length - 10} more! View all at <a href="https://creatorchain.site/">CreatorChain</a>.`;
        }

        await sendSimpleMessage(chatId, responseText);
    } catch (err) {
        const errMsg = err.response?.data?.message || err.message;
        lastError = `Opps Error: ${errMsg}`;
        console.error('Opportunities fetch error:', errMsg);
        await sendSimpleMessage(chatId, `❌ <b>Error fetching opportunities.</b> Please try again later.`);
    }
  } else if (command === '/chatid') {
    await sendSimpleMessage(chatId, `🆔 <b>YOUR_TELEGRAM_CHAT_ID:</b> <code>${chatId}</code>\n\nUse this to configure manual alerts if needed.`);
  } else if (command === '/help') {
     const helpText = `🛠 <b>CREATORCHAIN BOT HELP</b>\n\n` +
                      `Available commands:\n` +
                      `/opportunities - View all live Web3 opportunities\n` +
                      `/chatid - Get your Telegram Chat ID\n` +
                      `/help - Show this help message\n\n` +
                      `Visit <a href="https://creatorchain.site/">CreatorChain</a> for the full experience.`;
     await sendSimpleMessage(chatId, helpText);
  } else {
      if (text.startsWith('/')) {
          // Default response for unknown commands
          await sendSimpleMessage(chatId, `❓ <b>Unknown command:</b> <code>${command}</code>\n\nType /help to see available commands.`);
      } else {
          // AI Chat integration
          await handleAIChat(chatId, text);
      }
  }

  res.status(200).send('OK');
};

async function handleAIChat(chatId, userMessage) {
    try {
        await sendSimpleMessage(chatId, `🤖 <i>Thinking... Let me check the latest opportunities for you.</i>`);
        
        const headers = { 
            'apikey': SUPABASE_KEY, 
            'Authorization': `Bearer ${SUPABASE_KEY}`
        };

        const [oppsResp, listingsResp] = await Promise.all([
            axios.get(`${SUPABASE_URL}/rest/v1/opportunities?status=eq.open&select=*`, { headers }),
            axios.get(`${SUPABASE_URL}/rest/v1/listings?approval_status=eq.approved&status=eq.Open&select=*`, { headers })
        ]);

        const opportunities = oppsResp.data || [];
        const listings = listingsResp.data || [];
        
        let allItems = [
            ...opportunities.map(o => ({...o, item_type: 'opp', is_exclusive: (o.project_name || '').toLowerCase().includes('creatorchain')})), 
            ...listings.map(l => ({...l, item_type: 'list', is_exclusive: (l.project || '').toLowerCase().includes('creatorchain')}))
        ];

        let contextText = "Active Opportunities:\n";
        allItems.slice(0, 20).forEach((item, index) => {
            const title = item.title || item.project_name || 'Untitled';
            const project = item.project_name || item.project || 'Web3 Project';
            const reward = item.reward || 'TBA';
            const id = item.id;
            const url = `https://creatorchain.site/opportunity.html?id=${id}`;
            contextText += `- [${project}] ${title} | Reward: ${reward} | Link: ${url}\n`;
        });

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.5-flash",
            systemInstruction: `You are the CreatorChain Web3 Job Assistant Telegram Bot. 
A user has sent you a message. Here are the current active Web3 job opportunities and bounties:
${contextText}

Answer the user's question concisely based primarily on these active opportunities. If they ask about specific skills, mention the jobs that fit best and provide the link. 
Format your response using ONLY Telegram-compatible HTML tags: <b>, <i>, <u>, <s>, <a>, <code>, <pre>. Do not use markdown like **bold** or *italic* or markdown links [text](url). Use <b>bold</b> and <a href="url">text</a> instead. Keep the tone helpful and professional.`
        });

        const result = await model.generateContent(userMessage);
        
        let aiResponse = result.response.text();
        
        // Minor cleanup if Gemini uses markdown by accident
        aiResponse = aiResponse.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        aiResponse = aiResponse.replace(/\*(.*?)\*/g, '<i>$1</i>');
        // Clean up markdown links that might have slipped through: [text](url) -> <a href="url">text</a>
        aiResponse = aiResponse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        
        await sendSimpleMessage(chatId, aiResponse);

    } catch (err) {
        console.error('AI Chat Error:', err);
        await sendSimpleMessage(chatId, `❌ <b>AI Error:</b> Sorry, I couldn't process your request right now.`);
    }
}

async function sendSimpleMessage(chatId, text) {
    try {
        await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
        });
    } catch (err) {
        lastError = `Send Error: ${err.message}`;
        console.error('Failed to send response message:', err.message);
    }
}
