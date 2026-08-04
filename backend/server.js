const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// =============================================
// AIVEN POSTGRESQL CONNECTION
// =============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,  // Required for Aiven
        sslmode: 'require'          // Aiven requires SSL
    }
});

// Test database connection
pool.connect((err) => {
    if (err) {
        console.log('❌ Aiven PostgreSQL connection failed:', err.message);
        console.log('💡 Check your DATABASE_URL in .env');
    } else {
        console.log('✅ Connected to Aiven PostgreSQL successfully!');
        console.log('📊 Database:', process.env.DATABASE_URL.split('/').pop().split('?')[0]);
    }
});

// =============================================
// TEST ROUTE
// =============================================
app.get('/api/test', (req, res) => {
    res.json({ 
        message: '✅ Server is working!',
        database: 'Aiven PostgreSQL',
        status: 'Connected'
    });
});

// =============================================
// REGISTER STAFF
// =============================================
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        console.log('📝 Register attempt:', username);

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ 
                error: 'All fields are required!' 
            });
        }

        // Check if staff exists
        const staffCheck = await pool.query(
            'SELECT * FROM staff WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (staffCheck.rows.length > 0) {
            return res.status(400).json({ 
                error: 'Username or email already exists' 
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save staff
        const result = await pool.query(
            'INSERT INTO staff (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
            [username, email, hashedPassword]
        );

        console.log('✅ Staff registered:', username);

        res.json({ 
            message: 'Registration successful! Please login.',
            user: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Register error:', error);
        res.status(500).json({ 
            error: 'Server error: ' + error.message 
        });
    }
});

// =============================================
// LOGIN STAFF
// =============================================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('🔑 Login attempt:', username);

        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Username and password required!' 
            });
        }

        // Find staff
        const result = await pool.query(
            'SELECT * FROM staff WHERE username = $1',
            [username]
        );

        const staff = result.rows[0];

        if (!staff) {
            return res.status(401).json({ 
                error: 'Invalid username or password' 
            });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, staff.password_hash);

        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Invalid username or password' 
            });
        }

        console.log('✅ Login successful:', username);

        res.json({
            message: 'Login successful!',
            user: {
                id: staff.id,
                username: staff.username,
                email: staff.email,
                created_at: staff.created_at
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            error: 'Server error: ' + error.message 
        });
    }
});

// =============================================
// GET ALL STAFF
// =============================================
app.get('/api/staff', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, created_at FROM staff ORDER BY id'
        );
        
        res.json({ 
            success: true,
            count: result.rows.length,
            staff: result.rows 
        });
        
    } catch (error) {
        console.error('❌ Error fetching staff:', error);
        res.status(500).json({ 
            error: 'Failed to fetch staff: ' + error.message 
        });
    }
});

// =============================================
// DELETE STAFF
// =============================================
app.delete('/api/staff/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'DELETE FROM staff WHERE id = $1 RETURNING username',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Staff not found' });
        }
        
        res.json({ 
            message: `Staff '${result.rows[0].username}' deleted successfully` 
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// START SERVER
// =============================================
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`✅ Database: Aiven PostgreSQL`);
    console.log(`✅ Test: http://localhost:${PORT}/api/test`);
    console.log(`📝 Register: POST /api/register`);
    console.log(`🔑 Login: POST /api/login`);
    console.log(`👥 View staff: GET /api/staff`);
    console.log('='.repeat(50));
});
