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
  const blocks = text.split(/\n\s*\n/);
  const partien = [];

  for (let block of blocks) {
    if (block.includes('1. ')) {
      const zeilen = block.split('\n');
      const datum = zeilen.find((z) => z.match(/\d{2}\.\d{2}\.\d{4}/));
      const spieler = zeilen.find((z) => z.match(/, [A-Z]/));
      const gegner = zeilen[1]?.trim() || 'Unbekannt';
      const zuege = zeilen.find((z) => z.startsWith('1.')) || '';
      const ergebnis = block.includes('1–0') ? '1–0' : block.includes('0–1') ? '0–1' : '½–½';

      if (spieler && gegner && datum && zuege.length > 10) {
        partien.push({
          spieler: spieler.trim(),
          gegner: gegner.trim(),
          datum: formatDatum(datum),
          zuege: zuege.trim(),
          ergebnis,
          event: 'PDF-Import'
        });
      }
    }
  }

  return partien;
}

function formatDatum(d) {
  const [tag, monat, jahr] = d.match(/\d{2}/g);
  return `${jahr}-${monat}-${tag}`;
}

app.get('/', (req, res) => {
  res.send('📡 PDF-Import-Server läuft.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
