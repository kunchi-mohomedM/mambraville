const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const razorpay = require("../../config/Razorpay");
const Coupon = require("../../models/couponSchema");
const Wallet = require("../../models/walletSchema");
const crypto = require("crypto");

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const cart = await Cart.findOne({ userId })
      .populate("items.productId")
      .lean();

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    const user = await User.findById(userId).lean();
    const addresses = user?.address || [];

    const cartItems = cart.items.map(i => {
      const p = i.productId || {};

      const image =
        p.productImage?.length
          ? typeof p.productImage[0] === "string"
            ? p.productImage[0]
            : p.productImage[0].url
          : "";

      const discountPercent = p.discount || 0;

      const discountedPrice = Math.round(
        p.price - (p.price * discountPercent) / 100
      );

      

      return {
        productId: p._id,
        productName: p.productName || p.name,
        originalPrice: p.price,
        price:discountedPrice,
        discountPercent,
        productImage: [image],
        quantity: i.qty,
        subtotal: discountedPrice * i.qty
      };
    });

    
    const cartTotal = cartItems.reduce(
      (sum, item) => sum + item.subtotal,
      0
    );

    const coupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: new Date() },
      usedBy: { $ne: userId }
    }).lean();

    const applicableCoupons = coupons.filter(
      coupon => cartTotal >= coupon.minPurchase
    );

    return res.render("checkout", {
      cartItems,
      addresses,
      cartTotal,
      coupons: applicableCoupons
    });

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
    
    if (!addressId)
      return res.json({ success: false, message: "Please select an address" });
    if (!paymentMethod)
      return res.json({
        success: false,
        message: "Please select payment method",
      });

    // Fetch user
    const user = await User.findById(userId);
    if (!user) return res.json({ success: false, message: "User not found" });

    // FIX 1: Correctly get embedded address using Mongoose .id()
    const selectedAddress = user.address.id(addressId);
    if (!selectedAddress) {
      return res.json({ success: false, message: "Invalid address selected" });
    }

    // Fetch cart with populated products
    const cart = await Cart.findOne({ userId }).populate("items.productId");
    if (!cart || cart.items.length === 0) {
      return res.json({ success: false, message: "Your cart is empty" });
    }

    const orderItems = [];
    let totalAmount = 0;

    // Validate stock and calculate
    for (const item of cart.items) {
      const product = item.productId;

      if (!product || product.isDeleted || product.status !== "Available") {
        return res.json({
          success: false,
          message: `${
            product?.productName || "Product"
          } is currently unavailable`,
        });
      }

      // FIX: Use item.qty, not item.quantity
      if (product.quantity < item.qty) {
        return res.json({
          success: false,
          message: `${product.productName} has only ${product.quantity} left in stock`,
        });
      }

      const priceAfterDiscount =
        product.price * (1 - (product.discount || 0) / 100);
      const subtotal = Math.round(priceAfterDiscount * item.qty); // ← item.qty

      orderItems.push({
        productId: product._id,
        name: product.productName,
        image:
          product.productImage?.[0]?.url || product.productImage?.[0] || "",
        qty: item.qty, // ← item.qty
        price: product.price,
        discount: product.discount || 0,
        subtotal,
      });

      totalAmount += subtotal;
    }

    const subtotal = totalAmount;
    const gstAmount = Math.round(subtotal * 0.05);
    totalAmount = subtotal + gstAmount;

    const createFinalOrder = async (
      paymentStatus = "Pending",
      paymentMethodUsed = "COD"
    ) => {
      const order = new Order({
        orderId: "MAM" + Date.now(),
        userId,
        items: orderItems.map((i) => ({
          productId: i.productId,
          name: i.name,
          image: i.image,
          qty: i.qty,
          price: i.price,
          discount: i.discount,
        })),
        address: {
          fullname: selectedAddress.fullname,
          phone: selectedAddress.phone,
          addressLine: selectedAddress.addressLine,
          locality: selectedAddress.locality,
          city: selectedAddress.city,
          state: selectedAddress.state,
          pincode: selectedAddress.pincode,
        },
        totalAmount,
        paymentMethod: paymentMethodUsed,
        paymentStatus,
        status: paymentMethodUsed === "COD" ? "Confirmed" : "Paid",
      });

      await order.save();

      // Deduct stock
      for (const item of orderItems) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { quantity: -item.qty },
        });
      }

      // Clear cart
      await Cart.findOneAndUpdate(
        { userId },
        { $set: { items: [], cartTotal: 0 } }
      );

      return order;
    };

    // COD Flow
    if (paymentMethod === "cod") {
      const order = await createFinalOrder("Pending", "COD");
      return res.json({
        success: true,
        cod: true,
        redirect: `/order/success/${order._id}`,
      });
    }

    // Razorpay Flow
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
        name: user.fullname || "Customer",
        email: user.email || "",
        contact: user.phone || "9999999999",
        tempOrderData: {
          userId,
          address: {
            fullname: selectedAddress.fullname,
            phone: selectedAddress.phone,
            addressLine: selectedAddress.addressLine,
            locality: selectedAddress.locality,
            city: selectedAddress.city,
            state: selectedAddress.state,
            pincode: selectedAddress.pincode,
          },
          orderItems,
          totalAmount,
          razorpayOrderId: razorpayOrder.id,
        },
      });
    }
  } catch (err) {
    console.error("Place Order Full Error:", err);
    return res.json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      tempOrderData,
    } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSign !== razorpay_signature) {
      return res.json({
        success: false,
        message: "Payment verification failed - Invalid signature",
      });
    }

    const { userId, orderItems, address, totalAmount } = tempOrderData;

    if (!userId || !orderItems || !address || !totalAmount) {
      return res.json({ success: false, message: "Invalid order data" });
    }

    for (const item of orderItems) {
      const product = await Product.findById(item.productId);
      if (!product || product.quantity < item.qty) {
        return res.json({
          success: false,
          message: `${item.name} is out of stock`,
        });
      }
    }

    const order = new Order({
      orderId: "MAM" + Date.now(),
      userId,
      items: orderItems.map((i) => ({
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
      razorpayPaymentId: razorpay_payment_id,
    });

    await order.save();

    for (const item of orderItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: -item.qty },
      });
    }

    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [], cartTotal: 0 } }
    );

    return res.json({
      success: true,
      redirect: `/order/success/${order._id}`,
    });
  } catch (err) {
    console.error("Verify Payment Error:", err);
    return res.json({
      success: false,
      message: "Payment failed. Please try again.",
    });
  }
};

