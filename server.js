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
  const lines = text
    .split('\n')
    .map(line =>
      line
        .replace(/[¥¤¢¦©®]/g, '')                 // Sonderzeichen entfernen
        .replace(/\[[^\]]*\]/g, '')               // PGN-Kommentare entfernen
        .replace(/CBM|ext|Fritz|\/|\\/, '')        // typische Analysewörter raus
        .replace(/[^\x20-\x7EÄÖÜäöüß.,\-–0-9A-Za-z]/g, '') // Sonderzeichen raus
        .trim()
    )
    .filter(line => line.length > 0);

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

    // Datum erkennen
    const datumMatch = line.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (datumMatch) {
      aktuellePartie.datum = formatDatum(datumMatch[1]);
    }

    // Spielerzeile (nur echte Namen, z. B. „Name, V. – Name, V.“)
    if (line.includes('–') && line.includes(',')) {
      const [spieler, gegner] = line.split('–').map(s => s.trim());
      const valid = /^[A-ZÄÖÜa-zäöüß-]{2,},\s?[A-ZÄÖÜ]/.test(spieler);
      if (valid) {
        aktuellePartie.spieler = spieler;
        aktuellePartie.gegner = gegner || 'n/a';
      }
    }

    // Züge erfassen
    if (line.startsWith('1.')) {
      aktuellePartie.zuege = line;
      let j = i + 1;

      while (
        j < lines.length &&
        !lines[j].match(/^([A-ZÄÖÜa-zäöüß]+,|1–0|0–1|½–½)/)
      ) {
        aktuellePartie.zuege += ' ' + lines[j];
        j++;
      }
    }

    // Ergebnis erkennen
    const ergMatch = line.match(/(1–0|0–1|½–½)/);
    if (ergMatch) {
      aktuellePartie.ergebnis = ergMatch[1];

      if (
        aktuellePartie.zuege.startsWith('1.') &&
        aktuellePartie.zuege.length > 10 &&
        !aktuellePartie.zuege.includes('CBM') &&
        aktuellePartie.spieler !== 'Unbekannt'
      ) {
        partien.push({ ...aktuellePartie });
      }

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
