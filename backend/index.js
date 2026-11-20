
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());

if (!process.env.JWT_SECRET || !process.env.DB_PASSWORD) {
    console.error("Missing JWT_SECRET or DB_PASSWORD in .env");
    process.exit(1);
}

const db = mysql.createPool({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD,
    database: "store_rating",
    waitForConnections: true,
    connectionLimit: 10
}).promise();

const PORT = 5000;

// VALIDATION
const validEmail = (email) =>
    typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const validPassword = (password) =>
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 16 &&
    /[A-Z]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);

const validName = (name) =>
    typeof name === "string" &&
    name.trim().length >= 20 &&
    name.trim().length <= 60;

const validAddress = (address) =>
    typeof address === "string" &&
    address.trim().length > 0 &&
    address.trim().length <= 400;

function errorResponse(res, error, message = "Server error") {
    console.error(message, error.code || error.message);
    return res.status(500).json({ message });
}

// JWT AUTHENTICATION
function authenticate(req, res, next) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Login required. Token missing."
        });
    }

    try {
        const token = header.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!Number.isInteger(decoded.id)) {
            return res.status(401).json({
                message: "Invalid token."
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

// ROLE AUTHORIZATION
function allowRoles(...roles) {
    return async (req, res, next) => {
        try {
            const [rows] = await db.execute(
                "SELECT id, role FROM users WHERE id = ? LIMIT 1",
                [req.user.id]
            );

            if (!rows.length) {
                return res.status(401).json({
                    message: "User no longer exists."
                });
            }

            const role = String(rows[0].role).toUpperCase();

            if (!roles.includes(role)) {
                return res.status(403).json({
                    message: "Access denied."
                });
            }

            req.user.role = role;
            next();
        } catch (error) {
            errorResponse(res, error);
        }
    };
}

const verifyAdmin = [
    authenticate,
    allowRoles("ADMIN")
];

const verifyUser = [
    authenticate,
    allowRoles("USER")
];

const verifyOwner = [
    authenticate,
    allowRoles("STORE_OWNER", "OWNER")
];

// HOME
app.get("/", (req, res) => {
    res.send("Store Rating API is running!");
});

// LOGIN
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!validEmail(email) || typeof password !== "string") {
            return res.status(400).json({
                message: "Valid email and password required."
            });
        }

        const [rows] = await db.execute(
            `SELECT id, name, email, password, role, address
       FROM users
       WHERE email = ?
       LIMIT 1`,
            [email.trim().toLowerCase()]
        );

        if (!rows.length) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const user = rows[0];

        const correct = await bcrypt.compare(
            password,
            user.password
        );

        if (!correct) {
            return res.status(401).json({
                message: "Invalid email or password."
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
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address
            }
        });
    } catch (error) {
        errorResponse(res, error, "Login failed.");
    }
});

// PUBLIC REGISTRATION
app.post("/register", async (req, res) => {
    try {
        const { name, email, password, address } = req.body;

        if (!validName(name)) {
            return res.status(400).json({
                message: "Name must contain 20 to 60 characters."
            });
        }

        if (!validEmail(email)) {
            return res.status(400).json({
                message: "Enter a valid email."
            });
        }

        if (!validAddress(address)) {
            return res.status(400).json({
                message: "Address is required (maximum 400 characters)."
            });
        }

        if (!validPassword(password)) {
            return res.status(400).json({
                message:
                    "Password must be 8-16 characters with uppercase and special character."
            });
        }

        const hashed = await bcrypt.hash(password, 10);

        const [result] = await db.execute(
            `INSERT INTO users
       (name, email, password, role, address)
       VALUES (?, ?, ?, 'USER', ?)`,
            [
                name.trim(),
                email.trim().toLowerCase(),
                hashed,
                address.trim()
            ]
        );

        res.status(201).json({
            message: "Registration successful!",
            user: {
                id: result.insertId,
                name: name.trim(),
                email: email.trim().toLowerCase(),
                role: "USER",
                address: address.trim()
            }
        });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "Email already registered."
            });
        }

        errorResponse(res, error, "Registration failed.");
    }
});

