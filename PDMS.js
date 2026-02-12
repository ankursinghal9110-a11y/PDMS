// PDMS.JS
const express = require('express');
const multer = require('multer');
const session = require('express-session');
const conn = require('./dbConfig');
const path = require('path');

const app = express();
app.set('view engine', 'ejs');

// MIDDLEWARE
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
    secret: 'yoursecret',
    resave: false,
    saveUninitialized: false
}));

// MULTER SETUP
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ADMIN MIDDLEWARE
function isAdmin(req, res, next) {
    if (!req.session.loggedin) return res.redirect('/login');

    const sql = 'SELECT usertype FROM users WHERE username = ?';
    conn.query(sql, [req.session.username], (err, results) => {
        if (err) return res.status(500).send('Database error');
        if (results.length === 0) return res.send('No such user found in database');

        if (results[0].usertype === 'admin') next();
        else res.status(403).send('Access denied: Admins only');
    });
}

// ROUTES 

// Home
// Home page with product list accessible to all
app.get('/', (req, res) => {
    const searchQuery = req.query.search || '';        
    const selectedCategory = req.query.category || 'all'; 

    // Base SQL
    let sql = 'SELECT * FROM product WHERE 1=1';
    const params = [];

    if (selectedCategory !== 'all') {
        sql += ' AND productGroup = ?';
        params.push(selectedCategory);
    }

    if (searchQuery) {
        sql += ' AND (code LIKE ? OR name LIKE ?)';
        params.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    // Query products
    conn.query(sql, params, (err, products) => {
        products = products || []; // default to empty array

        // Query categories for dropdown
        conn.query('SELECT DISTINCT productGroup FROM product', (err2, categories) => {
            categories = categories || [];

            // Render safely: always pass all variables
            res.render('home', {
                loggedin: req.session.loggedin || false,
                username: req.session.username || null,
                products: products,
                categories: categories,
                searchQuery: searchQuery,
                selectedCategory: selectedCategory
            });
        });
    });
});


// Register page
app.get('/register', (req, res) => res.render('register'));

// Login page
app.get('/login', (req, res) => res.render('login'));

// Register POST (normal users only)
app.post('/register', (req, res) => {
    const { usertype, username, password, email } = req.body;
    // const usertype = 'user';

    if (!usertype || !username || !password || !email) return res.send('Please fill in all required fields');

    const checkQuery = 'SELECT id FROM users WHERE username = ?';
    conn.query(checkQuery, [username], (err, results) => {
        if (err) return res.status(500).send('Database error');
        if (results.length > 0) return res.send('Username already taken');

        const insertQuery = 'INSERT INTO users (usertype, username, password, email) VALUES (?, ?, ?, ?)';
        conn.query(insertQuery, [usertype, username, password, email], (err) => {
            if (err) return res.status(500).send('Database error');
            res.redirect('/login');
        });
    });
});

// Login POST
app.post('/auth', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) return res.send('Please enter Username and Password');

    const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
    conn.query(query, [username, password], (err, results) => {
        if (err) return res.status(500).send('Database error');
        if (results.length === 0) return res.send('Incorrect Username and/or Password');

        req.session.loggedin = true;
        req.session.username = results[0].username;

        // Redirect based on usertype
        const usertype = results[0].usertype;
        if (usertype === 'admin') return res.redirect('/admin');
        if (usertype === 'buyer') return res.redirect('/buyer_dashboard');
        if (usertype === 'supplier') return res.redirect('/supplier_dashboard');

        res.redirect('/membersOnly'); // fallback
    });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.log(err);
        res.redirect('/login');
    });
});

// Members only (generic fallback)
app.get('/membersOnly', (req, res) => {
    if (!req.session.loggedin) return res.redirect('/login');
    res.render('membersOnly', { username: req.session.username });
});

// ---------------- DASHBOARD ROUTES ----------------

