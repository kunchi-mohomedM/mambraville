const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Order =require('../../models/orderSchema')
const Product = require("../../models/productSchema");


const loadCheckout = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.redirect("/login");

        const cart = await Cart.findOne({ userId })
            .populate("items.productId")
            .lean();

        const user = await User.findById(userId).lean();
        const addresses = user?.address || [];

        if (!cart || cart.items.length === 0) {
            return res.redirect("/cart");
        }

        const cartItems = cart.items.map(i => {
            const p = i.productId || {};

            const img = p.productImage?.length
                ? (typeof p.productImage[0] === "string"
                    ? p.productImage[0]
                    : p.productImage[0].url)
                : (i.image || "");

            return {
                productId: p._id,
                productName: p.productName || p.name,
                price: p.price,
                productImage: [img],
                quantity: i.qty,
                subtotal: p.price * i.qty
            };
        });

        return res.render("checkout", { cartItems, addresses });

    } catch (err) {
        console.error("loadCheckout error:", err);
        return res.status(500).send("Internal Server Error");
    }
};



const placeOrder = async(req,res) => {
    try {
        const userId = req.session.user;
        if(!userId) return res.redirect("/login");

        const {addressId} =req.body;
        if(!addressId){
            return res.redirect("/checkout");
        }
        const user = await User.findById(userId)
        if(!user) return res.redirect('/checkout');

         const addressObj = user.address.find(a => a._id.toString() === addressId);
    if (!addressObj) return res.redirect("/checkout");

    // load cart with populated products
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) return res.redirect("/cart");

    // validate stock and build order items
    let totalAmount = 0;
    const orderItems = [];

    for (const it of cart.items) {
      const p = await Product.findById(it.productId);
      if (!p || p.isDeleted || p.status === "Discontinued" || p.status === "out of stock" || p.quantity <= 0) {
        return res.redirect("/cart");
      }
      if (it.qty > p.quantity) {
        return res.redirect("/cart");
      }

      const price = p.price;
      const discountPct = p.discount || 0;
      const priceAfterDiscount = price - (price * discountPct / 100);
      const subtotal = priceAfterDiscount * it.qty;

      orderItems.push({
        productId: p._id,
        name: p.productName || p.name || it.name,
        image: (p.productImage && p.productImage[0]) ? (typeof p.productImage[0] === 'string' ? p.productImage[0] : p.productImage[0].url) : (it.image || ""),
        qty: it.qty,
        price: price,
        discount: discountPct,
        subtotal
      });

      totalAmount += subtotal;
    }

   const uniqueOrderId="MAM"+Date.now();

    const newOrder = new Order({
      orderId:uniqueOrderId,
      userId,
      items: orderItems.map(oi => ({

        productId: oi.productId,

        name: oi.name,

        image: oi.image,

        qty: oi.qty,

        price: oi.price,

        discount: oi.discount

      })),

      address: {
        fullname: addressObj.fullname,
        street: addressObj.addressLine,
        city: addressObj.city,
        state: addressObj.state,
        pincode: addressObj.pincode,
        phone :addressObj.phone
      },
      totalAmount
    });

    await newOrder.save();

    // decrement product stock
    for (const oi of orderItems) {
      await Product.findByIdAndUpdate(oi.productId, {
        $inc: { quantity: -oi.qty }
      }, { new: true });

      // update status if qty becomes 0
      const prod = await Product.findById(oi.productId);
      if (prod && prod.quantity <= 0) {
        prod.status = "out of stock";
        prod.quantity = Math.max(0, prod.quantity);
        await prod.save();
      }
    }

    // clear cart
    cart.items = [];
    cart.cartTotal = 0;
    await cart.save();

    // redirect to success page
    return res.redirect(`/order/success/${newOrder.orderId}`);
  } catch (err) {
    console.error("placeOrder error:", err);
    return res.status(500).send("Internal server error");
  }
};

const loadOrderSuccess = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const orderId = req.params.orderId;
    if (!orderId) return res.redirect("/");

    const order = await Order.findById(orderId).lean();
    if (!order) return res.redirect("/");

    // ensure owner
    if (order.userId.toString() !== userId.toString()) return res.redirect("/");

    return res.render("orderSuccess", { order });
  } catch (err) {
    console.error("loadOrderSuccess error:", err);
    return res.status(500).send("Internal server error");
  }
};

const loadOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.id;
    if (!userId) return res.redirect("/login");

    const order = await Order.findById(orderId).lean();
    if (!order) return res.redirect("/");

    if (order.userId.toString() !== userId.toString()) return res.redirect("/");

    return res.render("orderDetails", { order });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Internal server error");
  }
};

const cancelOrder=async (req,res)=>{
  try {
    const userId = req.session.user;
    const {orderId} = req.params;

    const order = await Order.findOne({orderId,userId})
    if(!order) return res.redirect("/order-summary");

    if(order.status === "Delivered"){
      return res.send("Cannot cancel delivered order");
    }

    for(let item of order.items){
      await Product.findByIdAndUpdate(item.productId,{
        $inc:{quantity:item.qty}
      });
    }

    order.status = "Cancelled";
    await order.save();

    return res.redirect("/order-summary");

  } catch (error) {
    console.error(error);
    res.status(500).send("Something went wrong");
  }
};

const returnOrder = async(req,res)=>{
  try {
    const userId = req.session.user;
    const {orderId} = req.params;

    const order = await Order.findOne({ orderId,userId });
    if(!order) return res.redirect("/order-summary");

    if(order.status !== "Delivered"){
      return res.send("Only delivered orders can be returned");
    }

    order.status = "Returned";
    await order.save();

    for(let item of order.items){
      await Product.findByIdAndUpdate(item.productId,{
        $inc:{quantity:item.qty}
      })
    }
    res.redirect("/order-summary");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error")
  }
} ;


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



module.exports = {
  loadCheckout,
  placeOrder,
  loadOrderSuccess,
  loadOrderDetails,
  cancelOrder,
  returnOrder,
  loadOrderSummary
};

