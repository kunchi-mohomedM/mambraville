const Coupon = require("../../models/couponSchema");

const loadCouponManagement = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const [total, Coupons] = await Promise.all([
      Coupon.countDocuments({}),
      Coupon.find({}).skip(skip).limit(limit),
    ]);

    const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

    res.render("couponManagement", {
      Coupons,
      page,
      totalPages,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};

const loadAddCoupon = async (req, res) => {
  try {
    return res.render("addCouponForm");
  } catch (error) {
    console.log(error);
  }
};




const addCoupon = async (req, res) => {
  try {
    let {
      couponcode,
      discount,
      minpurchaseamount = 0,
      maxdiscountamount = 0,
      startdate,
      expiredate,
      discountType,
    } = req.body;

    // Normalize coupon code
    couponcode = String(couponcode || "").trim().toUpperCase();

    // Required fields check
    if (!couponcode || discount === undefined || !expiredate || !discountType || !startdate) {
      return res.status(400).json({
        success: false,
        error: "All required fields must be provided (code, discount, type, start date, expiry date)"
      });
    }

    const type = discountType.toLowerCase();
    if (!["percentage", "fixed"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Discount type must be 'percentage' or 'fixed'"
      });
    }

    // Parse numbers safely
    const discVal = Number(discount);
    const minPur = Number(minpurchaseamount);
    const maxDisc = Number(maxdiscountamount);

    if (isNaN(discVal) || discVal <= 0) {
      return res.status(400).json({
        success: false,
        error: "Discount value must be a positive number"
      });
    }

    // ── Strict business rules ───────────────────────────────────────
    if (type === "fixed" && discVal >= minPur) {
      return res.status(400).json({
        success: false,
        error: "Fixed discount amount must be strictly less than the minimum purchase amount"
      });
    }

    if (type === "percentage" && maxDisc >= minPur) {
      return res.status(400).json({
        success: false,
        error: "Maximum discount amount must be strictly less than the minimum purchase amount"
      });
    }
    // ────────────────────────────────────────────────────────────────

    // Additional percentage validation
    if (type === "percentage" && discVal > 100) {
      return res.status(400).json({
        success: false,
        error: "Percentage discount cannot exceed 100%"
      });
    }

    // Date validation
    const start = new Date(startdate);
    const expiry = new Date(expiredate);

    if (isNaN(start.getTime()) || isNaN(expiry.getTime())) {
      return res.status(400).json({
        success: false,
        error: "Invalid date format for start or expiry date"
      });
    }

    if (start > expiry) {
      return res.status(400).json({
        success: false,
        error: "Start date cannot be later than expiry date"
      });
    }

    if (expiry <= new Date()) {
      return res.status(400).json({
        success: false,
        error: "Expiry date must be in the future"
      });
    }

    // Check for duplicate code (case-insensitive)
    const existingCoupon = await Coupon.findOne({
      code: { $regex: new RegExp(`^${couponcode}$`, "i") }
    });

    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        error: "A coupon with this code already exists"
      });
    }

    // Create new coupon
    const newCoupon = new Coupon({
      code: couponcode,
      discountType: type,
      discountValue: discVal,
      minPurchase: minPur,
      maxDiscount: type === "percentage" ? maxDisc : 0,
      startDate: start,
      expiryDate: expiry,
      isActive: true,
    });

    await newCoupon.save();

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      couponId: newCoupon._id
    });

  } catch (error) {
    console.error("Add coupon error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error while creating coupon"
    });
  }
};

const deleteCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;

    if (!couponId) {
      return res.redirect("/admin/coupon?msg=Invalid coupon ID");
    }

    const deleted = await Coupon.findByIdAndDelete(couponId);

    if (!deleted) {
      return res.redirect("/admin/coupon?msg=Coupon not found");
    }

    return res.redirect("/admin/coupon?msg=Coupon deleted successfully");
  } catch (error) {
    console.error("Delete coupon error:", error);
    return res.redirect("/admin/coupon?msg=Error deleting coupon");
  }
};

const loadEditcoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).send("Coupon not found");
    }
    console.log(coupon);
    return res.render("editCoupon", {
      coupon: {
        _id: coupon._id, // Added _id
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minPurchase: coupon.minPurchase,
        maxDiscount: coupon.maxDiscount,
        startDate: coupon.startDate
          ? coupon.startDate.toISOString().split("T")[0]
          : "", // Added and formatted startDate
        expiryDate: coupon.expiryDate
          ? coupon.expiryDate.toISOString().split("T")[0]
          : "",
      },
    });
  } catch (error) {
    console.log("Error occured while loading Editcoupon", error);
  }
};

const editCoupon = async (req, res) => {
  try {
    const {
      couponId,
      code,
      discountType,
      discountValue,
      minPurchase = 0,
      maxDiscount = 0,
      startdate,
      expiryDate,
    } = req.body;

    if (!couponId || !code) {
      return res.status(400).json({
        success: false,
        error: "Coupon ID and code are required"
      });
    }

    const type = discountType.toLowerCase();
    if (!["percentage", "fixed"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Discount type must be 'percentage' or 'fixed'"
      });
    }

    // Parse numbers
    const discVal = Number(discountValue);
    const minPur = Number(minPurchase);
    const maxDisc = Number(maxDiscount);

    if (isNaN(discVal) || discVal <= 0) {
      return res.status(400).json({
        success: false,
        error: "Discount value must be a positive number"
      });
    }

    // ── Same strict validation as addCoupon ─────────────────────────
    if (type === "fixed" && minPur > 0 && discVal >= minPur) {
      return res.status(400).json({
        success: false,
        error: "Fixed discount amount must be strictly less than the minimum purchase amount"
      });
    }

    if (type === "percentage" && minPur > 0 && maxDisc >= minPur) {
      return res.status(400).json({
        success: false,
        error: "Maximum discount amount must be strictly less than the minimum purchase amount"
      });
    }
    // ────────────────────────────────────────────────────────────────

    if (type === "percentage" && discVal > 100) {
      return res.status(400).json({
        success: false,
        error: "Percentage discount cannot exceed 100%"
      });
    }

    // Date validation
    const start = new Date(startdate);
    const expiry = new Date(expiryDate);

    if (isNaN(start.getTime()) || isNaN(expiry.getTime())) {
      return res.status(400).json({
        success: false,
        error: "Invalid date format for start or expiry date"
      });
    }

    if (start > expiry) {
      return res.status(400).json({
        success: false,
        error: "Start date cannot be later than expiry date"
      });
    }

    // Note: We allow editing to past expiry if needed (business decision)
    // If you want to block it, uncomment next block:
    /*
    if (expiry <= new Date()) {
      return res.status(400).json({
        success: false,
        error: "Expiry date must be in the future"
      });
    }
    */

    // Normalize code
    const normalizedCode = String(code).trim().toUpperCase();

    // Check for duplicate (exclude self)
    const duplicate = await Coupon.findOne({
      code: { $regex: new RegExp(`^${normalizedCode}$`, "i") },
      _id: { $ne: couponId }
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        error: "Another coupon with this code already exists"
      });
    }

    // Prepare update object
    const updateData = {
      code: normalizedCode,
      discountType: type,
      discountValue: discVal,
      minPurchase: minPur,
      maxDiscount: type === "percentage" ? maxDisc : 0,
      startDate: start,
      expiryDate: expiry,
    };

    const updatedCoupon = await Coupon.findByIdAndUpdate(
      couponId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCoupon) {
      return res.status(404).json({
        success: false,
        error: "Coupon not found"
      });
    }

    return res.json({
      success: true,
      message: "Coupon updated successfully",
      coupon: updatedCoupon
    });

  } catch (error) {
    console.error("Edit coupon error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: "Coupon code already exists"
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        error: messages.join(", ")
      });
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error while updating coupon"
    });
  }
};

module.exports = {
  loadCouponManagement,
  loadAddCoupon,
  addCoupon,
  deleteCoupon,
  loadEditcoupon,
  editCoupon,
};
