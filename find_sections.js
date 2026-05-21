import fs from 'fs';

const content = fs.readFileSync('public/index.html', 'utf8');
const lines = content.split('\n');

const keywords = ['id="listings"', 'id="opportunity', 'class="hero"', 'class="latest"', '<section', '<nav', 'init()', 'renderFooter', 'lucide.createIcons', 'theme-toggle', 'themeToggle'];

lines.forEach((line, index) => {
    const lowerLine = line.toLowerCase();
    keywords.forEach(kw => {
        if (line.includes(kw) || (kw.startsWith('<') && lowerLine.includes(kw))) {
            console.log(`${index + 1}: ${line.trim()}  (matched: ${kw})`);
        }
    });
});
