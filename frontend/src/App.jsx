
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000";

function App() {
    const [page, setPage] = useState("home");
    const [user, setUser] = useState(null);
    const [token, setToken] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [address, setAddress] = useState("");

    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");

    const [stores, setStores] = useState([]);
    const [users, setUsers] = useState([]);
    const [ratings, setRatings] = useState([]);
    const [myRatings, setMyRatings] = useState([]);

    const [ownerData, setOwnerData] = useState({
        stores: [],
        ratings: [],
    });

    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState("name");
    const [sortDirection, setSortDirection] = useState("asc");
    const [selectedRatings, setSelectedRatings] = useState({});

    // Admin-only table controls (independent of the public store search)
    const [adminUserSearch, setAdminUserSearch] = useState("");
    const [adminRoleFilter, setAdminRoleFilter] = useState("ALL");
    const [adminUserSort, setAdminUserSort] = useState("name");
    const [adminUserDirection, setAdminUserDirection] = useState("asc");
    const [adminStoreSearch, setAdminStoreSearch] = useState("");
    const [adminStoreSort, setAdminStoreSort] = useState("store_name");
    const [adminStoreDirection, setAdminStoreDirection] = useState("asc");
    const [adminRatingSearch, setAdminRatingSearch] = useState("");

    const [newUser, setNewUser] = useState({
        name: "",
        email: "",
        password: "",
        address: "",
        role: "USER",
    });

    const [newStore, setNewStore] = useState({
        store_name: "",
        email: "",
        address: "",
        category: "",
        owner_id: "",
    });

    // PRODUCT RATINGS - NEW STATES
    const [selectedStore, setSelectedStore] = useState(null);
    const [products, setProducts] = useState([]);
    const [productRatings, setProductRatings] = useState({});
    const [myProductRatings, setMyProductRatings] = useState({});
    const [productsLoading, setProductsLoading] = useState(false);

    function navigate(next) {
        setMessage("");
        setPage(next);
    }

    function logout() {
        setToken("");
        setUser(null);
        setUsers([]);
        setRatings([]);
        setMyRatings([]);
        setOwnerData({ stores: [], ratings: [] });
        setProducts([]);
        setSelectedStore(null);
        setPassword("");
        setPage("home");
        setMessage("Logged out successfully.");
    }

    async function api(path, options = {}, authToken = token) {
        let response;

        try {
            response = await fetch(API_URL + path, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...(authToken
                        ? { Authorization: `Bearer ${authToken}` }
                        : {}),
                    ...(options.headers || {}),
                },
            });
        } catch {
            throw new Error(
                "Cannot connect to backend. Check node index.js on port 5000."
            );
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.message || `Request failed (${response.status})`
            );
        }

        return data;
    }

    async function loadStores(query = "") {
        try {
            const data = await api(
                `/stores?search=${encodeURIComponent(query)}`
            );
            setStores(Array.isArray(data) ? data : []);
        } catch (error) {
            setMessage(error.message);
        }
    }

    async function loadAdmin(authToken = token) {
        try {
            const [allUsers, allRatings, allStores] =
                await Promise.all([
                    api("/users", {}, authToken),
                    api("/ratings", {}, authToken),
                    api("/admin/stores", {}, authToken),
                ]);

            setUsers(allUsers);
            setRatings(allRatings);
            setStores(allStores);
        } catch (error) {
            setMessage(error.message);
        }
    }

    async function loadMyRatings(authToken = token) {
        try {
            const data = await api(
                "/my-ratings",
                {},
                authToken
            );
            setMyRatings(data);
        } catch (error) {
            setMessage(error.message);
        }
    }

    async function loadOwner(authToken = token) {
        try {
            const data = await api(
                "/owner/dashboard",
                {},
                authToken
            );
            setOwnerData(data);
        } catch (error) {
            setMessage(error.message);
        }
    }

    useEffect(() => {
        loadStores();
    }, []);

    async function handleLogin(event) {
        event.preventDefault();
        setLoading(true);
        setMessage("");

        try {
            const data = await api(
                "/login",
                {
                    method: "POST",
                    body: JSON.stringify({ email, password }),
                },
                ""
            );

            if (!data.token || !data.user) {
                throw new Error(
                    "Login response missing token or user."
                );
            }

            setToken(data.token);
            setUser(data.user);
            setPassword("");

            const role = String(
                data.user.role || ""
            ).toUpperCase();

            if (role === "ADMIN") {
                setPage("admin");
                await loadAdmin(data.token);
            } else if (
                role === "STORE_OWNER" ||
                role === "OWNER"
            ) {
                setPage("owner");
                await loadOwner(data.token);
            } else {
                setPage("dashboard");
                await Promise.all([
                    loadStores(),
                    loadMyRatings(data.token),
                ]);
            }
        } catch (error) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleRegister(event) {
        event.preventDefault();
        setLoading(true);
        setMessage("");

        try {
            const data = await api(
                "/register",
                {
                    method: "POST",
                    body: JSON.stringify({
                        name,
                        email,
                        password,
                        address,
                    }),
                },
                ""
            );

            setMessage(
                data.message ||
                "Registration successful. Please login."
            );

            setPassword("");
            setPage("login");
        } catch (error) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleRating(storeId) {
        setLoading(true);
        setMessage("");

        try {
            const rating = Number(
                selectedRatings[storeId] || 0
            );

            if (rating < 1 || rating > 5) {
                throw new Error(
                    "Select a rating from 1 to 5."
                );
            }

            const data = await api("/ratings", {
                method: "POST",
                body: JSON.stringify({
                    store_id: storeId,
                    rating,
                }),
            });

            setMessage(
                data.message || "Rating saved."
            );

            await Promise.all([
                loadStores(search),
                loadMyRatings(),
            ]);
        } catch (error) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    }

    // NEW - LOAD PRODUCTS OF A STORE
    async function openProducts(store) {
        setSelectedStore(store);
        setProducts([]);
        setProductRatings({});
        setMyProductRatings({});
        setProductsLoading(true);
        setMessage("");
        setPage("products");

        try {
            const data = await api(
                `/products?store_id=${store.id}`
            );

            setProducts(
                Array.isArray(data) ? data : []
            );

            if (user?.role === "USER" && token) {
                try {
                    const myData = await api(
                        "/my-product-ratings"
                    );

                    if (Array.isArray(myData)) {
                        const ratingMap = {};

                        myData.forEach((item) => {
                            ratingMap[item.product_id] =
                                item.rating;
                        });

                        setMyProductRatings(ratingMap);
                    }
                } catch {
                    // Product listing still works even
                    // if this optional endpoint is absent.
                }
            }
        } catch (error) {
            setMessage(error.message);
        } finally {
            setProductsLoading(false);
        }
    }

    // NEW - SAVE PRODUCT RATING
    async function handleProductRating(productId) {
        if (!user || user.role !== "USER") {
            setMessage(
                "Please login as a normal user to rate products."
            );
            return;
        }

        const rating = Number(
            productRatings[productId] || 0
        );

        if (rating < 1 || rating > 5) {
            setMessage(
                "Please select 1 to 5 stars."
            );
            return;
        }

        setLoading(true);
        setMessage("");

        try {
            const data = await api(
                "/product-ratings",
                {
                    method: "POST",
                    body: JSON.stringify({
                        product_id: productId,
                        rating,
                    }),
                }
            );

            setMessage(
                data.message ||
                "Product rating saved successfully!"
            );

            setMyProductRatings((previous) => ({
                ...previous,
                [productId]: rating,
            }));

            if (selectedStore) {
                const refreshed = await api(
                    `/products?store_id=${selectedStore.id}`
                );

                setProducts(
                    Array.isArray(refreshed)
                        ? refreshed
                        : []
                );
            }
        } catch (error) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleChangePassword(event) {
        event.preventDefault();
        setLoading(true);
        setMessage("");

        try {
            const data = await api(
                "/change-password",
                {
                    method: "PUT",
                    body: JSON.stringify({
                        oldPassword,
                        newPassword,
                    }),
                }
            );

            setMessage(data.message);
            setOldPassword("");
            setNewPassword("");
        } catch (error) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddUser(event) {
        event.preventDefault();
        setLoading(true);
        setMessage("");

        try {
            const data = await api(
                "/admin/users",
                {
                    method: "POST",
                    body: JSON.stringify(newUser),
                }
            );

            setMessage(data.message);

            setNewUser({
                name: "",
                email: "",
                password: "",
                address: "",
                role: "USER",
            });

            await loadAdmin();
        } catch (error) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddStore(event) {
        event.preventDefault();
        setLoading(true);
        setMessage("");

        try {
            const data = await api(
                "/admin/stores",
                {
                    method: "POST",
                    body: JSON.stringify(newStore),
                }
            );

            setMessage(data.message);

            setNewStore({
                store_name: "",
                email: "",
                address: "",
                category: "",
                owner_id: "",
            });

            await loadAdmin();
        } catch (error) {
            setMessage(error.message);
        } finally {
            setLoading(false);
        }
    }

    function sorted(items, keyFn) {
        return [...items].sort((a, b) => {
            const aValue = keyFn(a);
            const bValue = keyFn(b);

            const cmp = String(
                aValue ?? ""
            ).localeCompare(
                String(bValue ?? ""),
                undefined,
                { numeric: true }
            );

            return sortDirection === "asc"
                ? cmp
                : -cmp;
        });
    }

    const displayStores = sorted(
        stores.filter((store) =>
            `${store.store_name} ${
                store.address || ""
            }`
                .toLowerCase()
                .includes(search.toLowerCase())
        ),
        (store) =>
            sortBy === "rating"
                ? Number(store.average_rating || 0)
                : store.store_name
    );

    function sortAdminRows(items, key, direction) {
        return [...items].sort((a, b) => {
            const first = a[key] ?? "";
            const second = b[key] ?? "";
            const result = String(first).localeCompare(String(second), undefined, {
                numeric: true,
                sensitivity: "base",
            });
            return direction === "asc" ? result : -result;
        });
    }

    const filteredAdminUsers = sortAdminRows(
        users.filter((u) => {
            const matchesText = [u.name, u.email, u.address]
                .some((value) => String(value ?? "").toLowerCase().includes(adminUserSearch.trim().toLowerCase()));
            return matchesText && (adminRoleFilter === "ALL" || u.role === adminRoleFilter);
        }),
        adminUserSort,
        adminUserDirection
    );

    const filteredAdminStores = sortAdminRows(
        stores.filter((s) => [s.store_name, s.email, s.address, s.owner_name]
            .some((value) => String(value ?? "").toLowerCase().includes(adminStoreSearch.trim().toLowerCase()))),
        adminStoreSort,
        adminStoreDirection
    );

    const filteredAdminRatings = ratings.filter((r) =>
        [r.user_name, r.store_name, r.rating]
            .some((value) => String(value ?? "").toLowerCase().includes(adminRatingSearch.trim().toLowerCase()))
    );

    const myRatingByStore =
        Object.fromEntries(
            myRatings.map((rating) => [
                rating.store_id,
                rating.rating,
            ])
        );

    const cardStyle = {
        background: "white",
        borderRadius: 12,
        padding: 20,
        boxShadow: "0 2px 8px #0001",
    };

    const tableStyle = {
        width: "100%",
        borderCollapse: "collapse",
        background: "white",
    };

    const cellStyle = {
        padding: 12,
        border: "1px solid #ddd",
    };

    function backFromProducts() {
        navigate("stores");
        loadStores(search);

        if (user?.role === "USER") {
            loadMyRatings();
        }
    }

    return (
        <div
            className="app"
            style={{
                minHeight: "100vh",
                background: "#f5f6fb",
                color: "#202124",
                textAlign: "center",
            }}
        >
            <header
                style={{
                    background: "#4f46e5",
                    color: "white",
                    padding: "30px 16px",
                }}
            >
                <div className="brand-header">
                    <div className="brand-title">
                        <span className="brand-star">⭐</span>
                        <div className="app-title-container">
                            <h1>Store Rating App</h1>
                        </div>
                        <span className="brand-sparkle">✨</span>
                    </div>

                    <p className="brand-subtitle">
                        🛍️ Explore Stores • ⭐ Rate Your Favorites • 💜 Share Experiences
                    </p>
                </div>
            </header>

            <main
                style={{
                    maxWidth: 1150,
                    margin: "35px auto",
                    padding: "0 16px 50px",
                }}
            >
                {message && (
                    <p
                        role="alert"
                        style={{
                            background: "#fff",
                            padding: 12,
                            borderRadius: 8,
                            border: "1px solid #d8d8e5",
                        }}
                    >
                        {message}
                    </p>
                )}

                {/* HOME */}
                {page === "home" && (
                    <section className="home-section">
                        <div className="welcome-icon">🛍️ ✨ 🏬</div>
                        <h2>Welcome to Store Rating App</h2>
                        <p>
                            Login or register to get started.
                        </p>

                        <button
                            onClick={() => navigate("login")}
                        >
                            Login
                        </button>{" "}

                        <button
                            onClick={() => navigate("register")}
                        >
                            Register
                        </button>{" "}

                        <button
                            onClick={() => {
                                navigate("stores");
                                loadStores();
                            }}
                        >
                            View Stores
                        </button>
                    </section>
                )}

                {/* LOGIN */}
                {page === "login" && (
                    <section
                        className="form-container"
                        style={{
                            maxWidth: 440,
                            margin: "auto",
                        }}
                    >
                        <h2>Login</h2>

                        <form
                            onSubmit={handleLogin}
                            style={{
                                display: "grid",
                                gap: 12,
                            }}
                        >
                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) =>
                                    setEmail(e.target.value)
                                }
                                required
                            />

                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) =>
                                    setPassword(e.target.value)
                                }
                                required
                            />

                            <button disabled={loading}>
                                {loading
                                    ? "Please wait..."
                                    : "Login"}
                            </button>
                        </form>

                        <p>
                            <button
                                onClick={() =>
                                    navigate("register")
                                }
                            >
                                Create Account
                            </button>{" "}

                            <button
                                onClick={() =>
                                    navigate("home")
                                }
                            >
                                Home
                            </button>
                        </p>
                    </section>
                )}

                {/* REGISTER */}
                {page === "register" && (
                    <section
                        className="form-container"
                        style={{
                            maxWidth: 520,
                            margin: "auto",
                        }}
                    >
                        <h2>Register as Normal User</h2>

                        <p>
                            Name: 20–60 characters.
                            Password: 8–16, uppercase
                            and special character.
                        </p>

                        <form
                            onSubmit={handleRegister}
                            style={{
                                display: "grid",
                                gap: 12,
                            }}
                        >
                            <input
                                placeholder="Full Name (20–60 characters)"
                                value={name}
                                onChange={(e) =>
                                    setName(e.target.value)
                                }
                                minLength={20}
                                maxLength={60}
                                required
                            />

                            <input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) =>
                                    setEmail(e.target.value)
                                }
                                required
                            />

                            <textarea
                                placeholder="Address (max 400 characters)"
                                value={address}
                                onChange={(e) =>
                                    setAddress(e.target.value)
                                }
                                maxLength={400}
                                required
                            />

                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) =>
                                    setPassword(e.target.value)
                                }
                                minLength={8}
                                maxLength={16}
                                required
                            />

                            <button disabled={loading}>
                                Register
                            </button>
                        </form>

                        <p>
                            <button
                                onClick={() =>
                                    navigate("login")
                                }
                            >
                                Back to Login
                            </button>
                        </p>
                    </section>
                )}

                {/* USER DASHBOARD */}
                {page === "dashboard" && user && (
                    <section>
                        <h2>User Dashboard</h2>

                        <p>Welcome, {user.name}!</p>

                        <button
                            onClick={() => {
                                navigate("stores");
                                loadStores();
                                loadMyRatings();
                            }}
                        >
                            View & Rate Stores
                        </button>{" "}

                        <button
                            onClick={() =>
                                navigate("password")
                            }
                        >
                            Change Password
                        </button>{" "}

                        <button onClick={logout}>
                            Logout
                        </button>
                    </section>
                )}

                {/* ALL STORES */}
                {page === "stores" && (
                    <section>
                        <h2 className="stores-heading">
                            🏬 All Stores
                        </h2>

                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                justifyContent: "center",
                                flexWrap: "wrap",
                                marginBottom: 20,
                            }}
                        >
                            <input
                                placeholder="Search by name or address"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    loadStores(e.target.value);
                                }}
                            />

                            <select
                                value={sortBy}
                                onChange={(e) =>
                                    setSortBy(e.target.value)
                                }
                            >
                                <option value="name">
                                    Sort by Name
                                </option>
                                <option value="rating">
                                    Sort by Rating
                                </option>
                            </select>

                            <select
                                value={sortDirection}
                                onChange={(e) =>
                                    setSortDirection(e.target.value)
                                }
                            >
                                <option value="asc">
                                    Ascending
                                </option>
                                <option value="desc">
                                    Descending
                                </option>
                            </select>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fit, minmax(260px, 1fr))",
                                gap: 16,
                            }}
                        >
                            {displayStores.map((store) => (
                                <article
                                    key={store.id}
                                    className="store-card"
                                    style={cardStyle}
                                >

                                    <img
                                        className="store-image"
                                        src={
                                            store.store_name === "ABC Store"
                                                ? "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800"
                                                : store.store_name === "Daily Needs"
                                                    ? "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800"
                                                    : store.store_name === "Fresh Mart"
                                                        ? "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800"
                                                        : "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800"
                                        }
                                        alt={store.store_name}
                                        loading="lazy"
                                        onError={(e) => {
                                            e.currentTarget.src =
                                                "https://placehold.co/800x500/ede9fe/6d28d9?text=Store";
                                        }}
                                    />

                                    <h3>{store.store_name}</h3>

                                    <p>
                                        {store.address ||
                                            "Address not available"}
                                    </p>

                                    <p>
                                        Category:{" "}
                                        {store.category ||
                                            "General"}
                                    </p>

                                    <p>
                                        Average Rating: ⭐{" "}
                                        {store.average_rating ??
                                            "Not rated"}
                                    </p>

                                    {user?.role === "USER" && (
                                        <>
                                            <p>
                                                Your Rating:{" "}
                                                {myRatingByStore[
                                                    store.id
                                                    ]
                                                    ? `⭐ ${
                                                        myRatingByStore[
                                                            store.id
                                                            ]
                                                    }/5`
                                                    : "Not rated yet"}
                                            </p>

                                            <select
                                                aria-label={`Rating for ${store.store_name}`}
                                                value={
                                                    selectedRatings[
                                                        store.id
                                                        ] || ""
                                                }
                                                onChange={(e) =>
                                                    setSelectedRatings(
                                                        (previous) => ({
                                                            ...previous,
                                                            [store.id]:
                                                            e.target.value,
                                                        })
                                                    )
                                                }
                                            >
                                                <option value="">
                                                    Select rating
                                                </option>

                                                {[1, 2, 3, 4, 5].map(
                                                    (rating) => (
                                                        <option
                                                            key={rating}
                                                            value={rating}
                                                        >
                                                            {rating} Star
                                                            {rating > 1
                                                                ? "s"
                                                                : ""}
                                                        </option>
                                                    )
                                                )}
                                            </select>{" "}

                                            <button
                                                disabled={loading}
                                                onClick={() =>
                                                    handleRating(
                                                        store.id
                                                    )
                                                }
                                            >
                                                Save Rating
                                            </button>
                                        </>
                                    )}

                                    {/* NEW BUTTON */}
                                    <p style={{ marginTop: 18 }}>
                                        <button
                                            onClick={() =>
                                                openProducts(store)
                                            }
                                        >
                                            🛒 View Products &
                                            Ratings
                                        </button>
                                    </p>
                                </article>
                            ))}
                        </div>

                        {!displayStores.length && (
                            <p>No stores found.</p>
                        )}

                        <p style={{ marginTop: 20 }}>
                            <button
                                onClick={() =>
                                    navigate(
                                        user
                                            ? user.role === "ADMIN"
                                                ? "admin"
                                                : [
                                                    "STORE_OWNER",
                                                    "OWNER",
                                                ].includes(
                                                    user.role
                                                )
                                                    ? "owner"
                                                    : "dashboard"
                                            : "home"
                                    )
                                }
                            >
                                Back
                            </button>{" "}

                            {user && (
                                <button onClick={logout}>
                                    Logout
                                </button>
                            )}
                        </p>
                    </section>
                )}

                {/* NEW - PRODUCTS PAGE */}
                {page === "products" && (
                    <section>
                        <h2>
                            🛒{" "}
                            {selectedStore?.store_name ||
                                "Store"}{" "}
                            Products
                        </h2>

                        <p>
                            View products, prices,
                            and customer ratings.
                        </p>

                        {productsLoading && (
                            <p>Loading products...</p>
                        )}

                        {!productsLoading &&
                            products.length === 0 && (
                                <p>
                                    No products available
                                    for this store yet.
                                </p>
                            )}

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fit, minmax(250px, 1fr))",
                                gap: 18,
                                marginTop: 25,
                            }}
                        >
                            {products.map((product) => (
                                <article
                                    key={product.id}
                                    className="product-card"
                                >
                                    <div className="product-image-box">

                                        <img
                                            src={
                                                product.image_url ||
                                                ({
                                                        biscuits:
                                                            "https://images.unsplash.com/photo-1598373182133-52452f7691ef?w=600",
                                                        "cooking oil":
                                                            "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600",
                                                        dal:
                                                            "https://images.unsplash.com/photo-1515543904379-3d757afe72e4?w=600",
                                                        rice:
                                                            "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600",
                                                        vegetables:
                                                            "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600",
                                                    }[product.product_name?.trim().toLowerCase()] ||
                                                    "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600")
                                            }
                                            alt={product.product_name}
                                            loading="lazy"
                                            onError={(e) => {
                                                e.currentTarget.onerror = null;
                                                e.currentTarget.src =
                                                    "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600";
                                            }}
                                        />

                                    </div>
                                    <h3>
                                        🛍️{" "}
                                        {product.product_name}
                                    </h3>

                                    <p>
                                        Category:{" "}
                                        {product.category ||
                                            "General"}
                                    </p>

                                    <p>
                                        <strong>
                                            Price: ₹
                                            {Number(
                                                product.price || 0
                                            ).toFixed(2)}
                                        </strong>
                                    </p>

                                    <p>
                                        Average Rating: ⭐{" "}
                                        {product.average_rating ==
                                        null
                                            ? "Not rated"
                                            : Number(
                                                product.average_rating
                                            ).toFixed(2)}
                                    </p>

                                    <p>
                                        Total Ratings:{" "}
                                        {product.rating_count ||
                                            0}
                                    </p>

                                    {user?.role ===
                                        "USER" && (
                                            <>
                                                <p>
                                                    Your Rating:{" "}
                                                    {myProductRatings[
                                                        product.id
                                                        ]
                                                        ? `⭐ ${
                                                            myProductRatings[
                                                                product.id
                                                                ]
                                                        }/5`
                                                        : "Not rated yet"}
                                                </p>

                                                <select
                                                    value={
                                                        productRatings[
                                                            product.id
                                                            ] || ""
                                                    }
                                                    onChange={(e) =>
                                                        setProductRatings(
                                                            (previous) => ({
                                                                ...previous,
                                                                [product.id]:
                                                                e.target.value,
                                                            })
                                                        )
                                                    }
                                                >
                                                    <option value="">
                                                        Select rating
                                                    </option>

                                                    {[1, 2, 3, 4, 5].map(
                                                        (rating) => (
                                                            <option
                                                                key={rating}
                                                                value={rating}
                                                            >
                                                                {rating} Star
                                                                {rating > 1
                                                                    ? "s"
                                                                    : ""}
                                                            </option>
                                                        )
                                                    )}
                                                </select>

                                                <p>
                                                    <button
                                                        disabled={loading}
                                                        onClick={() =>
                                                            handleProductRating(
                                                                product.id
                                                            )
                                                        }
                                                    >
                                                        ⭐ Save Product
                                                        Rating
                                                    </button>
                                                </p>
                                            </>
                                        )}

                                    {!user && (
                                        <p>
                                            Login to rate this
                                            product.
                                        </p>
                                    )}
                                </article>
                            ))}
                        </div>

                        <p style={{ marginTop: 25 }}>
                            <button
                                onClick={backFromProducts}
                            >
                                Back to Stores
                            </button>{" "}

                            {!user && (
                                <button
                                    onClick={() =>
                                        navigate("login")
                                    }
                                >
                                    Login
                                </button>
                            )}
                        </p>
                    </section>
                )}

                {/* ADMIN DASHBOARD */}
                {page === "admin" &&
                    user?.role === "ADMIN" && (
                        <section>
                            <h2>
                                Admin Dashboard 📊
                            </h2>

                            <p>
                                Welcome, {user.name}!
                            </p>

                            <div
                                style={{
                                    display: "flex",
                                    justifyContent:
                                        "center",
                                    gap: 18,
                                    flexWrap: "wrap",
                                    margin: "28px 0",
                                }}
                            >
                                {[
                                    [
                                        "Total Users",
                                        users.length,
                                    ],
                                    [
                                        "Total Stores",
                                        stores.length,
                                    ],
                                    [
                                        "Total Ratings",
                                        ratings.length,
                                    ],
                                ].map(
                                    ([label, count]) => (
                                        <div
                                            key={label}
                                            style={{
                                                ...cardStyle,
                                                minWidth: 180,
                                                padding: 24,
                                            }}
                                        >
                                            <h3>{label}</h3>
                                            <h2>{count}</h2>
                                        </div>
                                    )
                                )}
                            </div>

                            <button
                                onClick={() =>
                                    navigate("addUser")
                                }
                            >
                                Add User / Admin /
                                Owner
                            </button>{" "}

                            <button
                                onClick={() =>
                                    navigate("addStore")
                                }
                            >
                                Add Store
                            </button>{" "}

                            <button
                                onClick={() =>
                                    navigate("password")
                                }
                            >
                                Change Password
                            </button>{" "}

                            <button
                                onClick={() => {
                                    navigate("stores");
                                    loadStores();
                                }}
                            >
                                View Stores
                            </button>{" "}

                            <button
                                onClick={() =>
                                    loadAdmin()
                                }
                            >
                                Refresh
                            </button>

                            <h3>All Users</h3>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 15 }}>
                                <input aria-label="Search users" placeholder="Search name, email or address" value={adminUserSearch} onChange={(e) => setAdminUserSearch(e.target.value)} />
                                <select aria-label="Filter user role" value={adminRoleFilter} onChange={(e) => setAdminRoleFilter(e.target.value)}>
                                    <option value="ALL">All Roles</option>
                                    <option value="ADMIN">Admin</option>
                                    <option value="USER">User</option>
                                    <option value="STORE_OWNER">Store Owner</option>
                                    <option value="OWNER">Owner</option>
                                </select>
                                <select aria-label="Sort users by" value={adminUserSort} onChange={(e) => setAdminUserSort(e.target.value)}>
                                    <option value="name">Sort by Name</option>
                                    <option value="email">Sort by Email</option>
                                    <option value="role">Sort by Role</option>
                                    <option value="id">Sort by ID</option>
                                </select>
                                <select aria-label="User sort direction" value={adminUserDirection} onChange={(e) => setAdminUserDirection(e.target.value)}>
                                    <option value="asc">Ascending</option>
                                    <option value="desc">Descending</option>
                                </select>
                            </div>
                            <p>Showing {filteredAdminUsers.length} of {users.length} users</p>

                            <div
                                style={{
                                    overflowX: "auto",
                                }}
                            >
                                <table
                                    style={tableStyle}
                                >
                                    <thead>
                                    <tr>
                                        {[
                                            "ID",
                                            "Name",
                                            "Email",
                                            "Address",
                                            "Role",
                                        ].map((h) => (
                                            <th
                                                key={h}
                                                style={
                                                    cellStyle
                                                }
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {filteredAdminUsers.map((u) => (
                                        <tr key={u.id}>
                                            {[
                                                u.id,
                                                u.name,
                                                u.email,
                                                u.address ||
                                                "—",
                                                u.role,
                                            ].map(
                                                (value, i) => (
                                                    <td
                                                        key={i}
                                                        style={
                                                            cellStyle
                                                        }
                                                    >
                                                        {value}
                                                    </td>
                                                )
                                            )}
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>

                            <h3>All Stores</h3>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 15 }}>
                                <input aria-label="Search admin stores" placeholder="Search store, email, address or owner" value={adminStoreSearch} onChange={(e) => setAdminStoreSearch(e.target.value)} />
                                <select aria-label="Sort admin stores" value={adminStoreSort} onChange={(e) => setAdminStoreSort(e.target.value)}>
                                    <option value="store_name">Sort by Store Name</option>
                                    <option value="email">Sort by Email</option>
                                    <option value="owner_name">Sort by Owner</option>
                                    <option value="average_rating">Sort by Rating</option>
                                </select>
                                <select aria-label="Store sort direction" value={adminStoreDirection} onChange={(e) => setAdminStoreDirection(e.target.value)}>
                                    <option value="asc">Ascending</option>
                                    <option value="desc">Descending</option>
                                </select>
                            </div>
                            <p>Showing {filteredAdminStores.length} of {stores.length} stores</p>

                            <div
                                style={{
                                    overflowX: "auto",
                                }}
                            >
                                <table
                                    style={tableStyle}
                                >
                                    <thead>
                                    <tr>
                                        {[
                                            "ID",
                                            "Store",
                                            "Email",
                                            "Address",
                                            "Owner",
                                            "Average Rating",
                                        ].map((h) => (
                                            <th
                                                key={h}
                                                style={
                                                    cellStyle
                                                }
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {filteredAdminStores.map((s) => (
                                        <tr key={s.id}>
                                            {[
                                                s.id,
                                                s.store_name,
                                                s.email ||
                                                "—",
                                                s.address ||
                                                "—",
                                                s.owner_name ||
                                                "Unassigned",
                                                s.average_rating ??
                                                "Not rated",
                                            ].map(
                                                (value, i) => (
                                                    <td
                                                        key={i}
                                                        style={
                                                            cellStyle
                                                        }
                                                    >
                                                        {value}
                                                    </td>
                                                )
                                            )}
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>

                            <h3>All Ratings</h3>
                            <div style={{ marginBottom: 15 }}>
                                <input aria-label="Search ratings" placeholder="Search user, store or rating" value={adminRatingSearch} onChange={(e) => setAdminRatingSearch(e.target.value)} />
                            </div>
                            <p>Showing {filteredAdminRatings.length} of {ratings.length} ratings</p>

                            <div
                                style={{
                                    overflowX: "auto",
                                }}
                            >
                                <table
                                    style={tableStyle}
                                >
                                    <thead>
                                    <tr>
                                        {[
                                            "ID",
                                            "User",
                                            "Store",
                                            "Rating",
                                        ].map((h) => (
                                            <th
                                                key={h}
                                                style={
                                                    cellStyle
                                                }
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {filteredAdminRatings.map((r) => (
                                        <tr key={r.id}>
                                            {[
                                                r.id,
                                                r.user_name,
                                                r.store_name,
                                                `${r.rating} / 5`,
                                            ].map(
                                                (value, i) => (
                                                    <td
                                                        key={i}
                                                        style={
                                                            cellStyle
                                                        }
                                                    >
                                                        {value}
                                                    </td>
                                                )
                                            )}
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>

                            <p>
                                <button
                                    onClick={logout}
                                >
                                    Logout
                                </button>
                            </p>
                        </section>
                    )}

                {/* ADD USER */}
                {page === "addUser" &&
                    user?.role === "ADMIN" && (
                        <section
                            style={{
                                maxWidth: 500,
                                margin: "auto",
                            }}
                        >
                            <h2>
                                Add User / Admin /
                                Store Owner
                            </h2>

                            <form
                                onSubmit={
                                    handleAddUser
                                }
                                style={{
                                    display: "grid",
                                    gap: 12,
                                }}
                            >
                                <input
                                    placeholder="Full Name (20–60 characters)"
                                    minLength={20}
                                    maxLength={60}
                                    required
                                    value={newUser.name}
                                    onChange={(e) =>
                                        setNewUser({
                                            ...newUser,
                                            name:
                                            e.target.value,
                                        })
                                    }
                                />

                                <input
                                    type="email"
                                    placeholder="Email"
                                    required
                                    value={
                                        newUser.email
                                    }
                                    onChange={(e) =>
                                        setNewUser({
                                            ...newUser,
                                            email:
                                            e.target.value,
                                        })
                                    }
                                />

                                <textarea
                                    placeholder="Address"
                                    maxLength={400}
                                    required
                                    value={
                                        newUser.address
                                    }
                                    onChange={(e) =>
                                        setNewUser({
                                            ...newUser,
                                            address:
                                            e.target.value,
                                        })
                                    }
                                />

                                <input
                                    type="password"
                                    placeholder="Password (8–16, uppercase, special)"
                                    minLength={8}
                                    maxLength={16}
                                    required
                                    value={
                                        newUser.password
                                    }
                                    onChange={(e) =>
                                        setNewUser({
                                            ...newUser,
                                            password:
                                            e.target.value,
                                        })
                                    }
                                />

                                <select
                                    value={
                                        newUser.role
                                    }
                                    onChange={(e) =>
                                        setNewUser({
                                            ...newUser,
                                            role:
                                            e.target.value,
                                        })
                                    }
                                >
                                    <option value="USER">
                                        Normal User
                                    </option>

                                    <option value="ADMIN">
                                        Admin
                                    </option>

                                    <option value="STORE_OWNER">
                                        Store Owner
                                    </option>
                                </select>

                                <button
                                    disabled={loading}
                                >
                                    Create User
                                </button>
                            </form>

                            <p>
                                <button
                                    onClick={() =>
                                        navigate(
                                            "admin"
                                        )
                                    }
                                >
                                    Back to Admin
                                    Dashboard
                                </button>
                            </p>
                        </section>
                    )}

                {/* ADD STORE */}
                {page === "addStore" &&
                    user?.role === "ADMIN" && (
                        <section
                            style={{
                                maxWidth: 500,
                                margin: "auto",
                            }}
                        >
                            <h2>Add Store</h2>

                            <form
                                onSubmit={
                                    handleAddStore
                                }
                                style={{
                                    display: "grid",
                                    gap: 12,
                                }}
                            >
                                <input
                                    placeholder="Store Name"
                                    required
                                    value={
                                        newStore.store_name
                                    }
                                    onChange={(e) =>
                                        setNewStore({
                                            ...newStore,
                                            store_name:
                                            e.target.value,
                                        })
                                    }
                                />

                                <input
                                    type="email"
                                    placeholder="Store Email"
                                    required
                                    value={
                                        newStore.email
                                    }
                                    onChange={(e) =>
                                        setNewStore({
                                            ...newStore,
                                            email:
                                            e.target.value,
                                        })
                                    }
                                />

                                <textarea
                                    placeholder="Store Address"
                                    maxLength={400}
                                    required
                                    value={
                                        newStore.address
                                    }
                                    onChange={(e) =>
                                        setNewStore({
                                            ...newStore,
                                            address:
                                            e.target.value,
                                        })
                                    }
                                />

                                <input
                                    placeholder="Category (optional)"
                                    value={
                                        newStore.category
                                    }
                                    onChange={(e) =>
                                        setNewStore({
                                            ...newStore,
                                            category:
                                            e.target.value,
                                        })
                                    }
                                />

                                <select
                                    value={
                                        newStore.owner_id
                                    }
                                    onChange={(e) =>
                                        setNewStore({
                                            ...newStore,
                                            owner_id:
                                            e.target.value,
                                        })
                                    }
                                >
                                    <option value="">
                                        No owner assigned
                                    </option>

                                    {users
                                        .filter((u) =>
                                            [
                                                "STORE_OWNER",
                                                "OWNER",
                                            ].includes(
                                                u.role
                                            )
                                        )
                                        .map((u) => (
                                            <option
                                                key={u.id}
                                                value={u.id}
                                            >
                                                {u.name} (ID{" "}
                                                {u.id})
                                            </option>
                                        ))}
                                </select>

                                <button
                                    disabled={loading}
                                >
                                    Create Store
                                </button>
                            </form>

                            <p>
                                <button
                                    onClick={() =>
                                        navigate(
                                            "admin"
                                        )
                                    }
                                >
                                    Back to Admin
                                    Dashboard
                                </button>
                            </p>
                        </section>
                    )}

                {/* STORE OWNER DASHBOARD */}
                {page === "owner" &&
                    user &&
                    [
                        "STORE_OWNER",
                        "OWNER",
                    ].includes(user.role) && (
                        <section>
                            <h2>
                                Store Owner
                                Dashboard 🏬
                            </h2>

                            <p>
                                Welcome, {user.name}!
                            </p>

                            <h3>My Stores</h3>

                            {!ownerData.stores.length && (
                                <p>
                                    No stores assigned
                                    yet. Ask Admin to
                                    assign a store.
                                </p>
                            )}

                            {ownerData.stores.map(
                                (store) => (
                                    <div
                                        key={store.id}
                                        style={{
                                            background:
                                                "white",
                                            padding: 15,
                                            margin: 10,
                                            borderRadius: 8,
                                        }}
                                    >
                                        <strong>
                                            {store.store_name}
                                        </strong>

                                        <p>
                                            {store.address}
                                        </p>

                                        <p>
                                            Average Rating: ⭐{" "}
                                            {store.average_rating ??
                                                "Not rated"}
                                        </p>

                                        <button
                                            onClick={() =>
                                                openProducts(
                                                    store
                                                )
                                            }
                                        >
                                            View My Store
                                            Products
                                        </button>
                                    </div>
                                )
                            )}

                            <h3>
                                Users Who Rated My
                                Stores
                            </h3>

                            <div
                                style={{
                                    overflowX: "auto",
                                }}
                            >
                                <table
                                    style={tableStyle}
                                >
                                    <thead>
                                    <tr>
                                        {[
                                            "Store",
                                            "User",
                                            "Email",
                                            "Rating",
                                        ].map((h) => (
                                            <th
                                                key={h}
                                                style={
                                                    cellStyle
                                                }
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                    </thead>

                                    <tbody>
                                    {ownerData.ratings.map(
                                        (r) => (
                                            <tr key={r.id}>
                                                {[
                                                    r.store_name,
                                                    r.user_name,
                                                    r.user_email,
                                                    `${r.rating} / 5`,
                                                ].map(
                                                    (value, i) => (
                                                        <td
                                                            key={i}
                                                            style={
                                                                cellStyle
                                                            }
                                                        >
                                                            {value}
                                                        </td>
                                                    )
                                                )}
                                            </tr>
                                        )
                                    )}
                                    </tbody>
                                </table>
                            </div>

                            <p>
                                <button
                                    onClick={() =>
                                        navigate(
                                            "password"
                                        )
                                    }
                                >
                                    Change Password
                                </button>{" "}

                                <button
                                    onClick={() =>
                                        loadOwner()
                                    }
                                >
                                    Refresh
                                </button>{" "}

                                <button
                                    onClick={logout}
                                >
                                    Logout
                                </button>
                            </p>
                        </section>
                    )}

                {/* CHANGE PASSWORD */}
                {page === "password" &&
                    user && (
                        <section
                            style={{
                                maxWidth: 460,
                                margin: "auto",
                            }}
                        >
                            <h2>
                                Change Password
                            </h2>

                            <form
                                onSubmit={
                                    handleChangePassword
                                }
                                style={{
                                    display: "grid",
                                    gap: 12,
                                }}
                            >
                                <input
                                    type="password"
                                    placeholder="Old Password"
                                    required
                                    value={
                                        oldPassword
                                    }
                                    onChange={(e) =>
                                        setOldPassword(
                                            e.target.value
                                        )
                                    }
                                />

                                <input
                                    type="password"
                                    placeholder="New Password (8–16, uppercase, special)"
                                    minLength={8}
                                    maxLength={16}
                                    required
                                    value={
                                        newPassword
                                    }
                                    onChange={(e) =>
                                        setNewPassword(
                                            e.target.value
                                        )
                                    }
                                />

                                <button
                                    disabled={loading}
                                >
                                    Update Password
                                </button>
                            </form>

                            <p>
                                <button
                                    onClick={() =>
                                        navigate(
                                            user.role ===
                                            "ADMIN"
                                                ? "admin"
                                                : [
                                                    "STORE_OWNER",
                                                    "OWNER",
                                                ].includes(
                                                    user.role
                                                )
                                                    ? "owner"
                                                    : "dashboard"
                                        )
                                    }
                                >
                                    Back
                                </button>
                            </p>
                        </section>
                    )}
            </main>
        </div>
    );
}

export default App;

