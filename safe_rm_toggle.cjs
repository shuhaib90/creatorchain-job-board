const fs = require('fs');
const files = ['index.html', 'my-profile.html', 'profile.html', 'talent.html', 'exclusive.html', 'opportunity.html'];
files.forEach(f => {
  const p = require('path').join(process.cwd(), 'public', f);
  if (!fs.existsSync(p)) return;
  let lines = fs.readFileSync(p, 'utf8').split('\n');
  let newLines = [];
  let inToggleFunc = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Remove the button line
    if (line.includes('id="theme-toggle"')) {
       // if it spans multiple lines, this might leave closing tags, but usually it's one line
       continue;
    }
    
    // Remove the toggleTheme function definition carefully
    if (line.includes('function toggleTheme()')) {
        inToggleFunc = true;
        continue;
    }
    
    if (inToggleFunc) {
        if (line.trim() === '}') {
            inToggleFunc = false;
        }
        continue;
    }
    
    // Remove lucide icons refresh if it's lingering
    if (line.includes("localStorage.getItem('theme')")) {
        // We'll just comment out the DOMContentLoaded part later, but let's be safe.
    }
    
    newLines.push(line);
  }
  
  fs.writeFileSync(p, newLines.join('\n'));
  console.log('Processed safely', f);
});
