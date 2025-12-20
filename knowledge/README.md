# VASA Knowledge Base Documents

This folder contains the PCA/PCP methodology documents that are ingested into the RAG system for therapeutic guidance.

## Required Files

Add the following .txt files to this folder:

### Theory Documents
- `thend-framework.txt` - Thend framework and integration theory (CVDC, CYVC concepts)
- `register-theory.txt` - Real/Imaginary/Symbolic register theory
- `css-stages.txt` - CSS stage progression methodology
- `vasa-ultimate-goal.txt` - VASA Ultimate Goal - origin trauma integration

### Examples
- `eve-case-study.txt` - Eve case study demonstrating PCA methodology
- `example-intervention.txt` - Example therapeutic intervention with timing

### Techniques
- `hsfb-protocol.txt` - HSFB protocol for register grounding

### Guidelines
- `vasa-personality.txt` - VASA agent personality guidelines
- `vasa-voice-tone.txt` - VASA voice and tone style guide

## Ingestion

After adding files, run:
```bash
npx tsx server/scripts/ingest-knowledge.ts --clear
```

To check which files are present:
```bash
npx tsx server/scripts/ingest-knowledge.ts --list
```
