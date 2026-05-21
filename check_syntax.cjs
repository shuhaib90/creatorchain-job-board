const fs = require('fs');
const c = fs.readFileSync('public/index.html', 'utf8');
const scriptMatches = c.match(/<script>([\s\S]*?)<\/script>/g);
if (scriptMatches) {
    scriptMatches.forEach(block => {
        const js = block.replace(/<\/?script>/g, '');
        try {
            require('vm').createScript(js);
        } catch (e) {
            console.log('Error:', e.message);
            const lines = js.split('\n');
            const errLine = e.stack.split('\n')[0].match(/evalmachine\.<anonymous>:(\d+)/);
            if (errLine) {
                const ln = parseInt(errLine[1]);
                console.log('Around line', ln);
                for(let i=Math.max(0, ln-5); i<Math.min(lines.length, ln+5); i++) {
                    console.log((i+1) + ': ' + lines[i]);
                }
            } else {
                console.log('Stack:', e.stack);
            }
        }
    });
}
