const fs = require('fs');
const files = ['index.html', 'my-profile.html', 'profile.html', 'talent.html', 'exclusive.html', 'opportunity.html'];

files.forEach(f => {
    const p = require('path').join(process.cwd(), 'public', f);
    if (!fs.existsSync(p)) return;
    let c = fs.readFileSync(p, 'utf8');
    
    // Look for the stray } followed by document.addEventListener or similar.
    // In index.html:
    //    // Theme logic
    //    }
    c = c.replace(/\/\/\s*Theme logic\s*\n\s*\}/g, '// Theme logic removed');
    
    // Sometimes it might just be a } before unction toggleNotificationMenu
    // Let's just find }\s*function toggleNotificationMenu if toggleTheme was right above it
    c = c.replace(/\}\s*function toggleNotificationMenu/g, 'function toggleNotificationMenu');

    // Also remove the DOMContentLoaded theme check to fully remove night toggle logic
    c = c.replace(/const savedTheme = localStorage\.getItem\('theme'\);[\s\S]*?if\s*\(icon\)\s*icon\.setAttribute\('data-lucide',\s*'sun'\);\s*\}/g, '');

    fs.writeFileSync(p, c);
});
