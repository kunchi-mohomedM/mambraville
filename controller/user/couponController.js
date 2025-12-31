const Coupon = require("../../models/couponSchema");

const applyCoupon = async (req, res) => {
  try {
    const { code, total } = req.body;
    const userId = req.session.user;

    const orderTotal = Number(total);

    if (!orderTotal || orderTotal <= 0) {
      return res.json({
        success: false,
        message: "Invalid order total"
      });
    }

    const coupon = await Coupon.findOne({
      code,
      isActive: true,
      expiryDate: { $gte: new Date() }
    });

    if (!coupon)
      return res.json({
        success: false,
        message: "Invalid or expired coupon"
      });

    if (orderTotal < coupon.minPurchase)
      return res.json({
        success: false,
        message: `Minimum purchase ₹${coupon.minPurchase}`
      });

    if (coupon.usedBy.includes(userId))
      return res.json({
        success: false,
        message: "Coupon already used"
      });

    let discount = 0;

    if (coupon.discountType === "percentage") {
      discount = (orderTotal * coupon.discountValue) / 100;

      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      
      discount = coupon.discountValue;
    }

   
     if (discount >= orderTotal) {
      return res.json({
        success: false,
        message: "Coupon amount must be less than order total"
      });
    }

    return res.json({
      success: true,
      discount: Math.round(discount),
      payableAmount: orderTotal - Math.round(discount)
    });

  } catch (err) {
    console.error(err);
    return res.json({
      success: false,
      message: "Coupon error"
    });
  }
};




module.exports={
    applyCoupon,
}