import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export default async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { submission_link, opportunity_title, opportunity_description, skills_required, reward } = req.body;

  if (!submission_link) {
    return res.status(400).json({ error: 'submission_link is required' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an AI Submission Coach for CreatorChain, a Web3 creator platform. Analyze this submission and provide actionable feedback.

OPPORTUNITY CONTEXT:
- Title: ${opportunity_title || 'Web3 Content Bounty'}
- Description: ${opportunity_description || 'Create engaging content about the project'}
- Skills Required: ${skills_required || 'Content Creation, Community'}
- Reward: ${reward || 'TBA'}

SUBMISSION LINK: ${submission_link}

Based on the submission URL format and context, analyze:

1. CONTENT TYPE DETECTION — Determine what type of content this is (X thread, YouTube video, Medium article, GitHub repo, Reddit post, Instagram, etc.)

2. QUALITY SIGNALS — Based on the URL pattern and platform:
   - Is this a proper submission link? (not a profile page, not a homepage)
   - Is the platform appropriate for the opportunity?
   - Does the URL suggest original content?

3. WIN PROBABILITY — Estimate a realistic win probability (0-100%) based on:
   - Content type match with opportunity requirements
   - Platform relevance
   - Historical patterns (threads on X and long-form articles typically win more)
   - Note: Without seeing actual content, base this on format and platform signals

4. IMPROVEMENT TIPS — Give 3-5 specific, actionable suggestions to increase win chances

STRICT RULES:
- Return ONLY valid JSON
- Be encouraging but honest
- Score should be realistic (most first submissions: 30-50%, strong submissions: 60-80%)
- Tips should be specific to the content type and opportunity

JSON FORMAT:
{
  "content_type": "x_thread | youtube_video | medium_article | github_repo | reddit_post | instagram_post | other",
  "content_type_label": "X Thread",
  "platform_match": "strong | moderate | weak",
  "is_valid_submission": true,
  "win_probability": 55,
  "quality_grade": "A | B | C | D",
  "feedback_summary": "One-line summary of the submission quality",
  "strengths": ["strength 1", "strength 2"],
  "improvements": [
    {
      "tip": "Short actionable tip",
      "detail": "Why this matters and how to do it",
      "impact": "high | medium | low"
    }
  ],
  "pro_tip": "One expert-level insight that most creators miss"
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Clean AI output
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const analysis = JSON.parse(text);

    return res.status(200).json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('AI Coach Error:', error.message);
    return res.status(500).json({
      error: 'AI analysis failed',
      fallback: {
        content_type: 'unknown',
        content_type_label: 'Content',
        platform_match: 'moderate',
        is_valid_submission: true,
        win_probability: 45,
        quality_grade: 'B',
        feedback_summary: 'Submission looks valid. Make sure your content is original and follows the opportunity guidelines.',
        strengths: ['Submission link provided', 'Active participation'],
        improvements: [
          { tip: 'Add more depth to your content', detail: 'Top winners typically create detailed, well-researched content.', impact: 'high' },
          { tip: 'Tag the project account', detail: 'Mentioning the official project handle increases visibility.', impact: 'medium' },
          { tip: 'Include relevant hashtags', detail: 'Web3 hashtags help your content reach the right audience.', impact: 'low' }
        ],
        pro_tip: 'Consistency beats perfection. Submit to every relevant bounty — your win rate improves with each attempt.'
      }
    });
  }
};
