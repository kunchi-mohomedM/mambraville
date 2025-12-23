const Order = require("../../models/orderSchema");

const loadDashboard = async (req, res) => {
  try {

    let { filter = "daily", fromDate, toDate } = req.query;

    let startDate = new Date();
    let endDate = new Date();

    
    if (filter === "daily") {
      startDate.setHours(0, 0, 0, 0);
    }

    if (filter === "weekly") {
      startDate.setDate(startDate.getDate() - 7);
    }

    if (filter === "monthly") {
      startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    }

    if (filter === "yearly") {
      startDate = new Date(startDate.getFullYear(), 0, 1);
    }

    if (filter === "custom" && fromDate && toDate) {
      startDate = new Date(fromDate);
      endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
    }

 
    const summary = await Order.aggregate([
      {
        $match: {
          status: "Delivered",
          orderedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          netSales: { $sum: "$totalAmount" },
          couponDiscount: { $sum: "$couponDiscountAmount" }
        }
      }
    ]);

    const report = summary[0] || {
      totalOrders: 0,
      netSales: 0,
      couponDiscount: 0
    };

    const grossSales = report.netSales + report.couponDiscount;

    const tableData = await Order.aggregate([
      {
        $match: {
          status: "Delivered",
          orderedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$orderedAt" }
          },
          orders: { $sum: 1 },
          netAmount: { $sum: "$totalAmount" },
          discount: { $sum: "$couponDiscountAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.render("dashboard", {
      report,
      grossSales,
      tableData,
      filter,
      fromDate,
      toDate
    });

  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).send("Server Error");
  }
};

module.exports = { loadDashboard };
