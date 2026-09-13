import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Create connection pool using Hostinger database configuration
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test connection on startup
(async () => {
  try {
    const connection = await db.getConnection();
    console.log("Successfully connected to Hostinger MySQL database.");
    connection.release();
  } catch (error) {
    console.error("Error connecting to Hostinger MySQL:", error.message);
  }
})();

export default db;