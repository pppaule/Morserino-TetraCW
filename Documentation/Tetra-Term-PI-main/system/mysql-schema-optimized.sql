-- Optimized MySQL schema for Tetra Terminal
CREATE TABLE IF NOT EXISTS commands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  command TEXT,
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  direction VARCHAR(10) NOT NULL,
  `from` VARCHAR(255) NOT NULL,
  dest VARCHAR(255) NOT NULL,
  hex TEXT,
  message TEXT,
  type VARCHAR(50),
  INDEX idx_timestamp (timestamp),
  INDEX idx_from (`from`),
  INDEX idx_dest (dest)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `from` VARCHAR(255) NOT NULL,
  lat DECIMAL(10,6),
  lon DECIMAL(10,6),
  speed DOUBLE,
  heading DOUBLE,
  accuracy DOUBLE,
  altitude DOUBLE,
  INDEX idx_timestamp (timestamp),
  INDEX idx_from (`from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  `index` INT,
  number VARCHAR(255),
  type INT,
  name VARCHAR(255),
  INDEX idx_number (number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site VARCHAR(255),
  state VARCHAR(255),
  `groups` TEXT,
  UNIQUE INDEX uniq_site (site)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_qrv (
  id INT AUTO_INCREMENT PRIMARY KEY,
  issi VARCHAR(255),
  callsign VARCHAR(255),
  site VARCHAR(255),
  `groups` TEXT,
  UNIQUE INDEX uniq_issi (issi),
  INDEX idx_callsign (callsign)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS web_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site VARCHAR(255),
  module VARCHAR(255),
  message TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_site (site),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS markers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lat DECIMAL(10,6),
  lon DECIMAL(10,6),
  height DOUBLE,
  description TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lat_lon (lat, lon)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tracks (
  id VARCHAR(255) PRIMARY KEY,
  points JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
