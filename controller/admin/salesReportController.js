const Order = require("../../models/orderSchema");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const path = require("path");

// 🔁 Date filter logic (reused)
function getDateRange(filter, fromDate, toDate) {
  let startDate = new Date();
  let endDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  if (filter === "daily") {
    // Today only
  } else if (filter === "weekly") {
    startDate.setDate(startDate.getDate() - 6); // Last 7 days
  } else if (filter === "monthly") {
    startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  } else if (filter === "yearly") {
    startDate = new Date(startDate.getFullYear(), 0, 1);
  } else if (filter === "custom" && fromDate && toDate) {
    startDate = new Date(fromDate);
    endDate = new Date(toDate);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
}

// Helper to fetch all dashboard data (reused in exports)
async function fetchSalesData(startDate, endDate) {
  const successfulOrderMatch = {
    status: { $nin: ['Cancelled', 'Returned', 'Failed'] },
    paymentStatus: 'Paid',
    orderedAt: { $gte: startDate, $lte: endDate }
  };

  const anyOrderInPeriod = {
    orderedAt: { $gte: startDate, $lte: endDate }
  };

  const [
    totalOrdersResult,
    grossSalesResult,
    itemDiscountsResult,
    couponDiscountResult,
    refundsResult,
    topProducts,
    topCustomers,
    latestOrders,
    dailyBreakdown
  ] = await Promise.all([
    // Total Orders
    Order.aggregate([
      { $match: successfulOrderMatch },
      { $count: 'count' }
    ]),

    // Gross Sales
    Order.aggregate([
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
          total: { $sum: { $multiply: ['$items.qty', '$originalPricePerUnit'] } }
        }
      }
    ]),

    // Item Discounts
    Order.aggregate([
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
    ]),

    // Coupon Discount
    Order.aggregate([
      { $match: successfulOrderMatch },
      { $group: { _id: null, total: { $sum: '$couponDiscountAmount' } } }
    ]),

    // Refunds
    Order.aggregate([
      {
        $match: {
          status: { $in: ['Returned'] },
          paymentStatus: 'Paid',
          orderedAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $group: { _id: null, totalRefunds: { $sum: '$totalAmount' } } }
    ]),

    // Top 10 Products
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
          fullname: '$user.fullname',
          email: '$user.email',
          totalSpent: 1,
          orderCount: 1
        }
      }
    ]),

    // Latest 10 Orders
    Order.find(anyOrderInPeriod)
      .sort({ orderedAt: -1 })
      .limit(10)
      .populate('userId', 'fullname email phone')
      .select('orderId items subtotalAmount couponDiscountAmount totalAmount status paymentMethod orderedAt address')
      .lean(),

    // Daily Breakdown
    Order.aggregate([
      { $match: successfulOrderMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$orderedAt' } },
          orders: { $sum: 1 },
          discount: { $sum: '$couponDiscountAmount' },
          netAmount: { $sum: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ])
  ]);

  const totalOrders = totalOrdersResult[0]?.count || 0;
  const grossSales = grossSalesResult[0]?.total || 0;
  const itemDiscount = itemDiscountsResult[0]?.totalItemDiscount || 0;
  const couponDiscount = couponDiscountResult[0]?.total || 0;
  const totalDiscount = itemDiscount + couponDiscount;
  const netSales = grossSales - totalDiscount;
  const totalRefunds = refundsResult[0]?.totalRefunds || 0;
  const tableData = dailyBreakdown;

  return {
    totalOrders,
    grossSales,
    totalDiscount,
    netSales,
    totalRefunds,
    topProducts,
    topCustomers,
    latestOrders,
    tableData
  };
}

