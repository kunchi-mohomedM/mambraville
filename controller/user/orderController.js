const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Order = require('../../models/orderSchema')
const Product = require("../../models/productSchema");
const razorpay = require("../../config/Razorpay");
const crypto = require("crypto");


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


const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.json({ success: false, message: "Login required" });

    const { addressId, paymentMethod } = req.body;



    if (!addressId) return res.json({ success: false, message: "Please select address" });
    if (!paymentMethod) return res.json({ success: false, message: "Please select payment method" });

    // Fetch user & correct address
    const user = await User.findById(userId);
    const address = user.address.id(addressId);
    if (!address) return res.json({ success: false, message: "Invalid address" });

    // Fetch & validate cart
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0)
      return res.json({ success: false, message: "Cart is empty" });

    // Build order items + validate stock
    const orderItems = [];
    let totalAmount = 0; 

    for (const item of cart.items) {
      const product = item.productId;
      if (!product || product.isDeleted || product.quantity < item.qty) {
        return res.json({ success: false, message: `${product.productName} is out of stock` });
      }

      const priceAfterDiscount = product.price * (1 - (product.discount || 0) / 100);
      const subtotal = priceAfterDiscount * item.qty;

      orderItems.push({
        productId: product._id,
        name: product.productName,
        image: product.productImage?.[0]?.url || product.productImage?.[0] || "",
        qty: item.qty,
        price: product.price,
        discount: product.discount || 0,
        subtotal: Math.round(subtotal)
      });

      totalAmount += subtotal;
    }

    totalAmount = Math.round(totalAmount);

    // Helper - create order
    const finalizeOrder = async (paymentStatus = "Pending", method = "COD") => {
      const order = new Order({
        orderId: "MAM" + Date.now(),
        userId,
        items: orderItems.map(i => ({
          productId: i.productId,
          name: i.name,
          image: i.image,
          qty: i.qty,
          price: i.price,
          discount: i.discount
        })),
        address: {
          fullname: address.fullname,
          phone: address.phone,
          addressLine: address.addressLine,
          locality: address.locality,
          city: address.city,
          state: address.state,
          pincode: address.pincode,
        },
        totalAmount,
        paymentMethod: method,
        paymentStatus,
        status: method === "COD" ? "Confirmed" : "Paid"
      });

      await order.save();

      // Reduce stock
      for (const item of orderItems) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { quantity: -item.qty }
        });
      }

      // Clear cart
      cart.items = [];
      cart.cartTotal = 0;
      await cart.save();

      return order;
    };

    // CASE 1: Cash on Delivery
    if (paymentMethod === "cod") {
      const order = await finalizeOrder("Pending", "COD");
      return res.json({
        success: true,
        cod: true,
        redirect: `/order/success/${order._id}`
      });
    }

    // CASE 2: Razorpay
    if (paymentMethod === "razorpay") {
      const razorpayOrder = await razorpay.orders.create({
        amount: totalAmount * 100,
        currency: "INR",
        receipt: `receipt_${Date.now()}`,
      });

      return res.json({
        success: true,
        razorpay: true,
        key_id: process.env.RAZORPAY_KEY_ID,
        amount: razorpayOrder.amount,
        order_id: razorpayOrder.id,
        totalAmount,
        contact: user.phone || "9999999999",
        email: user.email,
        name: user.fullname,
        tempOrderData: {
          userId,
          addressId,
          orderItems,
          address: {
            fullname: address.fullname,
            phone: address.phone,
            addressLine: address.addressLine,
            locality: address.locality,
            city: address.city,
            state: address.state,
            pincode: address.pincode
          },
          totalAmount
        }
      });
    }

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Something went wrong" });
  }
};


