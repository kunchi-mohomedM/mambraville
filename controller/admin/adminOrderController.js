
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema"); 
const Wallet = require("../../models/walletSchema")
const mongoose = require("mongoose");

const DEFAULT_LIMIT = 10;

const listOrders = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const { status, search, sort } = req.query;
    const query = {};

    
    if (status && status !== "all") {
      query.status = status;
    }

    
   if (search && search.trim() !== "") {
      const q = search.trim();

      const users = await User.find({
        fullname: { $regex: q, $options: "i" }
      }).select("_id");

      query.$or = [
        { orderId: { $regex: q, $options: "i" } },
        { userId: { $in: users.map(u => u._id) } }
      ];
    }

    
    let sortOptions = { orderedAt: -1 }; 
    switch (sort) {
      case "oldest":
        sortOptions = { orderedAt: 1 };
        break;
      case "highAmount":
        sortOptions = { totalAmount: -1 };
        break;
      case "lowAmount":
        sortOptions = { totalAmount: 1 };
        break;
    }

   const total = await Order.countDocuments(query);


    const orders = await Order.find(query)
      .populate("userId","fullname email" )
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean();

   
    const totalPages = Math.ceil(total / limit);

    
    

    return res.render("adminOrders", {
      orders,
      page,
      totalPages,
      queryParams: {
        status: status || "all",
        search: search || "",
        sort: sort || "latest"
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
};


const viewOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.redirect("/admin/orders");
    }

    const order = await Order.findById(orderId).populate("userId", "name email phone").lean();
    if (!order) return res.redirect("/admin/orders");

    return res.render("adminOrderDetails", { order });
  } catch (err) {
    console.error("admin viewOrder error:", err);
    return res.status(500).send("Server error");
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).send("Invalid order");

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send("Order not found");

    
    const allowed = ["Pending", "Shipped", "Out for Delivery", "Delivered", "Cancelled"];
    if (!allowed.includes(status)) return res.status(400).send("Invalid status");

   
    if (status === "Cancelled" && order.status !== "Cancelled") {
      for (const item of order.items) {
        if (item.status !== "Cancelled") {
          await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: item.qty } });
          item.status = "Cancelled";
          item.cancelReason = item.cancelReason || "Cancelled by admin";
        }
      }
      order.cancelReason = order.cancelReason || "Cancelled by admin";
      order.totalAmount = 0; 
    }

    
    if (status === "Delivered") {
      order.deliveredAt = new Date();
     
      for (const item of order.items) {
        if (item.status === "Pending") item.status = "Delivered";
      }
    }

    order.status = status;
    await order.save();

    
    return res.redirect(`/admin/order/${orderId}`);
  } catch (err) {
    console.error("admin updateOrderStatus error:", err);
    return res.status(500).send("Server error");
  }
};

const verifyReturn = async (req, res) => {
  const { orderId, itemId } = req.params;

  const order = await Order.findById(orderId);
  if (!order) return res.redirect("/admin/orders");

  const item = order.items.id(itemId);
  if (!item) return res.redirect("/admin/orders");

  
  if (item.status !== "Return Requested") {
    return res.redirect(`/admin/order/${orderId}`);
  }

  
  item.status = "Returned";
  item.returnApprovedAt = new Date();

  
  await Product.findByIdAndUpdate(item.productId, {
    $inc: { quantity: item.qty }
  });

  
  const refundAmount = (item.price - (item.discount || 0)) * item.qty;

  await User.findByIdAndUpdate(order.userId, {
    $inc: { wallet: refundAmount }
  });

  
  const allReturned = order.items.every(
    i => i.status === "Returned" || i.status === "Cancelled"
  );

  if (allReturned) order.status = "Returned";

  await order.save();
  res.redirect(`/admin/order/${orderId}`);
};



const cancelOrderByAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) return res.redirect("/admin/orders");
    const order = await Order.findById(orderId);
    if (!order) return res.redirect("/admin/orders");

    if (order.status === "Delivered") {
      
      return res.redirect(`/admin/orders/${orderId}`);
    }

    for (const item of order.items) {
      if (item.status !== "Cancelled") {
        await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: item.qty } });
        item.status = "Cancelled";
        item.cancelReason = item.cancelReason || "Cancelled by admin";
      }
    }

    order.status = "Cancelled";
    order.cancelReason = order.cancelReason || "Cancelled by admin";
    await order.save();

    return res.redirect("/admin/orders");
  } catch (err) {
    console.error("admin cancelOrderByAdmin error:", err);
    return res.status(500).send("Server error");
  }
};

const listReturnRequests = async (req, res) => {
  try {
    const orders = await Order.find({
      "items.status": "Return Requested"
    })
    .populate("userId", "fullname email")
    .lean();

    
    const returnRequests = [];

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.status === "Return Requested") {
          returnRequests.push({
            orderId: order._id,
            orderCode: order.orderId,
            user: order.userId,
            item
          });
        }
      });
    });

    res.render("adminReturnRequests", { returnRequests });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

const approveReturn = async (req, res) => {
  const { orderId, itemId } = req.params;

  const order = await Order.findById(orderId);
  if (!order) return res.redirect("/admin/orders/returns");

  const item = order.items.id(itemId);
  if (!item || item.status !== "Return Requested") {
    return res.redirect("/admin/orders/returns");
  }

  item.status = "Returned";
  item.returnApprovedAt = new Date();

  // Restock product
  await Product.findByIdAndUpdate(item.productId, {
    $inc: { quantity: item.qty }
  });

  // ✅ CORRECT refund amount
  const refundAmount = Number(item.subtotal);

  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    console.error("Invalid refund amount", {
      subtotal: item.subtotal,
      qty: item.qty,
      finalPrice: item.finalPrice
    });
    return res.redirect("/admin/orders/returns");
  }

  // ✅ Update wallet
  await Wallet.findOneAndUpdate(
    { userId: order.userId },
    {
      $inc: { balance: refundAmount },
      $push: {
        transactions: {
          amount: refundAmount,
          type: "credit",
          reason: "Order Refund",
          orderId: order._id,
          description: `Refund for returned item`
        }
      }
    },
    { upsert: true, new: true }
  );

  // Update order status if all items returned/cancelled
  const allReturned = order.items.every(
    i => i.status === "Returned" || i.status === "Cancelled"
  );

  if (allReturned) order.status = "Returned";

  await order.save();
  res.redirect("/admin/orders/returns");
};



const rejectReturn = async (req, res) => {
  const { orderId, itemId } = req.params;

  const order = await Order.findById(orderId);
  if (!order) return res.redirect("/admin/orders/returns");

  const item = order.items.id(itemId);
  if (!item || item.status !== "Return Requested") {
    return res.redirect("/admin/orders/returns");
  }

  item.status = "Delivered";
  item.returnReason = "";
  item.returnRequestedAt = null;

  await order.save();
  res.redirect("/admin/orders/returns");
};

module.exports = {
  listOrders,
  viewOrder,
  updateOrderStatus,
  verifyReturn,
  cancelOrderByAdmin,
  listReturnRequests,
  approveReturn,
  rejectReturn

};
