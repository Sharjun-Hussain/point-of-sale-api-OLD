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
            // Get Swap from free -b (silently fails if not available in Docker)
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
        } catch (e) {
            // Ignore error in minimal environments
        }

        try {
            // Get I/O from iostat
            const { stdout: ioOut } = await execPromise('iostat -dx 1 1');
            const ioLines = ioOut.trim().split('\n');
            const lastLine = ioLines[ioLines.length - 1];
            const ioParts = lastLine.trim().split(/\s+/);
            systemMetrics.io = parseFloat(ioParts[ioParts.length - 1]) || 0;
        } catch (e) {
            // Ignore error in minimal environments
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
            
            // Get previous counters to calculate rate
            const lastStatsRaw = await redisService.client.get('pos:telemetry:last_counters');
            const lastStats = lastStatsRaw ? JSON.parse(lastStatsRaw) : null;
            
            // Get current HTTP counters from Redis
            const httpRequests = parseInt(await redisService.client.get('pos:traffic:requests') || 0);
            const httpBytesIn  = parseInt(await redisService.client.get('pos:traffic:bytes_in') || 0);
            
            const currentCounters = {
                timestamp: new Date().getTime(),
                httpRequests,
                httpBytesIn,
                dbBytesIn: health.db.bytesReceived || 0,
                dbBytesOut: health.db.bytesSent || 0
            };

            // Calculate throughput (Rate per 30s)
            let httpReqRate = 0;
            let httpInRate  = 0;
            let dbInRate    = 0;
            let dbOutRate   = 0;

            if (lastStats) {
                // We use Math.max(0, ...) to handle counter resets
                httpReqRate = Math.max(0, currentCounters.httpRequests - lastStats.httpRequests);
                httpInRate  = Math.max(0, currentCounters.httpBytesIn  - lastStats.httpBytesIn);
                dbInRate    = Math.max(0, currentCounters.dbBytesIn    - lastStats.dbBytesIn);
                dbOutRate   = Math.max(0, currentCounters.dbBytesOut   - lastStats.dbBytesOut);
            }

            const point = {
                timestamp: new Date().toISOString(),
                heapUsed: parseInt(health.memory.heapUsed),
                rss: parseInt(health.memory.rss),
                sysRam: Math.round(health.system.ram.used / 1024 / 1024),
                sysSwap: Math.round(health.system.swap.used / 1024 / 1024),
                cpuLoad: health.system.load[0], // 1m average
                ioUtil: health.system.io,
                threads: health.db.threadsConnected || 0,
                slowQueries: health.db.slowQueries || 0,
                // New Traffic Metrics (Rate per 30s)
                httpReqRate,
                httpInRate: Math.round(httpInRate / 1024), // KB per 30s
                dbInRate: Math.round(dbInRate / 1024),     // KB per 30s
                dbOutRate: Math.round(dbOutRate / 1024)    // KB per 30s
            };

            const listKey = 'pos:telemetry:health';
            const pipeline = redisService.client.pipeline();
            pipeline.lpush(listKey, JSON.stringify(point));
            pipeline.ltrim(listKey, 0, 1439); // Keep last 24 hours (1440 points)
            
            // Update last counters for next calculation
            pipeline.set('pos:telemetry:last_counters', JSON.stringify(currentCounters));
            
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
     * Helper to find the absolute path of a system binary.
     * Prevents "command not found" errors in restricted VPS environments.
     */
    async _getBinaryPath(name) {
        const paths = [`/usr/bin/${name}`, `/usr/local/bin/${name}`, `/bin/${name}`];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
        return name; // Fallback to name and hope it's in PATH
    }

    /**
     * Generate a full SQL dump using mysqldump.
     * Returns the full path to the temporary snapshot.
     */
    async exportSql() {
        const { database, username, password, host, port } = sequelize.config;
        const filename = `db_backup_${Date.now()}.sql`;
        const uploadDir = process.env.UPLOAD_PATH || path.join(__dirname, '../../uploads');
        const filepath = path.join(uploadDir, filename);
        
        const binPath = await this._getBinaryPath('mysqldump');
        
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Build mysqldump command
        const command = `${binPath} -h ${host} -P ${port} -u ${username} ${password ? `-p'${password}'` : ''} ${database} > "${filepath}"`;

        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    logger.error(`MySQL Export Error: ${error.message} - ${stderr}`);
                    return reject(new Error('Structural export failed. Verify that mysqldump is installed and accessible in the system path.'));
                }
                resolve({ filepath, filename });
            });
        });
    }

    /**
     * Restore database from a provided SQL file using mysql command.
     * Includes pre-processing to handle localhost -> VPS compatibility (DEFINER and Collation).
     */
    async importSql(filepath) {
        if (!fs.existsSync(filepath)) throw new Error('Source snapshot not found.');

        // Pre-process the SQL file for compatibility
        try {
            let content = fs.readFileSync(filepath, 'utf8');
            
            // 1. Remove DEFINER clauses which cause "Access Denied" or "User does not exist" on VPS
            // Matches: /*!50013 DEFINER=`root`@`localhost`*/ or DEFINER=`root`@`localhost`
            content = content.replace(/\/\*!50013 DEFINER=[^*]+\*\//g, '');
            content = content.replace(/DEFINER=`[^`]+`@`[^`]+`/g, '');

            // 2. Fix Collation issues (MySQL 8 uses utf8mb4_0900_ai_ci which MariaDB/MySQL 5.7 don't support)
            // Replace with utf8mb4_general_ci for maximum compatibility
            content = content.replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_general_ci');
            
            fs.writeFileSync(filepath, content);
        } catch (err) {
            logger.warn(`SQL Pre-processing Warning: ${err.message}`);
            // Continue anyway, it might work without pre-processing
        }

        const { database, username, password, host, port } = sequelize.config;
        const binPath = await this._getBinaryPath('mysql');
        const command = `${binPath} -h ${host} -P ${port} -u ${username} ${password ? `-p'${password}'` : ''} ${database} < "${filepath}"`;

        return new Promise(async (resolve, reject) => {
            exec(command, async (error, stdout, stderr) => {
                if (error) {
                    logger.warn(`MySQL Shell Import Failed: ${stderr}. Attempting native fallback...`);
                    
                    // NATIVE FALLBACK: Execute SQL line-by-line via Sequelize
                    try {
                        const sql = fs.readFileSync(filepath, 'utf8');
                        // Split by semicolon but ignore semicolons inside single quotes
                        const statements = sql
                            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
                            .split(/;(?=(?:[^']*'[^']*')*[^']*$)/);

                        for (let statement of statements) {
                            const cmd = statement.trim();
                            if (cmd && !cmd.startsWith('--') && !cmd.startsWith('/*')) {
                                try {
                                    await sequelize.query(cmd, { type: QueryTypes.RAW });
                                } catch (queryErr) {
                                    // Some statements like 'USE' might fail or be redundant, we log and continue
                                    logger.debug(`Fallback Query Warning: ${queryErr.message}`);
                                }
                            }
                        }
                        return resolve({ success: true, message: 'Structural restoration finalized via native fallback.' });
                    } catch (fallbackErr) {
                        logger.error(`Native Restoration Fallback Failed: ${fallbackErr.message}`);
                        const cleanError = stderr.split('\n')[0] || error.message;
                        return reject(new Error(`Structural restoration failed: ${cleanError}`));
                    }
                }
                resolve({ success: true, message: 'Structural restoration finalized.' });
            });
        });
    }
}

module.exports = new MaintenanceService();
