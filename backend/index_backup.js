
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

function verifyAdmin(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Login required. Token missing."
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (decoded.role?.toUpperCase() !== "ADMIN") {
            return res.status(403).json({
                message: "Access denied. Admin only."
            });
        }

        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired token."
        });
    }
}


// MySQL Database Connection
const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD,
    database: "store_rating"
});

connection.connect((err) => {
    if (err) {
        console.log("Database connection failed:", err);
        return;
    }

    console.log("MySQL connected successfully!");
});

// Home API
app.get("/", (req, res) => {
    res.send("Store Rating API is running!");
});

// 1. Users API
app.get("/users", verifyAdmin, (req, res) => {
    connection.query(
        "SELECT id, name, email, role FROM users",
        (err, results) => {
            if (err) {
                return res.status(500).json({
                    message: "Failed to fetch users"
                });
            }

            res.json(results);
        }
    );
});

// 2. Stores API with Average Rating
app.get("/stores", (req, res) => {
    const sql = `
        SELECT
            s.id,
            s.store_name,
            s.address,
            s.category,
            ROUND(AVG(r.rating), 2) AS average_rating
        FROM stores s
        LEFT JOIN ratings r ON s.id = r.store_id
        GROUP BY s.id, s.store_name, s.address, s.category
    `;

    connection.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({
                message: "Failed to fetch stores"
            });
        }

        res.json(results);
    });
});

// 3. Ratings API
app.get("/ratings", verifyAdmin, (req, res) => {
    const sql = `
        SELECT
            r.id,
            u.name AS user_name,
            s.store_name,
            r.rating
        FROM ratings r
        JOIN users u ON r.user_id = u.id
        JOIN stores s ON r.store_id = s.id
    `;

    connection.query(sql, (err, results) => {
        if (err) {
            return res.status(500).json({
                message: "Failed to fetch ratings"
            });
        }

        res.json(results);
    });
});

// 4. Submit or Update Rating API
app.post("/ratings", (req, res) => {
    const { user_id, store_id, rating } = req.body;

    if (
        !Number.isInteger(user_id) ||
        !Number.isInteger(store_id) ||
        !Number.isInteger(rating) ||
        user_id < 1 ||
        store_id < 1 ||
        rating < 1 ||
        rating > 5
    ) {
        return res.status(400).json({
            message: "Enter valid user_id, store_id and rating (1-5)"
        });
    }

    // Check if user already rated this store
    const checkSql = `
        SELECT id
        FROM ratings
        WHERE user_id = ? AND store_id = ?
        ORDER BY id
        LIMIT 1
    `;

    connection.query(
        checkSql,
        [user_id, store_id],
        (checkErr, results) => {
            if (checkErr) {
                return res.status(500).json({
                    message: "Failed to check rating"
                });
            }

            if (results.length > 0) {
                // Rating exists: update it
                const ratingId = results[0].id;

                const updateSql = `
                    UPDATE ratings
                    SET rating = ?
                    WHERE user_id = ? AND store_id = ?
                `;

                connection.query(
                    updateSql,
                    [rating, user_id, store_id],
                    (updateErr) => {
                        if (updateErr) {
                            return res.status(500).json({
                                message: "Rating update failed"
                            });
                        }

                        return res.json({
                            message: "Rating updated successfully!",
                            rating_id: ratingId
                        });
                    }
                );
            } else {
                // No existing rating: insert new rating
                const insertSql = `
                    INSERT INTO ratings (user_id, store_id, rating)
                    VALUES (?, ?, ?)
                `;

                connection.query(
                    insertSql,
                    [user_id, store_id, rating],
                    (insertErr, result) => {
                        if (insertErr) {
                            return res.status(500).json({
                                message: "Rating submission failed"
                            });
                        }

                        res.status(201).json({
                            message: "Rating submitted successfully!",
                            rating_id: result.insertId
                        });
                    }
                );
            }
        }
    );
});

// 5. Average Rating API
app.get("/average-rating/:store_id", (req, res) => {
    const storeId = req.params.store_id;

    const sql = `
        SELECT
            s.store_name,
            ROUND(AVG(r.rating), 2) AS average_rating
        FROM stores s
        LEFT JOIN ratings r ON s.id = r.store_id
        WHERE s.id = ?
        GROUP BY s.id, s.store_name
    `;

    connection.query(sql, [storeId], (err, results) => {
        if (err) {
            return res.status(500).json({
                message: "Failed to fetch average rating"
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                message: "Store not found"
            });
        }

        res.json(results[0]);
    });
});

// 6. Login API
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.trim() ||
        !password
    ) {
        return res.status(400).json({
            message: "Email and password are required"
        });
    }

    const sql = `
        SELECT id, name, email, password, role
        FROM users
        WHERE email = ?
        LIMIT 1
    `;

    connection.query(
        sql,
        [email.trim().toLowerCase()],
        async (err, results) => {
            if (err) {
                return res.status(500).json({
                    message: "Login failed"
                });
            }

            if (results.length === 0) {
                return res.status(401).json({
                    message: "Invalid email or password"
                });
            }

            const user = results[0];

            try {
                const validPassword = await bcrypt.compare(
                    password,
                    user.password
                );

                if (!validPassword) {
                    return res.status(401).json({
                        message: "Invalid email or password"
                    });
                }

                const token = jwt.sign(
                    {
                        id: user.id,
                        role: user.role
                    },
                    process.env.JWT_SECRET,
                    { expiresIn: "2h" }
                );

                res.json({
                    message: "Login successful!",
                    token: token,
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role
                    }
                });
            } catch (error) {
                res.status(500).json({
                    message: "Login failed"
                });
            }
        }
    );
});

// 7. User Registration API
app.post("/register", (req, res) => {
    const { name, email, password } = req.body;

    if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        !name.trim() ||
        !email.trim() ||
        password.length < 6
    ) {
        return res.status(400).json({
            message: "Enter name, email and password (minimum 6 characters)"
        });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Check whether email already exists
    const checkSql = `
        SELECT id
        FROM users
        WHERE email = ?
        LIMIT 1
    `;

    connection.query(
        checkSql,
        [cleanEmail],
        async (err, results) => {
            if (err) {
                return res.status(500).json({
                    message: "Registration failed"
                });
            }

            if (results.length > 0) {
                return res.status(409).json({
                    message: "Email already registered"
                });
            }

            try {
                // Hash password before storing
                const hashedPassword = await bcrypt.hash(
                    password,
                    10
                );

                const insertSql = `
                    INSERT INTO users
                        (name, email, password, role)
                    VALUES (?, ?, ?, ?)
                `;

                connection.query(
                    insertSql,
                    [
                        cleanName,
                        cleanEmail,
                        hashedPassword,
                        "USER"
                    ],
                    (insertErr, result) => {
                        if (insertErr) {
                            if (
                                insertErr.code === "ER_DUP_ENTRY"
                            ) {
                                return res.status(409).json({
                                    message: "Email already registered"
                                });
                            }

                            return res.status(500).json({
                                message: "Registration failed"
                            });
                        }

                        res.status(201).json({
                            message: "Registration successful!",
                            user: {
                                id: result.insertId,
                                name: cleanName,
                                email: cleanEmail,
                                role: "USER"
                            }
                        });
                    }
                );
            } catch (error) {
                res.status(500).json({
                    message: "Registration failed"
                });
            }
        }
    );
});

// Start Express Server
app.listen(5000, () => {
    console.log("Server running on port 5000");
});
