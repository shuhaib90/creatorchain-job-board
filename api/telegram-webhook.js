import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mwefmtmcljdsptcgowmb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let lastError = null;

let oppsCache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedOpportunities(headers) {
    const now = Date.now();
    if (oppsCache.data && (now - oppsCache.timestamp < CACHE_TTL)) {
        return oppsCache.data;
    }

    const [oppsResp, listingsResp] = await Promise.all([
        axios.get(`${SUPABASE_URL}/rest/v1/opportunities?status=eq.open&select=*`, { headers }),
        axios.get(`${SUPABASE_URL}/rest/v1/listings?approval_status=eq.approved&status=eq.Open&select=*`, { headers })
    ]);

    const opportunities = oppsResp.data || [];
    const listings = listingsResp.data || [];
    
    const currentDate = new Date();
    let allItems = [
        ...opportunities.map(o => ({...o, item_type: 'opp', is_exclusive: (o.project_name || '').toLowerCase().includes('creatorchain')})), 
        ...listings.map(l => ({...l, item_type: 'list', is_exclusive: (l.project || '').toLowerCase().includes('creatorchain')}))
    ].filter(item => {
        if (!item.deadline) return true;
        return new Date(item.deadline) >= currentDate;
    });

    oppsCache.data = allItems;
    oppsCache.timestamp = now;

    return allItems;
}
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

        let allItems = await getCachedOpportunities(headers);

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
  } else if (command === '/new_opportunity' || command === '/new_opportunities') {
    try {
        if (!SUPABASE_KEY) throw new Error('SUPABASE_KEY is missing');
        const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        let allItems = await getCachedOpportunities(headers);
        allItems.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        if (allItems.length === 0) {
            await sendSimpleMessage(chatId, `📭 <b>No opportunities found.</b>`);
            return res.status(200).send('OK');
        }

        let responseText = `✨ <b>NEW OPPORTUNITIES</b>\n\n`;
        allItems.slice(0, 5).forEach((item, index) => {
            const title = item.title || item.project_name || 'Untitled';
            const project = item.project_name || item.project || 'Web3 Project';
            const reward = item.reward || 'TBA';
            const url = `https://creatorchain.site/opportunity.html?id=${item.id}`;
            responseText += `${index + 1}. <b>${project}</b> | ${title}\n💰 <b>Reward:</b> ${reward}\n🔗 <a href="${url}">VIEW & APPLY</a>\n\n`;
        });
        await sendSimpleMessage(chatId, responseText);
    } catch (err) {
        console.error('Error in /new_opportunities:', err);
        await sendSimpleMessage(chatId, `❌ <b>Error:</b> Could not fetch new opportunities.`);
    }
  } else if (command === '/my_opportunities' || command === '/my_opportunities_by_skills') {
    try {
        if (!SUPABASE_KEY) throw new Error('SUPABASE_KEY is missing');
        const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        const profileResp = await axios.get(`${SUPABASE_URL}/rest/v1/user_profiles?telegram_id=eq.${chatId}`, { headers });
        const profile = profileResp.data && profileResp.data.length > 0 ? profileResp.data[0] : null;

        if (!profile) {
            await sendSimpleMessage(chatId, `🚫 <b>Account Not Linked</b>\n\nPlease link your Telegram account on your CreatorChain profile and run /start to see matching opportunities!`);
            return res.status(200).send('OK');
        }

        let allItems = await getCachedOpportunities(headers);
        const userSkills = (profile.skills || []).map(s => s.toLowerCase());

        let matched = allItems.filter(item => {
            const textToSearch = `${item.title || ''} ${item.project_name || ''} ${item.description || ''}`.toLowerCase();
            return userSkills.some(skill => textToSearch.includes(skill));
        });

        if (matched.length === 0) {
            matched = allItems.slice(0, 5);
        }

        let responseText = `🎯 <b>RECOMMENDED FOR YOU</b>\nBased on your skills: <i>${profile.skills ? profile.skills.join(', ') : 'Creator'}</i>\n\n`;
        matched.slice(0, 5).forEach((item, index) => {
            const title = item.title || item.project_name || 'Untitled';
            const project = item.project_name || item.project || 'Web3 Project';
            const reward = item.reward || 'TBA';
            const url = `https://creatorchain.site/opportunity.html?id=${item.id}`;
            responseText += `${index + 1}. <b>${project}</b> | ${title}\n💰 <b>Reward:</b> ${reward}\n🔗 <a href="${url}">VIEW & APPLY</a>\n\n`;
        });
        await sendSimpleMessage(chatId, responseText);
    } catch (err) {
        console.error('Error in /my_opportunities:', err);
        await sendSimpleMessage(chatId, `❌ <b>Error:</b> Could not fetch matching opportunities.`);
    }
  } else if (command === '/my_score' || command === '/myscore') {
    try {
        if (!SUPABASE_KEY) throw new Error('SUPABASE_KEY is missing');
        const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };
        const profileResp = await axios.get(`${SUPABASE_URL}/rest/v1/user_profiles?telegram_id=eq.${chatId}`, { headers });
        const profile = profileResp.data && profileResp.data.length > 0 ? profileResp.data[0] : null;

        if (!profile) {
            await sendSimpleMessage(chatId, `🚫 <b>Account Not Linked</b>\n\nPlease connect your Telegram handle in your CreatorChain settings page and run /start first.`);
            return res.status(200).send('OK');
        }

        const score = profile.reputation_score || profile.score || 0;
        await sendSimpleMessage(chatId, `📊 <b>YOUR CREATORCHAIN PROFILE</b>\n\n👤 <b>Name:</b> ${profile.name || 'User'}\n🌟 <b>Reputation Score:</b> <code>${score}</code>\n🛠 <b>Skills:</b> ${profile.skills ? profile.skills.join(', ') : 'None listed'}\n\nKeep contributing to Web3 projects to grow your on-chain reputation score!`);
    } catch (err) {
        console.error('Error in /my_score:', err);
        await sendSimpleMessage(chatId, `❌ <b>Error:</b> Could not retrieve profile score.`);
    }
  } else if (command === '/how_it_works' || command === '/how_it_work') {
    const textExplanation = `ℹ️ <b>HOW CREATORCHAIN WORKS</b>\n\n` +
        `CreatorChain is a decentralized platform connecting Web3 projects with skilled creators, developers, and ambassadors.\n\n` +
        `1️⃣ <b>Apply for Opportunities:</b> Find bounties, design gigs, developer tasks, or community roles using /opportunities.\n` +
        `2️⃣ <b>Complete Tasks:</b> Submit your work on the platform. Once approved by the project team, you get your rewards!\n` +
        `3️⃣ <b>Earn Reputation Score:</b> Each approved contribution increases your on-chain <b>Reputation Score</b>.\n` +
        `4️⃣ <b>Unlock Premium Perks:</b> Higher reputation scores build trust, unlock higher-paying exclusive gigs, and double your chances of winning bounties!\n\n` +
        `🔗 Visit <a href="https://creatorchain.site/">CreatorChain Web Platform</a> to manage your profile and view full details.`;
    await sendSimpleMessage(chatId, textExplanation);
  } else if (command === '/help') {
     const helpText = `🛠 <b>CREATORCHAIN BOT HELP</b>\n\n` +
                      `Available commands:\n` +
                      `/opportunities - View all active opportunities\n` +
                      `/new_opportunities - View the newest Web3 opportunities\n` +
                      `/my_opportunities - Match opportunities specifically to your profile skills\n` +
                      `/my_score - View your reputation score and linked status\n` +
                      `/how_it_works - Learn how CreatorChain reputation and gigs work\n` +
                      `/chatid - Get your Telegram Chat ID\n` +
                      `/help - Show this help message\n\n` +
                      `💬 You can also chat with me by asking any custom question in plain text!`;
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
        const headers = { 
            'apikey': SUPABASE_KEY, 
            'Authorization': `Bearer ${SUPABASE_KEY}`
        };

        // 1. Verify User Profile exists (AI is exclusive to signed-in users)
        const profileResp = await axios.get(`${SUPABASE_URL}/rest/v1/user_profiles?telegram_id=eq.${chatId}`, { headers });
        const profile = profileResp.data && profileResp.data.length > 0 ? profileResp.data[0] : null;

        if (!profile) {
            await sendSimpleMessage(chatId, `🚫 <b>Account Not Linked</b>\n\nThe AI Assistant is an exclusive feature for registered CreatorChain users.\n\nPlease log in to <a href="https://creatorchain.site/">CreatorChain</a>, save your Telegram Handle in your profile, and type /start here to link your account!`);
            return;
        }

        // 2. Check Q&A Cache for general questions
        const cacheable = isCacheableQuery(userMessage);
        if (cacheable) {
            try {
                const cacheResp = await axios.post(
                    `${SUPABASE_URL}/rest/v1/rpc/match_qna_cache`, 
                    { user_query: userMessage },
                    { headers }
                );
                const cachedResult = cacheResp.data;
                if (cachedResult && cachedResult.length > 0) {
                    console.log(`[Q&A Cache Hit] Match found: "${cachedResult[0].question}"`);
                    await sendSimpleMessage(chatId, cachedResult[0].answer);
                    return;
                }
            } catch (cacheErr) {
                console.error('Q&A Cache lookup error:', cacheErr.response?.data || cacheErr.message);
            }
        }

        // 3. Cache Miss / Non-cacheable: Proceed to Gemini
        await sendSimpleMessage(chatId, `🤖 <i>Thinking... Let me check the latest opportunities for you.</i>`);

        let allItems = await getCachedOpportunities(headers);

        let contextText = "Active Opportunities:\n";
        allItems.slice(0, 20).forEach((item, index) => {
            const title = item.title || item.project_name || 'Untitled';
            const project = item.project_name || item.project || 'Web3 Project';
            const reward = item.reward || 'TBA';
            const id = item.id;
            const url = `https://creatorchain.site/opportunity.html?id=${id}`;
            contextText += `- [${project}] ${title} | Reward: ${reward} | Link: ${url}\n`;
        });

        let userContext = profile 
            ? `The user you are talking to is named ${profile.name || 'Anonymous'}. Their Web3 skills are ${profile.skills ? profile.skills.join(', ') : 'Creator'}. Their current CreatorChain Reputation Score is ${profile.reputation_score || profile.score || 0}.` 
            : `The user has not linked their CreatorChain profile to this Telegram account yet. They can do so by making sure their Telegram Handle is saved on their CreatorChain web profile and typing /start here.`;

        const systemInstruction = `You are the CreatorChain Web3 Job Assistant Telegram Bot. 
A user has sent you a message. 

Here is what you know about CreatorChain:
CreatorChain is a decentralized platform connecting Web3 projects with skilled creators, developers, and ambassadors. Users apply for bounties, gigs, and full-time roles. When they successfully complete tasks and get approved by the project, their on-chain Reputation Score increases. Higher reputation unlocks exclusive, higher-paying opportunities and builds trust in the Web3 ecosystem.

${userContext}

Here are the current active Web3 job opportunities and bounties:
${contextText}

Answer the user's question concisely and accurately based on the data provided. 
- If they ask about their reputation, give them their real score based on the context above. 
- If they ask for opportunities based on specific criteria (e.g., "$1000", "frontend developer", "content writer"), filter the active opportunities list and ONLY show the ones that match their request.
- If they ask for opportunities "based on my skills" or "for me", cross-reference the active opportunities with their Web3 skills from their profile and recommend the best matches, explaining why they are a good fit.
- If there are no perfect matches, politely inform them and suggest the closest alternatives.

Format your response using ONLY Telegram-compatible HTML tags: <b>, <i>, <u>, <s>, <a>, <code>, <pre>. Do not use markdown like **bold** or *italic* or markdown links [text](url). Use <b>bold</b> and <a href="url">text</a> instead. Keep the tone helpful, engaging, and professional.`;

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: systemInstruction
        });

        const result = await model.generateContent(userMessage);
        
        let aiResponse = result.response.text();
        
        // Minor cleanup if Gemini uses markdown by accident
        aiResponse = aiResponse.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        aiResponse = aiResponse.replace(/\*(.*?)\*/g, '<i>$1</i>');
        // Clean up markdown links that might have slipped through: [text](url) -> <a href="url">text</a>
        aiResponse = aiResponse.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        
        await sendSimpleMessage(chatId, aiResponse);

        // 4. Save to Q&A Cache if cacheable
        if (cacheable) {
            const keywords = extractKeywords(userMessage);
            if (keywords) {
                try {
                    await axios.post(
                        `${SUPABASE_URL}/rest/v1/bot_qna_cache`,
                        {
                            question: userMessage,
                            answer: aiResponse,
                            keywords: keywords
                        },
                        { headers }
                    );
                    console.log(`[Q&A Cache Save] Saved new Q&A with keywords: "${keywords}"`);
                } catch (saveErr) {
                    console.error('Failed to save Q&A to cache:', saveErr.response?.data || saveErr.message);
                }
            }
        }

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