// Buyer Dashboard
app.get('/buyer_dashboard', (req, res) => {
    if (!req.session.loggedin) return res.redirect('/login');

    const sql = 'SELECT usertype FROM users WHERE username = ?';
    conn.query(sql, [req.session.username], (err, results) => {
        if (err) return res.status(500).send('Database error');
        if (results.length === 0) return res.send('User not found');
        if (results[0].usertype !== 'buyer') return res.status(403).send('Access denied');

        res.render('buyer_dashboard', { username: req.session.username });
    });
});

// Supplier Dashboard (admins can also access)
app.get('/supplier_dashboard', (req, res) => {
    if (!req.session.loggedin) return res.redirect('/login');

    const sql = 'SELECT usertype FROM users WHERE username = ?';
    conn.query(sql, [req.session.username], (err, results) => {
        if (err) return res.status(500).send('Database error');
        if (results.length === 0) return res.send('User not found');

        const usertype = results[0].usertype;
        if (usertype !== 'supplier' && usertype !== 'admin') {
            return res.status(403).send('Access denied');
        }

        res.render('supplier_dashboard', { username: req.session.username, isAdmin: usertype === 'admin' });
    });
});


// Add Product page
app.get('/addProduct', (req, res) => {
    if (!req.session.loggedin) return res.send('Please login first');
    res.render('addProduct', { username: req.session.username });
});

