
require("dotenv").config();

const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

async function hashPasswords() {
    const connection = await mysql.createConnection({
        host: "localhost",
        user: "root",
        password: process.env.DB_PASSWORD,
        database: "store_rating"
    });

    try {
        const [users] = await connection.execute(
            "SELECT id, password FROM users"
        );

        for (const user of users) {
            const password = user.password;

            if (
                password.startsWith("$2a$") ||
                password.startsWith("$2b$") ||
                password.startsWith("$2y$")
            ) {
                console.log(`User ${user.id}: Already hashed`);
                continue;
            }

            const hashedPassword = await bcrypt.hash(password, 12);

            await connection.execute(
                "UPDATE users SET password = ? WHERE id = ?",
                [hashedPassword, user.id]
            );

            console.log(`User ${user.id}: Password hashed`);
        }

        console.log("Password migration completed!");
    } catch (error) {
        console.error("Migration failed:", error.message);
    } finally {
        await connection.end();
    }
}

hashPasswords().catch((error) => {
    console.error("Database connection failed:", error.message);
});
