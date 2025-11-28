# Training Rules Embedding Script

This script embeds Functiomed's training rules and accident information into the knowledge base.

## Content Included

1. **Training Rules - CHECK-IN/CHECK-OUT**
   - Check-in/check-out procedures
   - Badge management
   - Locker and changing room rules

2. **Training Rules - Training Area**
   - Training supervision
   - Dress code requirements
   - Safety rules
   - Age restrictions

3. **Training Rules - Equipment Usage**
   - Equipment return requirements
   - Hygiene requirements (towels)
   - Disinfection rules

4. **Training Rules - Timestop**
   - Processing fees
   - Conditions for timestop
   - Retroactive timestop rules

5. **Training Rules - Important**
   - Health questionnaire requirements
   - Health change reporting

6. **Training Checklist**
   - Complete checklist of all training rules

7. **Accident Information - Patients**
   - Instructions for patients with accidents
   - Insurance requirements
   - Reporting deadlines
   - Different insurance scenarios

8. **Accident Information - Employers**
   - Information for employers
   - Required information for processing
   - Contact information

## Usage

Run the script to generate embeddings:

```bash
cd backend
npm run embed-training-rules
```

Or directly:

```bash
node scripts/embedTrainingRules.js
```

## What It Does

1. Processes 8 sections of training and accident information
2. Translates each section to English and French (German is original)
3. Generates embeddings using `nomic-embed-text` model
4. Stores all embeddings in the knowledge base with language tags

## Output

The script will create:
- 24 chunks total (8 sections × 3 languages)
- Each chunk stored with:
  - `id`: `{section_id}_{language}` (e.g., `training_rules_checkin_de`)
  - `language`: `de`, `en`, or `fr`
  - `title`: Translated title
  - `content`: Translated content
  - `embedding`: Vector embedding (768 dimensions)

## Prerequisites

1. **Ollama must be running**:
   ```bash
   ollama serve
   ```

2. **Required models must be pulled**:
   ```bash
   ollama pull llama3.2          # For translations
   ollama pull nomic-embed-text   # For embeddings
   ```

## Time Estimate

- Translation: ~2-3 minutes per language (16 sections total)
- Embedding generation: ~30 seconds per chunk (24 chunks)
- **Total: ~10-15 minutes**

## Querying the Content

Once embedded, users can ask questions like:
- "What are the check-in rules?"
- "What should I do if I have an accident?"
- "What are the dress code requirements?"
- "How do I report an accident to my employer?"

The chatbot will automatically detect the language and respond in the same language.

