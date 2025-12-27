// db.js
const mysql = require("mysql2/promise"); // 👈 use promise wrapper

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ✅ Test connection at startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ MySQL Database connected successfully!");
    connection.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }
})();

module.exports = pool;
