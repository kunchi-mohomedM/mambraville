
const Order = require("../../models/orderSchema");
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema"); 
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
  try {
    const { orderId, itemId } = req.params;
    const { approve } = req.body; 
    const { adminNote } = req.body; 

    if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).send("Invalid orderId");

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).send("Order not found");

    const item = order.items.id(itemId);
    if (!item) return res.status(404).send("Item not found");

   
    if (item.status === "Returned" || item.status === "Cancelled") {
      return res.redirect(`/admin/orders/${orderId}`);
    }

    
    if (item.status !== "Delivered") {
      return res.status(400).send("Only delivered items can be returned");
    }

 
    item.status = "Returned";
    if (!item.returnReason && req.body.returnReason) item.returnReason = req.body.returnReason;
    if (adminNote) item.adminNote = adminNote;

   
    await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: item.qty } });

    
    const refundAmount = (item.price || 0) * (item.qty || 0); 
    await User.findByIdAndUpdate(order.userId, { $inc: { wallet: refundAmount } });

    
    const allReturned = order.items.every(i => i.status === "Returned" || i.status === "Cancelled");
    if (allReturned) {
      order.status = "Returned";
    } else {
     
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
