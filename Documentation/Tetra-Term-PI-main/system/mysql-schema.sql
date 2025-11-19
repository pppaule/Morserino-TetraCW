-- MySQL schema for Tetra Terminal
CREATE TABLE IF NOT EXISTS commands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME,
  command TEXT
);

CREATE TABLE IF NOT EXISTS sds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME,
  direction VARCHAR(10),
  `from` VARCHAR(255),
  dest VARCHAR(255),
  hex TEXT,
  message TEXT,
  type VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS gps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME,
  `from` VARCHAR(255),
  lat DOUBLE,
  lon DOUBLE,
  speed DOUBLE,
  heading DOUBLE,
  accuracy DOUBLE,
  altitude DOUBLE
);

CREATE TABLE IF NOT EXISTS contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `index` INT,
  number VARCHAR(255),
  type INT,
  name VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS web_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site VARCHAR(255),
  state VARCHAR(255),
  `groups` TEXT,
  UNIQUE KEY uniq_site (site)
);

CREATE TABLE IF NOT EXISTS web_qrv (
  id INT AUTO_INCREMENT PRIMARY KEY,
  issi VARCHAR(255),
  callsign VARCHAR(255),
  site VARCHAR(255),
  `groups` TEXT,
  UNIQUE KEY uniq_issi (issi)
);

CREATE TABLE IF NOT EXISTS web_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site VARCHAR(255),
  module VARCHAR(255),
  message TEXT,
  timestamp VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS markers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lat DOUBLE,
  lon DOUBLE,
  height DOUBLE,
  description TEXT,
  timestamp DATETIME
);

CREATE TABLE IF NOT EXISTS tracks (
  id VARCHAR(255) PRIMARY KEY,
  points JSON
);