// CHANGE PASSWORD
app.put("/change-password", authenticate, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (
            typeof oldPassword !== "string" ||
            !validPassword(newPassword)
        ) {
            return res.status(400).json({
                message:
                    "Enter old password and a valid new password (8-16 characters, uppercase, special character)."
            });
        }

        const [rows] = await db.execute(
            "SELECT password FROM users WHERE id = ?",
            [req.user.id]
        );

        if (!rows.length) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const matches = await bcrypt.compare(
            oldPassword,
            rows[0].password
        );

        if (!matches) {
            return res.status(401).json({
                message: "Old password is incorrect."
            });
        }

        const hashed = await bcrypt.hash(newPassword, 10);

        await db.execute(
            "UPDATE users SET password = ? WHERE id = ?",
            [hashed, req.user.id]
        );

        res.json({
            message: "Password updated successfully!"
        });
    } catch (error) {
        errorResponse(res, error, "Password update failed.");
    }
});

// ALL STORES WITH AVERAGE RATINGS
app.get("/stores", async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const pattern = `%${search}%`;

        const [rows] = await db.execute(
            `SELECT
         s.id,
         s.store_name,
         s.address,
         s.category,
         s.email,
         s.owner_id,
         ROUND(AVG(r.rating), 2) AS average_rating
       FROM stores s
       LEFT JOIN ratings r ON r.store_id = s.id
       WHERE s.store_name LIKE ? OR s.address LIKE ?
       GROUP BY
         s.id, s.store_name, s.address,
         s.category, s.email, s.owner_id
       ORDER BY s.store_name ASC`,
            [pattern, pattern]
        );

        res.json(rows);
    } catch (error) {
        errorResponse(res, error, "Failed to fetch stores.");
    }
});

// AVERAGE RATING OF ONE STORE
app.get("/average-rating/:store_id", async (req, res) => {
    try {
        const storeId = Number(req.params.store_id);

        if (!Number.isInteger(storeId) || storeId < 1) {
            return res.status(400).json({
                message: "Invalid store ID."
            });
        }

        const [rows] = await db.execute(
            `SELECT
         s.store_name,
         ROUND(AVG(r.rating), 2) AS average_rating
       FROM stores s
       LEFT JOIN ratings r ON r.store_id = s.id
       WHERE s.id = ?
       GROUP BY s.id, s.store_name`,
            [storeId]
        );

        if (!rows.length) {
            return res.status(404).json({
                message: "Store not found."
            });
        }

        res.json(rows[0]);
    } catch (error) {
        errorResponse(res, error);
    }
});

// USER: MY STORE RATINGS
app.get("/my-ratings", ...verifyUser, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
         r.id,
         r.store_id,
         s.store_name,
         r.rating
       FROM ratings r
       JOIN stores s ON s.id = r.store_id
       WHERE r.user_id = ?`,
            [req.user.id]
        );

        res.json(rows);
    } catch (error) {
        errorResponse(res, error);
    }
});

// USER: SAVE OR UPDATE STORE RATING
app.post("/ratings", ...verifyUser, async (req, res) => {
    try {
        const storeId = Number(req.body.store_id);
        const rating = Number(req.body.rating);

        if (
            !Number.isInteger(storeId) ||
            storeId < 1 ||
            !Number.isInteger(rating) ||
            rating < 1 ||
            rating > 5
        ) {
            return res.status(400).json({
                message: "Enter valid store ID and rating (1-5)."
            });
        }

        const [stores] = await db.execute(
            "SELECT id FROM stores WHERE id = ?",
            [storeId]
        );

        if (!stores.length) {
            return res.status(404).json({
                message: "Store not found."
            });
        }

        await db.execute(
            `INSERT INTO ratings (user_id, store_id, rating)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating)`,
            [req.user.id, storeId, rating]
        );

        res.json({
            message: "Rating saved successfully!"
        });
    } catch (error) {
        errorResponse(res, error, "Rating submission failed.");
    }
});

// ADMIN: ALL USERS
app.get("/users", ...verifyAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT id, name, email, address, role
       FROM users
       ORDER BY name ASC`
        );

        res.json(rows);
    } catch (error) {
        errorResponse(res, error, "Failed to fetch users.");
    }
});

