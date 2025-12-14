var mysql = require('mysql');
var conn=mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'pdms'

});
conn.connect(function(err){
    if(err) throw error;
    console.log('Database Connected');
});
module.exports  = conn;