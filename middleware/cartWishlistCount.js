const Cart = require("../models/cartSchema");
const Wishlist = require("../models/wishlistSchema");

/**
 * Middleware to fetch cart and wishlist item counts
 * Makes cartItems and wishlistItems arrays available to all views via res.locals
 */
const cartWishlistCount = async (req, res, next) => {
    try {
        // Initialize empty arrays for guests
        let cartItems = [];
        let wishlistItems = [];

        // Only fetch if user is logged in
        if (req.session.user) {
            // Fetch cart items
            const cart = await Cart.findOne({
                userId: req.session.user
            }).lean();

            cartItems = cart
                ? cart.items.map(i => i.productId.toString())
                : [];

            // Fetch wishlist items
            const wishlist = await Wishlist.findOne({
                userId: req.session.user
            }).lean();

            wishlistItems = wishlist
                ? wishlist.items.map(i => i.productId.toString())
                : [];
        }

        // Make available to all views
        res.locals.cartItems = cartItems;
        res.locals.wishlistItems = wishlistItems;

        next();
    } catch (error) {
        console.error("Error in cartWishlistCount middleware:", error);
        // Set empty arrays on error to prevent template errors
        res.locals.cartItems = [];
        res.locals.wishlistItems = [];
        next();
    }
};

module.exports = cartWishlistCount;
