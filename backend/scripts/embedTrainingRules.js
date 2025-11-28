/**
 * Embed Functiomed Training Rules and Accident Information
 * 
 * This script processes the training rules and accident information content,
 * generates embeddings, and stores them in the knowledge base.
 */

import { openai } from '../services/llm.js';
import { db, lowDb } from '../config/database.js';
import { createHash } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Training rules and accident information content (in German)
const trainingContent = {
  sections: [
    {
      id: "training_rules_checkin",
      title: "Die Goldenen Regeln - functiotraining: CHECK-IN / CHECK-OUT",
      content: `CHECK-IN / CHECK-OUT
• Bei jedem Training müssen sich die Kunden vor und nach dem Training ein- und auschecken.
Hierfür erhalten sie am Empfang einen Badge für das Handgelenk oder einen Sticker für das Handy.
• Das Check-in erfolgt vor dem Betreten der Trainingsfläche und das Check-out nach dem Verlassen der Trainingsfläche am dafür vorgesehenen Lesegerät.
• Der Check-in/out-Prozess ist verpflichtend und dient der Anwesenheitskontrolle sowie der Sicherheit.
• Der Badge ist nach Ende des Abonnements zurückzugeben; bei Nicht-Rückgabe oder Verlust wird eine Gebühr von CHF 20.- in Rechnung gestellt.
• In den Garderoben stehen während den Öffnungszeiten Garderobenschränke und Duschen zur Verfügung. Für verlorene oder gestohlene Gegenstände übernimmt die functiomed AG keine Haftung.
• Alle Schränke müssen am Abend geleert und ausgeliehene Schlösser am Empfang zurückgebracht werden. Verschlossene Schränke werden nach der Schliessung des Trainingsbereiches am Abend geräumt.`
    },
    {
      id: "training_rules_area",
      title: "Die Goldenen Regeln - functiotraining: TRAININGSFLÄCHE",
      content: `TRAININGSFLÄCHE
• Trainingsberatung (Risikobefragung, Bedürfnisabklärung und -kontrolle, Trainingsinstruktion und -betreuung)
• Die Trainingsfläche ist während den Öffnungszeiten mehrheitlich durch eine Aufsichtsperson betreut und überwacht.
• Auf der Trainingsfläche darf nur mit sauberen Turnschuhen trainiert werden.
• Knielange Trainingshosen und Shirts sind bei uns obligatorisch. Unterhemden oder Muskelshirts sind nicht erlaubt.
• Strassenkleider sind auf der Trainingsfläche nicht erlaubt.
• Es dürfen keine Taschen mit auf die Trainingsfläche genommen werden.
• Es dürfen keine Esswaren auf der Trainingsfläche konsumiert werden.
• Den Anweisungen des Personals ist Folge zu leisten. Andernfalls kann der Kunde vom Trainingsbesuch ausgeschlossen werden.
• Die Trainingsfläche ist 15 Minuten vor Schliessung der Praxisräumlichkeiten zu verlassen.
• Jugendliche bis zum 18. Lebensjahr dürfen nur mit Zustimmung der Erziehungsberechtigten trainieren.`
    },
    {
      id: "training_rules_equipment",
      title: "Die Goldenen Regeln - functiotraining: GERÄTEBENÜTZUNG",
      content: `GERÄTEBENÜTZUNG
• Jeder Kunde ist verpflichtet, nach dem Gebrauch von Fitnessgeräten, diese wieder an ihren Platz zurückzustellen. Gewichtsscheiben sind nach dem Gebrauch von den Maschinen oder Stangen zu entfernen.
• Zum Schutz der Polster und aus hygienischen Gründen ist ein Handtuch als Schweissunterlage mitzubringen.
• Alle Kontaktstellen sind nach jedem Gebrauch mit dem bereitstehenden Desinfektionsmittel zu reinigen.`
    },
    {
      id: "training_rules_timestop",
      title: "Die Goldenen Regeln - functiotraining: TIMESTOPP",
      content: `TIMESTOPP
• CHF 20.00 Bearbeitungsgebühr: bei ärztlich bescheinigter Trainingsunfähigkeit als Folge von Krankheit oder Unfall ab 1 Wochen; bei Schwangerschaft; bei Militär- oder Zivilschutzdienst gemäss Kopie des Aufgebots.
• Ein rückwirkender Timestopp ist nur bei Krankheit oder Unfall möglich.`
    },
    {
      id: "training_rules_important",
      title: "Die Goldenen Regeln - functiotraining: WICHTIG",
      content: `WICHTIG
Der Gesundheitsfragebogen wird beim Lösen eines Abos ausgehändigt und muss wahrheitsgetreu ausgefüllt werden. Gesundheitliche Veränderungen welche für das Training relevant sind, müssen der functiomed AG gemeldet werden. Im Zweifelsfall wenden Sie sich bitte an Ihren Hausarzt.`
    },
    {
      id: "training_checklist",
      title: "Checklist Functiomed Training",
      content: `Checklist Functiomed Training
Abonent:Innen müssen sich vor und nach dem Training ein- und auschecken, wobei der Check-in vor dem Betreten und das Check-out nach dem Verlassen der Trainingsfläche erfolgt; dieser Prozess ist verpflichtend zur Anwesenheitskontrolle und Sicherheit.
Es dürfen keine Esswaren auf der Trainingsfläche konsumiert werden.
Das Telefonieren, Filmen oder Fotografieren ist im gesamten Trainingsbereich untersagt.
Auf der Trainingsfläche darf nur mit sauberen und geschlossenen Sportschuhen mit weisser Sohle trainiert werden. Ein Handtuch als Schweissunterlage ist für das Training mitzubringen.
Knielange Trainingshosen und Shirts sind bei uns obligatorisch, es darf nicht mit freiem Oberkörper trainiert werden. Unterleibchen, Muskelshirts und Strassenkleider sind auf der Trainingsfläche nicht erlaubt.
Aus Sicherheitsgründen beachten Sie bitte unsere Öffnungszeiten.
Taschen sind in der Garderobe zu deponieren. Alle Schränke müssen am Abend geleert werden, sonst werden diese durch das Personal geräumt.
Alle Trainingsgeräte und Hilfsmittel müssen nach Gebrauch mit Desinfektionsmittel gereinigt und an Ihren Platz zurückgebracht werden.

Wir danken Ihnen für Ihr Verständnis. Ihr functiomed - Team`
    },
    {
      id: "accident_info_patients",
      title: "Wichtige Mitteilung für Patienten mit einem Unfall",
      content: `Wichtige Mitteilung für Patienten mit einem Unfall
Sie wurden nach einer Unfallverletzung von einem Therapeuten/Therapeutin der functiomed behandelt.
Wenn Sie in einem Anstellungsverhältnis arbeiten, sind Sie für Unfallbehandlungen durch Ihren Arbeitgeber versichert.
Es ist deshalb wichtig, dass Sie Ihren Unfall umgehend der Personalabteilung Ihres Arbeitgebers melden.
Für die Physiotherapie benötigen wir den Namen der Unfallversicherung, die Referenz-/Schadennummer, sowie das exakte Unfalldatum Ihres Unfalls. Bitte melden Sie oder Ihr Arbeitgeber uns diese innerhalb von 7 Arbeitstagen. Sie können uns diese Information per Telefon, E-Mail oder auf dem Postweg zukommen lassen oder das vollständig ausgefüllte Unfallformular direkt bei uns am Empfang abgeben.
Die Abrechnung erfolgt anschliessen direkt mit der Unfallversicherung.
• Selbstständig Erwerbende sind in der Regel bei der Krankenkasse gegen Unfall versichert
• Rentnerinnen und Rentner sind in der Regel bei der Krankenkasse gegen Unfall versichert
• Nicht erwerbstätige Personen sind bei der Krankenkasse gegen Unfall versichert
• Personen, welche wegen Arbeitslosigkeit bei der Arbeitslosenkasse (RAV) angemeldet sind, erhalten Ihr Unfallformular dort
• Kinder und Studenten sind bei der Krankenkasse gegen Unfall versichert
Falls Sie die Osteopathie über die Unfallversicherung abrechnen möchten, dann müssen Sie den Unfall ebenfalls der Personalabteilung Ihres Arbeitgebers melden. Gerne können Sie uns die Unfallangaben zukommen lassen und wir notieren diese auf der Rechnung. Die Rechnungsstellung erfolgt jedoch immer direkt an den/die Patienten/Patientin. Der/die Patient/Patientin ist gegenüber der functiomed zahlungspflichtig, unabhängig davon, welche Versicherung die Rückerstattung übernimmt.`
    },
    {
      id: "accident_info_employers",
      title: "Information für den Arbeitgeber - Unfallbehandlung",
      content: `Information für den Arbeitgeber
In der Folge eines Unfalls musste eine Mitarbeiterin / ein Mitarbeiter Ihres Unternehmens bei der functiomed ärztlich behandelt werden.
Bitte melden Sie diesen Unfall schnellstmöglich bei Ihrer Versicherung, da wir für die administrative Bearbeitung dieser Behandlung folgendes benötigen:
- Anschrift Ihrer Unfallversicherung
- Referenz-/Schadennummer
- exaktes Unfalldatum
Sie können uns dies direkt oder über Ihre Mitarbeitende / Ihren Mitarbeitenden zukommen lassen. Haben Sie weitere Fragen?
Dann melden Sie sich gerne bei uns.
Herzlichem Dank für Ihre Mitarbeit!
Ihre functiomed`
    }
  ]
};