// ADMIN: ALL STORE RATINGS
app.get("/ratings", ...verifyAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
         r.id,
         r.user_id,
         r.store_id,
         u.name AS user_name,
         s.store_name,
         r.rating
       FROM ratings r
       JOIN users u ON u.id = r.user_id
       JOIN stores s ON s.id = r.store_id
       ORDER BY s.store_name, u.name`
        );

        res.json(rows);
    } catch (error) {
        errorResponse(res, error, "Failed to fetch ratings.");
    }
});

// ADMIN: CREATE USER / ADMIN / STORE OWNER
app.post("/admin/users", ...verifyAdmin, async (req, res) => {
    try {
        const { name, email, password, address, role } = req.body;

        const selectedRole = String(role || "USER").toUpperCase();

        if (!["USER", "ADMIN", "STORE_OWNER"].includes(selectedRole)) {
            return res.status(400).json({
                message: "Invalid role."
            });
        }

        if (
            !validName(name) ||
            !validEmail(email) ||
            !validAddress(address) ||
            !validPassword(password)
        ) {
            return res.status(400).json({
                message:
                    "Invalid details. Name: 20-60, address: max 400, password: 8-16 with uppercase and special character."
            });
        }

        const hashed = await bcrypt.hash(password, 10);

        const [result] = await db.execute(
            `INSERT INTO users
       (name, email, password, address, role)
       VALUES (?, ?, ?, ?, ?)`,
            [
                name.trim(),
                email.trim().toLowerCase(),
                hashed,
                address.trim(),
                selectedRole
            ]
        );

        res.status(201).json({
            message: "User created successfully!",
            id: result.insertId
        });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                message: "Email already registered."
            });
        }

        errorResponse(res, error, "Failed to create user.");
    }
});

// ADMIN: ADD STORE
app.post("/admin/stores", ...verifyAdmin, async (req, res) => {
    try {
        const {
            store_name,
            email,
            address,
            category,
            owner_id
        } = req.body;

        if (
            typeof store_name !== "string" ||
            !store_name.trim() ||
            !validEmail(email) ||
            !validAddress(address)
        ) {
            return res.status(400).json({
                message: "Valid store name, email and address required."
            });
        }

        let ownerId = null;

        if (
            owner_id !== undefined &&
            owner_id !== null &&
            owner_id !== ""
        ) {
            ownerId = Number(owner_id);

            if (!Number.isInteger(ownerId) || ownerId < 1) {
                return res.status(400).json({
                    message: "Invalid owner ID."
                });
            }

            const [owners] = await db.execute(
                "SELECT role FROM users WHERE id = ?",
                [ownerId]
            );

            if (
                !owners.length ||
                !["STORE_OWNER", "OWNER"].includes(
                    String(owners[0].role).toUpperCase()
                )
            ) {
                return res.status(400).json({
                    message: "Selected user must be a Store Owner."
                });
            }
        }

        const [result] = await db.execute(
            `INSERT INTO stores
       (store_name, email, address, category, owner_id)
       VALUES (?, ?, ?, ?, ?)`,
            [
                store_name.trim(),
                email.trim().toLowerCase(),
                address.trim(),
                typeof category === "string" ? category.trim() : null,
                ownerId
            ]
        );

        res.status(201).json({
            message: "Store created successfully!",
            id: result.insertId
        });
    } catch (error) {
        errorResponse(res, error, "Failed to create store.");
    }
});

// ADMIN: STORE LIST
app.get("/admin/stores", ...verifyAdmin, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
         s.id,
         s.store_name,
         s.email,
         s.address,
         s.category,
         s.owner_id,
         u.name AS owner_name,
         ROUND(AVG(r.rating), 2) AS average_rating
       FROM stores s
       LEFT JOIN users u ON u.id = s.owner_id
       LEFT JOIN ratings r ON r.store_id = s.id
       GROUP BY
         s.id, s.store_name, s.email,
         s.address, s.category, s.owner_id, u.name
       ORDER BY s.store_name`
        );

        res.json(rows);
    } catch (error) {
        errorResponse(res, error);
    }
});

