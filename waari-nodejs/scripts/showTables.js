require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  try {
    const pool = await mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    });

    const tablesToDescribe = process.argv.slice(2);

    if (tablesToDescribe.length === 0) {
      const [tables] = await pool.query('SHOW TABLES');
      console.log(tables);
    } else {
      for (const table of tablesToDescribe) {
        const [rows] = await pool.query(`SHOW CREATE TABLE \`${table}\``);
        console.log(`\n=== ${table} ===`);
        console.log(rows[0]['Create Table']);
      }
    }

    await pool.end();
  } catch (err) {
    console.error('DB error', err);
    process.exit(1);
  }
})();
