import { Router } from 'express';
import type { Request, Response } from 'express';
import OpenAI from 'openai';

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post('/chat/completions', async (req: Request, res: Response) => {
  const callId = req.body.call?.id || 'unknown';
  const userId = req.body.metadata?.userId || 'unknown';
  const agentName = req.body.metadata?.agentName || 'unknown';
  const numUserTurns = req.body.metadata?.numUserTurns || 0;
  const numAssistantTurns = req.body.metadata?.numAssistantTurns || 0;

  console.log(`🔵 [CUSTOM-LLM] Request: call=${callId} user=${userId} agent=${agentName} turns=${numUserTurns}/${numAssistantTurns} messages=${req.body.messages?.length || 0}`);

  try {
    const completion = await openai.chat.completions.create({
      model: req.body.model || 'gpt-4o',
      messages: req.body.messages,
      temperature: req.body.temperature ?? 0.7,
      max_tokens: req.body.max_tokens ?? 300,
      stream: true,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of completion) {
      const data = JSON.stringify(chunk);
      res.write(`data: ${data}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

    console.log(`🔵 [CUSTOM-LLM] Response streamed: call=${callId} turns=${numUserTurns}/${numAssistantTurns}`);
  } catch (error: any) {
    console.error(`🔴 [CUSTOM-LLM] OpenAI error: ${error.message}`, { callId, userId, agentName });

    if (!res.headersSent) {
      res.status(500).json({ error: 'LLM request failed', message: error.message });
    } else {
      // Mid-stream failure — send graceful recovery message
      try {
        const errorChunk = {
          id: 'error',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: ' I apologize, I experienced a brief interruption. Could you repeat what you just said?' }, finish_reason: null }]
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        const finishChunk = {
          id: 'error',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
        };
        res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (e) {
        // If we can't even write the error, just end
        res.end();
      }
    }
  }
});

export default router;