// ADMIN: USER DETAILS
app.get("/admin/users/:id", ...verifyAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({
                message: "Invalid user ID."
            });
        }

        const [rows] = await db.execute(
            `SELECT id, name, email, address, role
       FROM users
       WHERE id = ?`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        res.json(rows[0]);
    } catch (error) {
        errorResponse(res, error);
    }
});

// STORE OWNER: DASHBOARD
app.get("/owner/dashboard", ...verifyOwner, async (req, res) => {
    try {
        const [stores] = await db.execute(
            `SELECT
         s.id,
         s.store_name,
         s.address,
         s.email,
         ROUND(AVG(r.rating), 2) AS average_rating
       FROM stores s
       LEFT JOIN ratings r ON r.store_id = s.id
       WHERE s.owner_id = ?
       GROUP BY s.id, s.store_name, s.address, s.email`,
            [req.user.id]
        );

        const [ratings] = await db.execute(
            `SELECT
         r.id,
         r.rating,
         r.store_id,
         s.store_name,
         u.name AS user_name,
         u.email AS user_email
       FROM ratings r
       JOIN stores s ON s.id = r.store_id
       JOIN users u ON u.id = r.user_id
       WHERE s.owner_id = ?
       ORDER BY s.store_name, u.name`,
            [req.user.id]
        );

        res.json({
            stores,
            ratings
        });
    } catch (error) {
        errorResponse(res, error, "Failed to load owner dashboard.");
    }
});

// ==========================================
// NEW FEATURE: PRODUCTS AND PRODUCT RATINGS
// ==========================================

// PUBLIC: GET ALL PRODUCTS
// Example: GET /products?store_id=4
app.get("/products", async (req, res) => {
    try {
        const storeId = req.query.store_id;

        let sql = `
      SELECT
        p.id,
        p.store_id,
        p.product_name,
        p.category,
        p.price,
        s.store_name,
        ROUND(AVG(pr.rating), 2) AS average_rating,
        COUNT(pr.id) AS rating_count
      FROM products p
      JOIN stores s ON s.id = p.store_id
      LEFT JOIN product_ratings pr ON pr.product_id = p.id
    `;

        const params = [];

        if (storeId !== undefined) {
            const id = Number(storeId);

            if (!Number.isInteger(id) || id < 1) {
                return res.status(400).json({
                    message: "Invalid store ID."
                });
            }

            sql += " WHERE p.store_id = ?";
            params.push(id);
        }

        sql += `
      GROUP BY
        p.id,
        p.store_id,
        p.product_name,
        p.category,
        p.price,
        s.store_name
      ORDER BY s.store_name, p.product_name
    `;

        const [rows] = await db.execute(sql, params);

        res.json(rows);
    } catch (error) {
        errorResponse(res, error, "Failed to fetch products.");
    }
});

// PUBLIC: GET ONE PRODUCT
app.get("/products/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({
                message: "Invalid product ID."
            });
        }

        const [rows] = await db.execute(
            `SELECT
         p.id,
         p.store_id,
         p.product_name,
         p.category,
         p.price,
         s.store_name,
         ROUND(AVG(pr.rating), 2) AS average_rating,
         COUNT(pr.id) AS rating_count
       FROM products p
       JOIN stores s ON s.id = p.store_id
       LEFT JOIN product_ratings pr ON pr.product_id = p.id
       WHERE p.id = ?
       GROUP BY
         p.id,
         p.store_id,
         p.product_name,
         p.category,
         p.price,
         s.store_name`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({
                message: "Product not found."
            });
        }

        res.json(rows[0]);
    } catch (error) {
        errorResponse(res, error, "Failed to fetch product.");
    }
});

