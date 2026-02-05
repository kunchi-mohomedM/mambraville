const Order = require('../../models/orderSchema'); // Adjust path if needed

const loadDashboard = async (req, res) => {
  try {
    // Get filter parameters
    const { filter = 'daily', fromDate, toDate } = req.query;

    // Default date range: Today
    let startDate = new Date();
    let endDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // Calculate date range based on filter
    if (filter === 'daily') {
      // Today only
    } else if (filter === 'weekly') {
      startDate.setDate(startDate.getDate() - 6); // Last 7 days including today
    } else if (filter === 'monthly') {
      startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    } else if (filter === 'yearly') {
      startDate = new Date(startDate.getFullYear(), 0, 1);
    } else if (filter === 'custom' && fromDate && toDate) {
      startDate = new Date(fromDate);
      endDate = new Date(toDate);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      if (isNaN(startDate) || isNaN(endDate) || startDate > endDate) {
        throw new Error('Invalid custom date range');
      }
    }

    // Base match conditions
    const successfulOrderMatch = {
      status: { $nin: ['Cancelled', 'Returned', 'Failed'] },
      paymentStatus: 'Paid',
      orderedAt: { $gte: startDate, $lte: endDate }
    };

    const anyOrderInPeriod = {
      orderedAt: { $gte: startDate, $lte: endDate }
    };

    //  Run all queries in parallel
    const [
      latestOrders,
      overallStats,
      topProducts,
      topCustomers,
      topCancelledProducts,
      topReturnedProducts,
      dailyBreakdown
    ] = await Promise.all([
      // Latest 10 orders (any status, in period)
      Order.find(anyOrderInPeriod)
        .sort({ orderedAt: -1 })
        .limit(10)
        .populate('userId', 'fullname email phone')
        .select('orderId items subtotalAmount couponDiscountAmount totalAmount status paymentMethod orderedAt address')
        .lean(),

      // Accurate overall stats with TRUE gross sales
      Order.aggregate([
        {
          $facet: {
            totalOrders: [
              { $match: successfulOrderMatch },
              { $count: 'count' }
            ],

            // True Gross Sales: before product/category discount
            grossSales: [
              { $match: successfulOrderMatch },
              { $unwind: '$items' },
              {
                $addFields: {
                  originalPricePerUnit: {
                    $cond: [
                      { $gt: ['$items.discountPercent', 0] },
                      {
                        $divide: [
                          '$items.finalPrice',
                          { $subtract: [1, { $divide: ['$items.discountPercent', 100] }] }
                        ]
                      },
                      '$items.finalPrice'
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  total: {
                    $sum: { $multiply: ['$items.qty', '$originalPricePerUnit'] }
                  }
                }
              }
            ],

            // Item-level discounts (product + category)
            itemDiscounts: [
              { $match: successfulOrderMatch },
              { $unwind: '$items' },
              {
                $addFields: {
                  originalPricePerUnit: {
                    $cond: [
                      { $gt: ['$items.discountPercent', 0] },
                      {
                        $divide: [
                          '$items.finalPrice',
                          { $subtract: [1, { $divide: ['$items.discountPercent', 100] }] }
                        ]
                      },
                      '$items.finalPrice'
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  totalItemDiscount: {
                    $sum: {
                      $multiply: [
                        '$items.qty',
                        { $subtract: ['$originalPricePerUnit', '$items.finalPrice'] }
                      ]
                    }
                  }
                }
              }
            ],

            // Coupon discounts
            couponDiscount: [
              { $match: successfulOrderMatch },
              { $group: { _id: null, total: { $sum: '$couponDiscountAmount' } } }
            ],

            // Refunds
            refunds: [
              {
                $match: {
                  status: { $in: ['Returned', 'Cancelled'] },
                  paymentStatus: 'Paid',
                  orderedAt: { $gte: startDate, $lte: endDate }
                }
              },
              { $group: { _id: null, totalRefunds: { $sum: '$totalAmount' } } }
            ]
          }
        }
      ]),

      // Top 10 Products (by quantity sold)
      Order.aggregate([
        { $match: successfulOrderMatch },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            totalQty: { $sum: '$items.qty' },
            totalRevenue: { $sum: '$items.subtotal' }
          }
        },
        { $sort: { totalQty: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productDetails'
          }
        },
        { $unwind: { path: '$productDetails', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            name: { $ifNull: ['$name', '$productDetails.productName'] },
            image: { $arrayElemAt: ['$productDetails.productImage.url', 0] },
            totalQty: 1,
            totalRevenue: 1
          }
        }
      ]),

      // Top 10 Customers 
      Order.aggregate([
        { $match: successfulOrderMatch },
        {
          $group: {
            _id: '$userId',
            totalSpent: { $sum: '$totalAmount' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $project: {
            name: '$user.fullname',
            email: '$user.email',
            totalSpent: 1,
            orderCount: 1
          }
        }
      ]),

      // Top 5 Cancelled Products
      Order.aggregate([
        { $match: { status: 'Cancelled', orderedAt: { $gte: startDate, $lte: endDate } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            cancelledQty: { $sum: '$items.qty' }
          }
        },
        { $sort: { cancelledQty: -1 } },
        { $limit: 5 }
      ]),

      // Top 5 Returned Products
      Order.aggregate([
        { $match: { status: 'Returned', orderedAt: { $gte: startDate, $lte: endDate } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            returnedQty: { $sum: '$items.qty' }
          }
        },
        { $sort: { returnedQty: -1 } },
        { $limit: 5 }
      ]),

      // Daily breakdown for tableData
      Order.aggregate([
        { $match: anyOrderInPeriod },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$orderedAt' } },
            orders: { $sum: 1 },
            gross: { $sum: '$subtotalAmount' },
            couponDiscount: { $sum: '$couponDiscountAmount' }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);


    const stats = overallStats[0] || {};

    const totalOrders = stats.totalOrders?.[0]?.count || 0;
    const grossSales = stats.grossSales?.[0]?.total || 0;
    const itemDiscount = stats.itemDiscounts?.[0]?.totalItemDiscount || 0;
    const couponDiscount = stats.couponDiscount?.[0]?.total || 0;
    const totalDiscount = itemDiscount + couponDiscount;
    const netSales = grossSales - totalDiscount;
    const totalRefunds = stats.refunds?.[0]?.totalRefunds || 0;


    let tableData = [];

    if (filter === 'daily') {
      tableData = [{
        _id: startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        orders: totalOrders,
        discount: totalDiscount.toFixed(2),
        netAmount: netSales.toFixed(2)
      }];
    } else {
      tableData = dailyBreakdown.map(day => {
        const dayGross = day.gross || 0;
        const proportion = grossSales > 0 ? dayGross / (grossSales - couponDiscount) : 0;
        const dayItemDiscount = itemDiscount * proportion;
        const dayTotalDiscount = (day.couponDiscount || 0) + dayItemDiscount;
        const dayNet = dayGross - dayTotalDiscount;

        return {
          _id: new Date(day._id).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          orders: day.orders,
          discount: dayTotalDiscount.toFixed(2),
          netAmount: dayNet.toFixed(2)
        };
      });
    }

    if (tableData.length === 0) {
      tableData = [{
        _id: 'No sales data',
        orders: 0,
        discount: '0.00',
        netAmount: '0.00'
      }];
    }


    res.render('dashboard', {
      latestOrders: latestOrders || [],
      totalOrders,
      grossSales: grossSales.toFixed(2),
      netSales: netSales.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      totalRefunds: totalRefunds.toFixed(2),
      topProducts: topProducts || [],
      topCustomers: topCustomers || [],
      topCancelledProducts: topCancelledProducts || [],
      topReturnedProducts: topReturnedProducts || [],
      tableData,
      filter,
      fromDate: fromDate || '',
      toDate: toDate || '',
      pageTitle: 'Dashboard'
    });

  } catch (error) {
    console.error('Error loading admin dashboard:', error);

    res.render('dashboard', {
      latestOrders: [],
      totalOrders: 0,
      grossSales: '0.00',
      netSales: '0.00',
      totalDiscount: '0.00',
      totalRefunds: '0.00',
      topProducts: [],
      topCustomers: [],
      topCancelledProducts: [],
      topReturnedProducts: [],
      tableData: [{
        _id: 'Error loading data',
        orders: 0,
        discount: '0.00',
        netAmount: '0.00'
      }],
      filter: req.query.filter || 'daily',
      fromDate: req.query.fromDate || '',
      toDate: req.query.toDate || '',
      errorMessage: 'Failed to load dashboard data. Please try again later.',
      pageTitle: 'Dashboard'
    });
  }
};

module.exports = { loadDashboard };