module.exports = function applyBestDiscount({
  products,
  categoryOfferMap,
  cartItems = [],
  wishlistItems = []
}) {
  return products.map(p => {
    const productDiscount = p.discount || 0;
    const categoryDiscount =
      categoryOfferMap[p.category?.toString()] || 0;

    const finalDiscountPercent = Math.max(
      productDiscount,
      categoryDiscount
    );

    const discountedPrice = Math.round(
      p.price - (p.price * finalDiscountPercent) / 100
    );

    return {
      ...p._doc,

      // cart & wishlist
      inCart: cartItems.includes(p._id.toString()),
      inWishlist: wishlistItems.includes(p._id.toString()),

      // pricing
      originalPrice: p.price,
      discountedPrice,
      discountPercent: finalDiscountPercent,
      discountSource:
        finalDiscountPercent === productDiscount
          ? "product"
          : "category"
    };
  });
};
    