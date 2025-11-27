/**
 * Generate Multilingual Embeddings for Functiomed Content
 * 
 * This script processes the provided content, translates it to English, German, and French,
 * and generates embeddings for each language version using Ollama.
 */

import { openai } from '../services/llm.js';
import { db, lowDb } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

// Original content (in German)
const originalContent = {
  title: "VISANA / Helsana / CSS - Informationen Leistungsabrechnung Osteopathie",
  sections: [
    {
      id: "osteopathy_billing_intro",
      title: "Osteopathie Kostenübernahme",
      content: `Um unseren Patienten*Innen eine Kostenübernahme durch die Zusatzversicherung zu ermöglichen wurden Kompromisslösungen vereinbart, welche wir in diesem Schreiben erläutern. Die Kompromisslösungen sind für functiomed ein Mehraufwand, trotzdem ist dies die einzige Möglichkeit für den Patienten von der Kostenbeteiligung seitens Zusatzversicherung Gebrauch zu machen. Aus diesem Grund haben wir uns entschieden, unsere Patienten*Innen dabei zu unterstützen. Wir bitten aber jeden Patienten*Inn die Kostenübernahme vor dem Termin selbständig abzuklären, da es immer wieder mal Änderungen geben kann, von welchen wir erst später in Kenntnis gesetzt werden.`
    },
    {
      id: "osteopathy_pricing",
      title: "Offizielle Preise von functiomed",
      content: `Offizielle Preise von functiomed:
30min ca. Fr. 108.-
45min ca. Fr. 159.-
Erstkonsultation zusätzlich Fr. 20.-
Zuschlag ausserordentliche Konsultation zusätzlich Fr. 40.-`
    },
    {
      id: "visana_info",
      title: "VISANA",
      content: `Folgende Osteopathen von functiomed sind auf der Therapeutenliste von Visana aufgeführt: Tiffany Roth, Luisa Furrer, Philipp Zuber, Mona Reuss und Fanny Guggisberg. Die Visana gibt einen Richtpreis für die Behandlung vor und akzeptiert für die Osteopathie pro 5min CHF 15.-, dies entspricht jedoch nicht der Tarifstruktur von functiomed. Die Behandlung wird mit dem Tarif 1203 für die Osteopathie pro 5min mit CHF 15.- verrechnet, bei 45min entspricht dies Fr. 135.-, da eine Behandlung von 45min bei functiomed Fr. 159.- kostet, entsteht eine Preisdifferenz von Fr. 24.- Dieser fehlende Betrag listet die functiomed auf der Rechnung mit "Nicht versicherte Kosten" auf, diese Kosten gehen zu Lasten des Patienten. WICHTIG: Die Visana beteiligt sich somit nur an einem Teil der Rechnung. Gerne können Sie bei der Krankenkasse direkt nachfragen wie hoch diese Beteiligung ist.`
    },
    {
      id: "helsana_info",
      title: "HELSANA",
      content: `Folgende Osteopathen von functiomed sind auf der Therapeutenliste von Helsana aufgeführt: Philipp Zuber, Luisa Furrer, Yvan Zanoli, Fanny Guggisberg, Mona Reuss und Thomas Reuter. Die Helsana gibt einen Richtpreis Fr. 13.- für die Osteopathie pro 5min vor. Aus diesem Grund wird die Behandlung mit dem Tarif 1200 für Anamnese / Untersuchung / Diagnostik / Befunderhebung pro 5 Min und Tarif 1203 für die Osteopathie pro 5min mit CHF 13.- verrechnet. Eine vollständige Rückerstattung ist nicht garantiert. Der Anteil der Kostenübernahme kann je nach Versicherer, Produkt und individuellen Ausschlüssen variieren! Die Abklärung diesbezüglich liegt in der Verantwortung des/r Patienten*Inn und muss vor dem Termin erfolgen.`
    },
    {
      id: "css_info",
      title: "CSS",
      content: `Die CSS-Versicherungen haben sich dazu entschieden, in der Zusatzversicherung für alle Therapien eine Begrenzung einzuführen: Ihre Kunden erhalten nur noch eine Maximalhöhe an Tarif rückerstattet. Für in der Nummer 223 (Master oder GDK) registrierte Osteopath*innen beträgt der maximal erstattete Tarif 18 Franken pro 5 Minuten. Für Osteopath*innen im Praktikum als Master oder SRK (Nummer 2231 und 2232) beträgt der maximal erstattete Tarif 16 Franken pro 5 Minuten. Für Therapeut*innen in der Nummer 141 beträgt der maximal erstattete Tarif 14.50 Franken pro 5 Minuten. Eine vollständige Rückerstattung ist nicht garantiert. Der Anteil der Kostenübernahme kann je nach Versicherer, Produkt und individuellen Ausschlüssen variieren! Die Abklärung diesbezüglich liegt in der Verantwortung des/r Patienten*Inn und muss vor dem Termin erfolgen.`
    },
    {
      id: "general_billing_info",
      title: "Allgemeine Informationen",
      content: `Komplementärmedizin und Nichtpflichtleistungen: Der Patient/die Patientin ist verpflichtet die Kostenübernahme vor dem Termin mit der Zusatzversicherung abzuklären. Verrechnung nach geleisteten Zeitaufwand, pro angefangene 5 Minuten nach dem Tarif 590. Aktenstudium und Führung der Krankengeschichte ist Teil der Konsultationszeit. Direkte Leistungsabrechnung mit den Versicherungen ist in der Komplementärmedizin nicht erlaubt. Patienten*Innen ohne Zusatzversicherung werden als Privatpatienten/Selbstzahler behandelt. Die Behandlung ist vor Ort zu bezahlen mit TWINT und EC/Maestro-Karten (kein American Express). Barzahlungen möglich, jedoch haben wir kein Wechselgeld.`
    },
    {
      id: "shockwave_therapy",
      title: "Fokussierte Stosswellentherapie",
      content: `Die extrakorporelle Stosswellentherapie (ESWT) stellt eine nicht-invasive Therapiemöglichkeit mit vielfältiger Anwendung dar. Neben Entzündungen von Sehnen und deren Ansätzen, können auch Sehnen-Verkalkungen und schlecht heilende Knochenbrüche damit therapiert werden. Welche Erkrankungen behandeln wir? Schulter: Sehnenverkalkungen (Tendinitis calcarea). Ellbogen: Tennis-/Golfer-Ellbogen (Epicondylopathia humero-radialis und -ulnaris). Finger: Weichteilverkalkungen. Hüfte: Schleimbeutelentzündung (Bursitis), Insertionstendinopathie am Trochanter major oder Tuber ischiadicum. Knie: Patellaspitzensyndrom, Insertionstendinopathie Tuberositas tibiae und Patella. Fuss: Fersenschmerzen: Plantarfasziitis, Fersenspron, Achillodynie. Knochen: Schlechte Frakturheilung, Non-union, Pseudoarthrosen (bei liegendem Osteosynthesematerial) und Stressfrakturen an den Extremitätenknochen. Wie läuft die Behandlung ab? Die ESWT wird bei uns ambulant und ohne Narkose oder Betäubung durchgeführt. In der Regel werden drei Sitzungen im Abstand von mindestens einer Woche durchgeführt. Jede Sitzung dauert ca. 20-30 Minuten. Die Kosten belaufen sich pro Region auf Fr. 220.- die Behandlung ist vor Ort zu bezahlen mit TWINT und EC/Maestro-Karten (kein American Express), Barzahlungen möglich, jedoch haben wir kein Wechselgeld.`
    },
    {
      id: "functiotraining_rules",
      title: "The Golden Rules - functiotraining",
      content: `CHECK-IN / CHECK-OUT: Patients must check in and - out, before and after each training session. Upon your first visit, you are given a wrist badge or a sticker, to attach to the back of your phonecase. Before each visit check in by holding up your badge or sticker to the reader at the entrance of the training to check- in to the training area. After you have finished your training session, check out by holding up your badge or sticker the reader. This is used to keep track of the duration of your stay and to make sure that you are safe. When your subscription ends, the badge must be returned at the reception. If you do not return it or if you lose it, you will be charged a fee of CHF 20. The locker and showers in the changing rooms can be used during opening hours. Functiomed AG is not responsible for any lost or stolen items. Lockers must be emptied every evening. Borrowed locks must be returned at the reception. Lockers must be emptied when the training area closes. TRAINING AREA: Training supervision (risk assessment, needs assessment and monitoring, training instruction and supervision). The training area is supervised and monitored by a supervisor during most opening hours. Only clean trainers may be worn on the training area. Knee-length training trousers and shirts are compulsory. Vests or muscle shirts are not permitted. Street clothes are not permitted on the training area. Bags are not allowed to be left on the training area. Food is not prohibited on the training area. Instructions given by staff must be followed. Failure to comply may result in ejection from the training area. The training area must be vacated 15 minutes before closing time. Patients under 18 must have a legal guardian's consent prior to training. USE OF EQUIPMENT: Equipment must be left in the same condition as before use. Weight discs must removed from machines or bars after use. Due to hygiene reasons, a towel must be used as a sweat cover when using the equipment. All surfaces must be cleaned with the provided disinfectant after each use.`
    },
    {
      id: "faq_general",
      title: "FAQ – Allgemeine Fragen zur Praxis",
      content: `Gibt es Parkmöglichkeiten bei functiomed? Ja, es stehen Ihnen kostenlose Parkplätze direkt vor der Praxis zur Verfügung. Zusätzlich befinden sich öffentliche Parkplätze in unmittelbarer Nähe. Wie sind die Öffnungszeiten der Praxis? Unsere regulären Öffnungszeiten sind Montag bis Freitag von 08:00 bis 18:00 Uhr. Termine außerhalb dieser Zeiten sind nach Vereinbarung möglich. Wie kann ich einen Termin vereinbaren? Termine können telefonisch, per E-Mail oder über das Online-Tool auf unserer Webseite vereinbart werden. Welche Sprachen sprechen die Mitarbeitenden? Unser Team spricht Deutsch, Englisch, Französisch und Italienisch und viele mehr. Bitte teilen Sie uns bei Bedarf Ihre bevorzugte Sprache mit.`
    },
    {
      id: "faq_orthopedics",
      title: "FAQ – Orthopädie & Traumatologie / Sportmedizin",
      content: `Was behandelt die Orthopädie bei functiomed? Die Orthopädie bei functiomed befasst sich mit Erkrankungen und Verletzungen des Bewegungsapparates, einschließlich Knochen, Gelenken, Muskeln und Sehnen. Welche Leistungen bietet die Sportmedizin? Unsere Sportmedizin umfasst Prävention, Diagnose und Behandlung von sportbedingten Verletzungen. Wir unterstützen sowohl Freizeit- als auch Profisportler. Benötige ich eine Überweisung für einen Termin? Nein, Sie können direkt einen Termin bei uns vereinbaren. Eine Überweisung ist nicht zwingend erforderlich ausser Sie sind in einem speziellen Versicherungsmodell, wie z.B. das Hausarztmodell. Werden die Kosten von der Krankenkasse übernommen? Die Kosten für orthopädische und traumatologische Behandlungen werden in der Regel von der Grundversicherung oder Unfallversicherung übernommen.`
    },
    {
      id: "faq_osteopathy",
      title: "FAQ – Osteopathie & Etiopathie",
      content: `Für wen ist eine osteopathische Behandlung geeignet? Osteopathie ist für Menschen jeden Alters geeignet, von Neugeborenen bis zu Senioren. Wie viele Sitzungen sind notwendig? Die Anzahl der Sitzungen variiert je nach Beschwerdebild. In der Regel sind mehrere Sitzungen notwendig. Wird Osteopathie von der Krankenkasse bezahlt? Viele Zusatzversicherungen übernehmen einen Teil der Kosten für osteopathische Behandlungen. Die Kostenübernahme muss durch den Patienten vor dem Termin abgeklärt werden.`
    },
    {
      id: "faq_rheumatology",
      title: "FAQ – Rheumatologie & Innere Medizin",
      content: `Welche Erkrankungen behandelt die Rheumatologie? Unsere Rheumatologie behandelt entzündliche Gelenkerkrankungen, Weichteilrheuma und andere rheumatische Erkrankungen. Was umfasst die Innere Medizin bei functiomed? Die Innere Medizin befasst sich mit Erkrankungen der inneren Organe, wie Herz, Lunge, Leber und Nieren. Wie erfolgt die Diagnosestellung? Wir nutzen Laboruntersuchungen und bildgebende Verfahren, um eine genaue Diagnose zu stellen. Muss ich nüchtern zur Blutabnahme erscheinen? Für bestimmte Blutuntersuchungen ist es erforderlich, nüchtern zu sein. Wir informieren Sie rechtzeitig.`
    },
    {
      id: "faq_integrative",
      title: "FAQ – Integrative Medizin",
      content: `Was versteht man unter integrativer Medizin? Integrative Medizin kombiniert schulmedizinische Verfahren mit komplementären Therapien für eine ganzheitliche Behandlung. Welche Therapien werden angeboten? Wir bieten Akupunktur, Homöopathie, Infusionstherapien, Colon Hydro Therapie, Ozontherapie, Orthomolekularmedizin, Ernährungsberatung und Mental Coaching an. Ist integrative Medizin wissenschaftlich anerkannt? Viele Methoden sind wissenschaftlich untersucht und ergänzen die Schulmedizin. Wie finde ich die passende Therapie für mich? In einem persönlichen Gespräch ermitteln wir gemeinsam die geeigneten Therapieansätze.`
    },
    {
      id: "faq_complementary",
      title: "FAQ – Komplementärmedizin",
      content: `Was beinhaltet die Komplementärmedizin bei functiomed? Unsere Komplementärmedizin umfasst Akupunktur, Homöopathie, medizinische Massagen und weitere alternative Heilmethoden. Wie läuft eine Akupunktursitzung ab? Feine Nadeln werden an spezifischen Punkten gesetzt, um den Energiefluss zu harmonisieren. Für Kinder oder alle die Nadeln nicht mögen und doch von den fernöstlichen Heilkünsten profitieren wollen, bieten wir Tuina an. Tuina ist eine chinesische Massageform, die auf der traditionellen chinesischen Medizin beruht. Mit diversen manuellen Techniken kann der Energie-Fluss mit Tuina positiv beeinflusst werden, Blockaden lösen sich auf und Körper und Seele kommen in Einklang. Ist Homöopathie für Kinder geeignet? Ja, Homöopathie kann auch bei Kindern angewendet werden. Bei Kindern verwendet man keine Nadeln. Welche Massagetechniken werden angeboten? Wir bieten klassische Massagen, Fußreflexzonenmassagen, Hot-Stone-Massagen, Japanische Gesichtsmassage, Lomi Lomi, Schwangerschaftsmassage, Anti Cellulite Massage, Manuelle Lymphdrainage, Shiatsu und Sportmassagen an.`
    }
  ]
};

