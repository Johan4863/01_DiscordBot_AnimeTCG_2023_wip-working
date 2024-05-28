# Tutorial for Installing Dependencies

1. **Install Node.js**
2. **Restart Text Editor if It's Open**
3. **To Check if Node is Installed Correctly Type** `npm --version`
4. **Type Commands Below in Terminal:**
    ```
    npm install canvas@^2.11.2 discord.js@^14.14.1 dotenv@^16.3.1 fs@^0.0.1-security jest@^29.7.0 mysql2@^3.6.3 nodemon@^3.0.1
    ```

# Tutorial for Setting up Local Database Compatible with This Project

1. **Download XAMPP**
2. **Turn on "Apache" and "MySQL" Services in XAMPP Panel**
3. **Click "Admin" in MySQL**
4. **After Opening Page Find SQL Tab (Next to Structure)**
5. **Paste Whole Commands Below into SQL Console and Click Go:**
    ```sql
    CREATE DATABASE IF NOT EXISTS cardbot;
    USE cardbot;
    CREATE TABLE IF NOT EXISTS card_inventory (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        card_name VARCHAR(255) NOT NULL,
        card_url VARCHAR(255),
        card_print VARCHAR(255),
        card_code VARCHAR(255) UNIQUE NOT NULL,
        series VARCHAR(255),
        element VARCHAR(255),
        base_element VARCHAR(255),
        date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS card_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        card_code VARCHAR(255) UNIQUE NOT NULL,
        strength INT,
        defense INT,
        agility INT,
        wisdom INT,
        energy INT,
        luck INT,
        FOREIGN KEY (card_code) REFERENCES card_inventory(card_code) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS user_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        item_type VARCHAR(255) NOT NULL,
        item_amount INT NOT NULL,
        UNIQUE(user_id, item_type)
    );
    CREATE TABLE IF NOT EXISTS user_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        card_name VARCHAR(255),
        usertag VARCHAR(255),
        description TEXT
    );
    CREATE TABLE IF NOT EXISTS players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) NOT NULL
    );
    CREATE TABLE IF NOT EXISTS card_info (
        id INT AUTO_INCREMENT PRIMARY KEY,
        card_name VARCHAR(255) NOT NULL,
        latest_print TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS last_code_table (
        id INT AUTO_INCREMENT PRIMARY KEY,
        last_generated_code VARCHAR(255) NOT NULL
    );
    ```
# HOW TO RUN PROJECT WITH "NODEMON"?

**Type this in terminal** `npm run test`