/* =========================
   📗 EXCEL DOWNLOAD - Enhanced & Structured
========================= */
const downloadExcel = async (req, res) => {
  try {
    const { filter, fromDate, toDate } = req.query;
    const { startDate, endDate } = getDateRange(filter, fromDate, toDate);
    const data = await fetchSalesData(startDate, endDate);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Mambraville Admin';
    workbook.lastModifiedBy = 'Mambraville System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Sales Report', {
      pageSetup: { paperSize: 9, orientation: 'landscape' }
    });

    // Styles
    const headerStyle = {
      font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    };

    const dataStyle = {
      alignment: { horizontal: 'left' },
      border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    };

    const currencyStyle = {
      numFmt: '₹#,##0.00',
      ...dataStyle
    };

    // Header Section
    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = 'Mambraville - Comprehensive Sales Report';
    sheet.getCell('A1').font = { bold: true, size: 16 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.getRow(2).values = [
      'Date Range:', 
      `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`, 
      '', 
      'Generated On:', 
      new Date().toLocaleDateString()
    ];
    sheet.getRow(2).font = { italic: true };

    sheet.addRow([]); // Spacer

    // Summary Section
    sheet.addRow(['Summary Statistics']);
    sheet.mergeCells('A4:E4');
    sheet.getCell('A4').font = { bold: true, size: 14 };
    sheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };

    const summaryData = [
      ['Total Orders', data.totalOrders],
      ['Gross Sales', data.grossSales],
      ['Total Discount', data.totalDiscount],
      ['Net Sales', data.netSales],
      ['Total Refunds', data.totalRefunds]
    ];

    summaryData.forEach((row, index) => {
      sheet.addRow(row);
      sheet.getCell(`B${5 + index}`).numFmt = '₹#,##0.00';
      sheet.getRow(5 + index).getCell(1).font = { bold: true };
    });

    sheet.addRow([]); // Spacer

    // Daily Sales Table
    const dailyStartRow = sheet.lastRow.number + 1;
    sheet.addRow(['Daily Sales Breakdown']);
    sheet.mergeCells(`A${dailyStartRow}:D${dailyStartRow}`);
    sheet.getCell(`A${dailyStartRow}`).font = { bold: true, size: 14 };
    sheet.getCell(`A${dailyStartRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCFE2F3' } };

    const dailyHeaders = ['Date', 'Orders', 'Discount', 'Net Amount'];
    sheet.addRow(dailyHeaders);
    sheet.getRow(dailyStartRow + 1).eachCell((cell) => {
      cell.style = headerStyle;
    });

    data.tableData.forEach(row => {
      const excelRow = sheet.addRow([row._id, row.orders, row.discount, row.netAmount]);
      excelRow.getCell(3).style = currencyStyle;
      excelRow.getCell(4).style = currencyStyle;
      excelRow.eachCell((cell, colNumber) => {
        if (colNumber > 1) cell.alignment = { horizontal: 'right' };
      });
    });

    sheet.addRow([]); // Spacer

    // Top Products Table
    const productsStartRow = sheet.lastRow.number + 1;
    sheet.addRow(['Top 10 Best Selling Products']);
    sheet.mergeCells(`A${productsStartRow}:E${productsStartRow}`);
    sheet.getCell(`A${productsStartRow}`).font = { bold: true, size: 14 };
    sheet.getCell(`A${productsStartRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4CCCC' } };

    const productHeaders = ['#', 'Product Name', 'Qty Sold', 'Revenue'];
    sheet.addRow(productHeaders);
    sheet.getRow(productsStartRow + 1).eachCell((cell) => {
      cell.style = headerStyle;
    });

    data.topProducts.forEach((product, index) => {
      const excelRow = sheet.addRow([
        index + 1,
        product.name || 'Unknown',
        product.totalQty,
        product.totalRevenue
      ]);
      excelRow.getCell(4).style = currencyStyle;
      excelRow.eachCell((cell, colNumber) => {
        if (colNumber > 2) cell.alignment = { horizontal: 'right' };
      });
    });

    sheet.addRow([]); // Spacer

    // Top Customers Table
    const customersStartRow = sheet.lastRow.number + 1;
    sheet.addRow(['Top 10 Customers']);
    sheet.mergeCells(`A${customersStartRow}:E${customersStartRow}`);
    sheet.getCell(`A${customersStartRow}`).font = { bold: true, size: 14 };
    sheet.getCell(`A${customersStartRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE5CD' } };

    const customerHeaders = ['#', 'Name', 'Email', 'Orders', 'Total Spent'];
    sheet.addRow(customerHeaders);
    sheet.getRow(customersStartRow + 1).eachCell((cell) => {
      cell.style = headerStyle;
    });

    data.topCustomers.forEach((customer, index) => {
      const excelRow = sheet.addRow([
        index + 1,
        customer.fullname,
        customer.email,
        customer.orderCount,
        customer.totalSpent
      ]);
      excelRow.getCell(5).style = currencyStyle;
      excelRow.eachCell((cell, colNumber) => {
        if (colNumber > 3) cell.alignment = { horizontal: 'right' };
      });
    });

    sheet.addRow([]); // Spacer

    // Latest Orders Table
    const ordersStartRow = sheet.lastRow.number + 1;
    sheet.addRow(['Latest 10 Orders']);
    sheet.mergeCells(`A${ordersStartRow}:G${ordersStartRow}`);
    sheet.getCell(`A${ordersStartRow}`).font = { bold: true, size: 14 };
    sheet.getCell(`A${ordersStartRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0E0E3' } };

    const orderHeaders = ['Order ID', 'Customer', 'Date', 'Items', 'Total', 'Status', 'Payment'];
    sheet.addRow(orderHeaders);
    sheet.getRow(ordersStartRow + 1).eachCell((cell) => {
      cell.style = headerStyle;
    });

    data.latestOrders.forEach(order => {
      const excelRow = sheet.addRow([
        order.orderId,
        order.userId?.fullname || 'Guest',
        new Date(order.orderedAt).toLocaleString(),
        order.items.length,
        order.totalAmount,
        order.status,
        order.paymentMethod
      ]);
      excelRow.getCell(5).style = currencyStyle;
      excelRow.getCell(5).alignment = { horizontal: 'right' };
      excelRow.getCell(4).alignment = { horizontal: 'center' };
    });

    // Auto-fit columns
    sheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) maxLength = columnLength;
      });
      column.width = maxLength < 10 ? 10 : maxLength + 2;
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=mambraville_sales_report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Excel Error:", err);
    res.status(500).send("Excel download failed");
  }
};

