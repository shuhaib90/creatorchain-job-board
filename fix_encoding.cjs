const fs = require('fs');
const files = ['public/index.html', 'public/explore.html'];

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

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  for (const [bad, good] of Object.entries(replacements)) {
    content = content.split(bad).join(good);
  }
  fs.writeFileSync(file, content, 'utf8');
});
console.log('Fixed encodings in', files.join(', '));
