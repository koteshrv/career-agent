import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "career-agent.db")

def upgrade_db():
    if not os.path.exists(DB_PATH):
        return
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("PRAGMA table_info(settings)")
    columns = [col[1] for col in cursor.fetchall()]
    
    for col in ["target_roles", "base_salary_expectations", "profile_narrative"]:
        if col not in columns:
            cursor.execute(f"ALTER TABLE settings ADD COLUMN {col} TEXT")
            print(f"Added column {col}")
            
    conn.commit()
    conn.close()

if __name__ == "__main__":
    upgrade_db()
