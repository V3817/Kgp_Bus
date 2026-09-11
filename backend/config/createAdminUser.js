import bcrypt from 'bcrypt'; // Using bcrypt as per your imports in authentication controller
import { pool } from '../config/db.js';

// Admin credentials 
const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'admin@kgpbus.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_ROLE = 'admin';

async function createAdminUser() {
    try {
        //console.log('Checking for admin user...');

        // Check if admin already exists
        const adminCheck = await pool.query('SELECT * FROM users WHERE role = $1 OR email = $2', 
            [ADMIN_ROLE, ADMIN_EMAIL]);

        if (adminCheck.rows.length > 0) {
            //console.log('Admin user already exists');
            return;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

        // Create admin user with proper schema
        await pool.query(
            'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)',
            [ADMIN_USERNAME, ADMIN_EMAIL, hashedPassword, ADMIN_ROLE]
        );

        //console.log('Admin user created successfully');
        //console.log('Username:', ADMIN_USERNAME);
        //console.log('Email:', ADMIN_EMAIL);
        //console.log('Password:', ADMIN_PASSWORD);
        //console.log('Role:', ADMIN_ROLE);
    } catch (error) {
        console.error('Error creating admin user:', error);
    }
}

// Execute if run directly (ES module version)
if (import.meta.url === `file://${process.argv[1]}`) {
    // When running directly as a script
    const { connectDB } = await import('../config/db.js');

    connectDB()
        .then(() => createAdminUser())
        .then(() => {
            //console.log('Done');
            process.exit(0);
        })
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}

// Export for importing in other modules
export { createAdminUser };