const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");
const CategoryOffer = require("../../models/categoryOffer");

async function cleanCart(cart) {
  if (!cart) return cart;

  cart.items = cart.items.filter((item) => {
    const p = item.productId;
    if (!p) return false;
    if (p.isDeleted) return false;
    if (p.status === "Discontinued") return false;
    if (p.status === "out of stock" || p.quantity <= 0) return false;
    return true;
  });

  cart.cartTotal = cart.items.reduce((sum, item) => {
    const p = item.productId;
    const finalPrice = p.price - (p.price * (p.discount || 0)) / 100;
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

    const product = await Product.findById(productId);
    if (!product || product.isDeleted) {
      return res.redirect("/products-user");
    }

    if (product.status === "Discontinued") {
      return res.status(400).send("Product discontinued");
    }

    if (product.quantity <= 0) {
      return res.status(400).send("Out of stock");
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItem = cart.items.find(
      (i) => i.productId.toString() === productId
    );

    if (existingItem) {
      if (existingItem.qty >= MAX_QTY) {
        return res.status(400).send(`Maximum ${MAX_QTY} units allowed`);
      }

      if (existingItem.qty + 1 > product.quantity) {
        return res.status(400).send("Stock limit reached");
      }

      existingItem.qty += 1;
    } else {
      cart.items.push({
        productId: product._id,
        qty: 1,
      });
    }

    await cart.save();

    await Wishlist.updateOne(
      { userId },
      { $pull: { items: { productId: product._id } } }
    );

    return res.redirect("/cart");
  } catch (error) {
    console.error("Add to cart error:", error);
    return res.status(500).send("Internal server error");
  }
};

const loadCart = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

  

const error = req.query.error;
    const customMessage = req.query.message ? decodeURIComponent(req.query.message) : null;

    let mssg = null;
    let alertType = "warning"; // default

    if (error === "stock") {
      mssg = "Cannot add more than available stock";
      alertType = "warning";
    } else if (error === "checkout_blocked") {
      mssg = customMessage || "Some items in your cart are unavailable. Please remove or update them before checkout.";
      alertType = "error";
    }

    let cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category" },
    });

    if (!cart || cart.items.length === 0) {
      return res.render("cartpage", {
        cart: { items: [], cartTotal: 0 },
      });
    }

    const categoryOffers = await CategoryOffer.find({ isActive: true }).lean();

    const categoryOfferMap = {};
    categoryOffers.forEach((offer) => {
      categoryOfferMap[offer.categoryId.toString()] = offer.discountPercentage;
    });

    let cartTotal = 0;
    const validItems = [];

    for (const item of cart.items) {
      const product = item.productId;

      if (
        !product ||
        product.isDeleted ||
        product.status === "Discontinued" ||
        product.quantity <= 0
      ) {
        continue;
      }

      if (item.qty > product.quantity) {
        item.qty = product.quantity;
      }

      const productDiscount = product.discount || 0;
      const categoryDiscount =
        categoryOfferMap[product.category?._id?.toString()] || 0;

      const discountPercent = Math.max(productDiscount, categoryDiscount);

      const originalPrice = product.price;
      const finalPrice = Math.round(
        originalPrice - (originalPrice * discountPercent) / 100
      );

      const subtotal = finalPrice * item.qty;
      cartTotal += subtotal;

      validItems.push({
        product,
        qty: item.qty,

        originalPrice,
        finalPrice,
        discountPercent,
        subtotal,
      });
    }

    cart.items = validItems.map((i) => ({
      productId: i.product._id,
      qty: i.qty,
    }));

    await cart.save();
    
   

    return res.render("cartpage", {
      cart: {
        items: validItems,
        cartTotal,
      },
      mssg,
      alertType,
       
    });
  } catch (error) {
    console.error("Error occur while loading cart:", error);
    return res.status(500).send("Internal Server Error");
  }
};

const increaseQty = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.id;

    let cart = await Cart.findOne({ userId });
    if (!cart) return res.redirect("/cart");

    const item = cart.items.find((i) => i.productId.toString() === productId);
    if (!item) return res.redirect("/cart");

    const product = await Product.findById(productId);
    if (!product) return res.redirect("/cart");

    if (item.qty + 1 > product.quantity) {
      return res.redirect("/cart?error=stock");
    }

    item.qty += 1;
    const finalprice = product.price - (product.price * product.discount) / 100;
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

    let cart = await Cart.findOne({ userId });
    if (!cart) return res.redirect("/cart");

    const item = cart.items.find((i) => i.productId.toString() === productId);
    if (!item) return res.redirect("/cart");

    if (item.qty > 1) {
      item.qty -= 1;
      const finalPrice = item.price - (item.price * item.discount) / 100;
      item.subtotal = item.qty * finalPrice;
    } else {
      cart.items = cart.items.filter(
        (i) => i.productId.toString() !== productId
      );
    }

    cart.cartTotal = cart.items.reduce((sum, i) => sum + i.subtotal, 0);

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

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId
    );

    cart.cartTotal = Math.round(
      cart.items.reduce((sum, i) => sum + i.subtotal, 0)
    );

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
  removeItem,
};
