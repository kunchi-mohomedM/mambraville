const Product = require('../../models/productSchema');
const User = require("../../models/userSchema");
const Cart = require('../../models/cartSchema');
const Wishlist = require("../../models/wishlistSchema");





async function cleanCart(cart) {
    if (!cart) return cart;

    cart.items = cart.items.filter(item => {
        const p = item.productId;
        if (!p) return false;
        if (p.isDeleted) return false;
        if (p.status === "Discontinued") return false;
        if (p.status === "out of stock" || p.quantity <= 0) return false;
        return true;
    });

    cart.cartTotal = cart.items.reduce((sum, item) => {
        const p = item.productId;
        const finalPrice = p.price - (p.price * (p.discount || 0) / 100);
        return sum + item.qty * finalPrice;
    }, 0);

    await cart.save();
    return cart;
}



const MAX_QTY = 5;
const addTocart = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.redirect("/login");

        const productId = req.params.id;
        if (!productId) return res.redirect("/products-user");

        const product = await Product.findById(productId)
        if (!product) return res.redirect("/products-user");

        if (product.isDeleted) {
            return res.status(400).send("This product is no longer available.");
        }

        if (product.status === "Discontinued") {
            return res.status(400).send("This product has been discontinued.");
        }

        if (product.status === "out of stock" || product.quantity <= 0) {
            return res.status(400).send("Product is out of stock.");
        }



        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({
                userId,
                items: [],
                cartTotal: 0
            });
        }

        const originalPrice = product.price;
        const discountPercentage = product.discount || 0;

        const finalprice =
            originalPrice - (originalPrice * discountPercentage / 100);

        const existingItem = cart.items.find(
            item => item.productId.toString() === productId
        );

        if (existingItem) {

            if (existingItem.qty >= MAX_QTY) {
                return res.status(400).send(`Maximum ${MAX_QTY} units allowed per products.`);
            }

            if (existingItem.qty + 1 > product.quantity) {
                return res.status(400).send("Cannot add more than available stock.");
            }

            existingItem.qty += 1;
            existingItem.subtotal = existingItem.qty * finalprice;
        } else {

            if (1 > product.quantity) {
                return res.status(400).send("Cannot add more than available stock.");
            }

            cart.items.push({
                productId: product._id,

                name: product.productName,

                image: product.productImage[0]?.url,

                qty: 1,

                price: originalPrice,

                discount: discountPercentage,

                subtotal: finalprice
            });
        }

        cart.cartTotal = cart.items.reduce((sum, item) => sum + item.subtotal, 0);

        await cart.save();

        const wishlist = await Wishlist.findOne({ userId });
        if (wishlist) {
            await Wishlist.updateOne(
                { userId },
                { $pull: { items: { productId: product._id } } }
            );
        }

        return res.redirect("/cart");

    } catch (error) {
        console.log("Error occur while addtocart", error)
        return res.status(500).send("Internal server error");
    }
};



const loadCart = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.redirect("/login");

        let cart = await Cart.findOne({ userId }).populate("items.productId");

        if (!cart) {
            return res.render("cartpage", {
                cart: { items: [], cartTotal: 0 }
            });
        }

        cart = await cleanCart(cart);

        return res.render("cartpage", {
            cart
        });

    } catch (error) {
        console.log("Error occur while loading cart:", error);
        return res.status(500).send("Internal Server Error");
    }
}


const increaseQty = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.id;

        let cart = await Cart.findOne({ userId });
        if (!cart) return res.redirect("/cart");

        const item = cart.items.find(i => i.productId.toString() === productId);
        if (!item) return res.redirect("/cart");

        const product = await Product.findById(productId);
        if (!product) return res.redirect("/cart");

        if (item.qty + 1 > product.quantity) {
            return res.status(400).send("Cannot add more than available stock");
        }

        item.qty += 1;
        const finalprice = product.price - (product.price * product.discount / 100);
        item.subtotal = item.qty * finalprice;

        cart.cartTotal = cart.items.reduce((sum, i) => sum + i.subtotal, 0);

        await cart.save();

        return res.redirect("/cart");
    } catch (error) {
        console.log("error occur while increase quantity", error);
        return res.status(500).send("Internal Server Error");
    }
};


const decreaseqty = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.id;

        let cart = await Cart.findOne({ userId })
        if (!cart) return res.redirect("/cart");

        const item = cart.items.find(i => i.productId.toString() === productId);
        if (!item) return res.redirect("/cart");

        if (item.qty > 1) {
            item.qty -= 1;
            const finalPrice = item.price - (item.price * item.discount / 100)
            item.subtotal = item.qty * finalPrice
        } else {
            cart.items = cart.items.filter(i => i.productId.toString() !== productId)
        }

        cart.cartTotal = cart.items.reduce((sum, i) => sum + i.subtotal, 0)

        await cart.save();
        return res.redirect("/cart");

    } catch (error) {
        console.log("Error occur while decrease quantity", error);
        return res.status(500).send("Internal server Error");
    }
};


const removeItem = async (req, res) => {
    try {
        const userId = req.session.user;
        const productId = req.params.id;

        let cart = await Cart.findOne({ userId });
        if (!cart) return res.redirect("/cart");

        cart.items = cart.items.filter(item => item.productId.toString() !== productId);

        cart.cartTotal = Math.round(cart.items.reduce((sum, i) => sum + i.subtotal, 0));

        await cart.save();
        return res.redirect("/cart");

    } catch (error) {
        console.log("Error occur while removing item ", error);
        return res.status(500).send("Internal Server error");
    }
};


module.exports = {
    addTocart,
    loadCart,
    increaseQty,
    decreaseqty,
    removeItem
};


