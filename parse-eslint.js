const fs = require('fs');
const data = JSON.parse(fs.readFileSync('eslint.json', 'utf8'));
const issues = data.filter(f => f.errorCount > 0 || f.warningCount > 0);
issues.forEach(f => {
  console.log('File:', f.filePath);
  f.messages.forEach(m => {
    console.log(`  L${m.line}:${m.column} [${m.severity === 2 ? 'error' : 'warn'}] ${m.message} (${m.ruleId})`);
  });
});
