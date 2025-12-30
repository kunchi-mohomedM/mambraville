const User = require("../../models/userSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const razorpay = require("../../config/Razorpay");
const Coupon = require("../../models/couponSchema");
const Wallet = require("../../models/walletSchema");
const crypto = require("crypto");
const CategoryOffer = require("../../models/categoryOffer");

const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const cart = await Cart.findOne({ userId })
      .populate({
        path: "items.productId",
        populate: { path: "category" },
      })
      .lean();

    if (!cart || cart.items.length === 0) {
      return res.redirect("/cart");
    }

    let hasInvalidItem = false;
    let errorMessages = [];

    for (let item of cart.items) {
      const product = item.productId;

      if (
        !product ||
        product.isDeleted ||
        product.status === "Discontinued" ||
        product.quantity <= 0 ||
        product.quantity < item.qty
      ) {
        const productName = product?.productName || "Unknown item";
        const reason = !product || product.isDeleted || product.status === "Discontinued"
          ? "unavailable or discontinued"
          : "out of stock";

        errorMessages.push(`"${productName}" is ${reason}`);
        hasInvalidItem = true;
      }
    }

    // If any item is invalid → block checkout and send message
    if (hasInvalidItem) {
      const message = errorMessages.join("; ") + ". Please update your cart.";
      return res.redirect(`/cart?error=checkout_blocked&message=${encodeURIComponent(message)}`);
    }

    // Proceed only if all items are valid
    // ... rest of your checkout logic (addresses, coupons, etc.)
    const user = await User.findById(userId).lean();
    const addresses = user?.address || [];

    const categoryOffers = await CategoryOffer.find({ isActive: true }).lean();
    const categoryOfferMap = {};
    categoryOffers.forEach((offer) => {
      categoryOfferMap[offer.categoryId.toString()] = offer.discountPercentage;
    });

    const cartItems = cart.items.map((i) => {
      const p = i.productId;

      const image = p?.productImage?.length
        ? typeof p.productImage[0] === "string"
          ? p.productImage[0]
          : p.productImage[0].url
        : "";

      const productDiscount = p.discount || 0;
      const categoryDiscount = categoryOfferMap[p.category?._id?.toString()] || 0;
      const finalDiscountPercent = Math.max(productDiscount, categoryDiscount);

      const finalPrice = Math.round(p.price - (p.price * finalDiscountPercent) / 100);

      return {
        productId: p._id,
        productName: p.productName || p.name,
        originalPrice: p.price,
        finalPrice,
        discountPercent: finalDiscountPercent,
        discountSource: finalDiscountPercent === productDiscount ? "product" : "category",
        productImage: [image],
        quantity: i.qty,
        subtotal: finalPrice * i.qty,
      };
    });

    const cartTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

    const coupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: new Date() },
      usedBy: { $ne: userId },
    }).lean();

    const applicableCoupons = coupons.filter((coupon) => cartTotal >= coupon.minPurchase);

    const wallet = await Wallet.findOne({ userId });
    const walletBalance = wallet ? wallet.balance : 0;

    return res.render("checkout", {
      cartItems,
      addresses,
      cartTotal,
      coupons: applicableCoupons,
      walletBalance,
    });
  } catch (err) {
    console.error("loadCheckout error:", err);
    return res.status(500).send("Internal Server Error");
  }
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.json({ success: false, message: "Login required" });
    }

    const { addressId, paymentMethod, couponCode, couponDiscount } = req.body;

    if (!addressId) {
      return res.json({ success: false, message: "Please select an address" });
    }
    if (!paymentMethod) {
      return res.json({ success: false, message: "Please select payment method" });
    }

    // Fetch user, address, cart early
    const user = await User.findById(userId);
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const selectedAddress = user.address.id(addressId);
    if (!selectedAddress) {
      return res.json({ success: false, message: "Invalid address selected" });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: "items.productId",
      populate: { path: "category" }
    });

    if (!cart || cart.items.length === 0) {
      return res.json({ success: false, message: "Your cart is empty" });
    }

    // === DECLARE ALL SHARED VARIABLES AT THE TOP ===
    let orderItems = [];
    let subtotalAmount = 0;
    let couponDiscountAmount = parseFloat(couponDiscount) || 0;
    let totalAmount = 0;
    let couponData = null;

    // Category offers map
    const categoryOffers = await CategoryOffer.find({ isActive: true }).lean();
    const categoryOfferMap = {};
    categoryOffers.forEach(offer => {
      categoryOfferMap[offer.categoryId.toString()] = offer.discountPercentage;
    });

    // === VALIDATE PRODUCTS & CALCULATE PRICES (Always run this) ===
    for (const item of cart.items) {
      const product = item.productId;

      if (!product || product.isDeleted || product.status !== "Available") {
        return res.json({
          success: false,
          message: `${product?.productName || "Product"} is unavailable`,
        });
      }

      if (product.quantity < item.qty) {
        return res.json({
          success: false,
          message: `${product.productName} has only ${product.quantity} left`,
        });
      }

      const productDiscount = product.discount || 0;
      const categoryDiscount = categoryOfferMap[product.category?._id?.toString()] || 0;
      const finalDiscountPercent = Math.max(productDiscount, categoryDiscount);

      const finalPrice = Math.round(
        product.price - (product.price * finalDiscountPercent) / 100
      );

      const itemSubtotal = finalPrice * item.qty;

      orderItems.push({
        productId: product._id,
        name: product.productName,
        image: product.productImage?.[0]?.url || product.productImage?.[0] || "",
        qty: item.qty,
        finalPrice,
        discountPercent: finalDiscountPercent,
        discountSource: finalDiscountPercent === productDiscount ? "product" : "category",
        subtotal: itemSubtotal,
      });

      subtotalAmount += itemSubtotal;
    }

   
    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode,
        isActive: true,
        expiryDate: { $gte: new Date() },
        usedBy: { $ne: userId },
      });

      if (!coupon) {
        return res.json({
          success: false,
          message: "Invalid or expired coupon",
        });
      }

      if (subtotalAmount < coupon.minPurchase) {
        return res.json({
          success: false,
          message: `Minimum purchase ₹${coupon.minPurchase} required`,
        });
      }

      couponDiscountAmount =
        coupon.discountType === "percentage"
          ? Math.round((subtotalAmount * coupon.discountValue) / 100)
          : coupon.discountValue;

      couponData = {
        couponId: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: couponDiscountAmount,
        minPurchase: coupon.minPurchase,
      };
    }

    totalAmount = subtotalAmount - couponDiscountAmount;


    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0, transactions: [] });
    }

   
    const createFinalOrder = async (paymentStatus = "Pending", paymentMethodUsed = "COD") => {
      const order = new Order({
        orderId: "MAM" + Date.now(),
        userId,
        items: orderItems,
        address: {
          fullname: selectedAddress.fullname,
          phone: selectedAddress.phone,
          addressLine: selectedAddress.addressLine,
          locality: selectedAddress.locality || "",
          city: selectedAddress.city,
          state: selectedAddress.state,
          pincode: selectedAddress.pincode,
        },
        coupon: couponData,
        subtotalAmount,
        couponDiscountAmount,
        totalAmount,
        paymentMethod: paymentMethodUsed,
        paymentStatus,
        status: paymentMethodUsed === "COD" || paymentMethodUsed === "Wallet" ? "Confirmed" : "Pending",
      });

      await order.save();

     
      if (couponData?.couponId) {
        await Coupon.findByIdAndUpdate(couponData.couponId, {
          $addToSet: { usedBy: userId },
        });
      }

      
      for (const item of orderItems) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { quantity: -item.qty },
        });
      }

    
      await Cart.findOneAndUpdate(
        { userId },
        { $set: { items: [], cartTotal: 0 } }
      );

      return order;
    };

    
    if (paymentMethod === "wallet") {
      if (totalAmount > wallet.balance) {
        return res.json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }

      
      const updatedWallet = await Wallet.findOneAndUpdate(
        { userId, balance: { $gte: totalAmount } },
        {
          $inc: { balance: -totalAmount },
          $push: {
            transactions: {
              amount: totalAmount,
              type: "debit",
              reason: "Order Payment",
              orderId: null,
              description: `Payment for order`,
            },
          },
        },
        { new: true }
      );

      if (!updatedWallet) {
        return res.json({
          success: false,
          message: "Payment failed. Insufficient balance or concurrent update.",
        });
      }

     
      const order = await createFinalOrder("Paid", "Wallet");

     
await Wallet.updateOne(
  { userId },
  { $set: { "transactions.$[elem].orderId": order._id } },
  {
    arrayFilters: [
      { "elem.reason": "Order Payment", "elem.orderId": null }
    ],
    sort: { "transactions.createdAt": -1 } 
  }
);

      return res.json({
        success: true,
        redirect: `/order/success/${order._id}`,
      });
    }

   
    if (paymentMethod === "cod") {
      const order = await createFinalOrder("Pending", "COD");
      return res.json({
        success: true,
        redirect: `/order/success/${order._id}`,
      });
    }

   
    if (paymentMethod === "razorpay") {
      const order = new Order({
        orderId: "MAM" + Date.now(),
        userId,
        items: orderItems,
        address: {
          fullname: selectedAddress.fullname,
          phone: selectedAddress.phone,
          addressLine: selectedAddress.addressLine,
          locality: selectedAddress.locality || "",
          city: selectedAddress.city,
          state: selectedAddress.state,
          pincode: selectedAddress.pincode,
        },
        subtotalAmount,
        totalAmount,
        paymentMethod: "Razorpay",
        paymentStatus: "Pending",
        status: "Pending",
        coupon: couponData,
        couponDiscountAmount,
      });

      await order.save();

      const razorpayOrder = await razorpay.orders.create({
        amount: totalAmount * 100,
        currency: "INR",
        receipt: order.orderId,
      });

      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      return res.json({
        success: true,
        razorpay: true,
        key_id: process.env.RAZORPAY_KEY_ID,
        amount: razorpayOrder.amount,
        order_id: razorpayOrder.id,
        orderId: order._id,
      });
    }

    return res.json({ success: false, message: "Invalid payment method" });

  } catch (err) {
    console.error("Place Order Error:", err);
    return res.json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expectedSign !== razorpay_signature) {
      return res.json({
        success: false,
        redirect: `/order/payment-failed/${order._id}`,
      });
    }

    console.log(expectedSign, razorpay_signature);

    const order = await Order.findById(orderId);

    if (!order) {
      return res.json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.paymentStatus === "Paid") {
      return res.json({
        success: true,
        redirect: `/order/success/${order._id}`,
      });
    }

    order.paymentStatus = "Paid";
    order.status = "Confirmed";
    order.razorpayOrderId = razorpay_order_id;
    order.razorpayPaymentId = razorpay_payment_id;

    await order.save();

    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: -item.qty },
      });
    }

    await Cart.findOneAndUpdate(
      { userId: order.userId },
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
      redirect: "/payment-failed",
    });
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
    
    if (!order) return res.redirect("/order-summary");

     if (order.status === "Cancelled") {
      return res.redirect("/order-summary");
    }

    order.cancelReason = reason;
    order.status = "Cancelled";

    for (let item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { quantity: item.qty },
      });
      item.status = "Cancelled";
    }


    if(order.paymentStatus === "Paid"){
    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = new Wallet({ 
        userId,
      balance:0,
    transactions:[]
  });
    }

    const refundAmount = Number(order.totalAmount);

     if (!isNaN(refundAmount) && refundAmount > 0) {
        wallet.balance += refundAmount;

        wallet.transactions.unshift({
          amount: refundAmount,
          type: "credit",
          reason: "Order Cancel Refund",
          orderId: order._id,
          description: `Refund for cancelled order`
        });

        await wallet.save();
      }
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

    if (item.status === "Cancelled") {
      return res.redirect("/order-summary");
    }

    // Optional: restrict cancellation based on status
    if (!["Pending", "Confirmed", "Processing", "Shipped"].includes(item.status)) {
      return res.redirect("/order-summary"); // or show error
    }

    const itemAmount = item.subtotal; // Use subtotal which is finalPrice * qty
    let refundAmount = itemAmount;

    // Check if coupon was applied
    const couponApplied = order.coupon && order.coupon.discountAmount > 0;
    const originalCouponDiscount = order.coupon?.discountAmount || 0;
    const minPurchaseForCoupon = order.coupon?.minPurchase || 0;

    // Calculate new subtotal after cancellation
    const newSubtotal = order.subtotalAmount - itemAmount;

    let newCouponDiscount = originalCouponDiscount;

    if (couponApplied) {
      if (newSubtotal < minPurchaseForCoupon) {
        // Coupon no longer valid → remove discount entirely
        // Subtract ENTIRE coupon discount from this item's refund
        newCouponDiscount = 0;
        refundAmount = Math.max(0, itemAmount - originalCouponDiscount);

        console.log(`Coupon invalidated. Reduced refund by ₹${originalCouponDiscount}`);
      }
      // Else: remaining subtotal >= min → keep full coupon, refund full item amount
    }

    // Update item
    item.status = "Cancelled";
    item.cancelReason = reason || "No reason provided";

    // Restore product stock
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { quantity: item.qty }
    });

    // Update order fields
    order.subtotalAmount = newSubtotal;

    if (order.coupon) {
      order.coupon.discountAmount = newCouponDiscount;
      if (newCouponDiscount === 0) {
        // Optional: null out entire coupon if discount is now zero
        order.coupon = null;
      }
    }

    // Update couponDiscountAmount (if you use it separately)
    order.couponDiscountAmount = newCouponDiscount;

    // Recalculate totalAmount
    order.totalAmount = newSubtotal - newCouponDiscount;

    // If all items cancelled
    if (order.items.every(i => i.status === "Cancelled")) {
      order.status = "Cancelled";
    }

    await order.save();

    // Process refund (only for paid orders)
    if (order.paymentStatus === "Paid" && refundAmount > 0) {
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({ userId, balance: 0, transactions: [] });
      }

      wallet.balance += refundAmount;
      wallet.transactions.push({
        amount: refundAmount,
        type: "credit",
        reason: "Order Item Cancellation Refund",
        orderId: order._id,
        description: newCouponDiscount === 0 && originalCouponDiscount > 0
          ? `Refund after coupon adjustment`
          : `Refund for cancelled item`
      });

      await wallet.save();
    }

    res.redirect(`/order-summary?message=Item cancelled successfully`);

  } catch (err) {
    console.error("Error cancelling order item:", err);
    res.status(500).send("Error cancelling item");
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

    
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).send("User not found");
    }

    const search = req.query.search ? req.query.search.trim() : "";

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let query = { userId };

    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { "items.name": { $regex: search, $options: "i" } },
      ];
    }

    const orders = await Order.find(query)
      .sort({ orderedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    return res.render("ordersummary", {
      user,
      orders,
      search,
      page,
      totalPages,
    });
  } catch (err) {
    console.error("Error loading order summary:", err);
    return res.status(500).send("Internal Server Error");
  }
};

