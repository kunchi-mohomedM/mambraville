const Order = require("../../models/orderSchema");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

// 🔁 Date filter logic (reused)
function getDateRange(filter, fromDate, toDate) {
  let startDate = new Date();
  let endDate = new Date();

  if (filter === "daily") startDate.setHours(0, 0, 0, 0);
  if (filter === "weekly") startDate.setDate(startDate.getDate() - 7);
  if (filter === "monthly") startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  if (filter === "yearly") startDate = new Date(startDate.getFullYear(), 0, 1);

  if (filter === "custom" && fromDate && toDate) {
    startDate = new Date(fromDate);
    endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
}

/* =========================
   📗 EXCEL DOWNLOAD
========================= */
const downloadExcel = async (req, res) => {
  try {
    const { filter, fromDate, toDate } = req.query;
    const { startDate, endDate } = getDateRange(filter, fromDate, toDate);

    const data = await Order.aggregate([
      {
        $match: {
          status: "Delivered",
          orderedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$orderedAt" } },
          orders: { $sum: 1 },
          discount: { $sum: "$couponDiscountAmount" },
          netAmount: { $sum: "$totalAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sales Report");

    sheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Orders", key: "orders", width: 10 },
      { header: "Discount", key: "discount", width: 15 },
      { header: "Net Sales", key: "netAmount", width: 15 }
    ];

    data.forEach(row => {
      sheet.addRow({
        date: row._id,
        orders: row.orders,
        discount: row.discount,
        netAmount: row.netAmount
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=sales_report.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("Excel Error:", err);
    res.status(500).send("Excel download failed");
  }
};

/* =========================
   📕 PDF DOWNLOAD
========================= */
const downloadPDF = async (req, res) => {
  try {
    const { filter, fromDate, toDate } = req.query;
    const { startDate, endDate } = getDateRange(filter, fromDate, toDate);

    const data = await Order.aggregate([
      {
        $match: {
          status: "Delivered",
          orderedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$orderedAt" } },
          orders: { $sum: 1 },
          discount: { $sum: "$couponDiscountAmount" },
          netAmount: { $sum: "$totalAmount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const doc = new PDFDocument({ margin: 30, size: "A4" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=sales_report.pdf");

    doc.pipe(res);

    doc.fontSize(18).text("Mambraville - Sales Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleDateString()}`);
    doc.moveDown();

    doc.fontSize(11);
    doc.text("Date        Orders    Discount    Net Sales");
    doc.moveDown(0.5);

    data.forEach(row => {
      doc.text(
        `${row._id}     ${row.orders}        ₹${row.discount}        ₹${row.netAmount}`
      );
    });

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
