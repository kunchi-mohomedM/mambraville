const Coupon = require("../../models/couponSchema");

const applyCoupon = async (req, res) => {
  try {
    const { code, total } = req.body;
    const userId = req.session.user;

    const coupon = await Coupon.findOne({
      code,
      isActive: true,
      expiryDate: { $gte: new Date() }
    });

    if (!coupon)
      return res.json({ success: false, message: "Invalid or expired coupon" });

    if (total < coupon.minPurchase)
      return res.json({
        success: false,
        message: `Minimum purchase ₹${coupon.minPurchase}`
      });

    if (coupon.usedBy.includes(userId))
      return res.json({ success: false, message: "Coupon already used" });

    let discount = 0;

    if (coupon.discountType === "percentage") {
      discount = (total * coupon.discountValue) / 100;
      if (coupon.maxDiscount)
        discount = Math.min(discount, coupon.maxDiscount);
    } else {
      discount = coupon.discountValue;
    }

    return res.json({
      success: true,
      discount: Math.round(discount)
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "Coupon error" });
  }
};


module.exports={
    applyCoupon,
}