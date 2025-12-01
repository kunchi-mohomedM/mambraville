
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema"); // for wallet update
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
      query.$or = [
        { orderId: { $regex: q, $options: "i" } }
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

  
    const orders = await Order.find(query)
      .populate({ path: "userId", select: "fullname email" })
      .lean();

   
    let filteredOrders = orders;
    if (search && search.trim() !== "") {
      const q = search.trim().toLowerCase();
      filteredOrders = orders.filter(
        o => o.orderId.toLowerCase().includes(q) || 
             (o.userId.fullname && o.userId.fullname.toLowerCase().includes(q))
      );
    }

    const total = filteredOrders.length;
    const totalPages = Math.ceil(total / limit);

    
    const paginatedOrders = filteredOrders.slice(skip, skip + limit);

    return res.render("adminOrders", {
      orders: paginatedOrders,
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

    return res.render("admin/orderDetails", { order });
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

    // allowed status transitions (you can tighten rules if needed)
    const allowed = ["Pending", "Shipped", "Out for Delivery", "Delivered", "Cancelled"];
    if (!allowed.includes(status)) return res.status(400).send("Invalid status");

    // If moving to Cancelled by admin: restock all non-cancelled items
    if (status === "Cancelled" && order.status !== "Cancelled") {
      for (const item of order.items) {
        if (item.status !== "Cancelled") {
          await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: item.qty } });
          item.status = "Cancelled";
          item.cancelReason = item.cancelReason || "Cancelled by admin";
        }
      }
      order.cancelReason = order.cancelReason || "Cancelled by admin";
      order.totalAmount = 0; // optional: keep original but typically set to 0 for business logic
    }

    // If marking Delivered, mark deliveredAt and mark item status -> Delivered if still pending
    if (status === "Delivered") {
      order.deliveredAt = new Date();
      // mark pending items as delivered
      for (const item of order.items) {
        if (item.status === "Pending") item.status = "Delivered";
      }
    }

    order.status = status;
    await order.save();

    // redirect back to order details or orders list
    return res.redirect(`/admin/orders/${orderId}`);
  } catch (err) {
    console.error("admin updateOrderStatus error:", err);
    return res.status(500).send("Server error");
  }
};

/**
 * Verify return request for a specific item.
 * This route expects admin to approve a return request for itemId inside the order.
 * On approve: update item.status to Returned, credit wallet, increment stock, set item.returnReason (if not set)
 */
const verifyReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { approve } = req.body; // optional true/false if you want reject too
    const { adminNote } = req.body; // optional notes

    if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).send("Invalid orderId");

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send("Order not found");

    const item = order.items.id(itemId);
    if (!item) return res.status(404).send("Item not found");

    // If item already returned or cancelled -> nothing to do
    if (item.status === "Returned" || item.status === "Cancelled") {
      return res.redirect(`/admin/orders/${orderId}`);
    }

    // Only verify requests for Delivered items (business rule)
    if (item.status !== "Delivered") {
      return res.status(400).send("Only delivered items can be returned");
    }

    // Approve the return
    // 1) mark item as Returned
    item.status = "Returned";
    if (!item.returnReason && req.body.returnReason) item.returnReason = req.body.returnReason;
    if (adminNote) item.adminNote = adminNote;

    // 2) restock product
    await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: item.qty } });

    // 3) refund to user's wallet
    const refundAmount = (item.price || 0) * (item.qty || 0); // simple refund rule
    await User.findByIdAndUpdate(order.userId, { $inc: { wallet: refundAmount } });

    // 4) update order.status if all items returned
    const allReturned = order.items.every(i => i.status === "Returned" || i.status === "Cancelled");
    if (allReturned) {
      order.status = "Returned";
    } else {
      // if some items still delivered or pending, keep order as Delivered
      order.status = order.items.some(i => i.status === "Delivered") ? "Delivered" : order.status;
    }

    await order.save();
    return res.redirect(`/admin/orders/${orderId}`);
  } catch (err) {
    console.error("admin verifyReturn error:", err);
    return res.status(500).send("Server error");
  }
};

const cancelOrderByAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) return res.redirect("/admin/orders");
    const order = await Order.findById(orderId);
    if (!order) return res.redirect("/admin/orders");

    if (order.status === "Delivered") {
      // business: cannot admin-cancel delivered orders (unless you want to)
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

module.exports = {
  listOrders,
  viewOrder,
  updateOrderStatus,
  verifyReturn,
  cancelOrderByAdmin
};
