import sqlite3

def run_migration():
    conn = sqlite3.connect('jobs.db')
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE jobs ADD COLUMN crowdsource_pushed_at DATETIME;")
        print("Added crowdsource_pushed_at column.")
    except sqlite3.OperationalError as e:
        print(f"Column crowdsource_pushed_at might already exist: {e}")

    try:
        cursor.execute("ALTER TABLE settings ADD COLUMN career_agent_cloud_token VARCHAR;")
        print("Added career_agent_cloud_token column.")
    except sqlite3.OperationalError as e:
        print(f"Column career_agent_cloud_token might already exist: {e}")

    conn.commit()
    conn.close()

if __name__ == '__main__':
    run_migration()
