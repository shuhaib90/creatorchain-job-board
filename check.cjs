const fs = require('fs');
const c = fs.readFileSync('public/index.html', 'utf8');
const idx = c.indexOf('// Theme logic');
console.log(c.substring(idx - 50, idx + 100));
