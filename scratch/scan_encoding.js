import fs from 'fs';
import path from 'path';

const replacements = {
  'â€”': '—',
  'â†’': '→',
  'â–¼': '▼',
  'âœ“': '✓',
  'â­ ': '⭐',
  'ðŸ‘ ': '👀',
  'âœ ï¸ ': '✍️',
  'ðŸ“‹': '📋',
  'âœˆï¸ ': '✈️',
  'â€º': '›',
  'â—†': '◆',
  'ðŸ” ': '🔍',
  'âœ•': '✖',
  'âš¡': '⚡',
  'â”€': '─',
  'â ³': '⏳',
  'âœ…': '✅',
  'â Œ': '❌',
  'â€¢': '•',
  'â€“': '–',
  'â†‘': '↑',
  'â†“': '↓',
  'â€ ': '”',
  'â€œ': '“',
  'â€˜': '‘',
  'â€™': '’',
  'â€¦': '…'
};

const publicDir = 'public';
const files = fs.readdirSync(publicDir);

files.forEach(file => {
  if (file.endsWith('.html')) {
    const filePath = path.join(publicDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    let hasIssue = false;
    for (const bad in replacements) {
      if (content.includes(bad)) {
        console.log(`Found issue in ${file}: ${bad}`);
        hasIssue = true;
      }
    }
  }
});