// Handle adding a product
app.post('/add-product', upload.single('image'), (req, res) => {
    if (!req.session.loggedin) return res.send('Please login first');

    const { productGroup, code, name, tradePrice, rrpPrice } = req.body;
    const image = req.file ? req.file.filename : null;
    const username = req.session.username;

    if (!productGroup || !code || !name || !tradePrice || !rrpPrice || !image) {
        return res.send('Please fill in all required fields');
    }

    const insertQuery = `
        INSERT INTO product 
        (username, productGroup, code, name, tradePrice, rrpPrice, image)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    conn.query(insertQuery, [username, productGroup, code, name, tradePrice, rrpPrice, image], (err) => {
        if (err) throw err;
        res.redirect('/existingProducts');
    });
});

// View Existing Products
app.get('/existingProducts', (req, res) => {
    if (!req.session.loggedin) return res.send('Please login first');

    const selectQuery = 'SELECT username, productGroup, code, name, tradePrice, rrpPrice, image FROM product';
    conn.query(selectQuery, (err, results) => {
        if (err) throw err;
        res.render('existingProducts', {
            username: req.session.username,
            products: results || []
        });
    });
});

// Buyer dashboard - safe version
app.get('/buyer_dashboard', (req, res) => {
    if (!req.session.loggedin) return res.redirect('/login');

    const searchQuery = req.query.search || '';
    const selectedCategory = req.query.category || 'all';

    let sql = 'SELECT * FROM product WHERE 1=1';
    const params = [];

    if (selectedCategory !== 'all') {
        sql += ' AND productGroup = ?';
        params.push(selectedCategory);
    }

    if (searchQuery) {
        sql += ' AND (code LIKE ? OR name LIKE ?)';
        params.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    // Execute product query
    conn.query(sql, params, (err, products) => {
        // If error, default to empty array
        products = products || [];

        // Execute categories query
        conn.query('SELECT DISTINCT productGroup FROM product', (err2, categories) => {
            categories = categories || [];

            // Render page safely with defaults for EJS
            res.render('buyer_dashboard', {
                username: req.session.username || 'Buyer',
                products: products,
                categories: categories,
                searchQuery: searchQuery,
                selectedCategory: selectedCategory
            });
        });
    });
});





// ---------------- ADMIN ROUTES ----------------

// Admin dashboard
app.get('/admin', isAdmin, (req, res) => {
    res.render('admin', { username: req.session.username });
});

// Manage users (show password as well)
app.get('/admin/users', isAdmin, (req, res) => {
    const sql = 'SELECT id, usertype, username, email, password FROM users';
    conn.query(sql, (err, rows) => {
        if (err) return res.status(500).send('Database error');
        res.render('admin_users', { users: rows, username: req.session.username });
    });
});
// Add User
app.post('/admin/users/add', isAdmin, (req, res) => {
    const { usertype, username, email, password } = req.body;

    const sql = `INSERT INTO users (usertype, username, email, password) VALUES (?, ?, ?, ?)`;

    conn.query(sql, [usertype, username, email, password], (err) => {
        if (err) return res.status(500).send('Database error');
        res.redirect('/admin/users');
    });
});
// Update user (including password)
app.post('/admin/users/update/:id', isAdmin, (req, res) => {
    const { usertype, username, email, password } = req.body;
    const { id } = req.params;

    const sql = 'UPDATE users SET usertype=?, username=?, email=?, password=? WHERE id=?';
    conn.query(sql, [usertype, username, email, password, id], (err) => {  // password added here
        if (err) return res.status(500).send('Database error');
        res.redirect('/admin/users');
    });
});

// Delete user
app.get('/admin/users/delete/:id', isAdmin, (req, res) => {
    const { id } = req.params;

    const sql = 'DELETE FROM users WHERE id=?';
    conn.query(sql, [id], (err) => {
        if (err) return res.status(500).send('Database error');
        res.redirect('/admin/users');
    });
});

// Manage products
app.get('/admin/products', isAdmin, (req, res) => {
    const sql = 'SELECT * FROM product';
    conn.query(sql, (err, rows) => {
        if (err) return res.status(500).send('Database error');
        res.render('admin_products', { products: rows, username: req.session.username });
    });
});

// Add product
app.post('/admin/products/add', isAdmin, upload.single('image'), (req, res) => {
    const { username, productGroup, code, name, tradePrice, rrpPrice } = req.body;
    //const username = req.session.username;
    const image = req.file ? req.file.filename : null;

    const sql = 'INSERT INTO product (username, productGroup, code, name, tradePrice, rrpPrice, image) VALUES (?, ?, ?, ?, ?, ?, ?)';
    conn.query(sql, [username, productGroup, code, name, tradePrice, rrpPrice, image], (err) => {
        if (err) return res.status(500).send('Database error');
        res.redirect('/admin/products');
    });
});


// Update product
app.post(
    '/admin/products/update/:id',
    isAdmin,
    upload.single('image'),   // 👈 add this
    (req, res) => {

        const { code, name, productGroup, tradePrice, rrpPrice } = req.body;
        const { id } = req.params;

        // If new image uploaded
        if (req.file) {

            const sql = `
                UPDATE product 
                SET code=?, name=?, productGroup=?, tradePrice=?, rrpPrice=?, image=? 
                WHERE id=?`;

            conn.query(
                sql,
                [code, name, productGroup, tradePrice, rrpPrice, req.file.filename, id],
                (err) => {
                    if (err) return res.status(500).send('Database error');
                    res.redirect('/admin/products');
                }
            );

        } else {

            // No image uploaded → keep existing image
            const sql = `
                UPDATE product 
                SET code=?, name=?, productGroup=?, tradePrice=?, rrpPrice=? 
                WHERE id=?`;

            conn.query(
                sql,
                [code, name, productGroup, tradePrice, rrpPrice, id],
                (err) => {
                    if (err) return res.status(500).send('Database error');
                    res.redirect('/admin/products');
                }
            );
        }
    }
);
// Delete product
app.get('/admin/products/delete/:id', isAdmin, (req, res) => {
    const { id } = req.params;

    const sql = 'DELETE FROM product WHERE id=?';
    conn.query(sql, [id], (err) => {
        if (err) return res.status(500).send('Database error');
        res.redirect('/admin/products');
    });
});

// ---------------- START SERVER ----------------
app.listen(3000, () => console.log('Node app running on port 3000'));
