import sqlite3

def patch():
    conn = sqlite3.connect("data/hiver.db")
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE servers ADD COLUMN connection_type VARCHAR DEFAULT 'push'")
        cursor.execute("ALTER TABLE servers ADD COLUMN agent_url VARCHAR")
        conn.commit()
        print("Database patched successfully.")
    except Exception as e:
        print(f"Error patching database: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    patch()
