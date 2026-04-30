const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const redisService = require('./redisService');
const logger = require('../utils/logger');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const execPromise = promisify(exec);

/**
 * INDUSTRIAL MAINTENANCE SERVICE
 * Handles deep database diagnostics, optimization, Redis cache management,
 * and real-time system health monitoring.
 */
class MaintenanceService {

    /**
     * Fetch detailed usage statistics for all database tables.
     */
    async getDatabaseStats() {
        const dbName = sequelize.config.database;
        const tables = await sequelize.query(`
            SELECT 
                TABLE_NAME AS \`name\`,
                TABLE_ROWS AS \`rows\`,
                DATA_LENGTH AS \`dataSize\`,
                INDEX_LENGTH AS \`indexSize\`,
                DATA_FREE AS \`freeSpace\`,
                ENGINE AS \`engine\`,
                UPDATE_TIME AS \`lastUpdated\`
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = :dbName
            ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC;
        `, { replacements: { dbName }, type: QueryTypes.SELECT });

        const summary = tables.reduce((acc, t) => {
            acc.totalData  += Number(t.dataSize  || 0);
            acc.totalIndex += Number(t.indexSize || 0);
            acc.totalRows  += Number(t.rows      || 0);
            return acc;
        }, { totalData: 0, totalIndex: 0, totalRows: 0 });

        return { tables, summary, timestamp: new Date() };
    }

    /**
     * Run OPTIMIZE TABLE on all InnoDB/MyISAM tables.
     * Returns a verbose result log for every table attempted.
     */
    async optimizeTables() {
        const dbName = sequelize.config.database;
        const tables = await sequelize.query(`
            SELECT TABLE_NAME
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = :dbName
            AND ENGINE IN ('InnoDB', 'MyISAM');
        `, { replacements: { dbName }, type: QueryTypes.SELECT });

        const log = [];
        for (const row of tables) {
            const tableName = row.TABLE_NAME || row.table_name;
            try {
                const result = await sequelize.query(`OPTIMIZE TABLE \`${tableName}\``);
                // MySQL returns a result set with Msg_type/Msg_text columns
                const msgRow = result[0]?.[0] || {};
                const status = msgRow.Msg_type === 'error' ? 'failed' : 'success';
                log.push({ table: tableName, status, note: msgRow.Msg_text || 'OK' });
            } catch (err) {
                log.push({ table: tableName, status: 'failed', note: err.message });
            }
        }

        return {
            optimizedCount: log.filter(r => r.status === 'success').length,
            failedCount: log.filter(r => r.status === 'failed').length,
            log
        };
    }

