TUTORIAL FOR INSTALLING DEPENDENCIES
---------------------------------------------------------------------
1.INSTALL NODE.JS
2.RESTART TEXT EDITOR IF ITS OPEN
3.TO CHECK IF NODE IS INSTALLED CORRECTLY TYPE "NPM --VERSION"
4.TYPE COMMANDS BELOW IN TERMINAL:
---------------------------------------------------------------------
npm install canvas@^2.11.2 discord.js@^14.14.1 dotenv@^16.3.1 fs@^0.0.1-security jest@^29.7.0 mysql2@^3.6.3 nodemon@^3.0.1
---------------------------------------------------------------------
TUTORIAL FOR SETTING UP LOCAL DATABASE COMPATIBILE WITH THIS PROJECT
---------------------------------------------------------------------
1.DOWNLOAD XAMPP
2.TURN ON "APACHE" AND "MYSQL" SERVICES IN XAMPP PANEL
3.CLICK "ADMIN" IN MYSQL
4.AFTER OPENING PAGE FIND SQL TAB (NEXT TO STRUCTURE)
5.PASTE WHOLE COMMANDS BELOW INTO SQL CONSOLE AND CLICK GO
---------------------------------------------------------------------
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
---------------------------------------------------------------------
