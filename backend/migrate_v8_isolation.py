import sqlite3

def run_migration():
    conn = sqlite3.connect('jobs.db')
    cursor = conn.cursor()

    for table in ("jobs", "settings", "scraper_logs"):
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;")
            print(f"Added user_id column to {table}.")
        except sqlite3.OperationalError as e:
            print(f"Column user_id on {table} might already exist: {e}")

    # jobs.url was globally UNIQUE (ix_jobs_url) — now unique per (user_id, url), since two
    # users' scrapes can legitimately hit the same posting URL.
    cursor.execute("DROP INDEX IF EXISTS ix_jobs_url;")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_jobs_user_url ON jobs(user_id, url);")
    print("Rebuilt jobs.url uniqueness as (user_id, url).")

    # settings was a true singleton (one row, no unique constraint needed); now one row
    # per user.
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_settings_user_id ON settings(user_id);")
    print("Added unique index on settings.user_id.")

    # scraper_health's PK was just provider_name — can't hold "company X's health, per
    # user." SQLite can't ALTER a PRIMARY KEY in place, so rebuild the table.
    cursor.execute("""CREATE TABLE IF NOT EXISTS scraper_health_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1,
        provider_name VARCHAR,
        status VARCHAR DEFAULT 'OPERATIONAL',
        error_message TEXT,
        last_run_at DATETIME,
        last_success_at DATETIME,
        consecutive_failures INTEGER DEFAULT 0
    );""")
    cursor.execute("""INSERT INTO scraper_health_new
        (user_id, provider_name, status, error_message, last_run_at, last_success_at, consecutive_failures)
        SELECT 1, provider_name, status, error_message, last_run_at, last_success_at, consecutive_failures
        FROM scraper_health;""")
    cursor.execute("DROP TABLE scraper_health;")
    cursor.execute("ALTER TABLE scraper_health_new RENAME TO scraper_health;")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_scraper_health_user_provider ON scraper_health(user_id, provider_name);")
    print("Rebuilt scraper_health with a surrogate id PK + user_id.")

    conn.commit()
    conn.close()

if __name__ == '__main__':
    run_migration()
