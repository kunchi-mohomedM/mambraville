const Category = require("../../models/categorySchema");
const Products = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const Wishlist = require("../../models/wishlistSchema");
const CategoryOffer = require("../../models/categoryOffer");
const applyBestDiscount = require('../../helper/applyBestDiscount')

const loadUserProducts = async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 4;
    let skip = (page - 1) * limit;

    let categoryDoc = null;
    let matchStage = { isDeleted: false };

    // Category filter
    if (req.query.category) {
      categoryDoc = await Category.findOne({
        categoryname: req.query.category,
      });
      if (categoryDoc) {
        matchStage.category = categoryDoc._id;
      } else {
        matchStage.category = null;
      }
    }

    
    if (req.query.search) {
      matchStage.productName = { $regex: req.query.search, $options: "i" };
    }

   
    const categoryOffers = await CategoryOffer.find({ isActive: true }).lean();
    const categoryOfferMap = {};
    categoryOffers.forEach((offer) => {
      categoryOfferMap[offer.categoryId.toString()] = offer.discountPercentage;
    });

   
    const pipeline = [
      { $match: matchStage },

     
      {
        $addFields: {
          categoryDiscount: {
            $cond: {
              if: { $in: [{ $toString: "$category" }, Object.keys(categoryOfferMap)] },
              then: {
                $switch: {
                  branches: Object.entries(categoryOfferMap).map(([catId, discount]) => ({
                    case: { $eq: [{ $toString: "$category" }, catId] },
                    then: discount
                  })),
                  default: 0
                }
              },
              else: 0
            }
          }
        }
      },

      // Calculate effective discount and price
      {
        $addFields: {
          effectiveDiscount: {
            $max: [{ $ifNull: ["$discount", 0] }, "$categoryDiscount"]
          }
        }
      },
      {
        $addFields: {
          effectivePrice: {
            $round: {
              $subtract: [
                "$price",
                { $divide: [{ $multiply: ["$price", "$effectiveDiscount"] }, 100] }
              ]
            }
          }
        }
      }
    ];

    // Price filter - apply AFTER calculating effective price
    if (req.query.minPrice || req.query.maxPrice) {
      const priceFilter = {};
      if (req.query.minPrice) priceFilter.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) priceFilter.$lte = Number(req.query.maxPrice);
      pipeline.push({ $match: { effectivePrice: priceFilter } });
    }

    // Count total products after filtering
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Products.aggregate(countPipeline);
    const totalProducts = countResult.length > 0 ? countResult[0].total : 0;

    // Sorting based on query parameter
    let sortStage = {};
    switch (req.query.sort) {
      case "newest":
        sortStage.createdAt = -1;
        break;
      case "oldest":
        sortStage.createdAt = 1;
        break;
      case "priceasc":
        sortStage.effectivePrice = 1; // Sort by effective price
        break;
      case "pricedesc":
        sortStage.effectivePrice = -1; // Sort by effective price
        break;
      case "popular":
        sortStage.ratings = -1;
        break;
      default:
        sortStage.createdAt = -1;
    }

    pipeline.push({ $sort: sortStage });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Execute aggregation
    let products = await Products.aggregate(pipeline);

    // Mark out of stock products
    products = products.map(product => {
      product.isOutOfStock = product.quantity <= 0;
      return product;
    });

    // Get cart and wishlist items
    let cartItems = [];
    if (req.session.user) {
      const cart = await Cart.findOne({ userId: req.session.user });
      cartItems = cart ? cart.items.map((i) => i.productId.toString()) : [];
    }

    let wishlistItems = [];
    if (req.session.user) {
      const wishlist = await Wishlist.findOne({ userId: req.session.user });
      wishlistItems = wishlist
        ? wishlist.items.map((i) => i.productId.toString())
        : [];
    }

    // Apply best discount and add cart/wishlist flags
    products = products.map(p => {
      const productDiscount = p.discount || 0;
      const categoryDiscount = p.categoryDiscount || 0;
      const finalDiscountPercent = Math.max(productDiscount, categoryDiscount);

      return {
        ...p,
        _id: p._id,

        // cart & wishlist
        inCart: cartItems.includes(p._id.toString()),
        inWishlist: wishlistItems.includes(p._id.toString()),

        // pricing
        originalPrice: p.price,
        discountedPrice: p.effectivePrice,
        discountPercent: finalDiscountPercent,
        discountSource: finalDiscountPercent === productDiscount ? "product" : "category"
      };
    });

    const categories = await Category.find({ isListed: true });

    res.render("products", {
      products,
      categoryDoc,
      categories,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      totalProducts,
      queryParams: req.query,
      searchQuery: req.query.search || "",
      isLoggedIn: !!req.session.user,
      message: req.query.message || null,
    });
  } catch (error) {
    console.error("Error occurred while rendering products page:", error);

    if (
      req.xhr ||
      req.headers["x-requested-with"] === "XMLHttpRequest" ||
      req.query.format === "json"
    ) {
      return res.status(500).json({
        status: "error",
        message: "An error occurred while loading products.",
      });
    }
    res.status(500).send("An error occurred while loading products..");
  }
};

const loadproductdetails = async (req, res) => {
  try {
    const productId = req.params.id;

    let productDoc = await Products.findOne({
      _id: productId,
      isDeleted: false
    });

    if (!productDoc) {
      return res.redirect("/products-user");
    }


    const categoryOffers = await CategoryOffer.find({
      isActive: true
    }).lean();

    const categoryOfferMap = {};
    categoryOffers.forEach(offer => {
      categoryOfferMap[offer.categoryId.toString()] =
        offer.discountPercentage;
    });


    let cartItems = [];
    let wishlistItems = [];

    if (req.session.user) {
      const cart = await Cart.findOne({ userId: req.session.user}).lean();
      cartItems = cart ? cart.items.map(i => i.productId.toString()) : [];
   
      const wishlist = await Wishlist.findOne({ userId: req.session.user }).lean();
      wishlistItems = wishlist ? wishlist.items.map(i => i.productId.toString()) : [];
   
    }


    let [product] = applyBestDiscount({
      products: [productDoc],
      categoryOfferMap,
      cartItems,
      wishlistItems
    });


    product.inCart = cartItems.includes(product._id.toString());
    product.inWishlist = wishlistItems.includes(product._id.toString());


    const category = await Category.findById(product.category).lean();


    let relatedDocs = await Products.find({
      category: product.category,
      isDeleted: false,
      _id: { $ne: product._id }
    })
      .sort({ createdAt: -1 })
      .limit(4);


    const relatedProducts = applyBestDiscount({
      products: relatedDocs,
      categoryOfferMap,
      cartItems,
      wishlistItems: []
    });


    res.render("productdetails", {
      product,
      category,
      relatedProducts,
      isLoggedIn: !!req.session.user
    });

  } catch (error) {
    console.error(
      "Error occurred while rendering productdetails page",
      error
    );
  }
};


module.exports = {
  loadUserProducts,
  loadproductdetails,
};
