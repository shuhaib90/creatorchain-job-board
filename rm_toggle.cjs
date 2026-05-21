const fs = require('fs');
const path = require('path');
const files = ['index.html', 'my-profile.html', 'profile.html', 'talent.html', 'exclusive.html', 'opportunity.html'];
files.forEach(f => {
  const p = path.join(process.cwd(), 'public', f);
  if (!fs.existsSync(p)) return;
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(/<button[^>]*id="theme-toggle"[^>]*>[\s\S]*?<\/button>/g, '');
  // Also remove the toggleTheme function definition carefully
  c = c.replace(/function toggleTheme\(\) \{[\s\S]*?\}\s*(?=<|\w|})/g, '');
  // Try to remove standard toggleTheme blocks more robustly if it misses
  c = c.replace(/function toggleTheme\(\) \{([\s\S]*?)\}/g, '');
  // Remove lucide icons refresh inside theme toggle if any
  fs.writeFileSync(p, c);
  console.log('Processed', f);
});
