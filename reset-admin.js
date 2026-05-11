/**
 * Emergency Super Admin Password Reset Script
 * Run this on the VPS with: node reset-admin.js
 * 
 * This resets the super admin password to 'admin123' without touching any other data.
 */

require('dotenv').config();
const { sequelize, User } = require('./src/models');
const bcrypt = require('bcryptjs');

async function resetSuperAdmin() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected.');

        // Find super admin by email
        const adminEmail = 'mrjoon005@gmail.com';
        const user = await User.findOne({ where: { email: adminEmail } });

        if (!user) {
            console.error(`❌ No user found with email: ${adminEmail}`);
            console.log('Available users:');
            const all = await User.findAll({ attributes: ['id', 'email', 'name', 'status'] });
            all.forEach(u => console.log(`  - ${u.email} (${u.name}) [${u.status}]`));
            process.exit(1);
        }

        const newPassword = 'admin123';
        const hash = await bcrypt.hash(newPassword, 10);
        await user.update({ password: hash, status: 'active' });

        console.log(`✅ Password reset successfully for: ${adminEmail}`);
        console.log(`   New password: ${newPassword}`);
        console.log('\n⚠️  Remember to change this password after logging in!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Reset failed:', error.message);
        process.exit(1);
    }
}

resetSuperAdmin();
