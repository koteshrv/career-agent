import sqlite3

from config import config


def run_migration():
    conn = sqlite3.connect('jobs.db')
    cursor = conn.cursor()

    cursor.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email VARCHAR UNIQUE,
        username VARCHAR UNIQUE,
        auth_method VARCHAR NOT NULL DEFAULT 'local',
        sso_provider VARCHAR,
        role VARCHAR NOT NULL DEFAULT 'USER',
        status VARCHAR NOT NULL DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME
    );""")
    print("Created users table (or it already existed).")

    admin_username = config["app_username"]
    cursor.execute(
        """INSERT OR IGNORE INTO users (id, username, auth_method, role, status, approved_at)
        VALUES (1, ?, 'local', 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP);""",
        (admin_username,),
    )
    print(f"Bootstrap admin user ensured (username={admin_username!r}).")

    conn.commit()
    conn.close()

if __name__ == '__main__':
    run_migration()
