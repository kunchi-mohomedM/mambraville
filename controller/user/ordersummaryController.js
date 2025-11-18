const Order = require("../../models/orderSchema");   // adjust path if needed
const User = require("../../models/userSchema");     // adjust path if needed

const loadOrderSummary = async (req, res) => {
    try {
        
        const userId = req.session.user;
        if (!userId) {
            return res.redirect("/login");
        }

        // Fetch user
        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).send("User not found");
        }

        // Fetch orders for this user
        const orders = await Order.find({ userId })
            .sort({ orderedAt: -1 }) // latest first
            .lean();

        // Render the EJS page
        return res.render("ordersummary", {
            user,
            orders,
        });

    } catch (err) {
        console.error("Error loading order summary:", err);
        return res.status(500).send("Internal Server Error");
    }
};

module.exports = { loadOrderSummary };