const loadOrderSuccess = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const orderId = req.params.orderId;
    console.log(orderId);
    if (!orderId) return res.redirect("/");

    const order = await Order.findById(orderId).lean();
    console.log(order);
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
    console.log(order);
    if (!order) return res.redirect("/order-summary");

    order.cancelReason = reason;
    order.status = "Cancelled";

    for (let item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: item.qty },
      });
      item.status = "Cancelled";
    }

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId });
    }
  let amount =  Number(order.totalAmount);
    wallet.balance +=amount
    wallet.transactions.unshift({
      amount,
      type: "credit",
      reason: "Order Cancel Refund",
      description: `Refund amount of order: ${orderId}`,
    });

    await wallet.save();

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
        $inc: { quantity: item.qty },
      });
      item.status = "Returned";
      item.returnReason = reason;
    }

    await order.save();
    res.redirect("/order-summary");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error");
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
      $inc: { quantity: item.qty },
    });

    if (order.items.every((i) => i.status === "Cancelled")) {
      order.status = "Cancelled";
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

    if (!reason || reason.trim() === "") {
      return res.send("Return reason is required");
    }

    const order = await Order.findById(orderId);
    if (!order) return res.redirect("/order-summary");

    const item = order.items.id(itemId);
    if (!item) return res.redirect("/order-summary");

    if (item.status !== "Delivered") {
      return res.send("Only delivered items can be returned");
    }

    // Update item
    item.status = "Return Requested";
    item.returnReason = reason;
    item.returnRequestedAt = new Date();

    await order.save();
    res.redirect(`/order/details/${orderId}`);
  } catch (err) {
    console.error("Return item error:", err);
    res.status(500).send("Something went wrong");
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
          { "items.name": { $regex: search, $options: "i" } },
        ],
      })
        .sort({ orderedAt: -1 })
        .lean();
    } else {
      orders = await Order.find({ userId }).sort({ orderedAt: -1 }).lean();
    }

    // Render the EJS page
    return res.render("ordersummary", {
      user,
      orders,
      search,
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
  verifyPayment,
};
