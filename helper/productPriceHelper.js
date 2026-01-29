// helpers/productPriceHelper.js
const Product = require("../models/Product");
const CategoryOffer = require("../models/categoryOffer"); // adjust path

/**
 * Updates sellingPrice, activeDiscountPercent & discountAppliedBy for one product
 * @param {String|ObjectId} productId - or full product document
 * @returns {Promise<Product>}
 */
async function updateProductSellingPrice(productOrId) {
  let product;

  if (typeof productOrId === "string" || productOrId instanceof mongoose.Types.ObjectId) {
    product = await Product.findById(productOrId);
  } else {
    product = productOrId;
  }

  if (!product) throw new Error("Product not found");

  // Get active category offer
  const activeCatOffer = await CategoryOffer.findOne({
    categoryId: product.category,
    isActive: true,
  }).lean();

  const categoryDiscount = activeCatOffer ? activeCatOffer.discountPercentage : 0;
  const productDiscount = product.discount || 0;

  const bestDiscount = Math.max(productDiscount, categoryDiscount);

  const newSellingPrice = Math.round(product.price * (1 - bestDiscount / 100));

  // Update fields
  product.sellingPrice = newSellingPrice;
  product.activeDiscountPercent = bestDiscount;
  product.discountAppliedBy =
    bestDiscount === 0
      ? "none"
      : bestDiscount === productDiscount
      ? "product"
      : "category";

  await product.save();

  return product;
}

module.exports = { updateProductSellingPrice };