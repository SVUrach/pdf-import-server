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
  const blocks = text.split(/\n\s*\n/); // trennt nach Leerzeilen
  const partien = [];

  for (let i = 0; i < blocks.length; i++) {
    const current = blocks[i];
    const next = blocks[i + 1] || '';
    const next2 = blocks[i + 2] || '';

    const fullBlock = `${current}\n${next}\n${next2}`;

    // Erkenne Partie anhand von Zugbeginn und Ergebnis
    if (fullBlock.includes('1. ') && /(1–0|0–1|½–½)/.test(fullBlock)) {
      const datumMatch = fullBlock.match(/(\d{2}\.\d{2}\.\d{4})/);
      const spielerZeile = current.split('\n')[0];
      const spieler = spielerZeile?.split(',')[0]?.trim() || 'Unbekannt';
      const gegner = spielerZeile?.split('–')[1]?.trim() || 'n/a';
      const zuegeMatch = fullBlock.match(/1\..+?(1–0|0–1|½–½)/s);
      const ergebnisMatch = fullBlock.match(/(1–0|0–1|½–½)/);

      if (zuegeMatch && ergebnisMatch) {
        partien.push({
          spieler,
          gegner,
          datum: datumMatch ? formatDatum(datumMatch[1]) : '0000-00-00',
          zuege: zuegeMatch[0]
            .replace(/\[[^\]]*\]/g, '') // Kommentare entfernen
            .replace(/\s+/g, ' ')
            .trim(),
          ergebnis: ergebnisMatch[1],
          event: 'PDF-Import'
        });

        i += 2; // überspringe die verwendeten Absätze
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
