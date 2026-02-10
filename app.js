require('dotenv').config();
const express = require('express')
const path = require("path")
const app = express();
const db = require("./config/db");
const passport = require("./config/passport.js")
const userRouter = require("./routes/userRouter.js");
const adminRouter = require("./routes/adminRouter.js")
const session = require("express-session")
const nocache = require("nocache")
const cartWishlistCount = require("./middleware/cartWishlistCount")
db()


app.use(nocache())

const flash = require("connect-flash");

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { // Fixed casing from Cookie to cookie
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000 // Fixed casing from Maxage to maxAge
    }
}))

app.use(flash());

app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store,no-cache,must-revalidate,private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
})

app.use(passport.initialize());
app.use(passport.session());


app.use(express.json());
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", [path.join(__dirname, "views/user"), path.join(__dirname, "views/admin")])
app.use((req, res, next) => {
    res.locals.user = req.session.user ? true : false;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// Fetch cart and wishlist counts for all pages
app.use(cartWishlistCount);

app.use("/", userRouter);
app.use("/admin", adminRouter)

app.use((req, res, next) => {
    res.status(404).render("page-404");
});

app.listen(process.env.PORT, () => {
    console.log("Server Running");
})

module.exports = app;