const User = require("../models/userSchema");

const userAuth = async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    try {
        const user = await User.findById(req.session.user).lean();

        if (!user) {
            req.session.destroy(() => { });
            return res.redirect("/login");
        }

        if (user.isBlocked) {
            req.session.destroy(() => { });
           
            return res.redirect("/login?blocked=true");
        }

       
        res.locals.userData = user;
        next();
    } catch (error) {
        console.error("Error in userAuth middleware:", error);
        req.session.destroy(() => { });
        res.status(500).send("Internal server error");
    }
};

const isLogin = (req, res, next) => {
    if (req.session.user) {
        res.locals.user = true;
        return res.redirect("/");
    }
    next();
};

const checkUserBlocked = async (req, res, next) => {
    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user).select("isBlocked");
            if (!user || user.isBlocked) {
                req.session.destroy(() => {
                  
                    res.redirect("/login?blocked=true");
                });
                return;
            }
            
            next();
        } catch (error) {
            console.error("Error in checkUserBlocked middleware:", error);
          
            res.status(500).send("Internal Server Error");
        }
    } else {
       
        next();
    }
};

module.exports = { userAuth, isLogin, checkUserBlocked };