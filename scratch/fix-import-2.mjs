import fs from 'fs';
let content = fs.readFileSync('frontend/src/App.tsx', 'utf8');

const regex = /import \{([^\}]+)\}\s*from "lucide-react"/;
const match = content.match(regex);
if (match) {
  const currentImports = match[1];
  if (!currentImports.includes('Rocket')) {
    content = content.replace(regex, \`import {\${currentImports}, Rocket} from "lucide-react"\`);
    fs.writeFileSync('frontend/src/App.tsx', content);
    console.log("Rocket added!");
  }
} else {
  console.log("Could not find lucide-react import");
}
