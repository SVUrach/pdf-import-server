const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const SUPABASE_URL = 'https://fbzzzzcmakhytfhylfwx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

app.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('❌ Keine Datei erhalten.');

  try {
    console.log(`📥 Datei empfangen: ${req.file.originalname}`);

    const data = await pdfParse(req.file.buffer);
    const text = data.text;

    const partien = extractPartien(text);
    let inserted = 0;

    for (const p of partien) {
      const { error } = await supabase.from('partien').insert(p);
      if (!error) inserted++;
      else console.error('❌ Fehler beim Einfügen:', error.message);
    }

    console.log(`✅ ${inserted} Partien importiert.`);
    res.send(`✅ ${inserted} Partien erfolgreich importiert.`);
  } catch (err) {
    console.error('❌ Fehler beim Verarbeiten der PDF:', err.message);
    res.status(500).send('Fehler beim Verarbeiten der PDF.');
  }
});

function extractPartien(text) {
  const lines = text.split('\n').map(l =>
    l
      .replace(/[¥¤¢¦©®]/g, '') // entferne Sonderzeichen
      .replace(/[^\x20-\x7EÄÖÜäöüß.,\-–0-9A-Za-z]/g, '') // entferne alles Nicht-Textliche außer Umlauten und Satzzeichen
      .trim()
  ).filter(l => l.length > 0);

  const partien = [];
  let aktuellePartie = {
    spieler: 'Unbekannt',
    gegner: 'n/a',
    datum: '0000-00-00',
    zuege: '',
    ergebnis: '',
    event: 'PDF-Import'
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Datum
    const datumMatch = line.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (datumMatch) {
      aktuellePartie.datum = formatDatum(datumMatch[1]);
    }

    // Spielerzeile (z. B. „Name, V. – Gegner, X.“)
    if (line.includes('–') && line.includes(',')) {
      const [spieler, gegner] = line.split('–').map(s => s.trim());
      if (spieler && spieler.match(/[A-Za-zÄÖÜäöüß]+\s*,\s*[A-ZÄÖÜ]/)) {
        aktuellePartie.spieler = spieler;
        aktuellePartie.gegner = gegner || 'n/a';
      }
    }

    // Zugbeginn
    if (line.match(/^1\./)) {
      aktuellePartie.zuege = line;
      let j = i + 1;
      while (j < lines.length && !lines[j].match(/^([A-ZÄÖÜa-zäöüß]+,|1–0|0–1|½–½)/)) {
        aktuellePartie.zuege += ' ' + lines[j];
        j++;
      }
    }

    // Ergebnis
    if (line.match(/(1–0|0–1|½–½)/)) {
      aktuellePartie.ergebnis = line.match(/(1–0|0–1|½–½)/)[1];

      if (aktuellePartie.zuege.length > 10) {
        partien.push({ ...aktuellePartie });

        // Neue Partie vorbereiten
        aktuellePartie = {
          spieler: 'Unbekannt',
          gegner: 'n/a',
          datum: '0000-00-00',
          zuege: '',
          ergebnis: '',
          event: 'PDF-Import'
        };
      }
    }
  }

  return partien;
}

function formatDatum(d) {
  const [tag, monat, jahr] = d.split('.');
  return `${jahr}-${monat}-${tag}`;
}

app.get('/', (req, res) => {
  res.send('📡 PDF-Import-Server läuft.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
