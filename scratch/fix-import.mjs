import fs from 'fs';
let content = fs.readFileSync('frontend/src/App.tsx', 'utf8');

// Undo the bad sed replacement
content = content.replace(/, Rocket from "lucide-react"/g, ' from "lucide-react"');

// Properly add Rocket to the destructured import
content = content.replace(/} from "lucide-react"/g, ', Rocket } from "lucide-react"');

fs.writeFileSync('frontend/src/App.tsx', content);
console.log("Fixed import!");
