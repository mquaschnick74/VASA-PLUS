         import { Router } from 'express';
         import { retrieve, extractKeywordsFromMessage } from '../services/kb-retrieval-service';
         import { supabase } from '../services/supabase-service';

         const router = Router();

         /**
          * POST /api/kb/retrieve
          * Main endpoint for retrieving therapeutic protocols
          * Called from use-vapi.ts at call-start
          */
         router.post('/retrieve', async (req, res) => {
           try {
             const { userId, cssStage, baseline, keywords, agentName } = req.body;

             // Validate required fields
             if (!userId) {
               return res.status(400).json({ 
                 error: 'Missing required field: userId',
                 protocols: '',
                 documentCount: 0
               });
             }

             console.log(`📥 KB retrieve request:`, {
               userId: userId.substring(0, 8),
               cssStage: cssStage || 'none',
               baseline: baseline || false,
               keywordCount: keywords?.length || 0,
               agentName: agentName || 'none'
             });

             // Call retrieval service
             const result = await retrieve({
               userId,
               cssStage: cssStage || 'pointed_origin',
               baseline: baseline || false,
               keywords: keywords || [],
               agentName: agentName || undefined
             });

             // Return formatted protocols
             res.json({
               protocols: result.protocols,
               documentCount: result.documentCount,
               success: true
             });

           } catch (error) {
             console.error('❌ KB retrieve endpoint error:', error);
             res.status(500).json({ 
               error: 'KB retrieval failed',
               protocols: '',
               documentCount: 0,
               success: false
             });
           }
         });

         /**
          * POST /api/kb/retrieve-from-message
          * Extract keywords from user message and retrieve relevant protocols
          * Optional: Can be used in conversation-update webhook
          */
         router.post('/retrieve-from-message', async (req, res) => {
           try {
             const { userId, userMessage, cssStage, agentName } = req.body;

             if (!userId || !userMessage) {
               return res.status(400).json({ 
                 error: 'Missing required fields: userId, userMessage',
                 protocols: '',
                 documentCount: 0
               });
             }

             // Extract keywords from user message
             const keywords = extractKeywordsFromMessage(userMessage);

             console.log(`📥 KB retrieve from message:`, {
               userId: userId.substring(0, 8),
               messageLength: userMessage.length,
               extractedKeywords: keywords.slice(0, 5) // Log first 5 keywords
             });

             // Call retrieval service with extracted keywords
             const result = await retrieve({
               userId,
               cssStage: cssStage || 'pointed_origin',
               baseline: false,
               keywords,
               agentName: agentName || undefined
             });

             res.json({
               protocols: result.protocols,
               documentCount: result.documentCount,
               extractedKeywords: keywords,
               success: true
             });

           } catch (error) {
             console.error('❌ KB retrieve from message error:', error);
             res.status(500).json({ 
               error: 'KB retrieval failed',
               protocols: '',
               documentCount: 0,
               success: false
             });
           }
         });

         /**
          * GET /api/kb/documents
          * Get all KB documents (for admin/debugging)
          * Optional: Can add authentication later
          */
         router.get('/documents', async (req, res) => {
           try {
             const { data: documents, error } = await supabase
               .from('knowledge_base_documents')
               .select('*')
               .order('priority', { ascending: false });

             if (error) {
               throw error;
             }

             res.json({
               documents: documents || [],
               count: documents?.length || 0,
               success: true
             });

           } catch (error) {
             console.error('❌ KB documents fetch error:', error);
             res.status(500).json({ 
               error: 'Failed to fetch documents',
               documents: [],
               count: 0,
               success: false
             });
           }
         });

         /**
          * GET /api/kb/documents/:documentId
          * Get single KB document by document_id
          * Optional: For debugging/admin
          */
         router.get('/documents/:documentId', async (req, res) => {
           try {
             const { documentId } = req.params;

             const { data: document, error } = await supabase
               .from('knowledge_base_documents')
               .select('*')
               .eq('document_id', documentId)
               .single();

             if (error) {
               throw error;
             }

             if (!document) {
               return res.status(404).json({ 
                 error: 'Document not found',
                 success: false
               });
             }

             res.json({
               document,
               success: true
             });

           } catch (error) {
             console.error('❌ KB document fetch error:', error);
             res.status(500).json({ 
               error: 'Failed to fetch document',
               success: false
             });
           }
         });

         /**
          * POST /api/kb/documents
          * Create new KB document (for admin)
          * Optional: Add authentication/authorization
          */
         router.post('/documents', async (req, res) => {
           try {
             const documentData = req.body;

             // Validate required fields
             const requiredFields = ['document_id', 'document_type', 'title', 'content', 'token_count'];
             for (const field of requiredFields) {
               if (!documentData[field]) {
                 return res.status(400).json({ 
                   error: `Missing required field: ${field}`,
                   success: false
                 });
               }
             }

             // Insert document
             const { data, error } = await supabase
               .from('knowledge_base_documents')
               .insert(documentData)
               .select()
               .single();

             if (error) {
               throw error;
             }

             console.log(`✅ Created KB document: ${documentData.document_id}`);

             res.json({
               document: data,
               success: true
             });

           } catch (error) {
             console.error('❌ KB document creation error:', error);
             res.status(500).json({ 
               error: 'Failed to create document',
               success: false
             });
           }
         });

         /**
          * PUT /api/kb/documents/:documentId
          * Update KB document (for admin)
          * Optional: Add authentication/authorization
          */
         router.put('/documents/:documentId', async (req, res) => {
           try {
             const { documentId } = req.params;
             const updates = req.body;

             // Update document
             const { data, error } = await supabase
               .from('knowledge_base_documents')
               .update({
                 ...updates,
                 updated_at: new Date().toISOString()
               })
               .eq('document_id', documentId)
               .select()
               .single();

             if (error) {
               throw error;
             }

             if (!data) {
               return res.status(404).json({ 
                 error: 'Document not found',
                 success: false
               });
             }

             console.log(`✅ Updated KB document: ${documentId}`);

             res.json({
               document: data,
               success: true
             });

           } catch (error) {
             console.error('❌ KB document update error:', error);
             res.status(500).json({ 
               error: 'Failed to update document',
               success: false
             });
           }
         });

         /**
          * DELETE /api/kb/documents/:documentId
          * Soft delete KB document (sets is_active = false)
          * Optional: Add authentication/authorization
          */
         router.delete('/documents/:documentId', async (req, res) => {
           try {
             const { documentId } = req.params;

             // Soft delete by setting is_active = false
             const { data, error } = await supabase
               .from('knowledge_base_documents')
               .update({ 
                 is_active: false,
                 updated_at: new Date().toISOString()
               })
               .eq('document_id', documentId)
               .select()
               .single();

             if (error) {
               throw error;
             }

             if (!data) {
               return res.status(404).json({ 
                 error: 'Document not found',
                 success: false
               });
             }

             console.log(`✅ Soft deleted KB document: ${documentId}`);

             res.json({
               message: 'Document deactivated',
               success: true
             });

           } catch (error) {
             console.error('❌ KB document deletion error:', error);
             res.status(500).json({ 
               error: 'Failed to delete document',
               success: false
             });
           }
         });

         export default router;