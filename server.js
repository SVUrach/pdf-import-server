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

  let aktuellesDatum = null;

  for (let block of blocks) {
    // Datum suchen wie "16.03.2025"
    const datumsMatch = block.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (datumsMatch) {
      aktuellesDatum = formatDatum(datumsMatch[1]);
    }

    if (block.includes('1. ') && (block.includes('1–0') || block.includes('0–1') || block.includes('½–½'))) {
      const zuegeMatch = block.match(/1\..+/s);
      const ergebnisMatch = block.match(/(1–0|0–1|½–½)/);
      const spielerName = block.split('\n')[0]?.split(',')[0]?.trim();

      if (zuegeMatch && ergebnisMatch) {
        partien.push({
          spieler: spielerName || 'Unbekannt',
          gegner: 'n/a',
          datum: aktuellesDatum || '0000-00-00',
          zuege: zuegeMatch[0]
            .trim()
            .replace(/\[[^\]]*\]/g, '')  // entferne [Kommentare]
            .replace(/\s+/g, ' '),       // mehrfaches Leerzeichen entfernen
          ergebnis: ergebnisMatch[1],
          event: 'PDF-Import'
        });
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
