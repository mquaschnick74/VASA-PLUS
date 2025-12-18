# PCA/PCP Knowledge Base Documents

This directory contains documents that are ingested into the RAG (Retrieval-Augmented Generation) system for the VASA Sensing Layer.

## Directory Structure

```
docs/
├── pca/                    # PCA/PCP theory documents
│   ├── thend-framework.txt
│   ├── css-stages.txt
│   ├── register-theory.txt
│   └── cvdc-ibm-theory.txt
├── examples/               # Therapy session examples
│   ├── dom-session.txt
│   └── eve-case-study.txt
├── techniques/             # Therapeutic techniques
│   ├── hsfb-protocol.txt
│   ├── register-movement.txt
│   └── symbolic-intervention.txt
└── guidelines/             # VASA personality guidelines
    ├── vasa-personality.txt
    └── therapeutic-boundaries.txt
```

## Document Types

- **theory**: Core PCA/PCP methodology concepts
- **example**: Real therapy session transcripts showing techniques in action
- **technique**: Specific therapeutic interventions and protocols
- **guideline**: VASA agent personality and safety guidelines

## Adding Documents

1. Create a `.txt` file in the appropriate directory
2. Add the file configuration to `server/scripts/ingest-knowledge.ts` in the `DOCUMENTS` array
3. Run the ingestion script:

```bash
npx tsx server/scripts/ingest-knowledge.ts
```

## Document Format

Documents should be plain text with clear paragraph breaks. The ingestion script will:
- Split documents into ~1000 character chunks
- Maintain paragraph boundaries where possible
- Add 200 character overlap between chunks for context continuity

## Tags

Tags help the RAG system retrieve relevant chunks. Common tags include:
- Register tags: `real`, `imaginary`, `symbolic`
- CSS stage tags: `pointed_origin`, `focus_bind`, `suspension`, `gesture_toward`, `completion`
- Pattern tags: `cvdc`, `ibm`, `thend`, `cyvc`
- Technique tags: `hsfb`, `grounding`, `intervention`, `timing`

## Ingestion Commands

```bash
# Ingest all configured documents
npx tsx server/scripts/ingest-knowledge.ts

# Clear existing knowledge base first
npx tsx server/scripts/ingest-knowledge.ts --clear

# List existing files in docs/
npx tsx server/scripts/ingest-knowledge.ts --list

# Show help
npx tsx server/scripts/ingest-knowledge.ts --help
```
