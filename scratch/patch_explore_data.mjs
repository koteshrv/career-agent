import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/ExplorePage.tsx', 'utf8');

const oldState = `  const [roles, setRoles] = useState<string[]>([
    "AI", "ML", "LLM", "Agent", "Agentic", "GenAI", "Generative AI", "NLP", "LLMOps", "MLOps", "Voice AI",
    "Conversational AI", "Speech", "Backend Engineer", "Backend Developer", "Cloud Engineer", "DevOps Engineer",
    "Infrastructure Engineer", "Solutions Architect", "Solutions Engineer", "Integration Engineer", "AI Platform",
    "AI Engineer"
  ])
  const [excludes, setExcludes] = useState<string[]>([
    "Junior", "word:Intern", "word:Interns", "Internship", ".NET", "Java", "iOS", "Android",
    "PHP", "Ruby", "Embedded", "Firmware", "FPGA", "ASIC", "Blockchain", "Web3", "Crypto",
    "Salesforce Admin", "SAP", "Oracle EBS", "Mainframe", "COBOL", "Werkstudent"
  ])`;

const newState = `  const [roles, setRoles] = useState<string[]>([])
  const [excludes, setExcludes] = useState<string[]>([])
  
  import { useEffect } from "react"
  
  useEffect(() => {
    fetch("/api/onboarding/me", {
        headers: { "Authorization": \`Bearer \${localStorage.getItem("token")}\` }
    })
    .then(res => res.json())
    .then(data => {
        if (data && data.target_roles) {
            setRoles(data.target_roles);
        }
        if (data && data.excludes) {
            setExcludes(data.excludes);
        }
    })
    .catch(console.error)
  }, [])`;

content = content.replace(oldState, newState);
// move import to top
if (content.includes('import { useEffect } from "react"')) {
    content = content.replace('import { useEffect } from "react"', '');
    if (!content.includes('useEffect')) {
        content = content.replace('import { useState } from "react"', 'import { useState, useEffect } from "react"');
    } else {
        content = content.replace('import { useState }', 'import { useState, useEffect }');
    }
}
fs.writeFileSync('frontend/src/components/ExplorePage.tsx', content);
console.log("ExplorePage patched");