    /**
     * Get deep system health including DB diagnostics and Redis stats.
     */
    async getSystemHealth() {
        const uptime      = process.uptime();
        const mem         = process.memoryUsage();
        let dbStatus      = 'healthy';
        let dbDiagnostics = {};

        try {
            await sequelize.authenticate();

            // Pull real-time MySQL global status variables
            const vars = await sequelize.query(`
                SHOW GLOBAL STATUS WHERE Variable_name IN (
                    'Threads_connected',
                    'Slow_queries',
                    'Questions',
                    'Uptime',
                    'Bytes_received',
                    'Bytes_sent'
                );
            `, { type: QueryTypes.SELECT });

            const statMap = vars.reduce((acc, row) => {
                acc[row.Variable_name] = row.Value;
                return acc;
            }, {});

            // Also grab the server version
            const [versionRow] = await sequelize.query(
                `SELECT VERSION() AS version;`,
                { type: QueryTypes.SELECT }
            );

            dbDiagnostics = {
                threadsConnected : Number(statMap.Threads_connected || 0),
                slowQueries      : Number(statMap.Slow_queries      || 0),
                totalQueries     : Number(statMap.Questions         || 0),
                dbUptime         : Number(statMap.Uptime            || 0),
                bytesReceived    : Number(statMap.Bytes_received    || 0),
                bytesSent        : Number(statMap.Bytes_sent        || 0),
                version          : versionRow?.version || 'Unknown'
            };
        } catch (e) {
            dbStatus = 'unstable';
        }

        // System wide metrics (Linux optimized)
        let systemMetrics = {
            ram: { total: os.totalmem(), free: os.freemem(), used: os.totalmem() - os.freemem() },
            swap: { total: 0, used: 0, free: 0 },
            load: os.loadavg(), // [1m, 5m, 15m]
            io: 0 // % utilization
        };

        try {
            // Get Swap from free -m
            const { stdout: freeOut } = await execPromise('free -b');
            const lines = freeOut.split('\n');
            const swapLine = lines.find(l => l.startsWith('Swap:'));
            if (swapLine) {
                const parts = swapLine.split(/\s+/);
                systemMetrics.swap = {
                    total: parseInt(parts[1]),
                    used: parseInt(parts[2]),
                    free: parseInt(parts[3])
                };
            }

            // Get I/O from iostat
            const { stdout: ioOut } = await execPromise('iostat -dx 1 1');
            const ioLines = ioOut.trim().split('\n');
            const lastLine = ioLines[ioLines.length - 1];
            const ioParts = lastLine.trim().split(/\s+/);
            // %util is usually the last column in iostat -dx
            systemMetrics.io = parseFloat(ioParts[ioParts.length - 1]) || 0;
        } catch (e) {
            logger.error(`System Metric Exec Error: ${e.message}`);
        }

        // Redis stats
        const cacheStats = await redisService.getStats();

        return {
            status    : dbStatus,
            uptime    : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
            nodeVersion: process.version,
            memory: {
                heapUsed : `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
                heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
                rss      : `${Math.round(mem.rss / 1024 / 1024)} MB`
            },
            system: systemMetrics,
            db    : dbDiagnostics,
            cache : cacheStats
        };
    }

    /**
     * Flush the Redis cache and return stats before + after.
     */
    async clearAppCache() {
        const before = await redisService.getStats();
        await redisService.flush();
        const after  = await redisService.getStats();
        return {
            success : true,
            message : 'Redis cache flushed successfully.',
            before,
            after
        };
    }

    /**
     * Record system metrics to Redis (Called automatically by Cron)
     */
    async recordSystemMetrics() {
        if (!redisService.isConnected) return;
        
        try {
            const health = await this.getSystemHealth();
            const point = {
                timestamp: new Date().toISOString(),
                heapUsed: parseInt(health.memory.heapUsed),
                rss: parseInt(health.memory.rss),
                sysRam: Math.round(health.system.ram.used / 1024 / 1024),
                sysSwap: Math.round(health.system.swap.used / 1024 / 1024),
                cpuLoad: health.system.load[0], // 1m average
                ioUtil: health.system.io,
                threads: health.db.threadsConnected || 0,
                slowQueries: health.db.slowQueries || 0
            };

            const listKey = 'pos:telemetry:health';
            const pipeline = redisService.client.pipeline();
            pipeline.lpush(listKey, JSON.stringify(point));
            pipeline.ltrim(listKey, 0, 1439); // Keep last 24 hours (1440 points)
            await pipeline.exec();
        } catch (err) {
            logger.error(`Telemetry Record Error: ${err.message}`);
        }
    }

    /**
     * Fetch historical telemetry for charts
     */
    async getTelemetryHistory(minutes = 60) {
        if (!redisService.isConnected) return [];
        try {
            const limit = Math.min(minutes, 1440) - 1; // 0-indexed range
            const data = await redisService.client.lrange('pos:telemetry:health', 0, limit);
            return data.map(d => JSON.parse(d)).reverse(); // Return in chronological order
        } catch (err) {
            logger.error(`Telemetry Fetch Error: ${err.message}`);
            return [];
        }
    }

    /**
     * Generate a full SQL dump using mysqldump.
     * Returns the full path to the temporary snapshot.
     */
    async exportSql() {
        const { database, username, password, host, port } = sequelize.config;
        const filename = `db_backup_${Date.now()}.sql`;
        const filepath = path.join(process.env.UPLOAD_PATH || 'uploads/', filename);
        
        // Build mysqldump command
        const command = `mysqldump -h ${host} -P ${port} -u ${username} ${password ? `-p${password}` : ''} ${database} > ${filepath}`;

        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    logger.error(`MySQL Export Error: ${error.message}`);
                    return reject(new Error('Structural export failed. Check system logs.'));
                }
                resolve({ filepath, filename });
            });
        });
    }

    /**
     * Restore database from a provided SQL file using mysql command.
     */
    async importSql(filepath) {
        if (!fs.existsSync(filepath)) throw new Error('Source snapshot not found.');

        const { database, username, password, host, port } = sequelize.config;
        const command = `mysql -h ${host} -P ${port} -u ${username} ${password ? `-p${password}` : ''} ${database} < ${filepath}`;

        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    logger.error(`MySQL Import Error: ${error.message}`);
                    return reject(new Error('Structural restoration failed. Invalid SQL basis.'));
                }
                resolve({ success: true, message: 'Structural restoration finalized.' });
            });
        });
    }
}

module.exports = new MaintenanceService();
