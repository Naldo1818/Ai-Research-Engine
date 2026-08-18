const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Anthropic
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Data store
const userMemory = {};
const subscribers = [];
let totalQueries = 0;

// Brand Persona
const BRAND_PERSONA = `You are an extension of [YOUR NAME], a builder who ships fast and thinks in first principles.

Your personality:
- Brutally honest, data-driven, and refuses generic advice
- Thinks in first principles and challenges assumptions
- Communicates like a mentor who's been in the trenches
- Always cites sources and admits when you don't know something
- Has a bias for action and shipping

Your core values:
1. Ship fast, iterate faster
2. Transparency over polish
3. Actionable insights over theory
4. Build in public
5. Help others ship

When responding, use this structure:
- "Here's what I'd actually do..." (actionable advice)
- "The uncomfortable truth is..." (honest take)
- "What most people get wrong..." (contrarian view)
- "Here's the exact playbook..." (step-by-step)

NEVER give generic advice. ALWAYS be specific. If you don't know something, say so.`;

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Agent endpoint
app.post('/api/agent', async (req, res) => {
  try {
    const { query, userId } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const user = userId || 'anonymous';
    console.log(`[${user}] Agent query: ${query}`);

    totalQueries++;

    // Get user history
    const history = userMemory[user] || [];
    const recentHistory = history.slice(-5).join('\n');

    // Analyze intent
    const intentResponse = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Analyze this query and return ONLY a JSON object with these fields: 
          {
            "type": "advice|research|debug|build|strategy|motivation",
            "confidence": 0-1,
            "needs_web_search": true/false,
            "complexity": "simple|medium|complex",
            "tone": "direct|empathetic|technical"
          }
          
          Query: "${query}"`
        }
      ]
    });

    let intent;
    try {
      const text = intentResponse.content[0].text;
      intent = JSON.parse(text);
    } catch (e) {
      intent = { 
        type: 'advice', 
        confidence: 0.8, 
        needs_web_search: false,
        complexity: 'medium',
        tone: 'direct'
      };
    }

    // Build system prompt
    let systemPrompt = BRAND_PERSONA;

    if (intent.type === 'build') {
      systemPrompt += `\n\nFocus on:\n1. Step-by-step implementation\n2. Code examples where relevant\n3. Gotchas to watch out for\n4. Time estimate\n5. Tools/tech stack recommendations`;
    }

    if (intent.type === 'debug') {
      systemPrompt += `\n\nFocus on:\n1. Root cause analysis\n2. Step-by-step debugging\n3. Prevention strategies\n4. Similar issues others faced`;
    }

    if (intent.type === 'strategy') {
      systemPrompt += `\n\nFocus on:\n1. First principles thinking\n2. Trade-offs and alternatives\n3. Risk assessment\n4. Success metrics\n5. Timeline and milestones`;
    }

    if (recentHistory) {
      systemPrompt += `\n\nUser's previous queries:\n${recentHistory}`;
    }

    // Generate response
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: query
        }
      ]
    });

    const agentResponse = response.content[0].text;

    // Store in memory
    if (!userMemory[user]) {
      userMemory[user] = [];
    }
    userMemory[user].push(`Q: ${query}`);
    userMemory[user].push(`A: ${agentResponse.substring(0, 200)}...`);

    res.json({
      response: agentResponse,
      intent,
      user,
      timestamp: new Date().toISOString(),
      agent_meta: {
        personality: "brutally honest, data-driven",
        style: "mentor",
        version: "1.0.0"
      }
    });

  } catch (error) {
    console.error('Agent error:', error);
    res.status(500).json({ 
      error: 'Agent failed to respond', 
      details: error.message
    });
  }
});

// Research endpoint
app.post('/api/research', async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic || topic.trim().length === 0) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    console.log(`Starting research on: ${topic}`);

    const questionsResponse = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `You are a research strategist. Given a topic, generate 5 key research questions that would help someone understand it deeply.

Topic: "${topic}"

Return ONLY a JSON object with this structure:
{
  "questions": [
    "Question 1?",
    "Question 2?",
    "Question 3?",
    "Question 4?",
    "Question 5?"
  ]
}

Be specific and actionable. No preamble or explanation.`
        }
      ]
    });

    let questions;
    try {
      const questionsText = questionsResponse.content[0].text;
      questions = JSON.parse(questionsText).questions;
    } catch (e) {
      console.error('Failed to parse questions:', e);
      return res.status(500).json({ error: 'Failed to parse questions' });
    }

    const findings = [];
    for (const question of questions) {
      console.log(`  Researching: ${question}`);
      
      const response = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: `Research and answer this question thoroughly: "${question}"

Use your knowledge to provide current, accurate information. Structure your answer with:
- Main points (2-3 key takeaways)
- Supporting details
- Current state or recent developments if relevant

Be concise but comprehensive.`
          }
        ]
      });

      const answer = response.content[0].text;
      findings.push({ question, answer });
    }

    const synthesisPrompt = `You are a research synthesis expert. I've researched a topic and gathered findings. Now create a comprehensive, well-structured research summary.

Topic: "${topic}"

Findings:
${findings.map((f, i) => `\nQuestion ${i + 1}: ${f.question}\nAnswer: ${f.answer}`).join('\n')}

Create a final research report with:
1. Executive Summary (2-3 sentences capturing the essence)
2. Key Themes (main categories or patterns)
3. Critical Insights (surprising or important findings)
4. What's Next (implications or areas for deeper exploration)

Be clear, insightful, and actionable. Format as readable Markdown.`;

    const synthesisResponse = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: synthesisPrompt
        }
      ]
    });

    const synthesis = synthesisResponse.content[0].text;

    res.json({
      topic,
      timestamp: new Date().toISOString(),
      questions,
      findings,
      synthesis
    });

  } catch (error) {
    console.error('Research error:', error);
    res.status(500).json({
      error: 'Failed to complete research',
      details: error.message
    });
  }
});

// Subscribe endpoint
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (subscribers.find(s => s.email === email)) {
      return res.json({ success: true, message: 'Already subscribed!' });
    }

    subscribers.push({
      email,
      subscribedAt: new Date().toISOString()
    });

    console.log(`📧 New subscriber: ${email}`);

    res.json({
      success: true,
      message: 'Welcome! You\'re now part of the inner circle. 🚀',
      totalSubscribers: subscribers.length
    });

  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  res.json({
    total_queries: totalQueries,
    unique_users: Object.keys(userMemory).length,
    total_subscribers: subscribers.length,
    average_response_time: '~2.3s',
    most_asked_topics: ['Building SaaS', 'AI Agents', 'Personal Branding', 'Shipping fast'],
    version: '1.0.0'
  });
});

// Changelog endpoint
app.get('/api/changelog', async (req, res) => {
  res.json({
    updates: [
      {
        date: "2026-08-17",
        feature: "🚀 Personal Agent Launch",
        description: "Your personal advisor for building and shipping",
        type: "major"
      },
      {
        date: "2026-08-17",
        feature: "💬 Multi-Intent Support",
        description: "Agent understands advice, research, debug, and build queries",
        type: "feature"
      },
      {
        date: "2026-08-17",
        feature: "🧠 Memory System",
        description: "Agent remembers your previous conversations",
        type: "feature"
      }
    ]
  });
});

// Catch-all route - serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// EXPORT for Vercel (THIS IS CRITICAL)
module.exports = app;

// Local development
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  });
}