const Admin = require("../../models/adminModel");
const bcrypt = require("bcryptjs");
const Users = require('../../models/userSchema')





const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Optional: keep this for security (timing attack prevention)
        const dummyHash = "$2b$10$somefakehashthatwillnevermatch";
        const admin = await Admin.findOne({ email });

        if (!admin) {
            // still do dummy compare
            await bcrypt.compare(password, dummyHash).catch(() => {});
            return res.status(401).render('adminlogin', { 
                message: 'Invalid email or password' 
            });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);

        if (!passwordMatch) {
            return res.status(401).render('adminlogin', { 
                message: 'Invalid email or password' 
            });
        }

        req.session.admin = true;
        // Optional: regenerate session to prevent fixation
        req.session.regenerate((err) => {
            if (err) console.error("Session regenerate failed:", err);
        });

        return res.redirect("/admin/dashboard");

    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).render('adminlogin', { 
            message: 'Something went wrong. Please try again later.' 
        });
    }
};

// Also update loadlogin (optional but cleaner)
const loadlogin = async (req, res) => {
    try {
        res.render("adminlogin", { message: null });
    } catch (err) {
        console.error("Error rendering login page:", err);
        res.status(500).render("adminlogin", { 
            message: "Service unavailable – please try again later" 
        });
    }
};


const toggleBlockUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Find the user
        const user = await Users.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }


        user.isBlocked = !user.isBlocked;
        await user.save({ validateBeforeSave: false });

        if (user.isBlocked) {
           
            console.log(`User ${userId} blocked → sessions will be cleared on next action`);
        }

        return res.status(200).json({
            success: true,
            message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,
            isBlocked: user.isBlocked
        });

    } catch (error) {
        console.error('Error in toggleBlockUser:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};





const loaduser = async (req, res) => {
    try {

        let search = req.query.search || '';
        let page = parseInt(req.query.page) || 1;
        const limit = 10;
        let sort = req.query.sort || 'asc';


        let query = {
            $or: [
                { fullname: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        };


        let sortOption = {};
        switch (sort) {
            case 'asc':
                sortOption = { fullname: 1 };
                break;
            case 'desc':
                sortOption = { fullname: -1 };
                break;
            case 'active':
                query.isBlocked = false;
                sortOption = { fullname: 1 };
                break;
            case 'blocked':
                query.isBlocked = true;
                sortOption = { fullname: 1 };
                break;
            default:
                sortOption = { fullname: 1 };
        }


        const users = await Users.find(query)
            .sort(sortOption)
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();


        const count = await Users.countDocuments(query);
        const totalPages = Math.ceil(count / limit);


        res.render('users', {
            users,
            search,
            page,
            totalPages,
            sort
        });
    } catch (error) {
        console.error('Error occurred while rendering users page:', error);
        res.status(500).send('Internal Server Error');
    }
};



const logout = async (req, res) => {
    try {
        // Most important line
        req.session.destroy((err) => {
            if (err) {
                console.error("Session destroy error:", err);
                return res.status(500).json({ 
                    success: false, 
                    message: "Logout failed. Please try again." 
                });
            }

            // Optional: clear the cookie explicitly (good practice)
            res.clearCookie('connect.sid'); // default name of express-session cookie

            // Option A: JSON response (modern SPA / fetch/axios frontend)
            // return res.status(200).json({ success: true, message: "Logged out successfully" });

            // Option B: Traditional redirect (most common in EJS + form-based admin panels)
            return res.redirect("/admin/login");
        });
    } catch (error) {
        console.error("Logout error:", error);
        res.redirect("/admin/login"); // fail-safe redirect
    }
};


module.exports = {
    loadlogin,
    login,
    loaduser,
    toggleBlockUser,
    logout

}