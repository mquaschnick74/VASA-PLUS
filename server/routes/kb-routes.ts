POST /api/kb/retrieve
- Body: { userId, cssStage?, keywords?, agentName? }
- Returns: { protocols: string, documentCount: number }
- Used by: use-vapi.ts at call-start

GET /api/kb/documents (optional - for admin)
- Returns: All KB documents
- Used by: Future admin panel

POST /api/kb/documents (optional - for admin)
- Creates new KB document
- Used by: Future admin panel