// Translations (you can use a translation API or service here)
// For now, I'll create a function that uses Ollama to translate
async function translateText(text, targetLanguage) {
  const languageNames = {
    'en': 'English',
    'de': 'German',
    'fr': 'French'
  };

  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text to ${languageNames[targetLanguage]}. Maintain the same structure, formatting, and technical terms. Only return the translation, no explanations.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error(`Translation error for ${targetLanguage}:`, error);
    return text; // Return original if translation fails
  }
}

// Generate embeddings for a text
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'nomic-embed-text',
      input: text
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation error:', error);
    throw error;
  }
}

// Store chunk in database
function storeChunk(chunkData) {
  try {
    const { id, title, content, language, embedding, section_id } = chunkData;
    
    // Map to database schema fields
    const page_title = title;
    const chunk_text = content;
    const heading_path = section_id;
    const url = `internal://functiomed-docs/${section_id}?lang=${language}`;
    
    // Check if chunk already exists
    const existing = db.prepare(`
      SELECT id FROM knowledge_chunks 
      WHERE id = ?
    `).get(id);

    if (existing) {
      // Update existing chunk
      db.prepare(`
        UPDATE knowledge_chunks 
        SET page_title = ?, chunk_text = ?, embedding = ?, heading_path = ?, url = ?, updated_at = ?
        WHERE id = ?
      `).run(
        page_title,
        chunk_text,
        JSON.stringify(embedding),
        heading_path,
        url,
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
async function generateMultilingualEmbeddings() {
  console.log('🚀 Starting multilingual embedding generation...\n');

  const languages = ['de', 'en', 'fr'];
  let totalChunks = 0;

  for (const section of originalContent.sections) {
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
          content = await translateText(section.content, lang);
          title = await translateText(section.title, lang);
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Generate embedding
        console.log(`   Generating embedding (${lang.toUpperCase()})...`);
        const embedding = await generateEmbedding(`${title}\n\n${content}`);

        // Store chunk
        const chunkId = `${section.id}_${lang}`;
        storeChunk({
          id: chunkId,
          section_id: section.id,
          title: title,
          content: content,
          language: lang,
          embedding: embedding
        });

        totalChunks++;
        console.log(`   ✓ Completed: ${chunkId}`);

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`   ✗ Error processing ${lang} for ${section.id}:`, error.message);
      }
    }
  }

  console.log(`\n✅ Completed! Generated ${totalChunks} chunks across ${languages.length} languages.`);
  console.log(`   Total: ${totalChunks} chunks (${originalContent.sections.length} sections × ${languages.length} languages)`);
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  generateMultilingualEmbeddings()
    .then(() => {
      console.log('\n🎉 All done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    });
}

export { generateMultilingualEmbeddings, translateText, generateEmbedding };