// USER: MY PRODUCT RATINGS
app.get("/my-product-ratings", ...verifyUser, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
         pr.id,
         pr.product_id,
         pr.rating,
         p.product_name,
         p.store_id,
         s.store_name
       FROM product_ratings pr
       JOIN products p ON p.id = pr.product_id
       JOIN stores s ON s.id = p.store_id
       WHERE pr.user_id = ?
       ORDER BY s.store_name, p.product_name`,
            [req.user.id]
        );

        res.json(rows);
    } catch (error) {
        errorResponse(res, error, "Failed to fetch your product ratings.");
    }
});

// USER: RATE A PRODUCT
app.post("/product-ratings", ...verifyUser, async (req, res) => {
    try {
        const productId = Number(req.body.product_id);
        const rating = Number(req.body.rating);

        if (
            !Number.isInteger(productId) ||
            productId < 1 ||
            !Number.isInteger(rating) ||
            rating < 1 ||
            rating > 5
        ) {
            return res.status(400).json({
                message: "Enter valid product ID and rating (1-5)."
            });
        }

        const [products] = await db.execute(
            "SELECT id FROM products WHERE id = ?",
            [productId]
        );

        if (!products.length) {
            return res.status(404).json({
                message: "Product not found."
            });
        }

        await db.execute(
            `INSERT INTO product_ratings
       (user_id, product_id, rating)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = VALUES(rating)`,
            [req.user.id, productId, rating]
        );

        res.json({
            message: "Product rating saved successfully!"
        });
    } catch (error) {
        errorResponse(res, error, "Failed to save product rating.");
    }
});

// ADMIN: ADD NEW PRODUCT
app.post("/admin/products", ...verifyAdmin, async (req, res) => {
    try {
        const storeId = Number(req.body.store_id);
        const name = req.body.product_name;
        const category = req.body.category;
        const price = Number(req.body.price);

        if (
            !Number.isInteger(storeId) ||
            storeId < 1 ||
            typeof name !== "string" ||
            !name.trim() ||
            name.trim().length > 150 ||
            (category != null && typeof category !== "string") ||
            req.body.price === undefined ||
            req.body.price === null ||
            req.body.price === "" ||
            !Number.isFinite(price) ||
            price < 0
        ) {
            return res.status(400).json({
                message: "Invalid product details."
            });
        }

        const [stores] = await db.execute(
            "SELECT id FROM stores WHERE id = ?",
            [storeId]
        );

        if (!stores.length) {
            return res.status(404).json({
                message: "Store not found."
            });
        }

        const [result] = await db.execute(
            `INSERT INTO products
       (store_id, product_name, category, price)
       VALUES (?, ?, ?, ?)`,
            [
                storeId,
                name.trim(),
                category ? category.trim() : null,
                price
            ]
        );

        res.status(201).json({
            message: "Product created successfully!",
            id: result.insertId
        });
    } catch (error) {
        errorResponse(res, error, "Failed to create product.");
    }
});

// OWNER: VIEW PRODUCTS OF OWN STORES
app.get("/owner/products", ...verifyOwner, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
         p.id,
         p.store_id,
         p.product_name,
         p.category,
         p.price,
         s.store_name,
         ROUND(AVG(pr.rating), 2) AS average_rating,
         COUNT(pr.id) AS rating_count
       FROM products p
       JOIN stores s ON s.id = p.store_id
       LEFT JOIN product_ratings pr ON pr.product_id = p.id
       WHERE s.owner_id = ?
       GROUP BY
         p.id,
         p.store_id,
         p.product_name,
         p.category,
         p.price,
         s.store_name
       ORDER BY s.store_name, p.product_name`,
            [req.user.id]
        );

        res.json(rows);
    } catch (error) {
        errorResponse(res, error, "Failed to fetch owner products.");
    }
});

// OWNER: VIEW USERS WHO RATED PRODUCTS
app.get("/owner/product-ratings", ...verifyOwner, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
         pr.id,
         pr.rating,
         p.id AS product_id,
         p.product_name,
         s.id AS store_id,
         s.store_name,
         u.name AS user_name,
         u.email AS user_email
       FROM product_ratings pr
       JOIN products p ON p.id = pr.product_id
       JOIN stores s ON s.id = p.store_id
       JOIN users u ON u.id = pr.user_id
       WHERE s.owner_id = ?
       ORDER BY s.store_name, p.product_name, u.name`,
            [req.user.id]
        );

        res.json(rows);
    } catch (error) {
        errorResponse(res, error, "Failed to fetch product ratings.");
    }
});

// START BACKEND SERVER
db.query("SELECT 1")
    .then(() => {
        console.log("MySQL connected successfully!");

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error("MySQL connection failed:", error.message);
        process.exit(1);
    });