function extractKeywords(text) {
    const stopwords = new Set([
        'what', 'is', 'my', 'how', 'to', 'the', 'a', 'an', 'and', 'or', 'but', 'for', 
        'with', 'about', 'in', 'on', 'at', 'of', 'by', 'from', 'this', 'that', 'these', 
        'those', 'i', 'you', 'he', 'she', 'they', 'we', 'me', 'us', 'him', 'her', 'them',
        'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'shall', 'may',
        'might', 'must', 'tell', 'show', 'give', 'get', 'want', 'please', 'thanks', 'thank'
    ]);
    
    // Clean text: lowercase and remove non-alphanumeric (except spaces)
    const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    // Split into words, filter out stopwords and short/empty words
    const words = cleaned.split(/\s+/)
        .map(w => w.trim())
        .filter(w => w.length > 2 && !stopwords.has(w));
        
    // Return unique keywords joined by comma
    return [...new Set(words)].join(',');
}

function isCacheableQuery(text) {
    const normalized = text.toLowerCase();
    
    // Personal queries (e.g. referencing 'my reputation', 'my skills', 'my profile', etc.)
    if (/\b(my|mine|reputation|score|skills|profile)\b/i.test(normalized)) {
        return false;
    }
    
    // Live jobs queries
    if (/\b(opportunity|opportunities|job|jobs|bounty|bounties|gig|gigs|listing|listings|live|apply|latest)\b/i.test(normalized)) {
        return false;
    }
    
    return true;
}
