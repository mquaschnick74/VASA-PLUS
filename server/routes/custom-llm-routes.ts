import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

router.post('/chat/completions', async (req: Request, res: Response) => {
  try {
    // ===== STEP A: DIAGNOSTIC LOGGING =====
    console.log('🔵 [CUSTOM-LLM] Request received');
    console.log('🔵 [CUSTOM-LLM] Top-level keys:', Object.keys(req.body));
    console.log('🔵 [CUSTOM-LLM] model:', req.body.model);
    console.log('🔵 [CUSTOM-LLM] stream:', req.body.stream);
    console.log('🔵 [CUSTOM-LLM] temperature:', req.body.temperature);
    console.log('🔵 [CUSTOM-LLM] messages count:', req.body.messages?.length);

    if (req.body.messages) {
      console.log('🔵 [CUSTOM-LLM] Message roles:', req.body.messages.map((m: any) => m.role));
    }

    console.log('🔵 [CUSTOM-LLM] req.body.call:', JSON.stringify(req.body.call || 'NOT PRESENT'));
    console.log('🔵 [CUSTOM-LLM] req.body.metadata:', JSON.stringify(req.body.metadata || 'NOT PRESENT'));

    const systemMsg = req.body.messages?.[0];
    if (systemMsg?.role === 'system') {
      const hasMarker = systemMsg.content?.includes('VASA_CALL_ID:');
      console.log('🔵 [CUSTOM-LLM] System message has VASA_CALL_ID marker:', hasMarker);
      if (hasMarker) {
        const callId = systemMsg.content.split('VASA_CALL_ID:')[1]?.split('\n')[0]?.trim();
        console.log('🔵 [CUSTOM-LLM] Extracted callId from marker:', callId);
      }
    }

    if (req.body.tools) {
      console.log('🔵 [CUSTOM-LLM] Tools count:', req.body.tools.length);
      console.log('🔵 [CUSTOM-LLM] Tool names:', req.body.tools.map((t: any) => t.function?.name || t.name || 'unknown'));
    }

    console.log('🔵 [CUSTOM-LLM] Authorization header present:', !!req.headers['authorization']);
    console.log('🔵 [CUSTOM-LLM] Content-Type:', req.headers['content-type']);
    const customHeaders = Object.keys(req.headers).filter(h => h.startsWith('x-'));
    if (customHeaders.length > 0) {
      console.log('🔵 [CUSTOM-LLM] Custom headers:', customHeaders.map(h => `${h}: ${req.headers[h]}`));
    }

    // ===== STEP B: HARDCODED SSE RESPONSE =====
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const words = ['Hello,', 'this', 'is', 'the', 'custom', 'L L M', 'endpoint', 'speaking.', 'If', 'you', 'can', 'hear', 'me,', 'the', 'plumbing', 'works.'];

    // First chunk with role
    const firstChunk = {
      id: 'test-123',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }]
    };
    res.write(`data: ${JSON.stringify(firstChunk)}\n\n`);
    await sleep(50);

    // Content chunks
    for (const word of words) {
      const chunk = {
        id: 'test-123',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: word + ' ' }, finish_reason: null }]
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      await sleep(50);
    }

    // Finish chunk
    const finishChunk = {
      id: 'test-123',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
    };
    res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();

    console.log('🔵 [CUSTOM-LLM] Response streamed successfully');
  } catch (error: any) {
    console.error('🔴 [CUSTOM-LLM] Error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Custom LLM endpoint error', message: error.message });
    }
  }
});

export default router;