/* =========================
   📕 PDF DOWNLOAD - Enhanced & Structured
========================= */
const downloadPDF = async (req, res) => {
  try {
    const { filter, fromDate, toDate } = req.query;
    const { startDate, endDate } = getDateRange(filter, fromDate, toDate);
    const data = await fetchSalesData(startDate, endDate);

    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=mambraville_sales_report.pdf");
    doc.pipe(res);

    // Format currency with "Rs" prefix (Indian Rupee)
    const formatCurrency = (amount) => {
      return `Rs ${Number(amount).toLocaleString('en-IN', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`;
    };

    // Draw section header
    const drawSectionHeader = (title, y) => {
      doc.rect(40, y, 515, 28).fill('#ECF0F1');
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#2C3E50').text(title, 50, y + 8);
      return y + 35;
    };

    // Draw line
    const drawLine = (y, color = '#ECF0F1', thickness = 0.5) => {
      doc.strokeColor(color).lineWidth(thickness).moveTo(40, y).lineTo(555, y).stroke();
    };

    // ==================== HEADER ====================
    doc.rect(0, 0, 595, 80).fill('#2C3E50');
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#FFFFFF').text('MAMBRAVILLE', 40, 25, { align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#ECF0F1').text('Sales Performance Report', 40, 52, { align: 'center' });

    // Date Range
    doc.rect(40, 95, 515, 35).fill('#ECF0F1');
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#34495E').text('REPORT PERIOD', 50, 102);
    doc.fontSize(11).font('Helvetica').fillColor('#2C3E50')
       .text(`${startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} to ${endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, 50, 115);
    doc.fontSize(8).fillColor('#7F8C8D').text(`Generated: ${new Date().toLocaleString('en-IN')}`, 350, 108, { align: 'right', width: 195 });

    let currentY = 150;

    // ==================== SUMMARY CARDS ====================
    const summaryItems = [
      { label: 'Total Orders', value: data.totalOrders.toString(), color: '#3498DB' },
      { label: 'Gross Sales', value: formatCurrency(data.grossSales), color: '#27AE60' },
      { label: 'Total Discount', value: formatCurrency(data.totalDiscount), color: '#E74C3C' },
      { label: 'Net Sales', value: formatCurrency(data.netSales), color: '#2C3E50' },
      { label: 'Refunds', value: formatCurrency(data.totalRefunds), color: '#7F8C8D' }
    ];

    const cardWidth = 95, cardHeight = 55, cardGap = 10;
    summaryItems.forEach((item, index) => {
      const x = 40 + (index * (cardWidth + cardGap)), y = currentY;
      doc.rect(x, y, cardWidth, cardHeight).fill('#FFFFFF').stroke('#ECF0F1');
      doc.rect(x, y, cardWidth, 3).fill(item.color);
      doc.fontSize(8).font('Helvetica').fillColor('#7F8C8D').text(item.label.toUpperCase(), x + 8, y + 12, { width: cardWidth - 16 });
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#2C3E50').text(item.value, x + 8, y + 28, { width: cardWidth - 16 });
    });
    currentY += 85;

    // ==================== DAILY SALES ====================
    currentY = drawSectionHeader('Daily Sales Breakdown', currentY);
    const dailyHeaders = ['Date', 'Orders', 'Discount', 'Net Amount'];
    const dailyWidths = [140, 90, 120, 120];
    let xPos = 50;

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#34495E');
    dailyHeaders.forEach((h, i) => { doc.text(h, xPos, currentY, { width: dailyWidths[i], align: i === 0 ? 'left' : 'right' }); xPos += dailyWidths[i]; });
    currentY += 18; drawLine(currentY, '#7F8C8D', 1); currentY += 8;

    doc.fontSize(9).font('Helvetica').fillColor('#2C3E50');
    data.tableData.slice(0, 10).forEach((row, idx) => {
      xPos = 50;
      [new Date(row._id).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), row.orders.toString(), formatCurrency(row.discount), formatCurrency(row.netAmount)]
        .forEach((cell, i) => { doc.text(cell, xPos, currentY, { width: dailyWidths[i], align: i === 0 ? 'left' : 'right' }); xPos += dailyWidths[i]; });
      currentY += 16; if (idx < data.tableData.length - 1) drawLine(currentY - 4);
    });
    currentY += 20;

    if (currentY > 680) { doc.addPage(); currentY = 50; }

    // ==================== TOP PRODUCTS ====================
    currentY = drawSectionHeader('Top 10 Best Selling Products', currentY);
    const productHeaders = ['#', 'Product Name', 'Qty', 'Revenue'];
    const productWidths = [30, 280, 70, 90];
    xPos = 50;

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#34495E');
    productHeaders.forEach((h, i) => { doc.text(h, xPos, currentY, { width: productWidths[i], align: i > 1 ? 'right' : 'left' }); xPos += productWidths[i]; });
    currentY += 18; drawLine(currentY, '#7F8C8D', 1); currentY += 8;

    doc.fontSize(9).font('Helvetica').fillColor('#2C3E50');
    data.topProducts.forEach((p, idx) => {
      xPos = 50;
      const name = (p.name || 'Unknown').length > 45 ? (p.name || 'Unknown').substring(0, 42) + '...' : (p.name || 'Unknown');
      [(idx + 1).toString(), name, p.totalQty.toString(), formatCurrency(p.totalRevenue)]
        .forEach((cell, i) => { doc.text(cell, xPos, currentY, { width: productWidths[i], align: i > 1 ? 'right' : 'left' }); xPos += productWidths[i]; });
      currentY += 16; if (idx < data.topProducts.length - 1) drawLine(currentY - 4);
    });
    currentY += 20;

    if (currentY > 680) { doc.addPage(); currentY = 50; }

    // ==================== TOP CUSTOMERS ====================
    currentY = drawSectionHeader('Top 10 Customers', currentY);
    const customerHeaders = ['#', 'Name', 'Email', 'Orders', 'Total Spent'];
    const customerWidths = [30, 150, 180, 60, 100];
    xPos = 50;

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#34495E');
    customerHeaders.forEach((h, i) => { doc.text(h, xPos, currentY, { width: customerWidths[i], align: i > 2 ? 'right' : 'left' }); xPos += customerWidths[i]; });
    currentY += 18; drawLine(currentY, '#7F8C8D', 1); currentY += 8;

    doc.fontSize(8).font('Helvetica').fillColor('#2C3E50');
    data.topCustomers.forEach((c, idx) => {
      xPos = 50;
      const name = (c.fullname || 'Unknown').length > 22 ? (c.fullname || 'Unknown').substring(0, 19) + '...' : (c.fullname || 'Unknown');
      const email = (c.email || '-').length > 28 ? (c.email || '-').substring(0, 25) + '...' : (c.email || '-');
      [(idx + 1).toString(), name, email, c.orderCount.toString(), formatCurrency(c.totalSpent)]
        .forEach((cell, i) => { doc.text(cell, xPos, currentY, { width: customerWidths[i], align: i > 2 ? 'right' : 'left' }); xPos += customerWidths[i]; });
      currentY += 16; if (idx < data.topCustomers.length - 1) drawLine(currentY - 4);
    });
    currentY += 20;

    if (currentY > 650) { doc.addPage(); currentY = 50; }

    // ==================== LATEST ORDERS ====================
    currentY = drawSectionHeader('Latest Orders', currentY);
    const orderHeaders = ['Order ID', 'Customer', 'Date', 'Items', 'Total', 'Status'];
    const orderWidths = [80, 130, 90, 45, 90, 75];
    xPos = 50;

    doc.fontSize(8).font('Helvetica-Bold').fillColor('#34495E');
    orderHeaders.forEach((h, i) => { doc.text(h, xPos, currentY, { width: orderWidths[i], align: i > 2 ? 'center' : 'left' }); xPos += orderWidths[i]; });
    currentY += 18; drawLine(currentY, '#7F8C8D', 1); currentY += 8;

    doc.fontSize(8).font('Helvetica').fillColor('#2C3E50');
    data.latestOrders.slice(0, 10).forEach((o, idx) => {
      xPos = 50;
      const name = (o.userId?.fullname || 'Guest').length > 20 ? (o.userId?.fullname || 'Guest').substring(0, 17) + '...' : (o.userId?.fullname || 'Guest');
      [o.orderId || '-', name, new Date(o.orderedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), o.items?.length?.toString() || '0', formatCurrency(o.totalAmount), o.status || '-']
        .forEach((cell, i) => { doc.text(cell, xPos, currentY, { width: orderWidths[i], align: i > 2 ? 'center' : 'left' }); xPos += orderWidths[i]; });
      currentY += 16; if (idx < data.latestOrders.length - 1) drawLine(currentY - 4);
    });

    // Footer
    doc.fontSize(8).fillColor('#7F8C8D').text('© Mambraville - Confidential Report', 40, 770, { align: 'center', width: 515 });

    doc.end();

  } catch (err) {
    console.error("PDF Error:", err);
    res.status(500).send("PDF download failed");
  }
};

module.exports = {
  downloadExcel,
  downloadPDF
};