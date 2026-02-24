const User = require("../models/userSchema")



const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        return next();
    }

    // ── Important: detect AJAX / API-style requests ───────────────────────
    const isAjax = 
        req.xhr || 
        req.headers['x-requested-with'] === 'XMLHttpRequest' ||
        req.headers.accept?.includes('application/json') ||
        req.headers['content-type']?.includes('application/json');

    if (isAjax) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized – please log in as admin",
            redirectTo: "/admin/login"   // optional – frontend can use it
        });
    }

    // Traditional browser navigation → redirect
    return res.redirect("/admin/login");
};

const islogin = (req, res, next) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard");
    }
    next();
};

module.exports = { adminAuth, islogin };