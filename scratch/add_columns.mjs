import fs from 'fs';
let content = fs.readFileSync('backend/database/models.py', 'utf8');

// Insert new columns after approved_at in User model
const insertPoint = `    approved_at = Column(DateTime(timezone=True), nullable=True)`;
const newColumns = `    approved_at = Column(DateTime(timezone=True), nullable=True)
    resume_text = Column(Text, nullable=True)
    target_roles = Column(String, nullable=True) # JSON array of roles
    excludes = Column(String, nullable=True)     # JSON array of excludes
    onboarding_completed = Column(Boolean, default=False)`;

content = content.replace(insertPoint, newColumns);
fs.writeFileSync('backend/database/models.py', content);
console.log("models.py updated");
