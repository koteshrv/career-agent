import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "career-agent.db")

def upgrade_db():
    if not os.path.exists(DB_PATH):
        return
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check existing columns
    cursor.execute("PRAGMA table_info(jobs)")
    columns = [col[1] for col in cursor.fetchall()]
    
    new_columns = [
        "score_match", "score_north_star", "score_comp", 
        "score_red_flags", "legitimacy_tier"
    ] # score_culture already exists
    
    for col in new_columns:
        if col not in columns:
            cursor.execute(f"ALTER TABLE jobs ADD COLUMN {col} VARCHAR")
            print(f"Added column {col}")
            
    conn.commit()
    conn.close()

if __name__ == "__main__":
    upgrade_db()