// Delay function to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Translate text using Ollama
async function translateText(text, targetLanguage) {
  const languageNames = {
    'en': 'English',
    'fr': 'French'
  };

  const messages = [
    { 
      role: 'system', 
      content: `You are a highly skilled translator. Translate the following German text into ${languageNames[targetLanguage]}. Provide only the translated text, without any additional commentary or conversational filler. Maintain the same structure, formatting, and bullet points.` 
    },
    { role: 'user', content: text }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      messages: messages,
      temperature: 0.3,
    });
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error(`Error translating to ${targetLanguage}:`, error);
    return null;
  }
}

// Generate embedding using Ollama
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
      input: text
    });

    if (!response.data || response.data.length === 0 || !response.data[0].embedding) {
      throw new Error('Failed to generate embedding: Empty or invalid response');
    }

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

// Store chunk in database
function storeChunk(chunkData) {
  try {
    const { id, title, content, language, embedding } = chunkData;
    
    // Map to database schema fields
    const page_title = title;
    const chunk_text = content;
    const heading_path = id;
    const url = `internal://functiomed-training-rules/${id}?lang=${language}`;
    
    // Check if chunk already exists
    const existing = db.prepare(`
      SELECT id FROM knowledge_chunks 
      WHERE id = ?
    `).get(id);

    if (existing) {
      // Update existing chunk
      db.prepare(`
        UPDATE knowledge_chunks 
        SET page_title = ?, chunk_text = ?, embedding = ?, heading_path = ?, url = ?, language = ?, updated_at = ?
        WHERE id = ?
      `).run(
        page_title,
        chunk_text,
        JSON.stringify(embedding),
        heading_path,
        url,
        language,
        new Date().toISOString(),
        id
      );
      console.log(`✓ Updated chunk: ${id} (${language})`);
    } else {
      // Insert new chunk
      db.prepare(`
        INSERT INTO knowledge_chunks (
          id, page_title, chunk_text, heading_path, embedding, url, language, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        page_title,
        chunk_text,
        heading_path,
        JSON.stringify(embedding),
        url,
        language,
        new Date().toISOString(),
        new Date().toISOString()
      );
      console.log(`✓ Created chunk: ${id} (${language})`);
    }

    // Force database write
    lowDb.write();
  } catch (error) {
    console.error('Error storing chunk:', error);
    throw error;
  }
}

// Main function to process all content
async function embedTrainingRules() {
  console.log('🚀 Starting training rules embedding generation...\n');

  const languages = ['de', 'en', 'fr'];
  let totalChunks = 0;

  for (const section of trainingContent.sections) {
    console.log(`\n📄 Processing: ${section.title}`);
    console.log(`   Section ID: ${section.id}`);

    // Process each language
    for (const lang of languages) {
      try {
        let content = section.content;
        let title = section.title;

        // Translate if not German
        if (lang !== 'de') {
          console.log(`   Translating to ${lang.toUpperCase()}...`);
          title = await translateText(section.title, lang);
          await delay(1000); // Rate limit
          content = await translateText(section.content, lang);
          
          if (!content || !title) {
            console.error(`   ✗ Translation failed for ${lang}, skipping...`);
            continue;
          }
          
          // Small delay to avoid rate limiting
          await delay(1000);
        }

        // Generate embedding
        console.log(`   Generating embedding (${lang.toUpperCase()})...`);
        const embedding = await generateEmbedding(`${title}\n\n${content}`);

        // Store chunk
        const chunkId = `${section.id}_${lang}`;
        storeChunk({
          id: chunkId,
          title: title,
          content: content,
          language: lang,
          embedding: embedding
        });

        totalChunks++;
        console.log(`   ✓ Completed: ${chunkId}`);

        // Small delay between requests
        await delay(500);
      } catch (error) {
        console.error(`   ✗ Error processing ${lang} for ${section.id}:`, error.message);
      }
    }
  }

  console.log(`\n✅ Completed! Generated ${totalChunks} chunks across ${languages.length} languages.`);
  console.log(`   Total: ${totalChunks} chunks (${trainingContent.sections.length} sections × ${languages.length} languages)`);
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('embedTrainingRules.js')) {
  embedTrainingRules().catch(console.error);
}

export { embedTrainingRules };

