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
        .replace(/[¥¤¢¦©®]/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .trim()
    )
    .filter(line => line.length > 0);

  const partien = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('1.')) {
      let zuege = line;
      let j = i + 1;
      while (
        j < lines.length &&
        !lines[j].match(/(1–0|0–1|½–½)/) &&
        !lines[j].startsWith('1.')
      ) {
        zuege += ' ' + lines[j];
        j++;
      }

      let ergebnis = '';
      while (j < lines.length && ergebnis === '') {
        const ergMatch = lines[j].match(/(1–0|0–1|½–½)/);
        if (ergMatch) {
          ergebnis = ergMatch[1];
        }
        j++;
      }

      zuege = zuege.split(/CBM|ext|Fritz|– \(/)[0].trim();

      let spieler = 'Unbekannt';
      let gegner = 'n/a';
      let datum = '0000-00-00';

      for (let k = i - 1; k >= Math.max(0, i - 5); k--) {
        const l = lines[k];
        const dmatch = l.match(/(\d{2}\.\d{2}\.\d{4})/);
        if (dmatch && datum === '0000-00-00') datum = formatDatum(dmatch[1]);

        if (isValidSpielerzeile(l)) {
          const [s, g] = l.split('–').map(x => x.trim());
          if (s.length > 2 && s.length < 100) {
            spieler = s;
            gegner = g || 'n/a';
            break;
          }
        }
      }

      if (
        zuege.length > 10 &&
        ergebnis &&
        spieler !== 'Unbekannt'
      ) {
        partien.push({
          spieler,
          gegner,
          datum,
          zuege,
          ergebnis,
          event: 'PDF-Import'
        });
      }

      i = j - 1;
    }
  }

  return partien;
}

// Prüft, ob eine Zeile wirklich eine Spielerzeile ist
function isValidSpielerzeile(line) {
  const lower = line.toLowerCase();
  const forbidden = ['weiss', 'weiß', 'remis', 'gibt', 'auf', 'vs', 'cbm', 'fritz', 'ext', 'kommentar'];
  if (
    !line.includes('–') ||
    line.match(/^\d/) ||                          // beginnt mit Zahl (z. B. 88.xc6)
    forbidden.some(w => lower.includes(w)) ||    // enthält typische Müllwörter
    line.length < 5
  ) {
    return false;
  }

  // Gültig, wenn Komma oder Punkt ODER mindestens zwei Wörter (echter Name)
  const words = line.split(/\s+/);
  return line.includes(',') || line.includes('.') || words.length >= 2;
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
