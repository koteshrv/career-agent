import fs from 'fs';

let content = fs.readFileSync('backend/main.py', 'utf8');

// Import router
if (!content.includes('from backend.routers import onboarding')) {
    content = content.replace('from backend.routers import jobs, settings, health, history, knowledge, resumes, followups, crowdsourcing, playbooks, generation, extension', 
    'from backend.routers import jobs, settings, health, history, knowledge, resumes, followups, crowdsourcing, playbooks, generation, extension, onboarding');
    
    // Register router
    const insertPoint = `app.include_router(extension.router)`;
    if (content.includes(insertPoint)) {
        content = content.replace(insertPoint, insertPoint + `\napp.include_router(onboarding.router)`);
        fs.writeFileSync('backend/main.py', content);
        console.log("main.py updated successfully!");
    } else {
        console.log("Could not find insert point for onboarding router!");
    }
} else {
    console.log("Already added");
}