const loadOrderFailure = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect("/login");

    const orderId = req.params.orderId;
    if (!orderId) return res.redirect("/");

    const order = await Order.findById(orderId).lean();
    if (!order) return res.redirect("/");

    if (order.userId.toString() !== userId.toString()) return res.redirect("/");

    return res.render("orderFailure", { order });
  } catch (error) {
    console.error("LoadOrderFailure error :", error);
    return res
      .status(500)
      .send("Internal server error when load Failure page ");
  }
};

const markPaymentFailed = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.json({ success: false, message: "Order ID required" });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.json({ success: false, message: "Order not found" });
    }

    
    if (order.paymentStatus === "Pending" && order.status !== "Cancelled") {
      order.paymentStatus = "Failed";
      order.status = "Failed";

      await order.save();

    }

    return res.json({
      success: true,
      redirect: `/order/payment-failed/${orderId}`,
    });
  } catch (err) {
    console.error("Mark Payment Failed Error:", err);
    return res.json({
      success: false,
      redirect: "/cart",
    });
  }
};

const retrypayment = async (req, res) => {
  try {
    const userId = req.session.user;
    const orderId = req.params.orderId;

    if (!userId) {
      return res.redirect("/login");
    }

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.redirect("/order-summary");
    }

    if (
      order.paymentMethod !== "Razorpay" ||
      order.paymentStatus !== "Failed" ||
      order.status !== "Failed"
    ) {
      return res.redirect(`/order/details/${orderId}`);
    }

    
    const razorpayOrder = await razorpay.orders.create({
      amount: order.totalAmount * 100, 
      currency: "INR",
      receipt: order.orderId + "_retry_" + Date.now(),
    });

    
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    const user = await User.findById(userId).lean();

    return res.render("retryPayment", {
      order,
      razorpayOrder,
      key_id: process.env.RAZORPAY_KEY_ID,
      name: user.fullname || "Customer",
      email: user.email || "",
      contact: user.phone || "9999999999",
    });
  } catch (error) {
    console.error("Retry Payment Load Error:", error);
    return res.status(500).send("Something went wrong");
  }
};

const retryPaymentCreate = async (req, res) => {
  try {
    const userId = req.session.user;
    const { orderId } = req.params;

    if (!userId) {
      return res.json({ success: false, message: "Login required" });
    }

    const order = await Order.findOne({ _id: orderId, userId });

    if (!order) {
      return res.json({ success: false, message: "Order not found" });
    }

    if (
      order.paymentMethod !== "Razorpay" ||
      order.paymentStatus !== "Failed" ||
      order.status !== "Failed"
    ) {
      return res.json({
        success: false,
        message: "This order cannot be retried",
      });
    }

    
    const razorpayOrder = await razorpay.orders.create({
      amount: order.totalAmount * 100, 
      currency: "INR",
      receipt: order.orderId + "_retry_" + Date.now(),
    });

    
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    return res.json({
      success: true,
      key_id: process.env.RAZORPAY_KEY_ID,
      amount: razorpayOrder.amount,
      order_id: razorpayOrder.id,
    });
  } catch (error) {
    console.error("Retry Payment Create Error:", error);
    return res.json({
      success: false,
      message: "Failed to initiate retry. Please try again.",
    });
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
  loadOrderFailure,
  markPaymentFailed,
  retrypayment,
  retryPaymentCreate,
};
