const Cart = require("../models/cartSchema");
const Wishlist = require("../models/wishlistSchema");


const cartWishlistCount = async (req, res, next) => {
    try {
        
        let cartItems = [];
        let wishlistItems = [];

       
        if (req.session.user) {
           
            const cart = await Cart.findOne({
                userId: req.session.user
            }).lean();

            cartItems = cart
                ? cart.items.map(i => i.productId.toString())
                : [];

            
            const wishlist = await Wishlist.findOne({
                userId: req.session.user
            }).lean();

            wishlistItems = wishlist
                ? wishlist.items.map(i => i.productId.toString())
                : [];
        }

       
        res.locals.cartItems = cartItems;
        res.locals.wishlistItems = wishlistItems;

        next();
    } catch (error) {
        console.error("Error in cartWishlistCount middleware:", error);
        
        res.locals.cartItems = [];
        res.locals.wishlistItems = [];
        next();
    }
};

module.exports = cartWishlistCount;
