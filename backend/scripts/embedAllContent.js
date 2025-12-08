/**
 * Complete Functiomed Content Embedding Script
 * 
 * This script processes ALL Functiomed content including:
 * - Training rules and procedures
 * - Accident information
 * - Insurance and billing information
 * - FAQs
 * - Shockwave therapy information
 * 
 * Generates embeddings in German, English, and French using Ollama.
 */

import { openai } from '../services/llm.js';
import { db, lowDb } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

// COMPLETE CONTENT - All Functiomed information
const allContent = {
  sections: [
    // ========== TRAINING RULES ==========
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
    
    // ========== ACCIDENT INFORMATION ==========
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
    },
    
    // ========== INSURANCE & BILLING ==========
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
      title: "Allgemeine Informationen - Leistungsabrechnung",
      content: `Komplementärmedizin und Nichtpflichtleistungen: Der Patient/die Patientin ist verpflichtet die Kostenübernahme vor dem Termin mit der Zusatzversicherung abzuklären. Verrechnung nach geleisteten Zeitaufwand, pro angefangene 5 Minuten nach dem Tarif 590. Aktenstudium und Führung der Krankengeschichte ist Teil der Konsultationszeit. Direkte Leistungsabrechnung mit den Versicherungen ist in der Komplementärmedizin nicht erlaubt. Patienten*Innen ohne Zusatzversicherung werden als Privatpatienten/Selbstzahler behandelt. Die Behandlung ist vor Ort zu bezahlen mit TWINT und EC/Maestro-Karten (kein American Express). Barzahlungen möglich, jedoch haben wir kein Wechselgeld.`
    },
    
    // ========== SHOCKWAVE THERAPY ==========
    {
      id: "shockwave_therapy",
      title: "Fokussierte Stosswellentherapie",
      content: `Die extrakorporelle Stosswellentherapie (ESWT) stellt eine nicht-invasive Therapiemöglichkeit mit vielfältiger Anwendung dar. Neben Entzündungen von Sehnen und deren Ansätzen, können auch Sehnen-Verkalkungen und schlecht heilende Knochenbrüche damit therapiert werden. Welche Erkrankungen behandeln wir? Schulter: Sehnenverkalkungen (Tendinitis calcarea). Ellbogen: Tennis-/Golfer-Ellbogen (Epicondylopathia humero-radialis und -ulnaris). Finger: Weichteilverkalkungen. Hüfte: Schleimbeutelentzündung (Bursitis), Insertionstendinopathie am Trochanter major oder Tuber ischiadicum. Knie: Patellaspitzensyndrom, Insertionstendinopathie Tuberositas tibiae und Patella. Fuss: Fersenschmerzen: Plantarfasziitis, Fersenspron, Achillodynie. Knochen: Schlechte Frakturheilung, Non-union, Pseudoarthrosen (bei liegendem Osteosynthesematerial) und Stressfrakturen an den Extremitätenknochen. Wie läuft die Behandlung ab? Die ESWT wird bei uns ambulant und ohne Narkose oder Betäubung durchgeführt. In der Regel werden drei Sitzungen im Abstand von mindestens einer Woche durchgeführt. Jede Sitzung dauert ca. 20-30 Minuten. Wie sind die Kosten? Vor der ESWT wird in einer Erstkonsultation geprüft, ob eine ESWT möglich und erfolgversprechend ist, der Ablauf wird besprochen und eine Kostengutsprache wird eingeholt (die ESWT ist keine Pflichtleistung der obligatorischen Grundversicherung, je nach Zusatzversicherung können die Kosten übernommen werden). Die Kosten belaufen sich pro Region auf Fr. 220.- die Behandlung ist vor Ort zu bezahlen mit TWINT und EC/Maestro-Karten (kein American Express), Barzahlungen möglich, jedoch haben wir kein Wechselgeld. Was sind Stosswellen? Stosswellen sind hörbare Schallwellen mit sehr hoher Energie. Diese Schallwellen werden im Stosswellengerät erzeugt und mit einem Wasserkissen auf den Körper übertragen. Bekannt wurde diese Therapiemethode durch die Nierensteinzertrümmerung. Die extrakorporale Stosswellentherapie (ESWT) verkleinert nicht nur Verkalkungen, sie wird auch bei schmerzhaften Sehnenansätzen und schlecht heilenden Knochenbrüchen eingesetzt. Dazu werden die Stosswellen fokussiert, d. h. Millimeter genau auf das zu behandelnde Gebiet eingestellt. Wie wirken Stosswellen? Die Stosswellen erzeugen einen sehr hohen Druck, dadurch kommt es zu einer Spannung im Gewebe, was zu einer biologischen Reaktion führt (Mechanotransduktion). Hierdurch werden körpereigene regenerative Prozesse aktiviert. Es wird unter anderem die Durchblutung gesteigert, der Stoffwechsel verbessert, und das Abwehr- und Reparatursystem des Körpers aktiviert. So kann das geschädigte Gewebe regenerieren und heilen. Welche Risiken bestehen? Im Rahmen der Stosswellentherapie kann es zu einer vorübergehenden Hautrötung kommen. In seltenen Fällen können sich die Beschwerden für ein paar Tage verschlimmern. Die Stosswellentherapie selbst verursacht keine Strahlenbelastung. Welche Kontraindikationen bestehen? Blutverdünnende Medikamente (Antikoagulation). Lokale Infektionen im Behandlungsgebiet. Infektionen der Knochen (Osteomyelitis) aktuell oder früher. Infizierte Pseudoarthrose bei der Behandlung einer Knochenheilungsstörung. Blutgerinnungsstörungen. Anwendung auf grossen Gefässen, Nerven und Lunge. Herzschrittmacher, Schwangerschaft, (Kinder und Jugendliche im Wachstumsalter, v.a. auf Wachstumsfugen).`
    },
    
    // ========== FAQs ==========
    {
      id: "faq_general",
      title: "FAQ – Allgemeine Fragen zur Praxis",
      content: `Allgemeine Fragen zur Praxis

Gibt es Parkmöglichkeiten bei functiomed?
Ja, es stehen Ihnen kostenlose Parkplätze direkt vor der Praxis zur Verfügung. Zusätzlich befinden sich öffentliche Parkplätze in unmittelbarer Nähe.

Wie sind die Öffnungszeiten der Praxis?
Unsere regulären Öffnungszeiten sind Montag bis Freitag von 08:00 bis 18:00 Uhr. Termine außerhalb dieser Zeiten sind nach Vereinbarung möglich.

Wie kann ich einen Termin vereinbaren?
Termine können telefonisch, per E-Mail oder über das Online-Tool auf unserer Webseite vereinbart werden.

Welche Sprachen sprechen die Mitarbeitenden?
Unser Team spricht Deutsch, Englisch, Französisch und Italienisch und viele mehr. Bitte teilen Sie uns bei Bedarf Ihre bevorzugte Sprache mit.`
    },
    {
      id: "faq_orthopedics",
      title: "FAQ – Orthopädie & Traumatologie / Sportmedizin",
      content: `Orthopädie & Traumatologie / Sportmedizin

Was behandelt die Orthopädie bei functiomed?
Die Orthopädie bei functiomed befasst sich mit Erkrankungen und Verletzungen des Bewegungsapparates, einschließlich Knochen, Gelenken, Muskeln und Sehnen.

Welche Leistungen bietet die Sportmedizin?
Unsere Sportmedizin umfasst Prävention, Diagnose und Behandlung von sportbedingten Verletzungen. Wir unterstützen sowohl Freizeit- als auch Profisportler.

Benötige ich eine Überweisung für einen Termin?
Nein, Sie können direkt einen Termin bei uns vereinbaren. Eine Überweisung ist nicht zwingend erforderlich ausser Sie sind in einem speziellen Versicherungsmodell, wie z.B. das Hausarztmodell.

Werden die Kosten von der Krankenkasse übernommen?
Die Kosten für orthopädische und traumatologische Behandlungen werden in der Regel von der Grundversicherung oder Unfallversicherung übernommen.`
    },
    {
      id: "faq_osteopathy",
      title: "FAQ – Osteopathie & Etiopathie",
      content: `Osteopathie & Etiopathie

Für wen ist eine osteopathische Behandlung geeignet?
Osteopathie ist für Menschen jeden Alters geeignet, von Neugeborenen bis zu Senioren.

Wie viele Sitzungen sind notwendig?
Die Anzahl der Sitzungen variiert je nach Beschwerdebild. In der Regel sind mehrere Sitzungen notwendig.

Wird Osteopathie von der Krankenkasse bezahlt?
Viele Zusatzversicherungen übernehmen einen Teil der Kosten für osteopathische Behandlungen. Die Kostenübernahme muss durch den Patienten vor dem Termin abgeklärt werden.`
    },
    {
      id: "faq_rheumatology",
      title: "FAQ – Rheumatologie & Innere Medizin",
      content: `Rheumatologie & Innere Medizin

Welche Erkrankungen behandelt die Rheumatologie?
Unsere Rheumatologie behandelt entzündliche Gelenkerkrankungen, Weichteilrheuma und andere rheumatische Erkrankungen.

Was umfasst die Innere Medizin bei functiomed?
Die Innere Medizin befasst sich mit Erkrankungen der inneren Organe, wie Herz, Lunge, Leber und Nieren.

Wie erfolgt die Diagnosestellung?
Wir nutzen Laboruntersuchungen und bildgebende Verfahren, um eine genaue Diagnose zu stellen.

Muss ich nüchtern zur Blutabnahme erscheinen?
Für bestimmte Blutuntersuchungen ist es erforderlich, nüchtern zu sein. Wir informieren Sie rechtzeitig.`
    },
    {
      id: "faq_integrative",
      title: "FAQ – Integrative Medizin",
      content: `Integrative Medizin

Was versteht man unter integrativer Medizin?
Integrative Medizin kombiniert schulmedizinische Verfahren mit komplementären Therapien für eine ganzheitliche Behandlung.

Welche Therapien werden angeboten?
Wir bieten Akupunktur, Homöopathie, Infusionstherapien, Colon Hydro Therapie, Ozontherapie, Orthomolekularmedizin, Ernährungsberatung und Mental Coaching an.

Ist integrative Medizin wissenschaftlich anerkannt?
Viele Methoden sind wissenschaftlich untersucht und ergänzen die Schulmedizin.

Wie finde ich die passende Therapie für mich?
In einem persönlichen Gespräch ermitteln wir gemeinsam die geeigneten Therapieansätze.`
    },
    {
      id: "faq_complementary",
      title: "FAQ – Komplementärmedizin",
      content: `Komplementärmedizin

Was beinhaltet die Komplementärmedizin bei functiomed?
Unsere Komplementärmedizin umfasst Akupunktur, Homöopathie, medizinische Massagen und weitere alternative Heilmethoden.

Wie läuft eine Akupunktursitzung ab?
Feine Nadeln werden an spezifischen Punkten gesetzt, um den Energiefluss zu harmonisieren. Für Kinder oder alle die Nadeln nicht mögen und doch von den fernöstlichen Heilkünsten profitieren wollen, bieten wir Tuina an. Tuina ist eine chinesische Massageform, die auf der traditionellen chinesischen Medizin beruht. Mit diversen manuellen Techniken kann der Energie-Fluss mit Tuina positiv beeinflusst werden, Blockaden lösen sich auf und Körper und Seele kommen in Einklang.

Ist Homöopathie für Kinder geeignet?
Ja, Homöopathie kann auch bei Kindern angewendet werden. Bei Kindern verwendet man keine Nadeln.

Welche Massagetechniken werden angeboten?
Wir bieten klassische Massagen, Fußreflexzonenmassagen, Hot-Stone-Massagen, Japanische Gesichtsmassage, Lomi Lomi, Schwangerschaftsmassage, Anti Cellulite Massage, Manuelle Lymphdrainage, Shiatsu und Sportmassagen an.`
    },
    
    // ========== FAQs IN ENGLISH ==========
    {
      id: "faq_general_en",
      title: "FAQ – General Practice Questions",
      content: `General Practice Questions

Are there parking facilities at functiomed?
Yes, free parking spaces are available directly in front of the practice. Additionally, public parking spaces are located nearby.

What are the practice opening hours?
Our regular opening hours are Monday through Friday from 08:00 to 18:00. Appointments outside these hours are possible by arrangement.

How can I make an appointment?
Appointments can be made by phone, by email, or through the online tool on our website.

What languages do the staff speak?
Our team speaks German, English, French, and Italian, and many more. Please let us know your preferred language if needed.`
    },
    {
      id: "faq_orthopedics_en",
      title: "FAQ – Orthopedics & Traumatology / Sports Medicine",
      content: `Orthopedics & Traumatology / Sports Medicine

What does orthopedics treat at functiomed?
Orthopedics at functiomed deals with diseases and injuries of the musculoskeletal system, including bones, joints, muscles, and tendons.

What services does sports medicine offer?
Our sports medicine includes prevention, diagnosis, and treatment of sports-related injuries. We support both recreational and professional athletes.

Do I need a referral for an appointment?
No, you can make an appointment directly with us. A referral is not mandatory unless you are in a special insurance model, such as the family doctor model.

Are the costs covered by health insurance?
The costs for orthopedic and traumatological treatments are usually covered by basic insurance or accident insurance.`
    },
    {
      id: "faq_osteopathy_en",
      title: "FAQ – Osteopathy & Etiopathy",
      content: `Osteopathy & Etiopathy

Who is osteopathic treatment suitable for?
Osteopathy is suitable for people of all ages, from newborns to seniors.

How many sessions are necessary?
The number of sessions varies depending on the condition. Generally, several sessions are necessary.

Is osteopathy paid for by health insurance?
Many supplementary insurance policies cover part of the costs for osteopathic treatments. Cost coverage must be clarified by the patient before the appointment.`
    },
    {
      id: "faq_rheumatology_en",
      title: "FAQ – Rheumatology & Internal Medicine",
      content: `Rheumatology & Internal Medicine

What conditions does rheumatology treat?
Our rheumatology treats inflammatory joint diseases, soft tissue rheumatism, and other rheumatic diseases.

What does internal medicine at functiomed include?
Internal medicine deals with diseases of the internal organs, such as heart, lungs, liver, and kidneys.

How is diagnosis made?
We use laboratory tests and imaging procedures to make an accurate diagnosis.

Do I need to be fasting for blood tests?
For certain blood tests, it is required to be fasting. We will inform you in advance.`
    },
    {
      id: "faq_integrative_en",
      title: "FAQ – Integrative Medicine",
      content: `Integrative Medicine

What is integrative medicine?
Integrative medicine combines conventional medical procedures with complementary therapies for holistic treatment.

What therapies are offered?
We offer acupuncture, homeopathy, infusion therapies, colon hydrotherapy, ozone therapy, orthomolecular medicine, nutritional counseling, and mental coaching.

Is integrative medicine scientifically recognized?
Many methods are scientifically studied and complement conventional medicine.

How do I find the right therapy for me?
In a personal consultation, we determine together the appropriate therapeutic approaches.`
    },
    {
      id: "faq_complementary_en",
      title: "FAQ – Complementary Medicine",
      content: `Complementary Medicine

What does complementary medicine at functiomed include?
Our complementary medicine includes acupuncture, homeopathy, medical massages, and other alternative healing methods.

How does an acupuncture session work?
Fine needles are placed at specific points to harmonize the energy flow. For children or anyone who doesn't like needles but still wants to benefit from Eastern healing arts, we offer Tuina. Tuina is a Chinese massage form based on traditional Chinese medicine. With various manual techniques, the energy flow can be positively influenced with Tuina, blockages are released, and body and soul come into harmony.

Is homeopathy suitable for children?
Yes, homeopathy can also be used in children. In children, no needles are used.

What massage techniques are offered?
We offer classical massages, foot reflexology massages, hot stone massages, Japanese facial massage, Lomi Lomi, pregnancy massage, anti-cellulite massage, manual lymph drainage, Shiatsu, and sports massages.`
    },
    
    // ========== FAQs IN FRENCH ==========
    {
      id: "faq_general_fr",
      title: "FAQ – Questions générales sur la pratique",
      content: `Questions générales sur la pratique

Y a-t-il des places de parking chez functiomed?
Oui, des places de parking gratuites sont disponibles directement devant la pratique. De plus, des places de parking publiques se trouvent à proximité.

Quels sont les horaires d'ouverture de la pratique?
Nos horaires d'ouverture réguliers sont du lundi au vendredi de 08h00 à 18h00. Les rendez-vous en dehors de ces heures sont possibles sur rendez-vous.

Comment puis-je prendre rendez-vous?
Les rendez-vous peuvent être pris par téléphone, par e-mail ou via l'outil en ligne sur notre site web.

Quelles langues parlent les membres du personnel?
Notre équipe parle allemand, anglais, français et italien, et bien d'autres. Veuillez nous faire savoir votre langue préférée si nécessaire.`
    },
    {
      id: "faq_orthopedics_fr",
      title: "FAQ – Orthopédie & Traumatologie / Médecine du sport",
      content: `Orthopédie & Traumatologie / Médecine du sport

Que traite l'orthopédie chez functiomed?
L'orthopédie chez functiomed traite les maladies et les blessures de l'appareil locomoteur, y compris les os, les articulations, les muscles et les tendons.

Quels services offre la médecine du sport?
Notre médecine du sport comprend la prévention, le diagnostic et le traitement des blessures liées au sport. Nous soutenons les athlètes récréatifs et professionnels.

Ai-je besoin d'une référence pour un rendez-vous?
Non, vous pouvez prendre rendez-vous directement avec nous. Une référence n'est pas obligatoire sauf si vous êtes dans un modèle d'assurance spécial, tel que le modèle de médecin de famille.

Les coûts sont-ils couverts par l'assurance maladie?
Les coûts des traitements orthopédiques et traumatologiques sont généralement couverts par l'assurance de base ou l'assurance accident.`
    },
    {
      id: "faq_osteopathy_fr",
      title: "FAQ – Ostéopathie & Étiopathie",
      content: `Ostéopathie & Étiopathie

Pour qui le traitement ostéopathique est-il adapté?
L'ostéopathie est adaptée aux personnes de tous âges, des nouveau-nés aux seniors.

Combien de séances sont nécessaires?
Le nombre de séances varie selon la condition. En général, plusieurs séances sont nécessaires.

L'ostéopathie est-elle payée par l'assurance maladie?
De nombreuses assurances complémentaires couvrent une partie des coûts des traitements ostéopathiques. La couverture des coûts doit être clarifiée par le patient avant le rendez-vous.`
    },
    {
      id: "faq_rheumatology_fr",
      title: "FAQ – Rhumatologie & Médecine interne",
      content: `Rhumatologie & Médecine interne

Quelles maladies la rhumatologie traite-t-elle?
Notre rhumatologie traite les maladies articulaires inflammatoires, les rhumatismes des tissus mous et d'autres maladies rhumatismales.

Que comprend la médecine interne chez functiomed?
La médecine interne traite les maladies des organes internes, tels que le cœur, les poumons, le foie et les reins.

Comment le diagnostic est-il établi?
Nous utilisons des tests de laboratoire et des procédures d'imagerie pour établir un diagnostic précis.

Dois-je être à jeun pour les prises de sang?
Pour certains tests sanguins, il est nécessaire d'être à jeun. Nous vous informerons à l'avance.`
    },
    {
      id: "faq_integrative_fr",
      title: "FAQ – Médecine intégrative",
      content: `Médecine intégrative

Qu'est-ce que la médecine intégrative?
La médecine intégrative combine les procédures médicales conventionnelles avec les thérapies complémentaires pour un traitement holistique.

Quelles thérapies sont proposées?
Nous proposons l'acupuncture, l'homéopathie, les thérapies par perfusion, l'hydrothérapie du côlon, l'ozonothérapie, la médecine orthomoléculaire, le conseil nutritionnel et le coaching mental.

La médecine intégrative est-elle scientifiquement reconnue?
De nombreuses méthodes sont scientifiquement étudiées et complètent la médecine conventionnelle.

Comment trouver la thérapie qui me convient?
Lors d'une consultation personnelle, nous déterminons ensemble les approches thérapeutiques appropriées.`
    },
    {
      id: "faq_complementary_fr",
      title: "FAQ – Médecine complémentaire",
      content: `Médecine complémentaire

Que comprend la médecine complémentaire chez functiomed?
Notre médecine complémentaire comprend l'acupuncture, l'homéopathie, les massages médicaux et d'autres méthodes de guérison alternatives.

Comment se déroule une séance d'acupuncture?
Des aiguilles fines sont placées à des points spécifiques pour harmoniser le flux d'énergie. Pour les enfants ou tous ceux qui n'aiment pas les aiguilles mais veulent quand même bénéficier des arts de guérison orientaux, nous proposons le Tuina. Le Tuina est une forme de massage chinois basée sur la médecine traditionnelle chinoise. Avec diverses techniques manuelles, le flux d'énergie peut être positivement influencé avec le Tuina, les blocages sont libérés et le corps et l'âme entrent en harmonie.

L'homéopathie est-elle adaptée aux enfants?
Oui, l'homéopathie peut également être utilisée chez les enfants. Chez les enfants, aucune aiguille n'est utilisée.

Quelles techniques de massage sont proposées?
Nous proposons des massages classiques, des massages de réflexologie plantaire, des massages aux pierres chaudes, des massages faciaux japonais, Lomi Lomi, massages de grossesse, massages anti-cellulite, drainage lymphatique manuel, Shiatsu et massages sportifs.`
    },
    
    // ========== HYALURONIC ACID INFORMATION ==========
    {
      id: "hyaluronic_acid_info",
      title: "Merkblatt Hyaluronsäure",
      content: `Merkblatt Hyaluronsäure
Was ist die Hyaluronsäure?
Die Hyaluronsäure ist Hauptbestandteil der Synovia (Gelenkflüssigkeit). Es wirkt als Schmiermittel und als "Stossdämpfer" bei allen Gelenkbewegungen. Sie dient ebenfalls als Platzhalter und hält dadurch die Gelenkflächen auf Distanz. Das Grundprinzip der Therapie ist daher, den Hyaluronsäure-Anteil im Gelenk wieder zu erhöhen. Die Präparate (z.B. Ostenil) entsprechen zu 100% der Struktur der menschlichen Hyaluronsäure.

Wann wird die Therapie mit Hyaluronsäure angewendet?
Die Therapie wird vor allem bei Reizzuständen im Gelenk, Knorpelschäden und Arthrose angewendet. Degenerative Knorpelschädigungen und Arthrose sind die typischen Abnutzung- und Verschleißerscheinungen der Gelenke und eine natürliche Folge unseres Alterungsprozesses. Zerstörtes Knorpelgewebe kann vom Körper nicht mehr selber ersetzt werden.

Erste Anzeichen für eine Arthrose sind; Anlaufschmerzen, Knirschen im Gelenk, eingeschränkte Beweglichkeit, Ruhe- und Nachtschmerz, Entzündung und Schwellung. Arthrose wird in 4 Stadien unterteilt.

Ziel der Therapie mit Hyaluronsäure:
- Reduzierung der Schmerzen
- Verbesserung der Beweglichkeit
- Geringere Notwendigkeit von Schmerzmitteln
- Optimale Patientenzufriedenheit
- Erhöhung der Hyaluronsäure in der Gelenkflüssigkeit

Wie läuft die Behandlung ab?
Der Arzt injiziert das jeweilige Produkt gezielt in den Gelenkspalt.

Welche Kontraindikationen/Risiken bestehen?
Hyaluronsäure zeigt fast nie negativ Nebenwirkungen in der Anwendung. Die Hauptrisiken sind prinzipiell ein Gelenkinfekt oder eine Einblutung. Einschränkungen bestehen somit bei Patienten mit Blutverdünnung (Antikoagulation) oder deutlich erhöhter Infekt Gefährdung (reduziertem Immunstatus).

Wie sind die Kosten?
Es handelt sich bei der Therapie mit Hyaluronsäure um keine Pflichtleistung der obligatorischen Grundsicherung. Erfahrungsgemäss wird die Therapie auch nicht von der Zusatzversicherung bezahlt. Aufgrund dessen verpflichten Sie sich mit Ihrer Unterschrift, die Behandlung nach dem Termin bei uns am Empfang zu begleichen (Karte oder Twint).

In der Regel erfolgt eine Therapie in 3 Sitzungen im Abstand von einem Monat. Die Kosten sind je nach Wahl des Produktes unterschiedlich. Die Wahl des Produktes entscheidet der behandelnde Arzt.

Preise pro Sitzung:
- Ostenil CHF 150.- bis 200.-
- Ostenil Plus CHF 200.- bis 250.-

Hiermit bestätige ich, dass ich das obige Merkblatt durchgelesen habe und einverstanden bin mit der Behandlung.`
    },
    
    // ========== PATIENT DATA HANDLING INFORMATION ==========
    {
      id: "patient_data_handling",
      title: "PATIENTENINFORMATION ZUM UMGANG MIT PATIENTENDATEN",
      content: `PATIENTENINFORMATION ZUM UMGANG MIT PATIENTENDATEN
Nachfolgend informieren wir Sie darüber, zu welchem Zweck die functiomed (nachfolgend Zentrum) Ihre Personendaten erhebt, speichert oder weiterleitet. Zusätzlich informieren wir Sie über Ihre Rechte, welche Sie im Rahmen des Datenschutzes wahrnehmen können.

Verantwortlichkeiten
Die verantwortliche Stelle für die Bearbeitung Ihrer Personendaten und insbesondere Ihrer Gesundheitsdaten ist das Zentrum. Bei Fragen zum Datenschutz oder wenn Sie Ihre Rechte im Rahmen des Datenschutzes wahrnehmen wollen, wenden Sie sich bitte an das Praxispersonal.

Erhebung und Zweck der Datenbearbeitung
Die Bearbeitung (Erhebung, Speicherung, Verwendung sowie Aufbewahrung) Ihrer Daten erfolgt aufgrund des Behandlungsvertrages und gesetzlicher Vorgaben zur Erfüllung des Behandlungszwecks sowie zu den damit verbundenen Pflichten. Die Erhebung von Daten erfolgt einerseits durch die/den behandelnde/n Ärztin/Arzt oder der/die Therapeuten/In im Rahmen Ihrer Behandlung. Andererseits erhalten wir auch Daten von weiteren Ärztinnen/Ärzten und Gesundheitsfachpersonen, bei denen Sie in Behandlung waren oder sind, falls Sie hierfür Ihre Einwilligung gegeben haben. In Ihrer Krankengeschichte werden nur Daten bearbeitet, die im Zusammenhang mit Ihrer medizinischen Behandlung stehen. Die Krankengeschichte umfasst die auf dem Patientenformular gemachten persönlichen Angaben wie Personalien, Kontaktdaten und Versicherungsangaben sowie unter anderem das im Rahmen der Behandlung durchgeführte Aufklärungsgespräch, erhobene Gesundheitsdaten wie Anamnesen, Diagnosen, Therapievorschläge und Befunde.

Dauer der Aufbewahrung
Ihre Krankengeschichte wird während 20 Jahren nach Ihrer letzten Behandlung aufbewahrt. Danach wird sie mit Ihrer ausdrücklichen Einwilligung weiter aufbewahrt oder sicher gelöscht bzw. vernichtet.

Weitergabe der Daten
Ihre Personendaten und insbesondere Ihre medizinischen Daten übermitteln wir nur dann an externe Dritte, wenn dies gesetzlich erlaubt oder verlangt ist oder wenn Sie im Rahmen Ihrer Behandlung in die Weitergabe der Daten eingewilligt haben.

- Die Übermittlung an Ihre Krankenversicherung bzw. an die Unfall- oder Invalidenversicherung erfolgt zum Zweck der Abrechnung der Ihnen gegenüber erbrachten Leistungen. Die Art der übermittelten Daten orientiert sich dabei an den gesetzlichen Vorgaben.
- Die Weitergabe an kantonale sowie nationale Behörden (z.B. kantonsärztlicher Dienst, Gesundheitsdepartemente etc.) erfolgt aufgrund gesetzlicher Meldepflichten.
- Die Weitergabe der notwendigen Patienten- und Rechnungsdaten an das Inkassobüro erfolgt zwecks Inkassos (Einziehen von fälligen Geldforderungen).
- Im Einzelfall, abhängig von Ihrer Behandlung und Ihrer entsprechenden Einwilligung, erfolgt die Übermittlung von Daten an weitere berechtigte Empfänger (z.B. Labore, andere Ärztinnen und Ärzte, andere Gesundheitsfachpersonen).

Interne Dateneinsicht
Alle in Ihrer Behandlung involvierten Gesundheitsfachpersonen der functiomed haben Einsicht in Ihre Personen- und medizinische Daten. Gesundheitsfachpersonen sind verpflichtet, das Berufs- oder Arztgeheimnis zu wahren. Alle erhaltenen Informationen müssen vertraulich behandelt werden. Grundsätzlich dürfen sie ohne Einwilligung keine Informationen an Dritte weitergeben.

Widerruf Ihrer Einwilligung
Haben Sie für eine Datenbearbeitung Ihre ausdrückliche Einwilligung gegeben, können Sie eine bereits erteilte Einwilligung jederzeit ganz oder teilweise widerrufen. Der Widerruf oder der Wunsch nach Änderung einer Einwilligung hat schriftlich zu erfolgen. Sobald wir Ihren schriftlichen Widerruf erhalten haben und die Bearbeitung auf keine andere Rechtsgrundlage als die Einwilligung gestützt werden kann, wird die Bearbeitung eingestellt. Die Rechtmässigkeit der bis zum Widerruf erfolgten Datenbearbeitung bleibt vom Widerruf unberührt.

Auskunft, Einsicht und Herausgabe
Sie haben jederzeit das Recht, Auskunft zu Ihren Personendaten zu erhalten. Sie können Ihre Krankengeschichte einsehen oder auch eine Kopie verlangen. Die Herausgabe der Kopie kann kostenpflichtig sein. Allfällige Kosten, welche vom Aufwand der Erstellung der Kopie abhängen, werden Ihnen vorgängig bekannt gegeben.

Recht auf Datenübertragung
Sie haben das Recht, Daten, die wir automatisiert bzw. digital verarbeiten, an sich oder an einen Dritten in einem gängigen, maschinenlesbaren Format aushändigen zu lassen. Dies gilt insbesondere auch bei der Weitergabe von medizinischen Daten an eine von Ihnen gewünschte Gesundheitsfachperson. Sofern Sie die direkte Übertragung der Daten an einen anderen Verantwortlichen verlangen, erfolgt dies nur, soweit es technisch machbar ist.

Berichtigung Ihrer Angaben
Wenn Sie feststellen oder der Ansicht sind, dass Ihre Daten nicht korrekt oder unvollständig sind, haben Sie die Möglichkeit, eine Berichtigung zu verlangen. Kann weder die Korrektheit noch die Unvollständigkeit Ihrer Daten festgestellt werden, haben Sie die Möglichkeit auf die Anbringung eines Bestreitungsvermerks.`
    },
    
    // ========== VISANA BILLING INFORMATION ==========
    {
      id: "visana_osteopathy_billing",
      title: "VISANA - Informationen Leistungsabrechnung Osteopathie",
      content: `VISANA
Informationen Leistungsabrechnung Osteopathie

Folgende Osteopathen von functiomed sind auf der Therapeutenliste von Visana aufgeführt:
- Tiffany Roth
- Luisa Furrer
- Philipp Zuber
- Mona Reuss
- Fanny Guggisberg

Die Visana gibt einen Richtpreis für die Behandlung vor und akzeptiert für die Osteopathie pro 5min CHF 15.-, dies entspricht jedoch nicht der Tarifstruktur von functiomed.

Um den Visana Patienten trotzdem eine Kostenübernahme durch Visana zu ermöglichen wurde eine Kompromisslösung vereinbart. Somit wurde eine separate Kostenaufstellung für Visana Patienten erstellt, welche die Preisvorstellung von Visana wie auch diese von functiomed gerecht wird.

Die Behandlung wird mit dem Tarif 1203 für die Osteopathie pro 5min mit CHF 15.- verrechnet, bei 45min entspricht dies Fr. 135.-, da eine Behandlung von 45min bei functiomed Fr. 159.- kostet, entsteht eine Preisdifferenz von Fr. 24.-.

Dieser fehlende Betrag listet die functiomed auf der Rechnung mit "Nicht versicherte Kosten" auf, diese Kosten gehen zu Lasten des Patienten.

WICHTIG: Die Visana beteiligt sich somit nur an einem Teil der Rechnung. Gerne können Sie bei der Krankenkasse direkt nachfragen wie hoch diese Beteiligung ist.

Preise von functiomed:
- 30min Fr. 108.-
- 45min Fr. 159.-
- Erstkonsultation zusätzlich Fr. 20.-
- Notfallzuschlag zusätzlich Fr. 40.-

Diese Kompromisslösung mit Visana ist für die functiomed ein Mehraufwand, trotzdem ist dies die einzige Möglichkeit für den Patienten von der Kostenbeteiligung seitens Visana Gebrauch zu machen. Aus diesem Grund haben wir uns entschieden, unsere Patienten dabei zu unterstützen.

Transparenz und Aufklärung ist uns wichtig, falls Sie Fragen haben, wenden Sie sich bitte an:
Ursula Baumberger, COO/Stv. Geschäftsführerin
ursula.baumberger@functiomed.ch

Wir freuen uns für Sie da sein zu dürfen.
Ihre functiomed`
    },
    
    // ========== PATIENT REGISTRATION FORM ==========
    {
      id: "patient_registration_form",
      title: "PATIENTENANMELDUNG",
      content: `PATIENTENANMELDUNG

Name / Cognome / Nom:
Vorname / Nome / Prénom:
Geschlecht: m / w / d
Geburtsdatum / Data di nascita / Date de naissance:
Tel / Mobile:
E-Mail:
Strasse / Nr.:
PLZ / Wohnort:
Hausärztin / Arzt:
Krankenversicherung:
Versicherten-Nr.:

Gesetzliche Vertretung (bitte ausfüllen, sofern gegeben und nicht identisch mit Personalien der Patienten / des Patienten)
Name und Vorname:
E-Mail:

Patientenerklärung
Ich bestätige mit meiner Unterschrift, dass ich mit der Bearbeitung meiner Daten, den Zugriffen auf die Daten durch die Ärztin/Arzt oder Therapeut/Therapeutin, sowie der Weitergabe der Daten an Dritte gemäss Patienteninformation zum Umgang mit Patientendaten auf der folgenden Seite einverstanden bin.

Ich bestätige mit meiner Unterschrift, dass ich die Patientenaufklärung und -erklärung gelesen und verstanden habe. Bei Unklarheiten oder Fragen, werde ich den behandelnden Arzt oder Therapeuten ansprechen.

Ich ermächtige mein ein Arzt/Therapeut, medizinische Akten wie Untersuchungsbefunde, Bildmaterialien, Gutachten, Akten von Behörden, Versicherungsträgern, Beurteilungen, sowie Arzt- oder Krankenhausberichten über abgeschlossene und noch laufende Behandlungen über mich zur Einsicht einzufordern und in meinem Interesse auch weiter zu leiten. Mir ist bekannt, dass ich diese Erklärung über die Entbindung von der Schweigepflicht jederzeit mit Wirkung für die Zukunft widerrufen kann.

Ich erkläre mich damit einverstanden, dass meine Mailadresse für den Newsletter von functiomed verwendet werden darf.

Ich bin mir möglicher Risiken des Datenaustausches von besonders schützenswerten Personendaten (mögliche Einsicht von unberechtigten Dritten bei unsicheren Kommunikationswegen) sowie meiner Rechte bewusst und gebe mein Einverständnis für den gegenseitigen Kontakt zwischen meiner Ärztin/meinem Arzt, meinem Therapeuten/meiner Therapeutin, dem Gesundheitspersonal von functiomed und mir als Patient/in durch die oben angegebenen Kontaktinformationen. Patienteninformationen werden seitens der Gesundheitspraxis wann immer möglich über gesicherte Kommunikationswege weitergegeben. Ich bin einverstanden, dass administrative Anliegen wie zum Beispiel Terminverschiebungen mit unverschlüsselter E-Mail-Kommunikation (@hin-Adresse/@functiomed-Adresse zu Empfängeradresse wie @bluewin.ch, @gmail.com etc.) erfolgen.

Komplementär-Medizin und Nichtpflichtleistungen
- Der Patient/die Patientin ist verpflichtet die Kostenübernahme vor dem Termin mit der Zusatz- oder Unfallversicherung abzuklären
- Verrechnung nach geleisteten Zeitaufwand, pro angefangene 5 Minuten nach dem Tarif 590
- Aktenstudium und Führung der Krankengeschichte ist Teil der Konsultationszeit
- Direkte Leistungsabrechnung mit den Versicherungen ist in der Komplementärmedizin nicht erlaubt
- Patienten*Innen ohne Zusatzversicherung werden als Privatpatienten/Selbstzahler behandelt
- Die Behandlung ist vor Ort zu bezahlen mit TWINT und EC/Maestro-Karten (kein American Express), Barzahlungen möglich, jedoch haben wir kein Wechselgeld
- Bei Postversand wird ein Zuschlag von Fr. 3.50 verrechnet
- Den Rückforderungsbeleg für Ihre Versicherung erhalten Sie via E-Mail
- Mahngebühren bei Zahlungsverzug: 1. Mahnung Fr. 5.- / 2. Mahnung Fr. 10.-

Patientenaufklärung Manuelle Medizin
Wir sind juristisch verpflichtet, Sie über seltene, aber mögliche Komplikationen durch eine manualtherapeutische Mobilisation oder Manipulation aufzuklären. Hierbei ist auch die vollständige Information über Vorerkrankungen oder chronische Erkrankungen wichtig, welche in der Anamnese erfasst werden. So kann trotz sachgemässer Durchführung einer manualtherapeutischen Behandlung an der Hals-, Brust- und Lendenwirbelsäule ein bisher klinisch stummer Bandscheibenvorfall symptomatisch werden. Mögliche Symptome sind Kribbeln, Taubheitsgefühl oder Muskellähmungen an Armen oder Beinen. Zudem kann eine Behandlung an der Halswirbelsäule in sehr seltenen Fällen zu einer Gefäßverletzung der hirnversorgenden Gefäße (Schlaganfall) kommen. Des Weiteren kann ein Wirbelkörper durch eine Behandlung bei bisher nicht diagnostizierter Osteoporose oder bei Metastasenbefall brechen. Es gibt jedoch Behandlungsalternativen, wenn eine manualmedizinische Manipulation nicht in Frage kommt. Bei Unklarheiten oder Fragen, wenden Sie sich bitte an den behandelnden Arzt oder Therapeuten.

Patientenaufklärung Gelenkinjektionen / Infiltrationen / ACP / Dry Needling
Trotz sachgerechter Ausführung und Einhaltung sämtlicher Sterilitätskriterien kann es bei diesen Behandlungen zu Nebenwirkungen kommen. Dazu gehören lokale Hämatome am Ort der Behandlung, sowie muskelkaterähnliches Gefühl an der behandelten Stelle. Infektion des jeweiligen Gelenkes oder der umgebenden Weichteile, sowie allergische Reaktionen können weitere Nebenwirkungen sein. Weitere Komplikationen bei Dry Needling sind Verletzungen innerer Organe z.B. der Lunge, Verletzungen von Nerven oder Gefässen, sowie Abbrechen der Nadel. Diese Komplikationen sind wie erwähnt äusserst selten und lediglich der Vollständigkeitshalber hier aufgeführt. Sollten Sie nach Eingriffen plötzlich eine massive Schmerzsymptomatik, Rötung, Schwellung, Fieber oder Schüttelfrost entwickeln, bitten wir Sie, umgehend mit uns Kontakt aufzunehmen oder sich im nächsten Krankenhaus vorzustellen.

Patientenaufklärung Infusionstherapien
Dieses Dokument bestätigt meine Einwilligung zur IV-Therapie. Ich habe alle aktuellen Medikamente und Nahrungsergänzungsmittel sowie bekannte Allergien und frühere Reaktionen auf Anästhetika mitgeteilt. Ich verstehe, dass ich über das Verfahren, mögliche Alternativen sowie die Risiken und Vorteile der IV-Therapie informiert werde. Mit meiner Unterschrift bestätige ich, dass dieses Verfahren das Einführen einer Nadel in die Venen und die Verabreichung einer Infusionslösung umfasst, die in der Schweiz als Off-Label-Gebrauch gilt.

Die potenziellen Risiken der IV-Therapie sind:
Gelegentlich: Unbehagen, Blutergüsse, Schmerzen an der Injektionsstelle.
Selten: Venenentzündung, Phlebitis, Stoffwechselstörungen, Verletzungen.
Äußerst selten: Schwere allergische Reaktionen, Anaphylaxie, Infektionen, Herzstillstand, Tod.

Ich bin mir der möglichen unvorhersehbaren Komplikationen bewusst und vertraue darauf, dass das medizinische Personal nach bestem Wissen und Gewissen handelt. Ich verstehe die Risiken und Vorteile des Verfahrens und hatte die Gelegenheit, alle Fragen zu stellen. Ich weiß, dass ich das Recht habe, eine Behandlung jederzeit zuzustimmen oder abzulehnen. Mit meiner Unterschrift bestätige ich, dass ich der IV-Therapie zugestimmt habe und verstehe, dass alle Nährstoffinfusionen als experimentell und nicht als Standardpflege gelten.`
    },
    
    // ========== PATIENT DATA HANDLING INFORMATION (ENGLISH) ==========
    {
      id: "patient_data_handling_en",
      title: "PATIENT INFORMATION CONCERNING THE HANDLING OF PATIENT DATA",
      content: `PATIENT INFORMATION
CONCERNING THE HANDLING OF PATIENT DATA
In the following, we inform you about the purpose for which functiomed (hereinafter referred to as the "Centre") collects, stores or passes on your personal data. In addition, we inform you about your rights that you can exercise within the framework of data protection regulations.

Responsibilities
The body responsible for the processing of your personal data, and in particular your health data, is the Centre. If you have any questions about data protection, or if you want to exercise your rights under data protection regulations, please contact the practice staff.

Collection of data and purpose of data processing
Your data is processed (collected, stored, used and retained) on the basis of your treatment contract and legal requirements in order to fulfil the purpose of the treatment and the associated obligations. On the one hand, data is collected by the doctor or therapist providing treatment within the framework of your treatment. On the other hand, we also receive data from other doctors and healthcare professionals with whom you have been or are undergoing treatment, if you have given your consent to this. Only data that is related to your medical treatment will be processed in your medical history. The medical history includes the personal information provided on the patient form, such as personal particulars, contact details and insurance information, as well as, among other things, the informed consent discussion carried out during treatment and health data collected, such as case histories, diagnoses, therapy suggestions and findings.

Duration of retention
Your medical history will be retained for 20 years after your last treatment. After that, it will continue to be stored, with your express consent, or will be securely deleted or destroyed.

Disclosure of personal data
We only pass on your personal data, and, in particular, your medical data, to external third parties if this is permitted or required by law or if you have consented to the disclosure of data within the framework of your treatment.

- Data is transferred to your health insurance provider, or the accident or disability insurance provider, for the purpose of billing the services provided to you. The type of data transmitted is based on the legal requirements.
- Disclosure to cantonal and national authorities (e.g., the cantonal medical service, public health departments, etc.) is based on legal reporting obligations.
- The necessary patient and invoice data will be passed on to the collection agency for the purpose of debt collection (collection of due claims for money).
- In individual cases, depending on your treatment and your corresponding consent, data will be transmitted to other authorised recipients (e.g., laboratories, other doctors, other healthcare professionals).

Internal accessing of data
All functiomed healthcare professionals involved in your treatment have access to your personal and medical data. Healthcare professionals are obliged to maintain professional or medical secrecy. All information received must be treated with confidentiality. In principle, they may not pass on any information to third parties without consent.

Revocation of your consent
If you have given your express consent to data processing, you can revoke any consent you have already given, in whole or in part, at any time. The revocation of or request to change your consent must be made in writing. As soon as we have received your written revocation of consent and the processing is not able to be based on any legal basis other than your consent, the processing will be discontinued. Your revocation of your consent does not affect the legality of any data processing conducted prior to our receipt of it.

Information, access and issuance
You have the right to receive information about your personal data at any time. You can view your medical history or request a copy. The issuance of this copy may be subject to a fee. Any costs that depend on the effort required to create the copy will be announced to you in advance.

Right to data portability
You have the right to have data that we process automatically or digitally handed over to you or to a third party in a common, machine-readable format. This also applies, in particular, for the disclosure of medical data to a healthcare professional of your choice. If you request the direct transfer of data to another data controller, this will only occur if it is technically feasible.

Correction of your data
If you find or believe that your data is not correct or is incomplete, you have the option of requesting it be rectified. If it is not possible to determine whether your data is correct or incomplete, you have the option of attaching a note of contestation.`
    },
    
    // ========== VISANA BILLING INFORMATION (ENGLISH) ==========
    {
      id: "visana_osteopathy_billing_en",
      title: "VISANA - Information benefit accounting osteopathy",
      content: `VISANA
Information benefit accounting osteopathy

The following osteopaths of functiomed are listed on the therapist list of Visana:
- Tiffany Roth
- Luisa Furrer
- Philipp Zuber
- Mona Reuss
- Fanny Guggisberg

Visana sets a guideline price for the treatment and accepts CHF 15.- per 5 minutes for osteopathy, but this does not correspond to functiomed's rate structure.

In order to enable Visana patients to have their costs covered by Visana nevertheless, a compromise solution was agreed upon. Thus, a separate cost breakdown for Visana patients was created, which meets the price expectations of Visana as well as those of functiomed.

The treatment is charged with the tariff 1203 for osteopathy per 5min with CHF 15.-, with 45min this corresponds to Fr. 135.-, since a treatment of 45min costs Fr. 159.- at functiomed, a price difference of Fr. 24.- arises.

This missing amount is listed by functiomed on the invoice as "uninsured costs"; these costs are to be paid by the patient.

IMPORTANT: Visana will therefore only contribute to a part of the bill. You are welcome to ask the health insurance company directly how much this participation is.

Prices of functiomed:
- 30min Fr. 108.-
- 45min Fr. 159.-
- First consultation additional Fr. 20.-
- Emergency surcharge additional Fr. 40.-

This compromise solution with Visana is an additional expense for functiomed, nevertheless this is the only possibility for the patient to make use of the cost sharing on the part of Visana. For this reason, we have decided to support our patients in this process.

Transparency and education is important to us, if you have any questions, please contact:
Ursula Baumberger, COO/Deputy Managing Director
ursula.baumberger@functiomed.ch

We look forward to being there for you.
Your functiomed`
    },
    
    // ========== PATIENT REGISTRATION FORM (ENGLISH) ==========
    {
      id: "patient_registration_form_en",
      title: "PATIENT REGISTRATION",
      content: `PATIENT REGISTRATION

Surname / Cognome / Nom:
First name / Nome / Prénom:
Gender: m / f / other
Date of birth / Data di nascita / Date de naissance:
Phone / Mobile:
Email:
Street/No.:
Postcode/Place of residence:
General practitioner:
Health insurance provider:
Insurance no.:

Legal representation (please fill in if there is one and if not identical to the patient's personal details)
Surname and first name:
Email:

Patient Declaration
By providing my signature, I confirm that I agree to the processing of my data, to my data being accessed by the doctor or therapist, and to the transfer of my data to third parties in accordance with the Information for Patients on the Handling of Patient Data, on the following page.

By providing my signature, I confirm that I have read and understood the Information for Patients and the Patient Declaration. If I have any questions or if anything is unclear to me, I will contact the doctor or therapist providing my treatment.

I authorize my doctor/therapist to request medical files such as examination findings, image material, expert opinions, files from authorities, insurance companies, assessments, as well as doctor's or hospital reports on completed and ongoing treatments about me for inspection and to forward them in my interest. I am aware that I can revoke this declaration of release from the duty of confidentiality at any time with effect for the future.

I consent to my email address being used for the functiomed newsletter.

I am aware of the possible risks of exchanging particularly sensitive personal data (possible access by unauthorised third parties in the event of insecure communication channels) as well as of my rights, and I give my consent to contact being made mutually between my doctor, my therapist, the functiomed health staff and me as a patient, by means of the contact information provided above. Patient information is passed on by the health practice via secure communication channels whenever possible. I consent to administrative requests, such as rescheduling appointments, using unencrypted email communication (@hin-address/@functiomed address to recipient address, such as @bluewin.ch, @gmail.com, etc.)

Complementary medicine and non-compulsory services
- The patient is obliged to check the reimbursement of costs with the complementary or accident insurance before the appointment
- Billing according to time spent, per 5 minutes or part thereof according to the rate 590
- Studying files and keeping the medical history is part of the consultation time
- Direct billing of services to insurance companies is not permitted in complementary medicine
- Patients without supplementary insurance are treated as private patients/self-payers
- Treatment must be paid for on site using TWINT and EC/Maestro cards (no American Express), cash payments possible, but we do not have change
- A surplus of CHF 3.50 will be charged for postal delivery
- You will receive the reimbursement voucher for your insurance by e-mail
- Reminder fees for late payment: 1st reminder CHF 5.- / 2nd reminder CHF 10.-

Patient Information for Manual Therapy
We are legally obliged to inform you about rare, but possible, complications caused by mobilisation and manipulation performed in manual therapy. Having complete information about pre-existing conditions and chronic diseases, which are recorded in your medical history, is important in this regard. For example, despite proper implementation of manual therapeutic treatment on the cervical, thoracic and lumbar spine, an as yet clinically dormant herniated disc can become symptomatic. Symptoms include tingling, numbness, and muscle paralysis in the arms or legs. In addition, in very rare cases, treatment of the cervical spine can lead to vascular injury of the vessels supplying the brain (stroke). Furthermore, a vertebral body can break during treatment if previously undiagnosed osteoporosis or metastases is/are present. However, there are always treatment alternatives when manipulation using manual therapy methods is not an option. If you have any questions or if anything is unclear to you, please contact the doctor or therapist providing your treatment.

Patient Information for Joint Injections / Infiltration / ACP / Dry Needling
Despite proper execution and compliance with all criteria regarding sterility, these treatments can trigger side effects. These include local haematomas at the site of treatment or a sensation comparable to a muscle ache near the spot of treatment. Further side effects could appear as an infection of the respective joint or the surrounding soft tissue as well as allergic reactions. Other complications of dry needling can include injury to internal organs (such as the lungs), injury to nerves or blood vessels, or needle breakage. People with weak immune systems, in particular, are at an increased risk for this. As mentioned, these complications are extremely rare and are listed here solely for the sake of completeness. If you suddenly develop severe pain symptoms, redness, swelling, fever or chills after the procedure, please contact us immediately or go to the nearest hospital.

Patient Information IV-therapy / vitamin infusions
This document confirms my consent to IV therapy. I have disclosed all current medications and supplements as well as any known allergies and previous reactions to anesthetics. I understand that I will be informed about the procedure, possible alternatives, and the risks and benefits of IV therapy. By signing below, I acknowledge that this procedure involves the insertion of a needle into the veins and the administration of an IV solution, which is considered an off-label use in Switzerland.

The potential risks of IV therapy are:
Occasional: Discomfort, bruising, pain at the injection site.
Rare: Phlebitis, phlebitis, metabolic disorders, injury.
Extremely rare: Severe allergic reactions, anaphylaxis, infections, cardiac arrest, death.

I am aware of the possible unforeseeable complications and trust the medical staff to act to the best of their knowledge and belief. I understand the risks and benefits of the procedure and have had the opportunity to ask any questions. I understand that I have the right to consent to or refuse treatment at any time. By signing below, I acknowledge that I have consented to IV therapy and understand that all nutrient infusions are considered experimental and not standard care.`
    },
    
    // ========== ACCIDENT INFORMATION FOR PATIENTS (DOCTOR TREATMENT) ==========
    {
      id: "accident_info_patients_doctor",
      title: "Wichtige Mitteilung für Patienten mit einem Unfall",
      content: `Wichtige Mitteilung für Patienten mit einem Unfall
Sie wurden nach einer Unfallverletzung von einem Arzt/einer Ärztin der functiomed behandelt.
Wenn Sie in einem Anstellungsverhältnis arbeiten, sind Sie für Unfallbehandlungen durch Ihren Arbeitgeber versichert.
Es ist deshalb wichtig, dass Sie Ihren Unfall umgehend der Personalabteilung Ihres Arbeitgebers melden.

Wir benötigen den Namen der Unfallversicherung, die Referenz-/Schadennummer, sowie das exakte Unfalldatum Ihres Unfalls. Bitte melden Sie oder Ihr Arbeitgeber uns diese innerhalb von 7 Arbeitstagen.
Sie können uns diese Information per Telefon, E-Mail oder auf dem Postweg zukommen lassen oder das vollständig ausgefüllte Unfallformular direkt bei uns am Empfang abgeben.

Die Abrechnung erfolgt anschliessen direkt mit der Unfallversicherung.

- Selbstständig Erwerbende sind in der Regel bei der Krankenkasse gegen Unfall versichert
- Rentnerinnen und Rentner sind in der Regel bei der Krankenkasse gegen Unfall versichert
- Nicht erwerbstätige Personen sind bei der Krankenkasse gegen Unfall versichert
- Personen, welche wegen Arbeitslosigkeit bei der Arbeitslosenkasse (RAV) angemeldet sind, erhalten Ihr Unfallformular dort
- Kinder und Studenten sind bei der Krankenkasse gegen Unfall versichert

Information für den Arbeitgeber
In der Folge eines Unfalls musste eine Mitarbeiterin / ein Mitarbeiter Ihres Unternehmens bei der functiomed ärztlich behandelt werden.
Bitte melden Sie diesen Unfall schnellstmöglich bei Ihrer Versicherung, da wir für die administrative Bearbeitung dieser Behandlung folgendes benötigen:
- Anschrift Ihrer Unfallversicherung
- Referenz-/Schadennummer
- exaktes Unfalldatum

Sie können und dies direkt oder über Ihre Mitarbeitende / Ihren Mitarbeitenden zukommen lassen.

Haben Sie weitere Fragen?
Dann melden Sie sich gerne bei uns.

Herzlichem Dank für Ihre Mitarbeit!
Ihre functiomed`
    },
    
    // ========== CONTACT AND LOCATION INFORMATION ==========
    {
      id: "contact_location_info",
      title: "Kontaktinformationen und Standort",
      content: `Kontaktinformationen und Standort / Contact Information and Location / Informations de contact et localisation

Adresse / Address / Adresse:
functiomed AG
Langgrütstrasse 112
CH-8047 Zürich
Schweiz / Switzerland / Suisse

Standort / Location / Localisation:
Unser Standort befindet sich in Zürich, an der Langgrütstrasse 112. Sie finden uns in der Nähe des Stadtzentrums von Zürich.

Our location is in Zurich, at Langgrütstrasse 112. You can find us near the city center of Zurich.

Notre emplacement se trouve à Zurich, au Langgrütstrasse 112. Vous pouvez nous trouver près du centre-ville de Zurich.

Google Maps Standort / Google Maps Location / Localisation Google Maps:
https://maps.app.goo.gl/Wqm6sfWQUJUC1t1N6

Sie können diesen Link verwenden, um unsere genaue Position auf Google Maps zu finden und Wegbeschreibungen zu erhalten.

You can use this link to find our exact location on Google Maps and get directions.

Vous pouvez utiliser ce lien pour trouver notre emplacement exact sur Google Maps et obtenir des itinéraires.

Telefon / Phone / Téléphone:
+41 44 401 15 15

E-Mail / Email:
functiomed@hin.ch
aerzte.functiomed@hin.ch`
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
      content: `You are a highly skilled translator. Translate the following German text into ${languageNames[targetLanguage]}. Provide only the translated text, without any additional commentary or conversational filler. Maintain the same structure, formatting, and bullet points. Preserve all technical terms, names, and numbers exactly as they appear.` 
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
    const url = `internal://functiomed-content/${id}?lang=${language}`;
    
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
async function embedAllContent() {
  console.log('🚀 Starting complete Functiomed content embedding generation...\n');
  console.log(`📊 Total sections to process: ${allContent.sections.length}\n`);

  const languages = ['de', 'en', 'fr'];
  let totalChunks = 0;
  let successfulChunks = 0;
  let failedChunks = 0;

  for (let i = 0; i < allContent.sections.length; i++) {
    const section = allContent.sections[i];
    console.log(`\n[${i + 1}/${allContent.sections.length}] 📄 Processing: ${section.title}`);
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
            failedChunks++;
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
        successfulChunks++;
        console.log(`   ✓ Completed: ${chunkId}`);

        // Small delay between requests
        await delay(500);
      } catch (error) {
        console.error(`   ✗ Error processing ${lang} for ${section.id}:`, error.message);
        failedChunks++;
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ COMPLETED!`);
  console.log(`   Total sections: ${allContent.sections.length}`);
  console.log(`   Total chunks generated: ${totalChunks} (${allContent.sections.length} sections × ${languages.length} languages)`);
  console.log(`   Successful: ${successfulChunks}`);
  console.log(`   Failed: ${failedChunks}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('embedAllContent.js')) {
  embedAllContent()
    .then(() => {
      console.log('🎉 All content embedded successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    });
}

export { embedAllContent, translateText, generateEmbedding };

