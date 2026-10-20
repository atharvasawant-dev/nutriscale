PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT NOT NULL UNIQUE,
    product_name TEXT NOT NULL,
    nutriscore TEXT,
    ingredients TEXT,
    additives TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nutrition (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    calories REAL,
    fat REAL,
    sugar REAL,
    salt REAL,
    protein REAL,
    fiber REAL,
    carbs REAL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    daily_calorie_limit INTEGER NOT NULL DEFAULT 2000,
    diet_type TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    barcode TEXT NOT NULL,
    scan_time TEXT NOT NULL DEFAULT (datetime('now')),
    result TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_diet_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    max_calories REAL,
    max_sugar REAL,
    max_salt REAL,
    max_fat REAL
);

CREATE TABLE IF NOT EXISTS daily_food_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL DEFAULT 1,
    barcode TEXT NOT NULL,
    product_name TEXT NOT NULL,
    calories REAL,
    fat REAL,
    sugar REAL,
    salt REAL,
    protein REAL,
    fiber REAL,
    carbs REAL,
    scan_session_id INTEGER UNIQUE,
    weight_grams REAL,
    consumed_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS scan_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    barcode TEXT NOT NULL,
    product_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS portion_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_session_id INTEGER NOT NULL UNIQUE,
    weight_grams REAL NOT NULL,
    source TEXT NOT NULL,
    stability TEXT NOT NULL DEFAULT 'stable',
    measured_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (scan_session_id) REFERENCES scan_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
CREATE INDEX IF NOT EXISTS idx_scan_history_barcode ON scan_history(barcode);
CREATE INDEX IF NOT EXISTS idx_nutrition_product_id ON nutrition(product_id);
CREATE INDEX IF NOT EXISTS idx_daily_food_log_consumed_at ON daily_food_log(consumed_at);
CREATE INDEX IF NOT EXISTS idx_scan_sessions_user_id ON scan_sessions(user_id);