const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      tempOrderData
    } = req.body;

    if (!tempOrderData) {
      console.warn("verifyPayment: missing tempOrderData");
      return res.status(400).json({ success: false, message: "Missing order data" });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.warn("verifyPayment: missing razorpay fields", { razorpay_order_id, razorpay_payment_id, hasSignature: !!razorpay_signature });
      return res.status(400).json({ success: false, message: "Missing razorpay parameters" });
    }

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSign !== razorpay_signature) {
      console.warn("verifyPayment: signature mismatch", { expectedSign, razorpay_signature });
      return res.status(400).json({ success: false, message: "Payment verification failed" });
    }

    // Payment verified
    const { userId, orderItems, address, totalAmount } = tempOrderData;

    if (!userId || !orderItems || !address || !totalAmount) {
      console.warn("verifyPayment: invalid tempOrderData payload", { tempOrderDataKeys: Object.keys(tempOrderData || {}) });
      return res.status(400).json({ success: false, message: "Invalid order payload" });
    }

    // create and save order (same as you had)
    const order = new Order({
      orderId: "MAM" + Date.now(),
      userId,
      items: orderItems.map(i => ({
        productId: i.productId,
        name: i.name,
        image: i.image,
        qty: i.qty,
        price: i.price,
        discount: i.discount,
      })),
      address,
      totalAmount,
      paymentMethod: "Razorpay",
      paymentStatus: "Paid",
      status: "Paid",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id
    });

    await order.save();

    // reduce stock & clear cart
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: -item.qty } });
    }

    const cart = await Cart.findOne({ userId });
    if (cart) {
      cart.items = [];
      cart.cartTotal = 0;
      await cart.save();
    }

    return res.json({ success: true, redirect: `/order/success/${order._id}` });
  } catch (err) {
    console.error("Verify Error:", err);
    return res.status(500).json({ success: false, message: "Server error during verification" });
  }
};



const loadOrderSuccess = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const orderId = req.params.orderId;
    console.log(orderId)
    if (!orderId) return res.redirect("/");

    const order = await Order.findById(orderId).lean();
    console.log(order)
    if (!order) return res.redirect("/");

    // ensure owner
    if (order.userId.toString() !== userId.toString()) return res.redirect("/");

    return res.render("orderSuccess", { order });
  } catch (err) {
    console.error("loadOrderSuccess error:", err);
    return res.status(500).send("Internal server error when success page");
  }
};

const loadOrderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.orderId;
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

const cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId } = req.params;
    const { reason } = req.body;


    const order = await Order.findOne({ _id: orderId, userId });
    console.log(order)
    if (!order) return res.redirect("/order-summary");


    order.cancelReason = reason;
    order.status = "Cancelled";

    for (let item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: item.qty }
      });
      item.status = "Cancelled";
    }


    await order.save();

    return res.redirect("/order-summary");

  } catch (error) {
    console.error(error);
    res.status(500).send("Something went wrong");
  }
};

const returnOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ orderId, userId });
    if (!order) return res.redirect("/order-summary");

    if (order.status !== "Delivered") {
      return res.send("Only delivered orders can be returned");
    }

    order.status = "Returned";
    order.returnReason = reason;


    for (let item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: item.qty }
      })
      item.status = "Returned";
      item.returnReason = reason;

    }

    await order.save();
    res.redirect("/order-summary");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error")
  }
};

const cancelItem = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.orderId;
    const itemId = req.params.itemId;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) return res.redirect("/order-summary");

    const item = order.items.id(itemId);
    if (!item) return res.redirect("/order-summary");

    item.status = "Cancelled";
    item.cancelReason = reason;

    await Product.findByIdAndUpdate(item.productId, {
      $inc: { quantity: item.qty }
    });

    if (order.items.every(i => i.status === "Cancelled")) {
      order.status = "Cancelled"
    }

    await order.save();

    res.redirect(`/order-summary`);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error");
  }
};

const returnItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.redirect("/order-summary");

    const item = order.items.id(itemId);
    if (!item) return res.redirect("/order-summary");

    if (item.status !== "Delivered") {
      return res.send("Only delivered items can be returned");
    }

    item.status = "Returned";
    item.returnReason = reason;

    await Product.findByIdAndUpdate(item.productId, {
      $inc: { quantity: item.qty }
    });

    const refundAmount = item.price * item.qty;
    await User.findByIdAndUpdate(order.userId, {
      $inc: { wallet: refundAmount }
    })

    const allReturned = order.items.every(i => i.status === "Returned");
    const allDelivered = order.items.every(i => i.status !== "Pending" && i.status !== "Cancelled");

    if (allReturned) {
      order.status = "Returned";
    } else if (allDelivered) {
      order.status = "Delivered";
    }

    await order.save();
    res.redirect(`/order/details/${orderId}`);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error");
  }
};


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

    const search = req.query.search ? req.query.search.trim() : "";

    let orders;

    if (search) {
      orders = await Order.find({
        userId,
        $or: [
          { orderId: { $regex: search, $options: "i" } },
          { "items.name": { $regex: search, $options: "i" } }
        ]
      }).sort({ orderedAt: -1 }).lean();
    } else {
      orders = await Order.find({ userId })
        .sort({ orderedAt: -1 })
        .lean();
    }



    // Render the EJS page
    return res.render("ordersummary", {
      user,
      orders,
      search
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
  loadOrderSummary,
  cancelItem,
  returnItem,
  verifyPayment
};

