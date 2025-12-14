const multer = require('multer');
var express = require('express'); 
var app = express(); 
//Session start
var session = require('express-session');
var conn = require('./dbConfig');
app.set('view engine', 'ejs');
app.use(session({
    secret: 'yoursecret',
    resave: false,
    saveUninitialized: false
}));
// Configure storage folder and filenames
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Make sure this folder exists
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

//Using CSS File
app.use('/public',express.static('public'));

//session code
app.use(express.json());
app.use(express.urlencoded({extended: true}));

//Adding Home Page
app.get('/', function (req, res){ 
res.render("home"); 
});
//Adding buyer_dashboard
app.get('/buyer_dashboard', function (req, res){ 
if (req.session.loggedin){
        res.render('buyer_dashboard', {username: req.session.username});
    }   else{
        res.send('Please login to view this page');
    }
}); 
//Adding supplier_dashboard
app.get('/supplier_dashboard', function (req, res){ 
if (req.session.loggedin){
        res.render('supplier_dashboard', {username: req.session.username});
    }   else{
        res.send('Please login to view this page');
    }
}); 
//Adding Admin Page
app.get('/admin', function (req, res){ 
if (req.session.loggedin){
        res.render('admin', {username: req.session.username});
    }   else{
        res.send('Please login to view this page');
    }
});
//Adding Add Product Page 
app.get('/addProduct', function (req, res){  
if (req.session.loggedin){
        res.render('addProduct', {username: req.session.username});
    }   else{
        res.send('Please login to view this page');
    }
});
//Adding Existing Product Page
app.get('/existingProducts', function (req, res){  
if (req.session.loggedin){
        res.render('existingProducts', {username: req.session.username});
    }   else{
        res.send('Please login to view this page');
    }
});


//Adding Login Page
app.get('/login', function (req, res){ 
res.render("login"); 
});
app.get('/membersOnly', function (req, res){
    if (req.session.loggedin){
        res.render('membersOnly', {username: req.session.username});
    }   else{
        res.send('Please login to view this page');
    }
});
//Logout
app.get('/logout', function(req, res)
        {
            req.session.destroy(function(err)
                {
                if(err)
                    {
                    console.log(err);
                    }
                else
                    {
                    res.redirect('/login');
                    }
                
                }
            );
        });
//Adding Register Page
app.get('/register', function (req, res){ 
res.render("register"); 
});
app.post('/auth', function(req, res){
    let username=req.body.username;
    let password=req.body.password;
    if(username && password){
        conn.query('SELECT * FROM users WHERE username = ? AND password = ?', [username , password],
        function(error, results, fields){
            if(error) throw error;
            if(results.length >0){
                req.session.loggedin = true;
                req.session.username = username;
                res.redirect('/membersOnly');
            }
            else{
                res.send('Incorrect Username and/or Password');
            }
        });
    }   else{
        res.send('Please enter Username and Password');
        
    }
});


//Send information from Registration to database
app.post('/register', function(req, res) {
    const { usertype, username, password, email } = req.body;

    if (!usertype || !username || !password || !email) {
        return res.send('Please fill in all required fields');
    }

    // Check if username exists
    const checkQuery = 'SELECT * FROM users WHERE username = ?';

    conn.query(checkQuery, [username], function(error, results) {
        if (error) throw error;

        if (results.length > 0) {
            return res.send('Username already taken');
        }

        // Insert new user
        const insertQuery = 'INSERT INTO users (usertype, username, password, email) VALUES (?, ?, ?, ?)';

        conn.query(insertQuery, [usertype, username, password, email], function(error) {
            if (error) throw error;

            /*res.send('Registration successful! You can now log in.');*/
            res.redirect('/login');
            
        });
    });
});
//Registration form ends here
/*app.get("/supplierdashboard", (req, res) => {
    const sql = "SELECT productName, rrp, image, eoq FROM products1";
    db.query(sql, (err, results) => {
        if (err) throw err;
        res.render("products", { products1: results });
    });
});*/
//Send information from addProduct page to database
app.post('/add-product', upload.single('image'), function(req, res) {
    if (!req.session.loggedin) {
        return res.send('Please login first');
    }

    const { buyerSupplier, code, name, tradePrice, rrpPrice } = req.body; // matches your HTML form
    const image = req.file ? req.file.filename : null;
    const username = req.session.username;

    if (!buyerSupplier || !code || !name || !tradePrice || !rrpPrice || !image) {
        return res.send('Please fill in all required fields');
    }

    const insertQuery = `
        INSERT INTO product 
        (username, buyerSupplier, code, name, tradePrice, rrpPrice, image)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    conn.query(
        insertQuery,
        [username, buyerSupplier, code, name, tradePrice, rrpPrice, image],
        function(error) {
            if (error) throw error;
            res.redirect('/existingProducts');
        }
    );
});

app.listen(3000); 
console.log('Node app is running on port 3000'); 