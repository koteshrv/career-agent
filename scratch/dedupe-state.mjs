import fs from 'fs';

let content = fs.readFileSync('frontend/src/components/JobsBoard.tsx', 'utf8');

const duplicateBlock = `  const [timeFilter, setTimeFilter] = useState<string | null>(null)
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [locationFilter, setLocationFilter] = useState<string | null>(null)`;

const firstIndex = content.indexOf(duplicateBlock);
if (firstIndex !== -1) {
  const secondIndex = content.indexOf(duplicateBlock, firstIndex + 1);
  if (secondIndex !== -1) {
    // Delete the second occurrence
    content = content.substring(0, secondIndex) + content.substring(secondIndex + duplicateBlock.length);
    fs.writeFileSync('frontend/src/components/JobsBoard.tsx', content);
    console.log("Deduplicated state!");
  } else {
    console.log("No second occurrence found.");
  }
} else {
  console.log("No occurrence found.");
}
