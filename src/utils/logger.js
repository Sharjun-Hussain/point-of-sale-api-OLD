const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Ensure log directory exists
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
        ({ timestamp, level, message, ...rest }) => {
            const meta = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
            return `${timestamp} ${level}: ${message} ${meta}`;
        }
    )
);

// Create transports
const transportCombined = new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: process.env.LOG_RETENTION_DAYS || '14d',
    level: process.env.LOG_LEVEL || 'info',
});

const transportError = new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: process.env.LOG_RETENTION_DAYS || '14d',
    level: 'error',
});

// Create logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        transportCombined,
        transportError
    ],
    exitOnError: false
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat
    }));
} else {
    // In production, also log to console but in JSON format for cloud logging (ELK, CloudWatch, etc.)
    logger.add(new winston.transports.Console());
}

// Create a stream object with a 'write' function that will be used by morgan
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    },
};

module.exports = logger;
