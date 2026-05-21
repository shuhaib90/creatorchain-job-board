const fs = require('fs');
const path = require('path');
const files = ['index.html', 'my-profile.html', 'profile.html', 'talent.html'];
files.forEach(f => {
  const p = path.join(process.cwd(), 'public', f);
  if (!fs.existsSync(p)) return;
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(/<button[^>]*id="theme-toggle"[^>]*>[\s\S]*?<\/button>/g, '');
  // Also remove the toggleTheme function definition carefully
  c = c.replace(/function toggleTheme\(\) \{[\s\S]*?\}/g, '');
  fs.writeFileSync(p, c);
  console.log('Processed', f);
});
