# Complete Functiomed Content Embedding

This script embeds **ALL** Functiomed content into the knowledge base in one go.

## What's Included

### 📋 Training Rules (6 sections)
1. **CHECK-IN / CHECK-OUT** - Check-in/check-out procedures, badge management, locker rules
2. **TRAININGSFLÄCHE** - Training area rules, dress code, safety requirements
3. **GERÄTEBENÜTZUNG** - Equipment usage, hygiene requirements, disinfection
4. **TIMESTOPP** - Processing fees, conditions for timestop
5. **WICHTIG** - Health questionnaire requirements
6. **Training Checklist** - Complete checklist of all training rules

### 🚨 Accident Information (2 sections)
7. **Accident Info for Patients** - Instructions for patients with accidents, insurance requirements, reporting deadlines
8. **Accident Info for Employers** - Information for employers, required documentation

### 💰 Insurance & Billing (6 sections)
9. **Osteopathy Billing Introduction** - Cost coverage information
10. **Official Pricing** - Functiomed pricing structure
11. **VISANA** - VISANA insurance details and coverage
12. **HELSANA** - Helsana insurance details and coverage
13. **CSS** - CSS insurance details and coverage
14. **General Billing Info** - Payment methods, billing procedures

### 🏥 Medical Services (1 section)
15. **Shockwave Therapy** - Complete information about ESWT treatment

### ❓ FAQs (6 sections)
16. **General Practice FAQs** - Parking, hours, appointments, languages
17. **Orthopedics & Sports Medicine FAQs** - Services, referrals, insurance
18. **Osteopathy & Etiopathy FAQs** - Suitability, sessions, insurance
19. **Rheumatology & Internal Medicine FAQs** - Conditions, diagnosis, blood tests
20. **Integrative Medicine FAQs** - Therapies, scientific recognition
21. **Complementary Medicine FAQs** - Acupuncture, homeopathy, massage techniques

## Total Content

- **21 sections** of content
- **63 chunks** total (21 sections × 3 languages: German, English, French)
- All content is complete and comprehensive

## Usage

Run the complete embedding script:

```bash
cd backend
npm run embed-all
```

Or directly:

```bash
node scripts/embedAllContent.js
```

## What It Does

1. Processes all 21 sections of content
2. Translates each section to English and French (German is original)
3. Generates embeddings using `nomic-embed-text` model
4. Stores all embeddings in the knowledge base with language tags

## Time Estimate

- Translation: ~2-3 minutes per language (42 translations total)
- Embedding generation: ~30 seconds per chunk (63 chunks)
- **Total: ~30-40 minutes**

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

## Output

The script will create:
- 63 chunks total (21 sections × 3 languages)
- Each chunk stored with:
  - `id`: `{section_id}_{language}` (e.g., `training_rules_checkin_de`)
  - `language`: `de`, `en`, or `fr`
  - `title`: Translated title
  - `content`: Complete translated content
  - `embedding`: Vector embedding (768 dimensions)

## Querying the Content

Once embedded, users can ask questions about:

**Training:**
- "What are the check-in rules?"
- "What is the dress code for training?"
- "How do I use the equipment?"

**Accidents:**
- "What should I do if I have an accident?"
- "How do I report an accident to my employer?"
- "What insurance information is needed?"

**Billing:**
- "How much does osteopathy cost?"
- "Does VISANA cover osteopathy?"
- "How do I pay for treatment?"

**Services:**
- "What is shockwave therapy?"
- "What conditions does shockwave therapy treat?"

**General:**
- "What are your opening hours?"
- "Do you have parking?"
- "What languages do you speak?"

The chatbot will automatically detect the user's language and respond in the same language.

## Progress Tracking

The script shows:
- Current section being processed
- Translation progress
- Embedding generation progress
- Success/failure counts
- Final summary with statistics

