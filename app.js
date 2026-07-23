if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");

const ExpressError = require("./utils/ExpressError.js");
const User = require("./models/user.js");
const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");

const app = express();
const dbUrl = process.env.ATLASDB_URL;
const sessionSecret = process.env.SECRET;
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || "0.0.0.0";

if (!dbUrl) {
    throw new Error("ATLASDB_URL is required. Set it in .env or the container environment.");
}

if (!sessionSecret) {
    throw new Error("SECRET is required. Set a long random session secret.");
}

if (process.env.NODE_ENV === "production") {
    // Required when HTTPS is terminated by a reverse proxy/load balancer.
    app.set("trust proxy", 1);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

const store = MongoStore.create({
    mongoUrl: dbUrl,
    crypto: {
        secret: sessionSecret,
    },
    touchAfter: 24 * 3600,
});

store.on("error", (err) => {
    console.error("Error in MongoDB session store:", err);
});

app.use(
    session({
        store,
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.COOKIE_SECURE === "true",
        },
    }),
);

app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user;
    next();
});

// Container/orchestrator health endpoint. It checks that Mongoose is connected.
app.get("/health", (req, res) => {
    const databaseConnected = mongoose.connection.readyState === 1;
    res.status(databaseConnected ? 200 : 503).json({
        status: databaseConnected ? "ok" : "degraded",
        database: databaseConnected ? "connected" : "disconnected",
        uptimeSeconds: Math.floor(process.uptime()),
    });
});

app.get("/", (req, res) => {
    res.redirect("/listings");
});

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);

app.all(/(.*)/, (req, res, next) => {
    next(new ExpressError(404, "Page Not Found!"));
});

app.use((err, req, res, next) => {
    const { statusCode = 500, message = "Something went wrong!" } = err;
    console.error(err);
    res.status(statusCode).render("error.ejs", { message });
});

let server;

async function start() {
    await mongoose.connect(dbUrl, {
        serverSelectionTimeoutMS: 10000,
    });
    console.log("Connected to MongoDB");

    server = app.listen(port, host, () => {
        console.log(`WanderLust listening on http://${host}:${port}`);
    });
}

async function shutdown(signal) {
    console.log(`${signal} received; shutting down gracefully`);

    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }

    await mongoose.connection.close();
    process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch((err) => {
    console.error("Application startup failed:", err);
    process.exit(1);
});
