import sqlite3

def run_migration():
    conn = sqlite3.connect('jobs.db')
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE settings ADD COLUMN healthcheck_ping_url VARCHAR;")
        print("Added healthcheck_ping_url column.")
    except sqlite3.OperationalError as e:
        print(f"Column healthcheck_ping_url might already exist: {e}")

    conn.commit()
    conn.close()

if __name__ == '__main__':
    run_migration()
