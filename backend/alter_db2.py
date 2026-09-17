import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "career-agent.db")

def upgrade_db():
    if not os.path.exists(DB_PATH):
        return
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("PRAGMA table_info(jobs)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if "fingerprint" not in columns:
        cursor.execute("ALTER TABLE jobs ADD COLUMN fingerprint VARCHAR")
        print("Added column fingerprint")
            
    conn.commit()
    conn.close()

if __name__ == "__main__":
    upgrade_db()
