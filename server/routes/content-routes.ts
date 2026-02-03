// server/routes/content-routes.ts
// Routes for user content upload pipeline (notes and documents)

import { Router } from 'express';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service';
import {
  processContent,
  getUserContentList,
  deleteUserContent,
  canUserAddContent,
  createUserContent,
  extractDocxText
} from '../services/user-content-service';

const router = Router();

// Configure multer for file uploads (memory storage, 500KB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 // 500KB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.md', '.json', '.docx'];
    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported. Allowed: ${allowedTypes.join(', ')}`));
    }
  }
});

/**
 * Helper to get both VASA user ID and auth user ID
 */
async function getUserIds(authUserId: string): Promise<{ vasaUserId: string; authUserId: string } | null> {
  const { data: vasaUser, error } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error || !vasaUser) {
    console.error('[Content] Failed to look up VASA user:', error?.message);
    return null;
  }

  return { vasaUserId: vasaUser.id, authUserId };
}

/**
 * POST /api/content/upload - Upload a file (multipart/form-data)
 * Accepts .txt, .md, .json, .docx files up to 500KB
 */
router.post('/upload', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const authUserId = req.user.id;
    console.log('[Content] File upload request from auth user:', authUserId);

    const userIds = await getUserIds(authUserId);
    if (!userIds) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check content limit
    const canAdd = await canUserAddContent(userIds.vasaUserId);
    if (!canAdd) {
      return res.status(429).json({
        error: 'Content limit reached',
        message: 'You have reached the maximum of 20 items. Please delete some content to upload more.'
      });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
    let rawText = '';

    // Extract text based on file type
    if (ext === '.docx') {
      rawText = await extractDocxText(file.buffer);
    } else {
      // .txt, .md, .json - read as UTF-8 text
      rawText = file.buffer.toString('utf-8');
    }

    if (!rawText || rawText.trim().length < 20) {
      return res.status(400).json({ error: 'File content is empty or too short' });
    }

    // Create user_content record
    const title = req.body.title || file.originalname.replace(/\.[^/.]+$/, '');
    const content = await createUserContent({
      userId: userIds.vasaUserId,
      contentType: 'document',
      source: 'web_upload',
      title,
      originalFilename: file.originalname,
      rawText,
      fileType: ext.substring(1), // Remove leading dot
      fileSize: file.size
    });

    if (!content) {
      return res.status(500).json({ error: 'Failed to create content record' });
    }

    console.log(`[Content] Created document record ${content.id}, processing async...`);

    // Process asynchronously - don't await
    processContent(content.id, userIds.authUserId).catch(err => {
      console.error('[Content] Async processing failed:', err.message);
    });

    // Return 202 Accepted immediately
    res.status(202).json({
      id: content.id,
      message: 'File uploaded and processing started',
      status: 'pending'
    });

  } catch (error: any) {
    console.error('[Content] Upload error:', error.message);

    if (error.message?.includes('File too large')) {
      return res.status(413).json({ error: 'File too large. Maximum size is 500KB.' });
    }
    if (error.message?.includes('not supported')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * POST /api/content/note - Submit a quick note
 * Body: { text: string, title?: string }
 */
router.post('/note', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserId = req.user.id;
    const { text, title } = req.body;

    console.log('[Content] Quick note request from auth user:', authUserId);

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (text.length > 10000) {
      return res.status(400).json({ error: 'Text exceeds maximum length of 10,000 characters' });
    }

    if (text.trim().length < 10) {
      return res.status(400).json({ error: 'Text is too short' });
    }

    const userIds = await getUserIds(authUserId);
    if (!userIds) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check content limit
    const canAdd = await canUserAddContent(userIds.vasaUserId);
    if (!canAdd) {
      return res.status(429).json({
        error: 'Content limit reached',
        message: 'You have reached the maximum of 20 items. Please delete some content to add more.'
      });
    }

    // Create user_content record
    const noteTitle = title || `Note from ${new Date().toLocaleDateString()}`;
    const content = await createUserContent({
      userId: userIds.vasaUserId,
      contentType: 'note',
      source: 'quick_note',
      title: noteTitle,
      rawText: text,
      fileSize: text.length
    });

    if (!content) {
      return res.status(500).json({ error: 'Failed to create note' });
    }

    console.log(`[Content] Created note record ${content.id}, processing async...`);

    // Process asynchronously - don't await
    processContent(content.id, userIds.authUserId).catch(err => {
      console.error('[Content] Async processing failed:', err.message);
    });

    // Return 202 Accepted immediately
    res.status(202).json({
      id: content.id,
      message: 'Note saved and processing started',
      status: 'pending'
    });

  } catch (error: any) {
    console.error('[Content] Note error:', error.message);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

/**
 * GET /api/content/list - List user's content
 */
router.get('/list', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserId = req.user.id;

    const userIds = await getUserIds(authUserId);
    if (!userIds) {
      return res.status(404).json({ error: 'User not found' });
    }

    const contentList = await getUserContentList(userIds.vasaUserId);

    res.json({
      items: contentList,
      count: contentList.length,
      limit: 20
    });

  } catch (error: any) {
    console.error('[Content] List error:', error.message);
    res.status(500).json({ error: 'Failed to fetch content list' });
  }
});

/**
 * DELETE /api/content/:id - Delete a content item
 */
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUserId = req.user.id;
    const contentId = req.params.id;

    if (!contentId) {
      return res.status(400).json({ error: 'Content ID is required' });
    }

    const userIds = await getUserIds(authUserId);
    if (!userIds) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deleted = await deleteUserContent(contentId, userIds.vasaUserId);

    if (!deleted) {
      return res.status(404).json({ error: 'Content not found or not owned by user' });
    }

    res.json({ success: true, message: 'Content deleted' });

  } catch (error: any) {
    console.error('[Content] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete content' });
  }
});

export default router;
