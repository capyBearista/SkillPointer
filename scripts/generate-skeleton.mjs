import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillsDir = path.resolve(process.cwd(), 'docs/internal/intel-fixtures/skills');
const outPath = path.resolve(process.cwd(), 'docs/internal/intel-fixtures/suggested-tags.json');
function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(function(file) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(filePath));
    } else if (file === 'SKILL.md') {
      results.push(filePath);
    }
  });
  return results;
}
try {
  const skillFiles = walkDir(skillsDir);
  const skeleton = {};
  for (const filePath of skillFiles) {
    // Get the directory containing the SKILL.md
    const dirPath = path.dirname(filePath);
    // Get the relative path from the base skillsDir
    const relativeKey = path.relative(skillsDir, dirPath);
    
    skeleton[relativeKey] = [];
  }
  // Write the formatted JSON skeleton
  fs.writeFileSync(outPath, JSON.stringify(skeleton, null, 2), 'utf8');
  
  console.log(`✅ Success! Generated JSON skeleton for ${skillFiles.length} skills.`);
  console.log(`📂 Output saved to: ${outPath}`);
  
} catch (error) {
  console.error(`❌ Failed to generate skeleton. Ensure the skills directory exists at: ${skillsDir}`);
  console.error(error);
}